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
router.get("/lookup", async (req, res, next) => {
  try {
    const id = typeof req.query.memberId === "string" ? req.query.memberId.trim().slice(0, 32) : "";
    if (!id) return res.status(400).json({ error: "Enter a member number." });
    const [member, account] = await Promise.all([Member.findOne({ memberId: id }).select("memberId fullName"), User.exists({ memberId: id })]);
    if (!member) return res.status(404).json({ error: `No UDEI member with number ${id}.` });
    if (!account) return res.status(404).json({ error: `${member.fullName} has no account yet, so they can't confirm as co-maker.` });
    res.json({ memberId: member.memberId, name: member.fullName });
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

module.exports = router;
