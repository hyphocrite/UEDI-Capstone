// Late signals by due dates (the bookkeeper, 2026-11-24): a loan charged to a bonus is judged only
// by its bonus date, and a month not on payroll is never a missed deduction.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp, approve, daysAgo } = require("./helpers");
const ledger = require("../src/services/ledger");
const lateness = require("../src/services/lateness");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let staff;

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
});

after(async () => {
  if (uri) await t.close();
});

const day = (s) => new Date(`${s}T00:00:00Z`);
const bonusLoan = (paid = 0) => ({
  paymentMode: "bonus",
  bonusType: "year_end",
  paymentModeHistory: [{ mode: "bonus", bonusType: "year_end", effectiveFrom: day("2000-01-01") }],
  schedule: [{ no: 1, dueDate: day("2026-12-15"), principalDue: 1_000_000, interestDue: 40_000, totalDue: 1_040_000, paid, interestPaid: 0, principalPaid: 0 }],
});

test("a bonus loan before its due date gives no late signal; after it, with a balance, it is late", () => {
  const loan = bonusLoan();
  assert.equal(lateness.isLate(loan, day("2026-11-25")), false);
  assert.equal(lateness.waitingForDueDate(loan, day("2026-11-25")), true, "early warning treats it as on track");
  assert.equal(lateness.isLate(loan, day("2026-12-16")), true, "a balance left after the bonus date");
  assert.equal(lateness.waitingForDueDate(loan, day("2026-12-16")), false);
  assert.equal(lateness.isLate(bonusLoan(1_040_000), day("2026-12-16")), false, "paid on the bonus");
});

test("a month not on payroll is never a missed deduction", () => {
  const cash = {
    paymentMode: "cash",
    paymentModeHistory: [{ mode: "payroll", effectiveFrom: day("2000-01-01") }, { mode: "cash", effectiveFrom: day("2026-11-01") }],
    schedule: [{ no: 1, dueDate: day("2026-11-30"), totalDue: 100_000, paid: 100_000 }],
    lastDeduction: { cutoffDate: day("2026-11-15"), result: "missed" },
  };
  assert.equal(lateness.missedDeduction(cash, { result: "missed" }, day("2026-11-15")), false, "cash in November");
  assert.equal(lateness.missedDeduction(cash, { result: "missed" }, day("2026-10-31")), true, "still on payroll in October");
  assert.equal(lateness.missedDeduction(cash, { result: "missed", reason: "not_on_payroll" }, day("2026-10-31")), false);
  assert.equal(lateness.isLate(cash, day("2026-11-20")), false);
});

test("member history and early warning: a bonus loan waiting for its bonus is on track", { skip }, async () => {
  // Released 5 days ago, charged to the Year-end bonus: its one installment is next November.
  const app = await approve(t, staff, application(0, {
    applicant: { memberId: "LT-1" },
    loan: { amount: 20000, termMonths: 12, paymentMode: "bonus", bonusType: "year_end" },
    bookkeeper: { longTermBalance: 0, shortTermBalance: 0 },
  }));
  const r = await t.call(`/loans/${app.loanId}/release`, { method: "POST", cookie: staff.signer.treasurer.cookie, body: { releasedAt: daysAgo(5), voucherNo: "CV-LT-1" } });
  assert.equal(r.status, 200, r.json.error);
  assert.ok(new Date(r.json.loan.schedule[0].dueDate) > ledger.todayInManila(), "due in the future");

  const Loan = require("../src/models/Loan");
  const loan = await Loan.findById(app.loanId);
  const { snapshotsFor } = require("../src/services/earlyWarning");
  const snap = (await snapshotsFor([loan])).get(String(loan._id));
  assert.equal(snap.days_since_last_payment, 0, "waiting for its due date, not overdue");
  assert.equal(snap.payment_ratio_90d, 1, "nothing was due in the last 90 days");
  assert.equal(snap.missed_deductions_6m, 0);
  assert.ok(snap.installment_to_net_pay < 1, "the one payment is spread over the months to the bonus");

  const { historiesFor } = require("../src/services/memberHistory");
  const history = (await historiesFor([{ memberId: "LT-1" }])).get("LT-1");
  assert.deepEqual([history.priorLoans, history.priorLatePayments], [1, 0], "not counted late before its bonus date");

  const ew = await t.call("/early-warning", { cookie: staff.officer.cookie });
  const row = ew.json.loans.find((l) => l.loanNo === loan.loanNo);
  assert.equal(row.pastDue, false);
  assert.notEqual(row.level, "high", "no early-warning flag");
});
