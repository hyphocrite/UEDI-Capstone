// How a member pays their mutual assistance (the bookkeeper, 2026-11-24): payroll deduction (the
// usual), charged to a bonus (Mid-year, Year-end, CNA or SRI), cash, e-money or bank transfer.
// Plain functions, no Express or Mongoose. Dates are calendar days at UTC midnight (ledger.js).
//
// A member can change the mode for a coming month only up to modeChangeCutoffDay (Settings),
// because the Bookkeeper bills HR for payroll deductions in the first week. Later changes start
// the next month. Paying cash ahead while staying on payroll is an advance, not a mode change.
const ledger = require("./ledger");

const PAYMENT_MODES = ["payroll", "bonus", "cash", "e_money", "bank_transfer"];
const BONUS_TYPES = ["mid_year", "year_end", "cna", "sri"];

// One wording for "Mode of payment" everywhere: screens, exports, emails and print (the panel at the
// final defense). The web (client/src/lib/paymentModes.ts) and the app (mobile/src/paymentModes.ts)
// use the same words. Only labels: the stored values above don't change.
const MODE_LABELS = {
  payroll: "Salary deduction",
  bonus: "Charge to bonus",
  cash: "Cash (over the counter)",
  e_money: "E-wallet (GCash / Maya)",
  bank_transfer: "Bank deposit / transfer",
};
const BONUS_LABELS = { mid_year: "Mid-Year Bonus", year_end: "Year-End Bonus", cna: "CNA Incentive", sri: "SRI" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Salary deduction", or "Charge to Year-End Bonus". */
const modeLabel = (mode, bonusType) => (mode === "bonus" ? (BONUS_LABELS[bonusType] ? `Charge to ${BONUS_LABELS[bonusType]}` : MODE_LABELS.bonus) : MODE_LABELS[mode] || mode);

/** A label without its bracket part, for narrow places and sentences: "Cash", "E-wallet". */
const shortLabel = (label) => String(label).replace(/\s*\(.*\)$/, "");

const DAY_MS = 86_400_000;
const lastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const firstOfMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/**
 * The first release date of `bonusType` that falls at least `minDays` after `from`: this year's
 * date, or next year's when this year's is too soon or past.
 */
function nextBonusDate(calendar, bonusType, from, minDays = 10) {
  const c = calendar?.[bonusType];
  if (!c) throw new Error(`No release date is set for the ${BONUS_LABELS[bonusType] || bonusType}.`);
  const earliest = ledger.calendarDay(from).getTime() + minDays * DAY_MS;
  for (let y = ledger.calendarDay(from).getUTCFullYear(); ; y++) {
    const date = new Date(Date.UTC(y, c.month - 1, Math.min(c.day, lastDay(y, c.month - 1))));
    if (date.getTime() >= earliest) return date;
  }
}

/** Whole months from `a` to `b`, counting a part month as a month (at least 1). */
function monthsBetween(a, b) {
  const x = ledger.calendarDay(a);
  const y = ledger.calendarDay(b);
  let months = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
  if (y.getUTCDate() > x.getUTCDate()) months += 1;
  return Math.max(1, months);
}

/**
 * The bonus a loan is charged to, from `from`: its due date and term in months. Refuses when the
 * bonus is further away than the product's longest term.
 */
function bonusTerm(rules, loanType, bonusType, from) {
  const dueDate = nextBonusDate(rules.bonusCalendar, bonusType, from);
  const termMonths = monthsBetween(from, dueDate);
  const product = rules.products[loanType];
  if (product && termMonths > product.maxTermMonths) {
    const when = `${MONTHS[dueDate.getUTCMonth()]} ${dueDate.getUTCDate()}, ${dueDate.getUTCFullYear()}`;
    const err = new Error(`The next ${BONUS_LABELS[bonusType]} (${when}) is ${termMonths} months away, more than the ${product.maxTermMonths} months ${product.label} can run. Choose another bonus or mode of payment.`);
    err.status = 400;
    throw err;
  }
  return { dueDate, termMonths };
}

/**
 * The first day of the month a change made `today` takes effect: this month when made on or
 * before the cutoff day, otherwise next month.
 */
function effectiveFrom(today, cutoffDay) {
  const t = ledger.calendarDay(today);
  const first = firstOfMonth(t);
  return t.getUTCDate() <= cutoffDay ? first : new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
}

/** The plain sentence telling the member when the change starts. */
function whenItStarts(today, starts) {
  const t = ledger.calendarDay(today);
  const month = MONTHS[starts.getUTCMonth()];
  if (starts.getUTCMonth() === t.getUTCMonth() && starts.getUTCFullYear() === t.getUTCFullYear()) return `Your change starts this month (${month}).`;
  return `Your change starts in ${month}. ${MONTHS[t.getUTCMonth()]}'s payroll deduction is already billed.`;
}

/** The mode in effect on `date`: the latest history entry that started on or before it. */
function modeOn(loan, date) {
  const t = ledger.calendarDay(date).getTime();
  const history = [...(loan.paymentModeHistory || [])].sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom));
  // No history (loans from before modes existed): the loan's own mode, else payroll.
  if (!history.length) return { mode: loan.paymentMode || "payroll", bonusType: loan.bonusType };
  // Before the first entry, the first entry's mode (the one filed on the application).
  const current = history.filter((h) => new Date(h.effectiveFrom).getTime() <= t).pop() ?? history[0];
  return { mode: current.mode, bonusType: current.bonusType };
}

/** True when payroll deducts for this loan on `date` (its mode that month is payroll). */
const onPayroll = (loan, date) => modeOn(loan, date).mode === "payroll";

module.exports = {
  PAYMENT_MODES,
  BONUS_TYPES,
  MODE_LABELS,
  BONUS_LABELS,
  MONTHS,
  modeLabel,
  shortLabel,
  nextBonusDate,
  monthsBetween,
  bonusTerm,
  effectiveFrom,
  whenItStarts,
  modeOn,
  onPayroll,
  firstOfMonth,
};
