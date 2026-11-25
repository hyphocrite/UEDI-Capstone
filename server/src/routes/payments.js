// Payments outside payroll (cash, e-money, bank transfer): submitted, received by the Treasurer with
// an Official Receipt, then confirmed by the Bookkeeper, which posts them to the loan. See
// services/paymentSubmissions.js. Amounts are integer centavos.
const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const Loan = require("../models/Loan");
const PaymentSubmission = require("../models/PaymentSubmission");
const subs = require("../services/paymentSubmissions");
const documentFiles = require("../services/documentFiles");
const { LoanError } = require("../services/loans");
const { requireAuth, requireRole } = require("../middleware/auth");
const { atLeast, seesAllLoans } = require("../config/access");
const { auditNote } = require("../middleware/audit");

const router = express.Router();
router.use(requireAuth);

const calendarDate = (what) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${what}.`);

const submitSchema = z.object({
  amount: z.coerce.number().int({ message: "Enter the amount in centavos." }).min(1, "Enter the amount paid.").max(100_000_000_00),
  method: z.enum(["cash", "e_money", "bank_transfer"], { message: "Choose cash, e-money or bank transfer." }),
  paidAt: calendarDate("date paid"),
  reference: z.string().trim().max(60).optional(),
  note: z.string().trim().max(300).optional(),
});
const officeSchema = submitSchema.extend({ loanId: z.string().refine(mongoose.isValidObjectId, "Choose the mutual assistance (loan).") });
const receiveSchema = z.object({
  orNumber: z.string().trim().min(1, "Enter the OR number.").max(30, "The OR number is at most 30 characters."),
  receivedAt: calendarDate("date received"),
});
const rejectSchema = z.object({ reason: z.string().trim().min(3, "Give a reason for rejecting this payment.").max(300) });

/** Bookkeeper, Treasurer and up see the Payments list. */
const reviews = (user) => user.role === "bookkeeper" || atLeast(user.role, "treasurer");
const OFFICE = ["bookkeeper", "treasurer"];

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof LoanError) return res.status(err.status).json({ error: err.message });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Files can be at most 10 MB." });
    next(err);
  }
};

const parse = (schema, req, res) => {
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) res.status(400).json({ error: parsed.error.issues[0].message });
  return parsed.success ? parsed.data : null;
};

const target = (x) => `${x.loanNo} · ${x.borrowerName}`;

/**
 * The borrower reports a payment on their own loan (web My Mutual Assistance, and the mobile app via
 * POST /api/member/loans/:id/payments). `loanIdOf` says where the loan id is in the request.
 */
const memberSubmit = (loanIdOf) =>
  handle(async (req, res) => {
    const body = parse(submitSchema, req, res);
    if (!body) return;
    const id = loanIdOf(req);
    const loan = mongoose.isValidObjectId(id) ? await Loan.findById(id) : null;
    if (!loan || !(await subs.ownsLoan(req.user, loan))) return res.status(404).json({ error: "Mutual assistance not found." });
    auditNote(res, { target: target(loan) });
    const sub = await subs.create(loan, body, req.user, "member");
    res.status(201).json({ submission: subs.view(sub) });
  });

// Staff (Treasurer or Bookkeeper) record a walk-in payment; anyone else reports one on their own loan.
router.post(
  "/",
  handle(async (req, res, next) => {
    if (!OFFICE.includes(req.user.role)) return memberSubmit((r) => r.body?.loanId)(req, res, next);
    const body = parse(officeSchema, req, res);
    if (!body) return;
    const loan = await Loan.findById(body.loanId);
    if (!loan) return res.status(404).json({ error: "Mutual assistance not found." });
    auditNote(res, { target: target(loan) });
    const sub = await subs.create(loan, body, req.user, "office");
    res.status(201).json({ submission: subs.view(sub) });
  }),
);

/** month "YYYY-MM" → [first day, first day of next month) on paidAt. */
function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return null;
  const [y, m] = month.split("-").map(Number);
  return { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
}

router.get(
  "/",
  handle(async (req, res) => {
    if (!reviews(req.user)) return res.status(403).json({ error: "You do not have access to this action." });
    const filter = {};
    if (PaymentSubmission.SUBMISSION_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const range = monthRange(req.query.month);
    if (range) filter.paidAt = range;
    if (mongoose.isValidObjectId(req.query.loan)) filter.loan = req.query.loan;
    const found = await PaymentSubmission.find(filter).sort({ paidAt: -1, createdAt: -1 }).limit(2000);
    res.json({ submissions: found.map(subs.view) });
  }),
);

// What waits on each signer, for the badges in the navigation.
router.get(
  "/counts",
  handle(async (req, res) => {
    if (!reviews(req.user)) return res.json({ submitted: 0, received: 0 });
    const [submitted, received] = await Promise.all([PaymentSubmission.countDocuments({ status: "submitted" }), PaymentSubmission.countDocuments({ status: "received" })]);
    res.json({ submitted, received });
  }),
);

// The borrower's own submissions on one loan (web). Staff use GET /?loan=.
router.get(
  "/mine",
  handle(async (req, res) => {
    const loan = mongoose.isValidObjectId(req.query.loan) ? await Loan.findById(req.query.loan) : null;
    if (!loan || !(await subs.ownsLoan(req.user, loan))) return res.json({ submissions: [] });
    const found = await PaymentSubmission.find({ loan: loan._id }).sort({ createdAt: -1 }).limit(200);
    res.json({ submissions: found.map(subs.view) });
  }),
);

async function findSub(req, res) {
  const sub = mongoose.isValidObjectId(req.params.id) ? await PaymentSubmission.findById(req.params.id) : null;
  if (!sub) {
    res.status(404).json({ error: "Payment not found." });
    return null;
  }
  auditNote(res, { target: target(sub) });
  return sub;
}

/** Staff who review payments, and the borrower. */
async function canSee(user, sub) {
  if (seesAllLoans(user)) return true;
  const loan = await Loan.findById(sub.loan).select("memberId application");
  return !!loan && (await subs.ownsLoan(user, loan));
}

router.get(
  "/:id",
  handle(async (req, res) => {
    const sub = await findSub(req, res);
    if (!sub) return;
    if (!(await canSee(req.user, sub))) return res.status(404).json({ error: "Payment not found." });
    res.json({ submission: subs.view(sub) });
  }),
);

// The proof photo or PDF: by whoever submitted it, or the Treasurer/Bookkeeper, until received.
router.put(
  "/:id/proof",
  express.raw({ type: [...documentFiles.TYPES], limit: documentFiles.MAX_BYTES }),
  handle(async (req, res) => {
    const sub = await findSub(req, res);
    if (!sub) return;
    if (!sub.submittedBy.equals(req.user._id) && !OFFICE.includes(req.user.role)) return res.status(404).json({ error: "Payment not found." });
    const type = req.get("content-type")?.split(";")[0];
    if (!Buffer.isBuffer(req.body) || !req.body.length || !documentFiles.TYPES.has(type)) {
      return res.status(415).json({ error: "Upload a JPEG, PNG, WebP or PDF file." });
    }
    if (sub.status !== "submitted") return res.status(409).json({ error: "The proof can only be changed before the Treasurer receives the payment." });
    const fileName = String(req.query.name || "").replace(/[/\u0000-\u001f]/g, "").trim().slice(0, 255) || `proof-of-payment.${type.split("/")[1]}`;
    const fileId = await documentFiles.save(req.body, { fileName, contentType: type, applicationId: sub.loan, index: `payment:${sub._id}` });
    const updated = await subs.attachProof(sub, { fileId, fileName, contentType: type, size: req.body.length, uploadedAt: new Date() });
    auditNote(res, { details: { fileName, size: req.body.length, replaced: !!sub.proof?.fileId } });
    res.json({ submission: subs.view(updated) });
  }),
);

router.get(
  "/:id/proof",
  handle(async (req, res, next) => {
    const sub = await findSub(req, res);
    if (!sub) return;
    if (!(await canSee(req.user, sub)) || !sub.proof?.fileId) return res.status(404).json({ error: "No proof of payment was uploaded." });
    res.setHeader("Content-Type", sub.proof.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(sub.proof.fileName)}"`);
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    const stream = documentFiles.open(sub.proof.fileId);
    stream.on("error", (err) => (res.headersSent ? res.destroy(err) : next(err)));
    stream.pipe(res);
  }),
);

