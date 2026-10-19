// Loan math for Mutual Assistance loans. Plain functions, no Express or Mongoose, so it is easy to test.
// Every amount is an integer number of centavos (₱1 = 100) so sums never drift.
// Dates are calendar days stored as UTC midnight ("2026-10-31T00:00:00Z").

const DAY_MS = 86_400_000;
/** The first installment falls due at least this many days after release. */
const FIRST_DUE_MIN_DAYS = 10;

const toCentavos = (pesos) => Math.round(Number(pesos) * 100);

/**
 * Interest for the whole term. UEDI uses add-on interest: the monthly rate is charged on the full
 * principal for every month of the term (client/src/lib/applications.ts monthlyInstallment() and
 * ml-service/uedi_ml/features.py do the same). If UEDI moves to diminishing balance, change this
 * function and buildSchedule's split; nothing else computes interest.
 */
function totalInterest(principal, monthlyRate, termMonths) {
  return Math.round(principal * (monthlyRate / 100) * termMonths);
}

/** Midnight UTC of a calendar date given as "YYYY-MM-DD" or a Date. */
function calendarDay(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`);
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Today's date in the Philippines, as a calendar day. */
function todayInManila(now = new Date()) {
  return calendarDay(now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }));
}

const lastDayOfMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * Due dates for `count` installments. Quincenal: the 15th and the last day of each month.
 * Monthly: the last day of each month. The first is the first such date at least 10 days after release.
 */
function dueDates(releasedAt, paymentFrequency, count) {
  const earliest = calendarDay(releasedAt).getTime() + FIRST_DUE_MIN_DAYS * DAY_MS;
  const start = new Date(earliest);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  const dates = [];
  while (dates.length < count) {
    const days = paymentFrequency === "quincenal" ? [15, lastDayOfMonth(year, month)] : [lastDayOfMonth(year, month)];
    for (const day of days) {
      const t = Date.UTC(year, month, day);
      if (t >= earliest && dates.length < count) dates.push(new Date(t));
    }
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return dates;
}

const installmentCount = (termMonths, paymentFrequency) => termMonths * (paymentFrequency === "quincenal" ? 2 : 1);

/**
 * The repayment schedule. Principal and interest are split evenly; the last installment absorbs
 * the rounding so the schedule adds up exactly to principal + interest.
 */
function buildSchedule({ principal, monthlyRate, termMonths, paymentFrequency, releasedAt }) {
  const n = installmentCount(termMonths, paymentFrequency);
  const interest = totalInterest(principal, monthlyRate, termMonths);
  const dates = dueDates(releasedAt, paymentFrequency, n);
  const p = Math.floor(principal / n);
  const i = Math.floor(interest / n);
  return dates.map((dueDate, k) => {
    const last = k === n - 1;
    const principalDue = last ? principal - p * (n - 1) : p;
    const interestDue = last ? interest - i * (n - 1) : i;
    return { no: k + 1, dueDate, principalDue, interestDue, totalDue: principalDue + interestDue, paid: 0, interestPaid: 0, principalPaid: 0 };
  });
}

const totalPayable = (schedule) => schedule.reduce((s, x) => s + x.totalDue, 0);

/**
 * Applies the total of all non-voided payments to the schedule: oldest installment first, and
 * within an installment interest before principal. Returns a new schedule and any amount left
 * over (more than the loan's total), which callers must reject.
 */
function allocate(schedule, payments) {
  let left = payments.filter((p) => !p.voided).reduce((s, p) => s + p.amount, 0);
  const result = schedule.map((inst) => {
    const interestPaid = Math.min(left, inst.interestDue);
    left -= interestPaid;
    const principalPaid = Math.min(left, inst.principalDue);
    left -= principalPaid;
    return { ...inst, interestPaid, principalPaid, paid: interestPaid + principalPaid };
  });
  return { schedule: result, unapplied: left };
}

/** Balance, amount paid, next installment due and whether anything is past due, as of `today`. */
function summarize(schedule, today = todayInManila()) {
  const total = totalPayable(schedule);
  const amountPaid = schedule.reduce((s, x) => s + x.paid, 0);
  const todayMs = calendarDay(today).getTime();
  const open = schedule.filter((x) => x.paid < x.totalDue);
  const overdue = open.filter((x) => new Date(x.dueDate).getTime() < todayMs);
  const next = open[0];
  return {
    totalPayable: total,
    amountPaid,
    balance: total - amountPaid,
    nextDue: next ? { no: next.no, dueDate: next.dueDate, amount: next.totalDue - next.paid } : null,
    pastDue: overdue.length > 0,
    pastDueAmount: overdue.reduce((s, x) => s + x.totalDue - x.paid, 0),
    maturesOn: schedule.length ? schedule[schedule.length - 1].dueDate : null,
  };
}

module.exports = {
  toCentavos,
  totalInterest,
  calendarDay,
  todayInManila,
  dueDates,
  installmentCount,
  buildSchedule,
  totalPayable,
  allocate,
  summarize,
};
