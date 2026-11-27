// Loan math for Mutual Assistance loans. Plain functions, no Express or Mongoose, so it is easy to test.
// Every amount is an integer number of centavos (₱1 = 100) so sums never drift.
// Dates are calendar days stored as UTC midnight ("2026-10-31T00:00:00Z").

const DAY_MS = 86_400_000;
/** The first installment falls due at least this many days after release. */
const FIRST_DUE_MIN_DAYS = 10;

const toCentavos = (pesos) => Math.round(Number(pesos) * 100);

/**
 * Interest rate per installment, as a fraction. UDEI charges its monthly rate on the remaining
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

/**
 * A loan charged to a bonus: one installment on the bonus release date, with interest at the
 * monthly rate on the whole balance for `months` (the months from release to that date).
 */
function buildBonusSchedule({ principal, monthlyRate, dueDate, months }) {
  const interestDue = Math.round((principal * monthlyRate * months) / 100);
  return [{ no: 1, dueDate: calendarDay(dueDate), principalDue: principal, interestDue, totalDue: principal + interestDue, paid: 0, interestPaid: 0, principalPaid: 0 }];
}

/**
 * The unpaid part of a schedule rebuilt from `from` (a change of payment mode to or from bonus).
 * Installments due before `from` stay as they are (paid or not); the principal still scheduled
 * after them is laid out again: on one bonus date (plan.bonus: { dueDate, months }), or in equal
 * installments (plan.installments: { termMonths, paymentFrequency }) on the cutoffs from `from`.
 * Payments are allocated again afterwards (loans.recompute), so nothing already paid is lost.
 */
function rebuildFrom(schedule, from, { monthlyRate, bonus, installments }) {
  const start = calendarDay(from).getTime();
  const kept = schedule.filter((x) => new Date(x.dueDate).getTime() < start);
  const principal = schedule.reduce((s, x) => s + x.principalDue, 0) - kept.reduce((s, x) => s + x.principalDue, 0);
  let rest = [];
  if (principal > 0 && bonus) {
    rest = buildBonusSchedule({ principal, monthlyRate, dueDate: bonus.dueDate, months: bonus.months });
  } else if (principal > 0) {
    const n = installmentCount(Math.max(1, installments.termMonths), installments.paymentFrequency);
    // dueDates() starts at least 10 days after its date, so start 10 days before `from`.
    const dates = dueDates(new Date(start - FIRST_DUE_MIN_DAYS * DAY_MS), installments.paymentFrequency, n);
    rest = amortize(principal, monthlyRate, n, installments.paymentFrequency).map(({ principalDue, interestDue }, k) => ({
      dueDate: dates[k], principalDue, interestDue, totalDue: principalDue + interestDue,
    }));
  }
  return [...kept, ...rest].map((x, k) => ({ ...x, no: k + 1, paid: 0, interestPaid: 0, principalPaid: 0 }));
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
    paidAhead: paidAhead(schedule, today),
    finishesAround: finishesAround(schedule, today),
  };
}

/**
 * Installments paid before their due date, from advance payments (cash, e-money, bank) allocated
 * oldest first: how many are fully paid, and the amount paid on not-yet-due installments.
 */
function paidAhead(schedule, today = todayInManila()) {
  const todayMs = calendarDay(today).getTime();
  const future = schedule.filter((x) => new Date(x.dueDate).getTime() > todayMs);
  return {
    count: future.filter((x) => x.totalDue > 0 && x.paid >= x.totalDue).length,
    amount: future.reduce((s, x) => s + x.paid, 0),
  };
}

/**
 * When the loan is paid off if payroll keeps deducting each scheduled installment in full on its
 * cutoff (it isn't reduced by advances): the due date by which the remaining cutoffs add up to the
 * balance. Null when paid, or when the balance outlasts the schedule (arrears): then it is
 * after the last due date.
 */
function finishesAround(schedule, today = todayInManila()) {
  const balance = totalPayable(schedule) - schedule.reduce((s, x) => s + x.paid, 0);
  if (balance <= 0) return null;
  const todayMs = calendarDay(today).getTime();
  let covered = 0;
  for (const x of schedule) {
    if (new Date(x.dueDate).getTime() < todayMs) continue;
    covered += x.totalDue;
    if (covered >= balance) return x.dueDate;
  }
  return null;
}

module.exports = {
  toCentavos,
  totalInterest,
  calendarDay,
  todayInManila,
  dueDates,
  installmentCount,
  buildSchedule,
  buildBonusSchedule,
  rebuildFrom,
  totalPayable,
  allocate,
  summarize,
  paidAhead,
  finishesAround,
};
