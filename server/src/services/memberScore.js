// The member score: an alternative-data credit score for every member, including those with
// no loan history. A transparent weighted score out of 100, not a black box, so staff can
// explain it: savings regularity, meeting and PMES attendance, utility/load bill payments,
// co-maker record, the guarantor network and past loan repayment.
//
// Parts with no data (no meetings held, no bills recorded, never a co-maker) are left out and
// the rest re-weighted, instead of counting as bad. `coverage` says how much of the score rests
// on real data; below 40% the score is labeled "Limited data".

const WEIGHTS = {
  savings: 30,
  savingsRecent: 10,
  attendance: 15,
  bills: 15,
  coMaker: 10,
  network: 5,
  repayment: 15,
};
const TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * @param signals from services/memberSignals.js
 * @param history { priorLoans, priorLatePayments } from the loan history (routes/members.js historyOf)
 */
function scoreOf(signals, history = { priorLoans: 0, priorLatePayments: 0 }) {
  const s = signals;
  const parts = [];
  const add = (key, label, value, detail) => parts.push({ key, label, weight: WEIGHTS[key], value, detail });

  if (!s.savings.hasPlan) add("savings", "Savings regularity", 0, "No retirement plan (savings) with UDEI.");
  else if (s.savings.rate12m === null) add("savings", "Savings regularity", null, "Plan started too recently to judge.");
  else add("savings", "Savings regularity", s.savings.rate12m, `Saved in ${pct(s.savings.rate12m)} of the months on record (up to 12)${s.savings.recordedUntil ? `, through ${s.savings.recordedUntil}` : ""}.`);

  if (s.savings.missed3m !== null) {
    add("savingsRecent", "Recent savings", 1 - s.savings.missed3m / 3,
      s.savings.missed3m === 0 ? "Saved every month for the last 3 months." : `Missed ${s.savings.missed3m} of the last 3 monthly deposits.`);
  } else add("savingsRecent", "Recent savings", null, "No recent months to judge.");

  if (s.meetings.rate !== null) {
    const v = Math.min(1, s.meetings.rate + (s.meetings.pmes ? 0.1 : 0));
    add("attendance", "Meeting attendance", v, `Attended ${s.meetings.attended12m} of ${s.meetings.held12m} meetings in 12 months${s.meetings.pmes ? ", and the PMES" : ""}.`);
  } else add("attendance", "Meeting attendance", s.meetings.pmes ? 1 : null, s.meetings.pmes ? "Attended the PMES; no meetings recorded since." : "No meetings recorded.");

  if (s.bills.lateRate !== null) {
    add("bills", "Utility and load bills", 1 - s.bills.lateRate, `${s.bills.recorded12m - s.bills.late12m} of ${s.bills.recorded12m} bills paid on time.`);
  } else add("bills", "Utility and load bills", null, "No bills recorded.");

  if (s.coMaker.vouched) {
    add("coMaker", "Co-maker record", s.coMaker.good / s.coMaker.vouched, `Vouched for ${s.coMaker.vouched} loan(s); ${s.coMaker.good} on track.`);
  } else add("coMaker", "Co-maker record", null, "Has not been a co-maker.");

  add("network", "Members who vouch for them", Math.min(s.backers, 2) / 2,
    s.backers ? `${s.backers} member(s) have agreed to be their co-maker.` : "No member has vouched for them yet.");

  if (history.priorLoans > 0) {
    const late = Math.min(1, history.priorLatePayments / history.priorLoans);
    add("repayment", "Past loan repayment", s.onAmnesty ? Math.min(1 - late, 0.3) : 1 - late,
      s.onAmnesty ? "On amnesty for an earlier loan." : `${history.priorLoans - history.priorLatePayments} of ${history.priorLoans} past loans paid without being late.`);
  } else add("repayment", "Past loan repayment", null, "No past loans.");

  const known = parts.filter((p) => p.value !== null);
  const knownWeight = known.reduce((a, p) => a + p.weight, 0);
  const score = knownWeight ? Math.round((known.reduce((a, p) => a + p.weight * p.value, 0) / knownWeight) * 100) : null;
  const coverage = knownWeight / TOTAL;
  const band = score === null || coverage < 0.4 ? "limited" : score >= 80 ? "strong" : score >= 60 ? "good" : score >= 40 ? "fair" : "weak";
  return { score, band, coverage: Math.round(coverage * 100) / 100, parts };
}

module.exports = { scoreOf, WEIGHTS };