router.post(
  "/:id/receive",
  requireRole("treasurer"),
  handle(async (req, res) => {
    const body = parse(receiveSchema, req, res);
    if (!body) return;
    const sub = await findSub(req, res);
    if (!sub) return;
    const updated = await subs.receive(sub, body, req.user);
    auditNote(res, { details: { orNumber: body.orNumber, receivedAt: body.receivedAt, amount: sub.amount, method: sub.method } });
    res.json({ submission: subs.view(updated) });
  }),
);

router.post(
  "/:id/confirm",
  requireRole("bookkeeper"),
  handle(async (req, res) => {
    const sub = await findSub(req, res);
    if (!sub) return;
    const { submission, loan, payment } = await subs.confirm(sub, req.user);
    auditNote(res, { details: { orNumber: submission.received.orNumber, amount: submission.amount, method: submission.method, payment: payment._id } });
    subs.notifyMember(submission, "posted");
    res.json({ submission: subs.view(submission), loan: require("../services/loans").present(loan), payment });
  }),
);

router.post(
  "/:id/reject",
  requireRole("treasurer", "bookkeeper"),
  handle(async (req, res) => {
    const body = parse(rejectSchema, req, res);
    if (!body) return;
    const sub = await findSub(req, res);
    if (!sub) return;
    auditNote(res, { before: { status: sub.status } });
    const updated = await subs.reject(sub, body.reason, req.user);
    subs.notifyMember(updated, "rejected");
    res.json({ submission: subs.view(updated) });
  }),
);

module.exports = router;
module.exports.memberSubmit = memberSubmit;
