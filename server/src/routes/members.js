const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const Member = require("../models/Member");
const { MEMBER_STATUSES } = require("../models/Member");
const Application = require("../models/Application");
const { EMPLOYMENT_STATUSES } = require("../models/Application");
const Loan = require("../models/Loan");
const RetirementPlan = require("../models/RetirementPlan");
const loans = require("../services/loans");
const plans = require("../services/retirementPlans");
const ledger = require("../services/ledger");
const BillRecord = require("../models/BillRecord");
const { BILL_KINDS, BILL_STATUSES } = require("../models/BillRecord");
const { signalsFor } = require("../services/memberSignals");
const { scoreOf } = require("../services/memberScore");
const { auditNote } = require("../middleware/audit");
const { requireStaff, requireLevel, requireRole } = require("../middleware/auth");

const router = express.Router();

/**
 * A signed-in member's own record, to fill in the loan form: what UDEI has on file, their history
 * with UDEI, and the salary details from their last application. Only the member's linked record.
 */
router.get("/mine", requireStaff, async (req, res, next) => {
  try {
    if (!req.user.memberId) return res.json({ member: null });
    const member = await Member.findOne({ memberId: req.user.memberId });
    const last = await Application.findOne({ "applicant.memberId": req.user.memberId }).sort({ createdAt: -1 }).lean();
    const a = last?.applicant;
    res.json({
      member: member
        ? {
            memberId: member.memberId,
            lastName: member.lastName,
            firstName: member.firstName,
            middleInitial: member.middleInitial,
            residenceAddress: member.residenceAddress,
            employer: member.employer,
            employmentStatus: member.employmentStatus,
            dateOfBirth: member.dateOfBirth,
          }
        : null,
      history: member ? await historyOf(member) : null,
      lastApplication: a
        ? {
            lastName: a.lastName, firstName: a.firstName, middleInitial: a.middleInitial, residenceAddress: a.residenceAddress,
            employer: a.employer, employmentStatus: a.employmentStatus, dateOfBirth: a.dateOfBirth,
            monthlySalary: a.monthlySalary, netTakeHomePay: a.netTakeHomePay, filedAt: last.createdAt,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// Everything below: UDEI's member records. Loan Officers and everyone above them can see and edit them.
router.use(requireStaff, requireLevel("loan_officer"));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blankToUndefined = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = (schema) => z.preprocess(blankToUndefined, schema.optional());

const fields = {
  // Optional: UDEI's spreadsheets list members by number only, so names are added later.
  lastName: optional(z.string().trim().max(60)),
  firstName: optional(z.string().trim().max(60)),
  middleInitial: optional(z.string().trim().max(3)),
  phone: optional(z.string().trim().regex(/^09\d{9}$/, "Mobile number must be 11 digits starting with 09.")),
  email: optional(z.string().trim().toLowerCase().email("Enter a valid email address.")),
  branch: optional(z.string().trim().max(120)),
  residenceAddress: optional(z.string().trim().max(300)),
  employer: optional(z.string().trim().max(120)),
  employmentStatus: optional(z.enum(EMPLOYMENT_STATUSES)),
  dateOfBirth: optional(z.coerce.date()),
  joinedAt: optional(z.coerce.date({ message: "Enter a valid membership date." })),
  status: z.enum(MEMBER_STATUSES).default("active"),
  remarks: optional(z.string().trim().max(120)),
};

const createSchema = z.object({
  // The UDEI member number. Leave empty to get the next free number.
  memberId: optional(z.string().trim().max(32).regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and dashes only.")),
  ...fields,
});
const updateSchema = z.object(fields);

/** One more than the highest plain-number member ID (UDEI numbers its members 1, 2, 3...). */
async function nextMemberId() {
  const ids = await Member.find({ memberId: /^\d+$/ }).select("memberId").lean();
  return String(ids.reduce((m, x) => Math.max(m, Number(x.memberId)), 0) + 1);
}

const byMemberId = (a, b) => a.memberId.localeCompare(b.memberId, "en", { numeric: true });

/**
 * For the list: open loans in the system, the loan balance (system loans plus the balance carried
 * over from UDEI's spreadsheet) and the retirement plan, per member ID. Amounts in centavos.
 */
async function summaries(members) {
  const ids = members.map((m) => m.memberId);
  const [openLoans, planDocs] = await Promise.all([
    Loan.find({ memberId: { $in: ids }, status: { $in: ["for_release", "active"] } }),
    RetirementPlan.find({ memberId: { $in: ids } }),
  ]);
  const loanInfo = new Map();
  // Once a carried-over balance has a payroll deduction it is a ledger loan, counted with the loans.
  const ledgerLoan = new Map(openLoans.filter((l) => l.source === "ledger").map((l) => [l.memberId, { id: l._id, loanNo: l.loanNo }]));
  for (const l of openLoans) {
    const v = loanInfo.get(l.memberId) || { count: 0, balance: 0 };
    v.count += 1;
    if (l.status === "active") v.balance += loans.present(l).balance;
    loanInfo.set(l.memberId, v);
  }
  const plan = new Map(planDocs.map((p) => {
    const v = plans.present(p);
    return [p.memberId, { id: v._id, balance: v.balance, monthlyContribution: v.monthlyContribution, status: v.status }];
  }));
  return (m) => {
    const info = loanInfo.get(m.memberId) || { count: 0, balance: 0 };
    const moved = ledgerLoan.get(m.memberId) || null;
    const carried = !moved && m.openingLoan?.balance > 0 ? m.openingLoan.balance : 0;
    return { openLoans: info.count, loanBalance: info.balance + carried, plan: plan.get(m.memberId) || null, ledgerLoan: moved };
  };
}

/**
 * What the loan form's "History with UDEI" fields need: loans in the system plus those in UDEI's
 * spreadsheet ledger (the carried-over balance counts as one loan, and so does each 2026 release).
 * A member "On Amnesty" had fallen behind, so that counts as a late loan.
 */
async function historyOf(member) {
  return (await historiesFor([member])).get(member.memberId);
}

/** historyOf() for many members with one query, for the members list. */
async function historiesFor(members) {
  // A ledger loan is the carried-over balance, already counted below as a spreadsheet loan.
  const all = await Loan.find({ memberId: { $in: members.map((m) => m.memberId) }, status: { $in: ["active", "paid"] }, source: { $ne: "ledger" } });
  return new Map(members.map((m) => [m.memberId, historyFrom(m, all.filter((l) => l.memberId === m.memberId))]));
}

function historyFrom(member, released) {
  const lateInSystem = released.filter((l) => loans.present(l).pastDue || ["missed", "partial"].includes(l.lastDeduction?.result));
  const opening = member.openingLoan || {};
  const spreadsheetLoans = (opening.balanceStartOfYear > 0 ? 1 : 0) + (opening.loansThisYear || 0);
  const priorLoans = released.length + spreadsheetLoans;
  const amnesty = /amnesty/i.test(member.remarks || "") ? 1 : 0;
  const joined = member.joinedAt ? ledger.calendarDay(member.joinedAt).getTime() : null;
  const years = joined == null ? 0 : Math.max(0, Math.floor((ledger.todayInManila().getTime() - joined) / (365.25 * 86_400_000)));
  return {
    yearsAsMember: years,
    priorLoans,
    priorLatePayments: Math.min(priorLoans, lateInSystem.length + amnesty),
    // The spreadsheet balance, for the Bookkeeper section when the member has no loans in the system yet.
    carriedBalance: opening.balance > 0 ? opening.balance : 0,
    carriedAsOf: opening.asOf || null,
  };
}

router.get("/", async (req, res, next) => {
  try {
    const filter = {};
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
    if (q) {
      const re = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ memberId: re }, { fullName: re }];
    }
    if (typeof req.query.branch === "string" && req.query.branch) filter.branch = req.query.branch;
    if (MEMBER_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const members = (await Member.find(filter).limit(5000)).sort(byMemberId);
    const [summary, histories, signals] = await Promise.all([summaries(members), historiesFor(members), signalsFor(members.map((m) => m.memberId))]);
    res.json({
      members: members.map((m) => {
        const { score, band, coverage } = scoreOf(signals.get(m.memberId), histories.get(m.memberId));
        return { ...m.toJSON(), ...summary(m), score: { score, band, coverage } };
      }),
      nextMemberId: await nextMemberId(),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:memberId", async (req, res, next) => {
  try {
    const member = await Member.findOne({ memberId: String(req.params.memberId).slice(0, 32) });
    if (!member) return res.status(404).json({ error: "Member not found." });
    const [history, signals] = await Promise.all([historyOf(member), signalsFor([member.memberId])]);
    res.json({ member: member.toJSON(), history, score: scoreOf(signals.get(member.memberId), history) });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const data = parsed.data;
    let member;
    for (let attempt = 0; attempt < 3 && !member; attempt++) {
      const memberId = data.memberId || (await nextMemberId());
      try {
        member = await Member.create({ ...data, memberId, createdByName: req.user.fullName });
      } catch (err) {
        if (err?.code !== 11000) throw err;
        if (data.memberId) return res.status(409).json({ error: `Member ID ${data.memberId} is already used.` });
      }
    }
    auditNote(res, { target: `No. ${member.memberId} · ${member.fullName}` });
    res.status(201).json({ member: member.toJSON() });
  } catch (err) {
    next(err);
  }
});

const deductionSchema = z.object({
  perCutoff: z.coerce.number().int({ message: "Enter the amount in centavos." }).min(100, "Enter the amount to deduct.").max(100_000_000_00),
  paymentFrequency: z.enum(["quincenal", "monthly"], { message: "Choose quincenal or monthly." }),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of the first deduction."),
});

// The Bookkeeper sets how much payroll deducts for a balance carried over from the ledger. That
// makes it a loan with a schedule, so deduction runs include it and posted payments lower it.
router.post("/:memberId/payroll-deduction", requireRole("bookkeeper", "treasurer"), async (req, res, next) => {
  try {
    const parsed = deductionSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const member = await Member.findOne({ memberId: String(req.params.memberId).slice(0, 32) });
    if (!member) return res.status(404).json({ error: "Member not found." });
    auditNote(res, { target: `No. ${member.memberId} · ${member.fullName}`, before: { carriedBalance: member.openingLoan?.balance ?? 0 } });
    const loan = await loans.fromCarriedBalance(member, parsed.data, req.user);
    res.status(201).json({ loan: loans.present(loan) });
  } catch (err) {
    if (err instanceof loans.LoanError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

const billSchema = z.object({
  kind: z.enum(BILL_KINDS, { message: "Choose the kind of bill." }),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Choose the billing month."),
  status: z.enum(BILL_STATUSES, { message: "Choose on time, late or unpaid." }),
  note: z.string().trim().max(200).optional(),
});

// Utility and load bills a member showed proof of (alternative data for the member score).
router.get("/:memberId/bills", async (req, res, next) => {
  try {
    const bills = await BillRecord.find({ memberId: String(req.params.memberId).slice(0, 32) }).sort({ month: -1, createdAt: -1 }).limit(100);
    res.json({ bills });
  } catch (err) {
    next(err);
  }
});

router.post("/:memberId/bills", async (req, res, next) => {
  try {
    const parsed = billSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const member = await Member.findOne({ memberId: String(req.params.memberId).slice(0, 32) });
    if (!member) return res.status(404).json({ error: "Member not found." });
    if (parsed.data.month > ledger.todayInManila().toISOString().slice(0, 7)) return res.status(400).json({ error: "The billing month can't be in the future." });
    auditNote(res, { target: `No. ${member.memberId} · ${member.fullName}` });
    const bill = await BillRecord.create({ ...parsed.data, memberId: member.memberId, recordedByName: req.user.fullName });
    res.status(201).json({ bill });
  } catch (err) {
    next(err);
  }
});

router.post("/:memberId/bills/:billId/void", async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
    if (reason.length < 3) return res.status(400).json({ error: "Give a reason for voiding this record." });
    if (!mongoose.isValidObjectId(req.params.billId)) return res.status(404).json({ error: "Record not found." });
    const bill = await BillRecord.findOneAndUpdate(
      { _id: req.params.billId, memberId: String(req.params.memberId).slice(0, 32), voided: false },
      { $set: { voided: true, voidReason: reason } },
      { returnDocument: "after" },
    );
    if (!bill) return res.status(404).json({ error: "Record not found or already voided." });
    res.json({ bill });
  } catch (err) {
    next(err);
  }
});

// The member ID can't change: loans, plans and accounts point to it.
router.patch("/:memberId", async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const member = await Member.findOne({ memberId: String(req.params.memberId).slice(0, 32) });
    if (!member) return res.status(404).json({ error: "Member not found." });
    // Only the fields that actually change, before and after.
    const changed = Object.keys(fields).filter((k) => String(member.get(k) ?? "") !== String(parsed.data[k] ?? ""));
    auditNote(res, {
      target: `No. ${member.memberId} · ${member.fullName}`,
      before: Object.fromEntries(changed.map((k) => [k, member.get(k) ?? null])),
      details: Object.fromEntries(changed.map((k) => [k, parsed.data[k] ?? null])),
    });
    for (const key of Object.keys(fields)) member.set(key, parsed.data[key]);
    member.updatedByName = req.user.fullName;
    await member.save();
    res.json({ member: member.toJSON() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
