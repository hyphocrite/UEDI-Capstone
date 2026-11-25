const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const Application = require("../models/Application");
const Loan = require("../models/Loan");
const Member = require("../models/Member");
const User = require("../models/User");
const loans = require("../services/loans");
const { STEP_LABELS, currentStepOf } = require("../services/approvals");
const { auditNote } = require("../middleware/audit");
const { requireAuth } = require("../middleware/auth");
const { atLeast, seesAllLoans } = require("../config/access");
const coMakers = require("../services/coMakers");
const documentFiles = require("../services/documentFiles");

// The co-maker portal: what a member has been asked to vouch for, what they vouched for, and how
// those borrowers are paying. Any signed-in account linked to a member number (web or mobile).
const router = express.Router();
router.use(requireAuth);

const myMemberId = (user) => user.memberId || user.memberNo || null;
const respondSchema = z.object({
  decision: z.enum(["accepted", "declined"], { message: "Choose accept or decline." }),
  note: z.string().trim().max(300).optional(),
});

// Who a member number belongs to, for the application form. Only members with an account, by name.
// Staff also get the details printed on the co-maker form; members don't see other members' details.
router.get("/lookup", async (req, res, next) => {
  try {
    const id = typeof req.query.memberId === "string" ? req.query.memberId.trim().slice(0, 32) : "";
    if (!id) return res.status(400).json({ error: "Enter a member number." });
    const [member, account] = await Promise.all([Member.findOne({ memberId: id }).select("memberId fullName residenceAddress employer employmentStatus phone joinedAt"), User.exists({ memberId: id })]);
    if (!member) return res.status(404).json({ error: `No UDEI member with number ${id}.` });
    if (!account) return res.status(404).json({ error: `${member.fullName} has no account yet, so they can't confirm as co-maker.` });
    const body = { memberId: member.memberId, name: member.fullName };
    if (atLeast(req.user.role, "loan_officer")) {
      const { residenceAddress, employer, employmentStatus, phone, joinedAt } = member;
      body.details = { residenceAddress, employer, employmentStatus, phone, joinedAt };
    }
    res.json(body);
  } catch (err) {
    next(err);
  }
});

/** An application as a co-maker sees it: the loan asked for and where it is, no scores. */
const requestView = (app, memberId) => {
  const me = app.coMakers.find((c) => c.memberId === memberId);
  const step = currentStepOf(app);
  return {
    applicationId: app._id,
    applicationNo: app.applicationNo,
    borrowerName: app.applicant.fullName,
    amount: app.loan.amount,
    termMonths: app.loan.termMonths,
    loanType: app.loan.loanType,
    purpose: app.loan.purpose || null,
    filedAt: app.createdAt,
    status: app.status,
    waitingFor: app.status === "pending" ? STEP_LABELS[step] || null : null,
    myStatus: me?.status,
    respondedAt: me?.respondedAt || null,
    // The signed Co-Maker's Statement: uploaded or not, and whether the final signature needs it.
    statementUploaded: !!me?.statement?.fileId,
    statementUploadedAt: me?.statement?.uploadedAt || null,
    statementRequired: coMakers.statementRequired(app),
    otherCoMakers: app.coMakers.filter((c) => c.memberId !== memberId).map((c) => ({ name: c.name, status: c.status })),
    loanId: app.loanId || null,
  };
};

