const express = require("express");
const Loan = require("../models/Loan");
const Payment = require("../models/Payment");
const Application = require("../models/Application");
const Member = require("../models/Member");
const User = require("../models/User");
const RetirementPlan = require("../models/RetirementPlan");
const LedgerHistory = require("../models/LedgerHistory");
const ledger = require("../services/ledger");
const loans = require("../services/loans");
const plans = require("../services/retirementPlans");
const { currentStepOf } = require("../services/approvals");
const { atLeast } = require("../config/access");
const { requireStaff, requireLevel } = require("../middleware/auth");

// The office dashboard: today's work and the state of the books, in one request.
// Loan Officers and up. Money totals over time (collections) follow Reports: Treasurer and up.
const router = express.Router();
router.use(requireStaff, requireLevel("loan_officer"));

const HOUR = 3_600_000;
/** Same as the Pending Loans page: longer than this at one step is overdue. */
const OVERDUE_HOURS = 48;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** When an application reached its current step: the last signature, or when it was filed. */
const waitingSince = (a) => new Date(a.approvals?.at(-1)?.signedAt ?? a.createdAt).getTime();

router.get("/", async (req, res, next) => {
  try {
    const today = ledger.todayInManila();
    const now = Date.now();
    const money = atLeast(req.user.role, "treasurer");

    const [loanDocs, apps, memberCounts, waitingAccounts, planDocs] = await Promise.all([
      Loan.find({ status: { $in: ["for_release", "active"] } }).select("loanNo borrowerName memberId status schedule principal").limit(5000),
      Application.find({}).sort({ createdAt: -1 }).limit(2000).select("applicationNo applicant.fullName loan.amount loan.loanType status currentStep approvals createdAt assessment.ensemble.suggestion").lean(),
      Member.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
      // Member accounts that still have only their own new ID (N-…): the office should link them.
      User.countDocuments({ role: "staff", memberId: /^N-/ }),
      RetirementPlan.find({}).limit(5000),
    ]);

    // Loans
    const active = [];
    let forRelease = 0;
    for (const l of loanDocs) {
      if (l.status === "for_release") forRelease++;
      else active.push(loans.present(l, today));
    }
    const pastDue = active.filter((l) => l.pastDue);
    const dueSoon = active
      .filter((l) => l.nextDue && !l.pastDue)
      .sort((a, b) => new Date(a.nextDue.dueDate) - new Date(b.nextDue.dueDate))
      .slice(0, 5)
      .map((l) => ({ id: l._id, loanNo: l.loanNo, borrowerName: l.borrowerName, dueDate: l.nextDue.dueDate, amount: l.nextDue.amount }));

    // Applications
    const pending = apps.filter((a) => a.status === "pending");
    const stepOf = (a) => currentStepOf(a);
    const byStep = { bookkeeper: 0, crecom_chair: 0, president: 0, treasurer: 0 };
    for (const a of pending) if (byStep[stepOf(a)] !== undefined) byStep[stepOf(a)]++;
    const monthStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1) - 8 * HOUR; // Manila midnight
    const decidedThisMonth = { approved: 0, denied: 0 };
    for (const a of apps) {
      if (a.status === "pending" || !a.approvals?.length) continue;
      if (new Date(a.approvals.at(-1).signedAt).getTime() >= monthStart) decidedThisMonth[a.status === "approved" ? "approved" : "denied"]++;
    }

    // Retirement plans
    const presentedPlans = planDocs.map((p) => plans.present(p, today));

    // Members
    const members = Object.fromEntries(memberCounts.map((m) => [m._id, m.n]));

    const body = {
      generatedAt: new Date(),
      role: req.user.role,
      loans: {
        active: active.length,
        forRelease,
        outstanding: active.reduce((s, l) => s + l.balance, 0),
        pastDue: pastDue.length,
        pastDueAmount: pastDue.reduce((s, l) => s + l.pastDueAmount, 0),
        dueSoon,
      },
      applications: {
        pending: pending.length,
        awaitingYou: pending.filter((a) => stepOf(a) === req.user.role).length,
        overdue: pending.filter((a) => (now - waitingSince(a)) / HOUR >= OVERDUE_HOURS).length,
        byStep,
        decidedThisMonth,
        recent: apps.slice(0, 6).map((a) => ({
          id: a._id,
          applicationNo: a.applicationNo,
          fullName: a.applicant?.fullName,
          amount: a.loan?.amount,
          status: a.status,
          currentStep: stepOf(a),
          suggestion: a.assessment?.ensemble?.suggestion ?? null,
          createdAt: a.createdAt,
        })),
      },
      members: {
        total: memberCounts.reduce((s, m) => s + m.n, 0),
        active: members.active ?? 0,
        accountsToLink: waitingAccounts,
      },
      plans: {
        total: presentedPlans.length,
        behind: presentedPlans.filter((p) => p.status === "behind").length,
        balance: presentedPlans.reduce((s, p) => s + p.balance, 0),
      },
    };

    if (money) body.collections = await lastSixMonths(today);
    res.json(body);
  } catch (err) {
    next(err);
  }
});

/** Loan collections and plan contributions for the last six months (this one included), in centavos. */
async function lastSixMonths(today) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const months = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(Date.UTC(y, m - 5 + i, 1));
    return { label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`, start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)), loans: 0, plans: 0 };
  });
  const from = months[0].start;
  const to = months[5].end;
  const [payments, history, planDocs] = await Promise.all([
    // Offsets are paid from a new loan's proceeds, not new money coming in (as in Reports).
    Payment.find({ paidAt: { $gte: from, $lt: to }, voided: false, method: { $ne: "offset" } }).select("amount paidAt").lean(),
    LedgerHistory.find({ date: { $gte: from, $lt: to }, kind: "payment" }).select("amount date").lean(),
    RetirementPlan.find({ "contributions.paidAt": { $gte: from, $lt: to } }).select("contributions").lean(),
  ]);
  const add = (day, field, amount) => {
    const t = ledger.calendarDay(day).getTime();
    const b = months.find((x) => t >= x.start.getTime() && t < x.end.getTime());
    if (b) b[field] += amount;
  };
  for (const p of payments) add(p.paidAt, "loans", p.amount);
  for (const h of history) add(h.date, "loans", h.amount);
  for (const p of planDocs) for (const c of p.contributions || []) if (!c.voided) add(c.paidAt, "plans", c.amount + (c.dues || 0));
  return months.map(({ label, loans: l, plans: p }) => ({ label, loans: l, plans: p }));
}

module.exports = router;
