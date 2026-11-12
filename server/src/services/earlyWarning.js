// Early warning: for each active loan, the chance it misses a payment in the next 60 days, from
// the ML service's second model (ml-service/uedi_ml/early_warning.py). This module turns what the
// system records into that model's inputs. `snapshotsFor` works as of any date, so the same code
// builds training rows from history (scripts/export-early-warning.js).

const Loan = require("../models/Loan");
const Payment = require("../models/Payment");
const Application = require("../models/Application");
const DeductionRun = require("../models/DeductionRun");
const Member = require("../models/Member");
const ledger = require("./ledger");
const loans = require("./loans");
const ml = require("./mlClient");
const { signalsFor } = require("./memberSignals");

const DAY = 86_400_000;
const perMonthOf = (loan) => {
  const first = loan.schedule[0]?.totalDue ?? 0;
  return loan.paymentFrequency === "quincenal" ? 2 * first : first;
};

/** The model's inputs for each loan (active on `asOf`), keyed by loan id. Centavo amounts become ratios. */
async function snapshotsFor(loanList, asOf = ledger.todayInManila()) {
  if (!loanList.length) return new Map();
  const ids = loanList.map((l) => l._id);
  const memberIds = loanList.map((l) => l.memberId).filter(Boolean);
  const sixMonthsAgo = new Date(asOf.getTime() - 183 * DAY);
  const [payments, apps, runs, members, otherLoans, signals] = await Promise.all([
    Payment.find({ loan: { $in: ids }, voided: false, paidAt: { $lte: asOf } }).lean(),
    Application.find({ _id: { $in: loanList.map((l) => l.application).filter(Boolean) } }).select("coMakers applicant.netTakeHomePay").lean(),
    DeductionRun.find({ status: "posted", cutoffDate: { $gte: sixMonthsAgo, $lte: asOf }, "lines.loan": { $in: ids } }).select("lines.loan lines.result").lean(),
    Member.find({ memberId: { $in: memberIds } }).select("memberId openingLoan remarks").lean(),
    Loan.find({ memberId: { $in: memberIds }, _id: { $nin: ids }, "release.releasedAt": { $lte: asOf } }),
    signalsFor(memberIds, asOf),
  ]);

  const out = new Map();
  for (const loan of loanList) {
    const id = String(loan._id);
    const mine = payments.filter((p) => String(p.loan) === id);
    const released = new Date(loan.release?.releasedAt ?? loan.createdAt);
    const windowStart = new Date(asOf.getTime() - 90 * DAY);
    const dueIn90 = loan.schedule.filter((s) => s.dueDate > windowStart && s.dueDate <= asOf).reduce((a, s) => a + s.totalDue, 0);
    const paidIn90 = mine.filter((p) => p.paidAt > windowStart).reduce((a, p) => a + p.amount, 0);
    const paidToDate = mine.reduce((a, p) => a + p.amount, 0);
    const total = ledger.totalPayable(loan.schedule);
    const lastPaid = mine.reduce((a, p) => (p.paidAt > a ? p.paidAt : a), null);
    const app = apps.find((a) => loan.application && String(a._id) === String(loan.application));
    const missedRuns = runs.reduce((n, r) => n + r.lines.filter((l) => String(l.loan) === id && ["missed", "partial"].includes(l.result)).length, 0);

    // Past loans: the member's other loans in the system and the spreadsheet ledger.
    const member = members.find((m) => m.memberId === loan.memberId);
    const others = otherLoans.filter((l) => l.memberId === loan.memberId && l.release?.releasedAt < released);
    const lateOthers = others.filter((l) => loans.present(l, asOf).pastDue || ["missed", "partial"].includes(l.lastDeduction?.result)).length;
    const sheet = (member?.openingLoan?.balanceStartOfYear > 0 ? 1 : 0) + (member?.openingLoan?.loansThisYear || 0);
    const amnesty = /amnesty/i.test(member?.remarks || "");
    const prior = others.length + sheet;
    const sig = signals.get(loan.memberId);

    out.set(id, {
      id,
      months_since_last_contribution: sig?.savings.monthsSinceLast ?? null,
      contributions_missed_3m: sig?.savings.missed3m ?? null,
      contribution_rate_12m: sig?.savings.rate12m ?? null,
      has_plan: sig ? Number(sig.savings.hasPlan) : null,
      payment_ratio_90d: dueIn90 > 0 ? Math.min(2, paidIn90 / dueIn90) : 1,
      days_since_last_payment: Math.round((asOf - (lastPaid ?? released)) / DAY),
      missed_deductions_6m: missedRuns,
      installment_to_net_pay: app?.applicant?.netTakeHomePay ? Math.min(5, perMonthOf(loan) / 100 / app.applicant.netTakeHomePay) : null,
      balance_ratio: total ? Math.max(0, Math.min(1, (total - paidToDate) / total)) : null,
      loan_age_months: Math.max(0, Math.round((asOf - released) / (30.44 * DAY))),
      prior_late_rate: prior ? Math.min(1, (lateOthers + (amnesty ? 1 : 0)) / prior) : null,
      meeting_attendance_12m: sig?.meetings.rate ?? null,
      bills_late_rate_12m: sig?.bills.lateRate ?? null,
      co_makers: app ? (app.coMakers || []).filter((c) => c.status === "accepted").length : 0,
      on_amnesty: amnesty ? 1 : 0,
    });
  }
  return out;
}

/** Today's early warning for every active loan, highest chance first. */
async function current() {
  const active = await Loan.find({ status: "active" });
  const snaps = await snapshotsFor(active);
  const { results, version } = await ml.earlyWarning([...snaps.values()]);
  const byId = new Map(results.map((r) => [r.id, r]));
  const list = active.map((loan) => {
    const s = loans.present(loan);
    const r = byId.get(String(loan._id));
    return {
      loanId: loan._id,
      loanNo: loan.loanNo,
      borrowerName: loan.borrowerName,
      memberId: loan.memberId || null,
      balance: s.balance,
      nextDue: s.nextDue,
      pastDue: s.pastDue,
      probability: r?.probability ?? null,
      level: r?.level ?? null,
      reasons: r?.reasons ?? [],
      inputs: snaps.get(String(loan._id)),
    };
  });
  list.sort((a, b) => (b.probability ?? -1) - (a.probability ?? -1));
  return { loans: list, modelVersion: version };
}

module.exports = { snapshotsFor, current };
