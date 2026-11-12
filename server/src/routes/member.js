// API for the UDEI member mobile app. Members register themselves, apply for loans and see
// only their own applications and loans. Staff routes stay closed to them (requireStaff).
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const User = require("../models/User");
const Application = require("../models/Application");
const Loan = require("../models/Loan");
const Payment = require("../models/Payment");
const loans = require("../services/loans");
const { STEP_LABELS, currentStepOf } = require("../services/approvals");
const { createSchema, createApplication } = require("./applications");
const { signSession, requireAuth } = require("../middleware/auth");

const router = express.Router();

// Rate per month the coop charges, filled in by the server so members can't pick their own.
// Keep in step with DEFAULT_RATE in client/src/components/loan-application/applicationForm.ts.
const MEMBER_RATES = { long_term: 1.0, emergency: 1.5 };
const MAX_TERM = { long_term: 12, emergency: 6 };

const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128)
  .regex(/[A-Za-z]/, "Password must include a letter.")
  .regex(/[0-9]/, "Password must include a number.");

const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  memberNo: z.string().trim().min(1, "Enter your UDEI member number.").max(32),
  phone: z.string().trim().max(20).optional(),
  password,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

// What the member fills in on the phone. The rate, bookkeeper balances and agreement date are set here.
const applySchema = z.object({
  lastName: z.string().trim().min(1, "Enter your last name.").max(60),
  firstName: z.string().trim().min(1, "Enter your first name.").max(60),
  middleInitial: z.string().trim().max(3).optional(),
  residenceAddress: z.string().trim().min(5, "Enter your residence address.").max(300),
  employer: z.string().trim().min(2, "Enter your employer.").max(120),
  monthlySalary: z.coerce.number().positive("Enter your monthly salary."),
  netTakeHomePay: z.coerce.number().positive("Enter your net take-home pay."),
  loanType: z.enum(["long_term", "emergency"], { message: "Choose Long term or Emergency." }),
  amount: z.coerce.number().positive("Enter the loan amount."),
  termMonths: z.coerce.number().int().min(1, "Enter the term in months."),
  paymentFrequency: z.enum(["quincenal", "monthly"]).default("monthly"),
  purpose: z.string().trim().max(300).optional(),
  payrollDeduction: z.literal(true, { message: "You must authorize payroll deduction." }),
  autoRestructure: z.literal(true, { message: "You must agree to automatic restructuring." }),
});

const firstIssue = (result) => result.error.issues[0]?.message || "Invalid input.";

function requireMember(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in." });
  if (req.user.role !== "member") return res.status(403).json({ error: "This app is for UDEI members." });
  next();
}

const reply = (user) => ({ token: signSession(user), session: user.toSession() });

router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const { fullName, email, memberNo, phone, password: pw } = parsed.data;
    if (await User.exists({ email })) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    const passwordHash = await bcrypt.hash(pw, 12);
    const user = await User.create({ fullName, email, memberNo, phone, passwordHash, role: "member" });
    res.status(201).json(reply(user));
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "An account with this email already exists." });
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");
    const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: "Invalid email or password." });
    if (user.role !== "member") {
      return res.status(403).json({ error: "Staff accounts sign in on the UDEI office web app." });
    }
    user.lastLoginAt = new Date();
    await user.save();
    res.json(reply(user));
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth, requireMember);

router.get("/me", (req, res) => res.json({ session: req.user.toSession() }));

/** An application as the member sees it: progress through the signers, no model scores. */
function memberView(app) {
  const step = currentStepOf(app);
  return {
    id: app._id,
    applicationNo: app.applicationNo,
    status: app.status,
    waitingFor: app.status === "pending" ? STEP_LABELS[step] || null : null,
    signed: (app.approvals || []).map((a) => ({ step: STEP_LABELS[a.step] || a.step, decision: a.decision, signedAt: a.signedAt })),
    // Members are told why a loan was denied; other signers' notes stay internal.
    denialNote: app.status === "denied" ? (app.approvals || []).find((a) => a.decision === "denied")?.note || null : null,
    loan: app.loan,
    loanId: app.loanId || null,
    loanNo: app.loanNo || null,
    createdAt: app.createdAt,
  };
}

