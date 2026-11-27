// What counts as "late" for the member score, the loan history and early warning. Every late
// signal is judged by the schedule's due dates, not by months (the bookkeeper, 2026-11-24):
//   - a loan charged to a bonus has one due date, the bonus release; before it, it is on track;
//   - a payroll deduction counts as missed only in a month the loan was on payroll, so a bonus
//     loan, or a cash/bank month, with no payroll line is never "missed".
const ledger = require("./ledger");
const paymentModes = require("./paymentModes");

/** A posted payroll line that really was a missed or short deduction. */
function missedDeduction(loan, line, cutoffDate) {
  if (!line || !["missed", "partial"].includes(line.result)) return false;
  if (line.reason === "not_on_payroll") return false;
  return paymentModes.onPayroll(loan, cutoffDate);
}

/** The loan's latest posted payroll line was missed or short while it was on payroll. */
const lastDeductionMissed = (loan) => missedDeduction(loan, loan.lastDeduction, loan.lastDeduction?.cutoffDate);

/** Past due on a due date (a balance left after it), or a missed payroll deduction. */
function isLate(loan, asOf = ledger.todayInManila()) {
  if (!loan.schedule?.length) return false;
  return ledger.summarize(loan.schedule, asOf).pastDue || lastDeductionMissed(loan);
}

/**
 * True when nothing has fallen due and stayed unpaid by `asOf` for a loan that isn't on payroll
 * (bonus, cash, bank): it is waiting for its due date, which is on track.
 */
function waitingForDueDate(loan, asOf = ledger.todayInManila()) {
  if (paymentModes.onPayroll(loan, asOf)) return false;
  const t = ledger.calendarDay(asOf).getTime();
  return !loan.schedule.some((x) => new Date(x.dueDate).getTime() <= t && x.paid < x.totalDue);
}

module.exports = { missedDeduction, lastDeductionMissed, isLate, waitingForDueDate };