router.get("/", async (req, res, next) => {
  try {
    const memberId = myMemberId(req.user);
    if (!memberId) return res.json({ linked: false, requests: [], loans: [], alerts: [] });
    const apps = await Application.find({ "coMakers.memberId": memberId }).sort({ createdAt: -1 }).limit(100);
    const accepted = apps.filter((a) => a.coMakers.some((c) => c.memberId === memberId && c.status === "accepted") && a.loanId);
    const vouched = await Loan.find({ _id: { $in: accepted.map((a) => a.loanId) } });
    const loanViews = vouched.map((loan) => {
      const s = loans.present(loan);
      const missed = ["missed", "partial"].includes(loan.lastDeduction?.result);
      return {
        loanId: loan._id,
        loanNo: loan.loanNo,
        borrowerName: loan.borrowerName,
        status: loan.status,
        principal: loan.principal,
        balance: s.balance,
        amountPaid: s.amountPaid,
        totalPayable: s.totalPayable,
        nextDue: s.nextDue,
        pastDue: s.pastDue,
        pastDueAmount: s.pastDueAmount,
        lastDeduction: loan.lastDeduction?.result ? { result: loan.lastDeduction.result, cutoffDate: loan.lastDeduction.cutoffDate } : null,
        standing: loan.status === "paid" ? "paid" : s.pastDue || missed ? "behind" : "on_track",
      };
    });
    const alerts = loanViews
      .filter((l) => l.standing === "behind")
      .map((l) => ({
        loanId: l.loanId,
        text: l.pastDue
          ? `${l.borrowerName} is behind on loan ${l.loanNo}: ${(l.pastDueAmount / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })} past due.`
          : `${l.borrowerName}'s last payroll deduction on loan ${l.loanNo} was ${l.lastDeduction.result === "partial" ? "only partly made" : "missed"}.`,
      }));
    res.json({ linked: true, requests: apps.map((a) => requestView(a, memberId)), loans: loanViews, alerts });
  } catch (err) {
    next(err);
  }
});