router.get("/applications", async (req, res, next) => {
  try {
    const apps = await Application.find({ submittedBy: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ applications: apps.map(memberView) });
  } catch (err) {
    next(err);
  }
});

router.post("/applications", async (req, res, next) => {
  try {
    const parsed = applySchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const f = parsed.data;
    if (f.termMonths > MAX_TERM[f.loanType]) {
      const label = f.loanType === "long_term" ? "Long term" : "Emergency";
      return res.status(400).json({ error: `${label} loans run at most ${MAX_TERM[f.loanType]} months.` });
    }
    if (await Application.exists({ submittedBy: req.user._id, status: "pending" })) {
      return res.status(409).json({ error: "You already have an application waiting for approval." });
    }
    // Run it through the same checks as an application typed in at the office.
    const full = createSchema.safeParse({
      applicant: {
        lastName: f.lastName,
        firstName: f.firstName,
        middleInitial: f.middleInitial,
        memberId: req.user.memberNo,
        residenceAddress: f.residenceAddress,
        employer: f.employer,
        monthlySalary: f.monthlySalary,
        netTakeHomePay: f.netTakeHomePay,
      },
      loan: {
        loanType: f.loanType,
        amount: f.amount,
        termMonths: f.termMonths,
        monthlyRate: MEMBER_RATES[f.loanType],
        paymentFrequency: f.paymentFrequency,
        purpose: f.purpose,
      },
      agreement: { payrollDeduction: true, autoRestructure: true, applicationDate: new Date() },
    });
    if (!full.success) return res.status(400).json({ error: firstIssue(full) });
    const app = await createApplication(full.data, req.user);
    res.status(201).json({ application: memberView(app) });
  } catch (err) {
    next(err);
  }
});

/** Loans that came from this member's own applications. */
async function ownLoanFilter(user) {
  const ids = await Application.find({ submittedBy: user._id, loanId: { $exists: true } }).distinct("_id");
  return { application: { $in: ids } };
}

const loanView = (loan) => {
  const l = loans.present(loan);
  return {
    id: l._id,
    loanNo: l.loanNo,
    loanType: l.loanType,
    status: l.status,
    principal: l.principal,
    monthlyRate: l.monthlyRate,
    termMonths: l.termMonths,
    paymentFrequency: l.paymentFrequency,
    releasedAt: l.release?.releasedAt || null,
    totalPayable: l.totalPayable,
    amountPaid: l.amountPaid,
    balance: l.balance,
    nextDue: l.nextDue,
    pastDue: l.pastDue,
    pastDueAmount: l.pastDueAmount,
    maturesOn: l.maturesOn,
    schedule: (l.schedule || []).map(({ no, dueDate, totalDue, paid }) => ({ no, dueDate, totalDue, paid })),
  };
};

// Every amount in the loan responses is integer centavos, like /api/loans.
router.get("/loans", async (req, res, next) => {
  try {
    const found = await Loan.find(await ownLoanFilter(req.user)).sort({ createdAt: -1 });
    res.json({ loans: found.map(loanView) });
  } catch (err) {
    next(err);
  }
});

router.get("/loans/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Loan not found." });
    const loan = await Loan.findOne({ _id: req.params.id, ...(await ownLoanFilter(req.user)) });
    if (!loan) return res.status(404).json({ error: "Loan not found." });
    const payments = await Payment.find({ loan: loan._id, voided: false }).sort({ paidAt: -1 });
    res.json({
      loan: loanView(loan),
      payments: payments.map((p) => ({ id: p._id, amount: p.amount, paidAt: p.paidAt, method: p.method })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
