const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const Loan = require("../models/Loan");
const Payment = require("../models/Payment");
const { PAYMENT_METHODS } = require("../models/Payment");
const loans = require("../services/loans");
const { requireAuth, requireRole } = require("../middleware/auth");

// Every amount in this API is an integer number of centavos (₱1 = 100).
const router = express.Router();
router.use(requireAuth);

const calendarDate = (what) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${what}.`);

const releaseSchema = z.object({
  releasedAt: calendarDate("release date"),
  voucherNo: z.string().trim().min(1, "Enter the voucher number.").max(40),
});

const paymentSchema = z.object({
  amount: z.coerce.number().int({ message: "Enter the amount in centavos." }).min(1, "Enter the amount paid.").max(100_000_000_00),
  paidAt: calendarDate("payment date"),
  method: z.enum(PAYMENT_METHODS, { message: "Choose payroll, cash or other." }),
  reference: z.string().trim().max(60).optional(),
});

const voidSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason for voiding this payment.").max(300),
});

const FILTERS = ["for_release", "active", "paid", "past_due"];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function findLoan(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Loan.findById(id);
}

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
    if (status) filter.status = status === "past_due" ? "active" : status;
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

router.get(
  "/:id",
  handle(async (req, res) => {
    const loan = await findLoan(req.params.id);
    if (!loan) return res.status(404).json({ error: "Loan not found." });
    const payments = await Payment.find({ loan: loan._id }).sort({ paidAt: -1, createdAt: -1 });
    res.json({ loan: loans.present(loan), payments });
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
    if (!mongoose.isValidObjectId(req.params.paymentId)) return res.status(404).json({ error: "Payment not found." });
    const { loan: updated, payment } = await loans.voidPayment(loan, req.params.paymentId, parsed.data.reason, req.user);
    res.json({ loan: loans.present(updated), payment });
  }),
);

module.exports = router;
