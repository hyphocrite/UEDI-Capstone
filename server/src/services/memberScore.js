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
 * @param history { priorLoans, priorLatePayments } from the loan history (services/memberHistory.js historyOf)
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
    add("coMaker", "Co-maker record", s.coMaker.good / s.coMaker.vouched, `Vouched for ${s.coMaker.vouched} mutual assistance; ${s.coMaker.good} on track.`);
  } else add("coMaker", "Co-maker record", null, "Has not been a co-maker.");

  add("network", "Members who vouch for them", Math.min(s.backers, 2) / 2,
    s.backers ? `${s.backers} member(s) have agreed to be their co-maker.` : "No member has vouched for them yet.");

  if (history.priorLoans > 0) {
    const late = Math.min(1, history.priorLatePayments / history.priorLoans);
    add("repayment", "Past mutual assistance repayment", s.onAmnesty ? Math.min(1 - late, 0.3) : 1 - late,
      s.onAmnesty ? "On amnesty for an earlier mutual assistance." : `${history.priorLoans - history.priorLatePayments} of ${history.priorLoans} past mutual assistance paid without being late.`);
  } else add("repayment", "Past mutual assistance repayment", null, "No past mutual assistance.");

  const known = parts.filter((p) => p.value !== null);
  const knownWeight = known.reduce((a, p) => a + p.weight, 0);
  const score = knownWeight ? Math.round((known.reduce((a, p) => a + p.weight * p.value, 0) / knownWeight) * 100) : null;
  const coverage = knownWeight / TOTAL;
  const band = score === null || coverage < 0.4 ? "limited" : score >= 80 ? "strong" : score >= 60 ? "good" : score >= 40 ? "fair" : "weak";
  return { score, band, coverage: Math.round(coverage * 100) / 100, parts };
}

// ---- What the member sees about their own score (GET /api/me/score) ----

const STRONG = 0.8;

/** The detail text, reworded from "them" (written for staff) to "you". */
function toYou(part) {
  const d = part.detail;
  const rules = [
    [/^No retirement plan \(savings\) with UDEI\.$/, "You don't have a retirement plan (savings) with UDEI yet."],
    [/^Plan started too recently to judge\.$/, "Your plan started too recently to judge."],
    [/^Saved in /, "You saved in "],
    [/^Saved every month/, "You saved every month"],
    [/^Missed /, "You missed "],
    [/^Attended the PMES; /, "You attended the PMES; "],
    [/^Attended /, "You attended "],
    [/^No meetings recorded\.$/, "No meetings recorded for you yet."],
    [/^(\d+) of (\d+) bills paid on time\.$/, "You paid $1 of $2 bills on time."],
    [/^No bills recorded\.$/, "No bills recorded for you yet."],
    [/^Vouched for /, "You vouched for "],
    [/^Has not been a co-maker\.$/, "You have not been a co-maker yet."],
    [/have agreed to be their co-maker\.$/, "have agreed to be your co-maker."],
    [/^No member has vouched for them yet\.$/, "No member has vouched for you yet."],
    [/^On amnesty for an earlier loan\.$/, "You are on amnesty for an earlier mutual assistance."],
    [/^(\d+) of (\d+) past mutual assistance paid without being late\.$/, "You paid $1 of $2 past mutual assistance without being late."],
    [/^No past mutual assistance\.$/, "You have no past mutual assistance."],
  ];
  return rules.reduce((text, [re, to]) => text.replace(re, to), d);
}

const youLabel = (label) => label.replace("vouch for them", "vouch for you");

/**
 * The tip for a part that pulls the score down, as a sentence to the member, or null when there
 * is nothing they can do about it (e.g. no past loans, or a plan too new to judge).
 */
function tipFor(part) {
  const { key, value, detail } = part;
  switch (key) {
    case "savings":
      if (/^No retirement plan/.test(detail)) return "Open a retirement plan (savings) with UDEI. Savings make up 40% of the score.";
      return value === null ? null : "Deposit to your retirement plan every month. Regular savings raise your score the most.";
    case "savingsRecent": {
      if (value === null) return null;
      const missed = /^Missed (\d+)/.exec(detail);
      return missed ? `You missed ${missed[1]} of the last 3 monthly deposits. Catching up helps.` : "Deposit to your retirement plan every month. Regular savings raise your score the most.";
    }
    case "attendance":
      // No PMES in the detail means it hasn't been taken.
      return /PMES/.test(detail) ? "Attend the next general assembly." : "Attend the PMES.";
    case "bills":
      return "Bring proof of your on-time electricity, water, internet or load payments to the UDEI office.";
    case "coMaker":
      return value === null ? null : "Help the members you vouch for stay on track. Their missed payments lower your score.";
    case "network":
      return "Ask a fellow member to vouch for you as co-maker on your next application.";
    case "repayment":
      return value === null ? null : "Keep your current mutual assistance up to date. Late payments lower your score.";
    default:
      return null;
  }
}

/**
 * Up to 3 tips for the parts that pull the score down most (weight × (1 − value); a part with no
 * data counts as 0 when the member can act on it), and up to 2 strengths: parts at 0.8 or higher,
 * as one-line "in favor" sentences.
 */
function tipsFor(result) {
  const weak = result.parts
    .filter((p) => p.value === null || p.value < STRONG)
    .map((p) => ({ part: p, tip: tipFor(p), pull: p.weight * (1 - (p.value ?? 0)) }))
    .filter((x) => x.tip)
    .sort((a, b) => b.pull - a.pull);
  const tips = [...new Set(weak.map((x) => x.tip))].slice(0, 3);
  const strengths = result.parts
    .filter((p) => p.value !== null && p.value >= STRONG)
    .sort((a, b) => b.weight * b.value - a.weight * a.value)
    .slice(0, 2)
    .map((p) => toYou(p));
  return { tips, strengths };
}

/** A score result as the member sees it: worded to "you", with tips and strengths. */
function memberView(result) {
  const { tips, strengths } = tipsFor(result);
  return {
    score: result.score,
    band: result.band,
    coverage: result.coverage,
    parts: result.parts.map((p) => ({ key: p.key, label: youLabel(p.label), weight: p.weight, value: p.value, detail: toYou(p) })),
    tips,
    strengths,
  };
}

module.exports = { scoreOf, tipsFor, memberView, WEIGHTS };