// Accept or decline vouching for an application, while it is still pending.
router.post("/requests/:id", async (req, res, next) => {
  try {
    const parsed = respondSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const memberId = myMemberId(req.user);
    if (!memberId || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Request not found." });
    const app = await Application.findOne({ _id: req.params.id, "coMakers.memberId": memberId });
    if (!app) return res.status(404).json({ error: "Request not found." });
    auditNote(res, { action: parsed.data.decision === "accepted" ? "Co-maker accepted" : "Co-maker declined", target: `${app.applicationNo} · ${app.applicant.fullName}` });
    if (app.status !== "pending") return res.status(409).json({ error: `This application was already ${app.status}.` });
    const me = app.coMakers.find((c) => c.memberId === memberId);
    if (me.status !== "pending") return res.status(409).json({ error: `You already ${me.status} this request.` });
    const updated = await Application.findOneAndUpdate(
      { _id: app._id, coMakers: { $elemMatch: { memberId, status: "pending" } } },
      { $set: { "coMakers.$.status": parsed.data.decision, "coMakers.$.respondedAt": new Date(), "coMakers.$.note": parsed.data.note } },
      { returnDocument: "after" },
    );
    if (!updated) return res.status(409).json({ error: "You already answered this request." });
    res.json({ request: requestView(updated, memberId) });
  } catch (err) {
    next(err);
  }
});

/**
 * Who may open a co-maker's statement of an application: the co-maker themselves, the applicant
 * (who prints it for them), and staff. Returns { app, coMaker, own } or null.
 */
async function statementAccess(req) {
  const { applicationId, memberId } = req.params;
  if (!mongoose.isValidObjectId(applicationId)) return null;
  const app = await Application.findById(applicationId);
  const coMaker = app?.coMakers.find((c) => c.memberId === memberId);
  if (!coMaker) return null;
  const own = myMemberId(req.user) === memberId;
  if (!own && !seesAllLoans(req.user) && !app.submittedBy?.equals(req.user._id)) return null;
  return { app, coMaker, own };
}

// What the Co-Maker's Statement shows, filled from the saved application, for printing one
// co-maker's copy. The co-maker's own details (address, employer, contact) go only to the co-maker
// and staff; the applicant gets blank lines for the co-maker to fill in.
router.get("/forms/:applicationId/:memberId", async (req, res, next) => {
  try {
    const found = await statementAccess(req);
    if (!found) return res.status(404).json({ error: "Co-maker's statement not found." });
    const { app, coMaker, own } = found;
    let details;
    if (own || seesAllLoans(req.user)) {
      const m = await Member.findOne({ memberId: coMaker.memberId }).select("residenceAddress employer employmentStatus phone joinedAt");
      if (m) details = { residenceAddress: m.residenceAddress, employer: m.employer, employmentStatus: m.employmentStatus, phone: m.phone, joinedAt: m.joinedAt };
    }
    res.json({
      form: {
        applicationId: app._id,
        applicationNo: app.applicationNo,
        borrowerName: app.applicant.fullName,
        nonMember: !!app.nonMember,
        amount: app.loan.amount,
        termMonths: app.loan.termMonths,
        paymentFrequency: app.loan.paymentFrequency,
        applicationDate: app.agreement?.applicationDate,
        status: app.status,
        coMaker: { memberId: coMaker.memberId, name: coMaker.name, status: coMaker.status, details },
        statement: coMaker.statement?.fileId ? { fileName: coMaker.statement.fileName, uploadedAt: coMaker.statement.uploadedAt } : null,
        statementRequired: coMakers.statementRequired(app),
        canUpload: own && app.status === "pending" && coMaker.status !== "declined",
      },
    });
  } catch (err) {
    next(err);
  }
});

// The co-maker uploads their signed statement (photo or PDF), kept in GridFS like application
// documents. While the application is pending; a new upload replaces the earlier one.
router.put(
  "/requests/:id/statement",
  express.raw({ type: [...documentFiles.TYPES], limit: documentFiles.MAX_BYTES }),
  async (req, res, next) => {
    try {
      const memberId = myMemberId(req.user);
      if (!memberId || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Request not found." });
      const app = await Application.findOne({ _id: req.params.id, "coMakers.memberId": memberId });
      if (!app) return res.status(404).json({ error: "Request not found." });
      auditNote(res, { target: `${app.applicationNo} · ${app.applicant.fullName} · co-maker ${memberId}` });
      if (app.status !== "pending") return res.status(409).json({ error: `This application was already ${app.status}.` });
      const me = app.coMakers.find((c) => c.memberId === memberId);
      if (me.status === "declined") return res.status(409).json({ error: "You declined this request, so there is no statement to upload." });
      const type = req.get("content-type")?.split(";")[0];
      if (!Buffer.isBuffer(req.body) || !req.body.length || !documentFiles.TYPES.has(type)) {
        return res.status(415).json({ error: "Upload a JPEG, PNG, WebP or PDF file." });
      }
      const fileName = String(req.query.name || "").replace(/[\/\u0000-\u001f]/g, "").trim().slice(0, 255) || `co-maker-statement-${memberId}.${type.split("/")[1]}`;
      const fileId = await documentFiles.save(req.body, { fileName, contentType: type, applicationId: app._id, index: `co-maker:${memberId}` });
      const statement = { fileId, fileName, contentType: type, size: req.body.length, uploadedAt: new Date() };
      const updated = await Application.findOneAndUpdate(
        { _id: app._id, status: "pending", coMakers: { $elemMatch: { memberId, status: { $ne: "declined" } } } },
        { $set: { "coMakers.$.statement": statement } },
        { returnDocument: "after" },
      );
      if (!updated) return res.status(409).json({ error: "The application changed in the meantime. Reload and try again." });
      auditNote(res, { details: { fileName, size: req.body.length, replaced: !!me.statement?.fileId } });
      res.json({ request: requestView(updated, memberId) });
    } catch (err) {
      if (err?.type === "entity.too.large") return res.status(413).json({ error: "Files can be at most 10 MB." });
      next(err);
    }
  },
);

// The uploaded signed statement, for the co-maker, the applicant and staff.
router.get("/forms/:applicationId/:memberId/statement", async (req, res, next) => {
  try {
    const found = await statementAccess(req);
    const st = found?.coMaker.statement;
    if (!st?.fileId) return res.status(404).json({ error: "The signed statement was not uploaded yet." });
    res.setHeader("Content-Type", st.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(st.fileName)}"`);
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    const stream = documentFiles.open(st.fileId);
    stream.on("error", (err) => (res.headersSent ? res.destroy(err) : next(err)));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
