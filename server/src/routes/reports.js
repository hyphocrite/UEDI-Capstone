const express = require("express");
const Loan = require("../models/Loan");
const Payment = require("../models/Payment");
const Application = require("../models/Application");
const RetirementPlan = require("../models/RetirementPlan");
const LedgerHistory = require("../models/LedgerHistory");
const ledger = require("../services/ledger");
const { requireStaff, requireLevel } = require("../middleware/auth");

// Daily, weekly, monthly and yearly totals. Amounts are integer centavos.
// Sources: loans and payments in the system, UDEI's imported spreadsheet ledger (LedgerHistory),
// retirement plan contributions and applications.
const router = express.Router();
router.use(requireStaff, requireLevel("treasurer"));

const DAY = 86_400_000;
const PERIODS = ["daily", "weekly", "monthly", "yearly"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
const shortDay = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;

/** Buckets [start, end) in Manila calendar days, oldest first. */
function buckets(period, today) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  if (period === "daily") {
    return Array.from({ length: 14 }, (_, i) => {
      const start = new Date(today.getTime() - (13 - i) * DAY);
      return { label: shortDay(start), start, end: new Date(start.getTime() + DAY) };
    });
  }
  if (period === "weekly") {
    // Weeks start on Monday.
    const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY);
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(monday.getTime() - (11 - i) * 7 * DAY);
      return { label: `Week of ${shortDay(start)}`, start, end: new Date(start.getTime() + 7 * DAY) };
    });
  }
  if (period === "monthly") {
    return Array.from({ length: m + 1 }, (_, i) => ({ label: `${MONTHS[i]} ${y}`, start: utc(y, i, 1), end: utc(y, i + 1, 1) }));
  }
  return Array.from({ length: 6 }, (_, i) => ({ label: String(y - 5 + i), start: utc(y - 5 + i, 0, 1), end: utc(y - 4 + i, 0, 1) }));
}

const emptyRow = (b) => ({
  label: b.label,
  start: b.start,
  loansReleased: 0,
  newLoans: 0,
  loanCollections: 0,
  planContributions: 0,
  monthlyDues: 0,
  applications: 0,
  approved: 0,
  denied: 0,
});

/** Adds `amount` to `field` of the row whose period holds calendar day `day`. */
function addTo(rows, list, day, field, amount = 1) {
  const t = ledger.calendarDay(day).getTime();
  const i = list.findIndex((b) => t >= b.start.getTime() && t < b.end.getTime());
  if (i >= 0) rows[i][field] += amount;
}

// The Manila calendar day of a timestamp (applications and plans are stamped with real times).
const manilaDay = (date) => ledger.todayInManila(new Date(date));

router.get("/", async (req, res, next) => {
  try {
    const period = PERIODS.includes(req.query.period) ? req.query.period : "monthly";
    const list = buckets(period, ledger.todayInManila());
    const from = list[0].start;
    const to = list[list.length - 1].end;
    // Timestamps are compared a day wider on each side, then placed by their Manila date.
    const wide = { $gte: new Date(from.getTime() - DAY), $lt: new Date(to.getTime() + DAY) };

    const [released, payments, history, apps, planDocs] = await Promise.all([
      Loan.find({ "release.releasedAt": { $gte: from, $lt: to } }).select("principal release.releasedAt").lean(),
      // Offsets are paid from a new loan's proceeds, not new money coming in.
      Payment.find({ paidAt: { $gte: from, $lt: to }, voided: false, method: { $ne: "offset" } }).select("amount paidAt").lean(),
      LedgerHistory.find({ date: { $gte: from, $lt: to } }).lean(),
      Application.find({ $or: [{ createdAt: wide }, { "approvals.signedAt": wide }] }).select("createdAt status approvals").lean(),
      RetirementPlan.find({ "contributions.paidAt": { $gte: from, $lt: to } }).select("contributions").lean(),
    ]);

    const rows = list.map(emptyRow);
    for (const l of released) {
      addTo(rows, list, l.release.releasedAt, "loansReleased", l.principal);
      addTo(rows, list, l.release.releasedAt, "newLoans");
    }
    for (const p of payments) addTo(rows, list, p.paidAt, "loanCollections", p.amount);
    for (const h of history) {
      if (h.kind === "payment") addTo(rows, list, h.date, "loanCollections", h.amount);
      else {
        addTo(rows, list, h.date, "loansReleased", h.amount);
        addTo(rows, list, h.date, "newLoans");
      }
    }
    for (const a of apps) {
      addTo(rows, list, manilaDay(a.createdAt), "applications");
      // Decided on the day of the last signature (approved) or the denial.
      if (a.status !== "pending" && a.approvals?.length) {
        const last = a.approvals[a.approvals.length - 1];
        addTo(rows, list, manilaDay(last.signedAt), a.status === "approved" ? "approved" : "denied");
      }
    }
    for (const p of planDocs) {
      for (const c of p.contributions || []) {
        if (c.voided) continue;
        addTo(rows, list, c.paidAt, "planContributions", c.amount);
        addTo(rows, list, c.paidAt, "monthlyDues", c.dues);
      }
    }

    res.json({ period, from, to, generatedAt: new Date(), rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
