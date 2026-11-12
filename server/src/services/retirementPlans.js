// Retirement plan figures: balance, contributions this year, and months not yet paid.
const ledger = require("./ledger");

const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const nextMonth = (key) => {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * Months from the first one owed through the last finished month that have no contribution.
 * The first month owed is the later of the start month and the month after openingAsOf.
 * The current month isn't counted: payroll may not have posted it yet.
 */
function missedMonths(plan, paidMonths, today) {
  const start = ledger.calendarDay(plan.startDate);
  let first = monthKey(start);
  if (plan.openingAsOf) {
    const afterOpening = nextMonth(monthKey(ledger.calendarDay(plan.openingAsOf)));
    if (afterOpening > first) first = afterOpening;
  }
  const current = monthKey(ledger.calendarDay(today));
  const missed = [];
  for (let k = first; k < current; k = nextMonth(k)) if (!paidMonths.has(k)) missed.push(k);
  return missed;
}

/** The plan as the API returns it: stored fields plus balance, this year's total and missed months. */
function present(plan, today = ledger.todayInManila()) {
  const p = plan.toJSON ? plan.toJSON() : plan;
  const live = (p.contributions || []).filter((c) => !c.voided);
  const year = String(ledger.calendarDay(today).getUTCFullYear());
  const contributed = live.reduce((s, c) => s + c.amount, 0);
  const paidMonths = new Set(live.map((c) => c.month));
  // With no monthly amount set there is nothing to fall behind on.
  const missed = p.monthlyContribution > 0 ? missedMonths(p, paidMonths, today) : [];
  const last = [...paidMonths].sort().pop() || null;
  return {
    ...p,
    contributions: [...(p.contributions || [])].sort((a, b) => (a.month < b.month ? 1 : -1)),
    duesShare: p.monthlyContribution - p.planShare,
    balance: p.openingBalance + contributed,
    contributedThisYear: live.filter((c) => c.month.startsWith(year)).reduce((s, c) => s + c.amount, 0),
    duesThisYear: live.filter((c) => c.month.startsWith(year)).reduce((s, c) => s + c.dues, 0),
    lastMonthPaid: last,
    missedMonths: missed,
    status: missed.length ? "behind" : "up_to_date",
  };
}

module.exports = { monthKey, nextMonth, missedMonths, present };
