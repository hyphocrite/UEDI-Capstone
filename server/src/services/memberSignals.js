// What the system knows about members besides their loan applications, as of a date: savings
// (retirement plan contributions), meeting and PMES attendance, utility/load bill payments and
// their record as co-makers. Used by the member score (services/memberScore.js) and early
// warning (services/earlyWarning.js). Every figure is computed from records dated on or before
// `asOf`, so the same code builds past snapshots for training (scripts/export-early-warning.js).

const Member = require("../models/Member");
const RetirementPlan = require("../models/RetirementPlan");
const Meeting = require("../models/Meeting");
const BillRecord = require("../models/BillRecord");
const Application = require("../models/Application");
const Loan = require("../models/Loan");
const loans = require("./loans");
const ledger = require("./ledger");

const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthIndex = (key) => {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
};
const DAY = 86_400_000;

/**
 * Savings from the retirement plan: how recently and how regularly the member deposits.
 * Only months the system has records for count. Months before the plan's imported opening
 * balance are unknown, and so are months after `recordedUntil`, the latest month anyone's
 * contribution was recorded: those haven't been entered yet, they weren't missed.
 */
function savingsOf(plan, asOf, recordedUntil = monthKey(asOf)) {
  if (!plan) return { hasPlan: false, monthsSinceLast: null, missed3m: null, rate12m: null, recordedUntil: null };
  // The last complete month we can judge: last month, or the last month with records if earlier.
  const now = Math.min(monthIndex(monthKey(asOf)), monthIndex(recordedUntil) + 1);
  const paid = new Set(
    plan.contributions.filter((c) => !c.voided && c.paidAt <= asOf && c.amount + (c.dues || 0) > 0).map((c) => monthIndex(c.month)),
  );
  const opened = plan.openingAsOf ? monthIndex(monthKey(new Date(plan.openingAsOf))) + 1 : -Infinity;
  const start = Math.max(monthIndex(monthKey(new Date(plan.startDate))), opened);
  // Complete months only: the current month may not be due yet.
  const window = (n) => Array.from({ length: n }, (_, i) => now - 1 - i).filter((m) => m >= start);
  const last12 = window(12);
  const last3 = window(3);
  const lastPaid = [...paid].filter((m) => m <= now).sort((a, b) => b - a)[0];
  return {
    hasPlan: true,
    // Whole months without a deposit since the last one: 0 when the latest complete month was paid.
    monthsSinceLast: lastPaid === undefined ? Math.max(0, now - start) : Math.max(0, now - 1 - lastPaid),
    missed3m: last3.length ? last3.filter((m) => !paid.has(m)).length : null,
    rate12m: last12.length ? last12.filter((m) => paid.has(m)).length / last12.length : null,
    recordedUntil,
  };
}

/**
 * Signals per member ID, as of `asOf` (default: today in Manila).
 * @returns {Promise<Map<string, object>>}
 */
async function signalsFor(memberIds, asOf = ledger.todayInManila()) {
  const ids = [...new Set(memberIds.filter(Boolean))];
  const yearAgo = new Date(asOf.getTime() - 365 * DAY);
  const [members, plans, meetings, bills, asCoMaker, ownApps] = await Promise.all([
    Member.find({ memberId: { $in: ids } }).lean(),
    RetirementPlan.find({ memberId: { $in: ids } }).lean(),
    Meeting.find({ date: { $lte: asOf } }).lean(),
    BillRecord.find({ memberId: { $in: ids }, voided: false, month: { $gte: monthKey(yearAgo), $lte: monthKey(asOf) } }).lean(),
    Application.find({ coMakers: { $elemMatch: { memberId: { $in: ids }, status: "accepted" } }, createdAt: { $lte: asOf } }).select("coMakers loanId applicant.memberId").lean(),
    Application.find({ "applicant.memberId": { $in: ids }, createdAt: { $lte: asOf } }).select("coMakers applicant.memberId").lean(),
  ]);
  // The latest month with any contribution recorded on or before asOf, for anyone.
  const [latest] = await RetirementPlan.aggregate([
    { $unwind: "$contributions" },
    { $match: { "contributions.voided": false, "contributions.paidAt": { $lte: asOf } } },
    { $group: { _id: null, month: { $max: "$contributions.month" } } },
  ]);
  const recordedUntil = latest?.month ?? monthKey(asOf);
  const vouchedLoanIds = asCoMaker.map((a) => a.loanId).filter(Boolean);
  const vouchedLoans = new Map((await Loan.find({ _id: { $in: vouchedLoanIds } })).map((l) => [String(l._id), l]));

  const out = new Map();
  for (const id of ids) {
    const member = members.find((m) => m.memberId === id);
    const joined = member?.joinedAt ? new Date(member.joinedAt) : null;
    const plan = plans.find((p) => p.memberId === id);

    // Meetings held in the last 12 months while they were a member.
    const held = meetings.filter((m) => m.kind !== "pmes" && m.date >= yearAgo && (!joined || m.date >= joined));
    const attended = held.filter((m) => m.attendees.includes(id)).length;
    const pmes = meetings.some((m) => m.kind === "pmes" && m.attendees.includes(id));

    const myBills = bills.filter((b) => b.memberId === id);
    const late = myBills.filter((b) => b.status !== "on_time").length;

    // As a co-maker: how the loans they vouched for are doing.
    const vouched = asCoMaker.filter((a) => a.coMakers.some((c) => c.memberId === id && c.status === "accepted") && a.loanId);
    let vouchedGood = 0;
    let vouchedBad = 0;
    for (const a of vouched) {
      const loan = vouchedLoans.get(String(a.loanId));
      if (!loan || loan.status === "for_release") continue;
      const s = loans.present(loan, asOf);
      const troubled = s.pastDue || ["missed", "partial"].includes(loan.lastDeduction?.result);
      if (troubled) vouchedBad++;
      else vouchedGood++;
    }
    // The guarantor network: different members who agreed to vouch for this member.
    const backers = new Set(
      ownApps.filter((a) => a.applicant.memberId === id).flatMap((a) => (a.coMakers || []).filter((c) => c.status === "accepted").map((c) => c.memberId)),
    ).size;

    out.set(id, {
      memberId: id,
      joinedAt: joined,
      onAmnesty: /amnesty/i.test(member?.remarks || ""),
      savings: savingsOf(plan, asOf, recordedUntil),
      meetings: { held12m: held.length, attended12m: attended, rate: held.length ? attended / held.length : null, pmes },
      bills: { recorded12m: myBills.length, late12m: late, lateRate: myBills.length ? late / myBills.length : null },
      coMaker: { vouched: vouchedGood + vouchedBad, good: vouchedGood, troubled: vouchedBad },
      backers,
    });
  }
  return out;
}

module.exports = { signalsFor, savingsOf, monthKey };
