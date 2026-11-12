const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const Loan = require("../models/Loan");
const Payment = require("../models/Payment");
const Member = require("../models/Member");
const loans = require("../services/loans");
const { requireStaff, requireRole } = require("../middleware/auth");
const { seesAllLoans } = require("../config/access");
const { auditNote } = require("../middleware/audit");

// Every amount in this API is an integer number of centavos (₱1 = 100).
const router = express.Router();
router.use(requireStaff);

const calendarDate = (what) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${what}.`);

const releaseSchema = z.object({
  releasedAt: calendarDate("release date"),
  voucherNo: z.string().trim().min(1, "Enter the voucher number.").max(40),
  // Old loans of the same borrower to pay off from the proceeds.
  offsetLoanIds: z.array(z.string().refine(mongoose.isValidObjectId, "Unknown loan.")).max(20).default([]),
});

const paymentSchema = z.object({
  amount: z.coerce.number().int({ message: "Enter the amount in centavos." }).min(1, "Enter the amount paid.").max(100_000_000_00),
  paidAt: calendarDate("payment date"),
  // "offset" payments are only made by a release.
  method: z.enum(["payroll", "cash", "other"], { message: "Choose payroll, cash or other." }),
  reference: z.string().trim().max(60).optional(),
});

const voidSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason for voiding this payment.").max(300),
});

const FILTERS = ["for_release", "active", "paid", "past_due", "missed_deduction"];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function findLoan(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Loan.findById(id);
}

/** Members see only loans under their linked member ID; an unlinked member sees none. */
const canSee = (user, loan) => seesAllLoans(user) || (!!user.memberId && loan.memberId === user.memberId);

/** Runs a handler and turns LoanError into its HTTP status. */
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof loans.LoanError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

router.get(
  "/",
  handle(async (req, res) => {
    const status = FILTERS.includes(req.query.status) ? req.query.status : undefined;
    const filter = {};
    if (!seesAllLoans(req.user)) {
      if (!req.user.memberId) return res.json({ loans: [] });
      filter.memberId = req.user.memberId;
    }
    if (status === "missed_deduction") filter["lastDeduction.result"] = { $in: ["missed", "partial"] };
    else if (status) filter.status = status === "past_due" ? "active" : status;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
    if (q) {
      const re = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ loanNo: re }, { borrowerName: re }];
    }
    const found = await Loan.find(filter).sort({ createdAt: -1 }).limit(500);
    let list = found.map((l) => loans.present(l));
    if (status === "past_due") list = list.filter((l) => l.pastDue);
    res.json({ loans: list });
  }),
);

// Balances carried over from UDEI's spreadsheet ledger (scripts/import-udei.js). The spreadsheet
// only has yearly totals per member, not rates or schedules, so these are not Loan records.
router.get(
  "/carried",
  handle(async (req, res) => {
    // Balances with a payroll deduction set up are ledger loans now, listed with the other loans.
    const moved = await Loan.distinct("memberId", { source: "ledger" });
    const filter = { memberId: { $nin: moved }, $or: [{ "openingLoan.balance": { $gt: 0 } }, { "openingLoan.payments": { $gt: 0 } }] };
    if (!seesAllLoans(req.user)) {
      if (!req.user.memberId || moved.includes(req.user.memberId)) return res.json({ carried: [] });
      filter.memberId = req.user.memberId;
    }
    const found = await Member.find(filter).select("memberId fullName remarks openingLoan").limit(5000);
    const carried = found
      .map((m) => ({ memberId: m.memberId, fullName: m.fullName, remarks: m.remarks || null, ...m.openingLoan.toObject() }))
      .sort((a, b) => a.memberId.localeCompare(b.memberId, "en", { numeric: true }));
    res.json({ carried });
  }),
);

// The Bookkeeper section of the application form, from the ledger. Amounts in centavos.
router.get(
  "/balances",
  handle(async (req, res) => {
    const memberId = typeof req.query.memberId === "string" ? req.query.memberId.trim().slice(0, 32) : "";
    if (!memberId) return res.status(400).json({ error: "Give a member ID." });
    if (!seesAllLoans(req.user) && memberId !== req.user.memberId) {
      return res.status(403).json({ error: "You can only look up your own balances." });
    }
    res.json({ balances: await loans.balancesFor(memberId) });
  }),
);

router.get(
  "/:id",
  handle(async (req, res) => {
    const loan = await findLoan(req.params.id);
    if (!loan || !canSee(req.user, loan)) return res.status(404).json({ error: "Loan not found." });
    const payments = await Payment.find({ loan: loan._id }).sort({ paidAt: -1, createdAt: -1 });
    const otherActiveLoans = loan.status === "for_release" ? await loans.otherActiveLoans(loan) : undefined;
    res.json({ loan: loans.present(loan), payments, otherActiveLoans });
  }),
);

router.post(
  "/:id/release",
  requireRole("treasurer"),
  handle(async (req, res) => {
    const parsed = releaseSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const loan = await findLoan(req.params.id);
    if (!loan) return res.status(404).json({ error: "Loan not found." });
    auditNote(res, { target: `${loan.loanNo} · ${loan.borrowerName}` });
    const released = await loans.release(loan, parsed.data, req.user);
    res.json({ loan: loans.present(released) });
  }),
);

router.post(
  "/:id/payments",
  requireRole("bookkeeper", "treasurer"),
  handle(async (req, res) => {
    const parsed = paymentSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const loan = await findLoan(req.params.id);
    if (!loan) return res.status(404).json({ error: "Loan not found." });
    auditNote(res, { target: `${loan.loanNo} · ${loan.borrowerName}` });
    const { loan: updated, payment } = await loans.recordPayment(loan, parsed.data, req.user);
    res.status(201).json({ loan: loans.present(updated), payment });
  }),
);

router.post(
  "/:id/payments/:paymentId/void",
  requireRole("bookkeeper", "treasurer"),
  handle(async (req, res) => {
    const parsed = voidSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const loan = await findLoan(req.params.id);
    if (!loan) return res.status(404).json({ error: "Loan not found." });
    auditNote(res, { target: `${loan.loanNo} · ${loan.borrowerName}` });
    if (!mongoose.isValidObjectId(req.params.paymentId)) return res.status(404).json({ error: "Payment not found." });
    const { loan: updated, payment } = await loans.voidPayment(loan, req.params.paymentId, parsed.data.reason, req.user);
    res.json({ loan: loans.present(updated), payment });
  }),
);

module.exports = router;
