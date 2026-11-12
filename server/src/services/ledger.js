// Loan math for Mutual Assistance loans. Plain functions, no Express or Mongoose, so it is easy to test.
// Every amount is an integer number of centavos (₱1 = 100) so sums never drift.
// Dates are calendar days stored as UTC midnight ("2026-10-31T00:00:00Z").

const DAY_MS = 86_400_000;
/** The first installment falls due at least this many days after release. */
const FIRST_DUE_MIN_DAYS = 10;

const toCentavos = (pesos) => Math.round(Number(pesos) * 100);

/**
 * Interest rate per installment, as a fraction. UEDI charges its monthly rate on the remaining
 * balance (2,000 on a 100,000 balance, then 1,800 at 90,000), so a quincenal installment carries
 * half the monthly rate.
 */
const periodRate = (monthlyRate, paymentFrequency) => monthlyRate / 100 / (paymentFrequency === "quincenal" ? 2 : 1);

/** Interest for the whole term: the sum of buildSchedule's interest on the remaining balance. */
function totalInterest(principal, monthlyRate, termMonths, paymentFrequency = "monthly") {
  return amortize(principal, monthlyRate, installmentCount(termMonths, paymentFrequency), paymentFrequency)
    .reduce((s, x) => s + x.interestDue, 0);
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
 * Equal installments with interest on the remaining balance (amortization). Each installment's
 * interest is the period rate on what is still owed; the rest of the installment repays principal.
 * The last installment clears the balance, so the schedule adds up exactly to the principal.
 * client/src/lib/applications.ts monthlyInstallment() and ml-service/uedi_ml/features.py use
 * the same formula.
 */
function amortize(principal, monthlyRate, n, paymentFrequency) {
  const r = periodRate(monthlyRate, paymentFrequency);
  const payment = r > 0 ? Math.round((principal * r) / (1 - (1 + r) ** -n)) : Math.ceil(principal / n);
  let balance = principal;
  const rows = [];
  for (let k = 0; k < n; k += 1) {
    const interestDue = Math.round(balance * r);
    const principalDue = k === n - 1 ? balance : Math.min(balance, payment - interestDue);
    balance -= principalDue;
    rows.push({ principalDue, interestDue });
  }
  return rows;
}

/** The repayment schedule: amortize()'s split on the due dates. */
function buildSchedule({ principal, monthlyRate, termMonths, paymentFrequency, releasedAt }) {
  const n = installmentCount(termMonths, paymentFrequency);
  const dates = dueDates(releasedAt, paymentFrequency, n);
  return amortize(principal, monthlyRate, n, paymentFrequency).map(({ principalDue, interestDue }, k) => ({
    no: k + 1,
    dueDate: dates[k],
    principalDue,
    interestDue,
    totalDue: principalDue + interestDue,
    paid: 0,
    interestPaid: 0,
    principalPaid: 0,
  }));
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
