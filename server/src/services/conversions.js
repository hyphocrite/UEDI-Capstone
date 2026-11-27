// Short-term mutual assistance (emergency) runs 1 to 5 months. If it isn't paid by the end of its
// term, it becomes long term automatically (the bookkeeper, 2026-11-24). It stays the same Loan and
// loan no., so payments, deduction runs and the audit trail stay together; the old schedule is
// kept in loan.conversions.
//
// convertOverdueShortTerm() runs at server start, every day at 00:30 Manila, and before a payroll
// deduction run is built (deductionRuns.createRun), so the run uses the converted schedule. It is
// idempotent and safe with two server instances: each conversion is one conditional update on
// loanType "emergency", so only one of them can win.
const AuditLog = require("../models/AuditLog");
const Loan = require("../models/Loan");
const User = require("../models/User");
const ledger = require("./ledger");
const settings = require("./settings");
const mailer = require("./mailer");

const DAY_MS = 86_400_000;
const peso = (c) => `PHP ${(c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (x) => (x.toObject ? x.toObject() : x);

/**
 * The schedule after conversion: what was already paid stays as settled installments (so the
 * payments still allocate exactly), then the unpaid balance (principal and unpaid interest) is
 * amortized over `termMonths` at `monthlyRate`, from the first cutoff after `today`.
 */
function convertedSchedule(schedule, { balance, monthlyRate, termMonths, paymentFrequency, today }) {
  const settled = schedule
    .filter((x) => x.paid > 0)
    .map((x) => ({ dueDate: x.dueDate, principalDue: x.principalPaid, interestDue: x.interestPaid, totalDue: x.paid }));
  // dueDates() starts at least 10 days after its date: start so the first is after today.
  const fresh = ledger.buildSchedule({
    principal: balance,
    monthlyRate,
    termMonths,
    paymentFrequency,
    releasedAt: new Date(ledger.calendarDay(today).getTime() + DAY_MS - 10 * DAY_MS),
  });
  return [...settled, ...fresh].map((x, k) => ({ ...x, no: k + 1, paid: 0, interestPaid: 0, principalPaid: 0 }));
}

/** Short term past its last due date (plus the grace days) with a balance left. */
function isOverdueShortTerm(loan, today, graceDays) {
  if (loan.status !== "active" || loan.loanType !== "emergency" || !loan.schedule?.length) return false;
  const last = ledger.calendarDay(loan.schedule[loan.schedule.length - 1].dueDate).getTime();
  return ledger.calendarDay(today).getTime() - last > graceDays * DAY_MS && ledger.summarize(loan.schedule).balance > 0;
}

/** Converts every overdue short-term loan. Returns the converted loans. `today` can be set for tests. */
async function convertOverdueShortTerm(today = ledger.todayInManila()) {
  const rules = await settings.get();
  const graceDays = rules.shortTermGraceDays;
  const longTerm = rules.products.long_term;
  const candidates = await Loan.find({ status: "active", loanType: "emergency" });
  const converted = [];
  for (const loan of candidates) {
    if (!isOverdueShortTerm(loan, today, graceDays)) continue;
    const oldSchedule = loan.schedule.map(plain);
    const balance = ledger.summarize(oldSchedule).balance;
    const termMonths = rules.conversionTermMonths;
    const schedule = convertedSchedule(oldSchedule, { balance, monthlyRate: longTerm.monthlyRate, termMonths, paymentFrequency: loan.paymentFrequency, today });
    const at = new Date();
    // Conditional on loanType "emergency": a second run, or a second server, finds nothing to do.
    const updated = await Loan.findOneAndUpdate(
      { _id: loan._id, loanType: "emergency", status: "active" },
      {
        $set: { loanType: "long_term", monthlyRate: longTerm.monthlyRate, termMonths, schedule },
        $push: { conversions: { at, fromType: "emergency", toType: "long_term", balance, oldSchedule, newTermMonths: termMonths, monthlyRate: longTerm.monthlyRate } },
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) continue;
    // Re-apply the payments to the new schedule (they cover the settled installments exactly).
    const { loan: done } = await require("./loans").recompute(updated);
    await AuditLog.create({
      userName: "System",
      role: "system",
      action: "Short term converted to long term",
      target: `${done.loanNo} · ${done.borrowerName}`,
      method: "JOB",
      path: "services/conversions.js",
      details: { balance, newTermMonths: termMonths, monthlyRate: longTerm.monthlyRate, lastDueDate: oldSchedule[oldSchedule.length - 1].dueDate, graceDays },
      status: 200,
      ok: true,
    }).catch((err) => console.error("Could not write the audit log:", err.message));
    notifyBorrower(done, balance, termMonths, longTerm.monthlyRate).catch(() => {});
    converted.push(done);
  }
  return converted;
}

/** Emails the borrower that their short term is now long term. Best effort. */
async function notifyBorrower(loan, balance, termMonths, rate) {
  const ids = new Set();
  if (loan.memberId) (await User.find({ memberId: loan.memberId }).select("_id")).forEach((u) => ids.add(String(u._id)));
  if (loan.application) {
    const app = await require("../models/Application").findById(loan.application).select("submittedBy");
    if (app?.submittedBy) ids.add(String(app.submittedBy));
  }
  const users = await User.find({ _id: { $in: [...ids] }, role: { $in: ["staff", "member"] } }).select("email fullName");
  const first = loan.schedule.find((x) => x.paid < x.totalDue);
  const text = `Your short-term mutual assistance ${loan.loanNo} is now long term. It wasn't fully paid by the end of its term, so the ${peso(balance)} left is spread over ${termMonths} months at ${rate}% per month.${first ? ` The first installment of ${peso(first.totalDue)} is due ${ledger.calendarDay(first.dueDate).toISOString().slice(0, 10)}.` : ""} Your payments so far stay on your ledger.`;
  await Promise.all(
    users.map((u) =>
      mailer
        .send({ to: u.email, subject: `Your mutual assistance ${loan.loanNo} is now long term`, text: `Hello ${u.fullName},\n\n${text}\n\nUDEI Mutual Assistance`, html: `<p>Hello ${u.fullName},</p><p>${text}</p><p>UDEI Mutual Assistance</p>` })
        .catch((err) => console.error("Conversion email failed:", err.message)),
    ),
  );
}

let lastDailyRun = null;
/**
 * Runs the conversion once a day at 00:30 Manila: a check every 5 minutes, no extra dependency.
 * Returns the timer so tests and shutdown can stop it.
 */
function scheduleDaily() {
  const tick = () => {
    const now = new Date();
    const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const day = ledger.todayInManila(now).toISOString().slice(0, 10);
    if (lastDailyRun === day || manila.getHours() * 60 + manila.getMinutes() < 30) return;
    lastDailyRun = day;
    convertOverdueShortTerm().then(
      (list) => list.length && console.log(`Converted ${list.length} short-term mutual assistance to long term.`),
      (err) => console.error("Short-term conversion failed:", err.message),
    );
  };
  const timer = setInterval(tick, 5 * 60 * 1000);
  timer.unref();
  return timer;
}

module.exports = { convertOverdueShortTerm, convertedSchedule, isOverdueShortTerm, scheduleDaily };
