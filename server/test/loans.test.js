// Loans after approval: release, payments, voids and payoff.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application } = require("./helpers");
const ledger = require("../src/services/ledger");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let officer;
let signer;

before(async () => {
  if (!uri) return;
  t = await setup();
  const admin = await t.register("Admin One", "admin@uedi.test");
  officer = await t.userWithRole(admin.cookie, "loan_officer");
  signer = {};
  for (const role of ["bookkeeper", "treasurer", "crecom_chair", "president"]) signer[role] = await t.userWithRole(admin.cookie, role);
});

after(async () => {
  if (uri) await t.close();
});

const daysAgo = (n) => new Date(ledger.todayInManila().getTime() - n * 86_400_000).toISOString().slice(0, 10);

async function approvedLoan(body = application(0)) {
  const app = (await t.call("/applications", { method: "POST", cookie: officer.cookie, body })).json.application;
  let last;
  for (const role of ["bookkeeper", "treasurer", "crecom_chair", "president"]) {
    last = await t.call(`/applications/${app._id}/approvals`, { method: "POST", cookie: signer[role].cookie, body: { decision: "approved" } });
    assert.equal(last.status, 200, last.json.error);
  }
  return (await t.call(`/loans/${last.json.application.loanId}`, { cookie: officer.cookie })).json;
}

const pay = (loan, who, body) => t.call(`/loans/${loan._id}/payments`, { method: "POST", cookie: who.cookie, body: { method: "payroll", ...body } });

test("approval creates a loan; the Treasurer releases it", { skip }, async () => {
  const { loan, payments } = await approvedLoan();
  assert.match(loan.loanNo, /^MA-\d{4}-0001$/);
  assert.equal(loan.status, "for_release");
  assert.equal(loan.borrowerName, "Maria C. Santos");
  assert.equal(loan.principal, 6_000_000, "₱60,000 in centavos");
  assert.equal(loan.existingBalances, 1_200_000);
  assert.deepEqual(payments, []);
  assert.equal(loan.schedule.length, 0, "no schedule until release");

  const list = await t.call("/loans?status=for_release", { cookie: officer.cookie });
  assert.equal(list.json.loans.length, 1);

  const release = (who, body) => t.call(`/loans/${loan._id}/release`, { method: "POST", cookie: who.cookie, body });
  assert.equal((await release(signer.bookkeeper, { releasedAt: daysAgo(60), voucherNo: "CV-1" })).status, 403, "Treasurer only");
  assert.equal((await release(signer.treasurer, { releasedAt: daysAgo(60) })).status, 400, "voucher required");
  assert.equal((await release(signer.treasurer, { releasedAt: daysAgo(-3), voucherNo: "CV-1" })).status, 400, "no future release");
  assert.equal((await pay(loan, signer.bookkeeper, { amount: 1000, paidAt: daysAgo(1) })).status, 409, "no payments before release");

  const released = await release(signer.treasurer, { releasedAt: daysAgo(60), voucherNo: "CV-2026-001" });
  assert.equal(released.status, 200);
  const l = released.json.loan;
  assert.equal(l.status, "active");
  assert.equal(l.release.voucherNo, "CV-2026-001");
  assert.equal(l.release.releasedByName, "Test treasurer");
  assert.equal(l.release.netProceeds, 4_800_000, "principal minus the Bookkeeper's balances");
  assert.equal(l.schedule.length, 48, "24 months, quincenal");
  assert.equal(l.totalPayable, 7_440_000);
  assert.equal(l.balance, 7_440_000);
  assert.ok(new Date(l.schedule[0].dueDate) - new Date(l.release.releasedAt) >= 10 * 86_400_000);
  assert.equal(l.pastDue, true, "installments fell due since the release 60 days ago");

  assert.equal((await release(signer.treasurer, { releasedAt: daysAgo(1), voucherNo: "CV-X" })).status, 409, "only once");
});

test("payments: who may record them, allocation, overpayment, void and payoff", { skip }, async () => {
  const [found] = (await t.call("/loans?q=santos", { cookie: officer.cookie })).json.loans;
  const loan = found;
  assert.ok(loan, "search by borrower name");
  assert.equal((await t.call(`/loans?q=${loan.loanNo}`, { cookie: officer.cookie })).json.loans.length, 1, "search by loan number");

  assert.equal((await pay(loan, officer, { amount: 100_000, paidAt: daysAgo(1) })).status, 403, "loan officers don't record payments");
  assert.equal((await pay(loan, signer.bookkeeper, { amount: 100_000, paidAt: daysAgo(90) })).status, 400, "before release");
  const over = await pay(loan, signer.bookkeeper, { amount: loan.balance + 1, paidAt: daysAgo(1) });
  assert.equal(over.status, 400);
  assert.match(over.json.error, /more than the remaining balance of ₱74,400\.00/);

  // Installment 1 is ₱1,250 principal + ₱300 interest.
  const first = await pay(loan, signer.bookkeeper, { amount: 200_000, paidAt: daysAgo(40), reference: "Payroll Sep" });
  assert.equal(first.status, 201);
  let s = first.json.loan.schedule;
  assert.deepEqual([s[0].paid, s[1].interestPaid, s[1].principalPaid], [155_000, 30_000, 15_000], "oldest first, interest before principal");
  const second = await pay(loan, signer.treasurer, { amount: 100_000, paidAt: daysAgo(20), method: "cash", reference: "OR 1234" });
  assert.equal(second.json.loan.amountPaid, 300_000);
  assert.equal(second.json.loan.balance, 7_140_000);

  const voidIt = (id, body, who = signer.bookkeeper) => t.call(`/loans/${loan._id}/payments/${id}/void`, { method: "POST", cookie: who.cookie, body });
  assert.equal((await voidIt(first.json.payment._id, {})).status, 400, "reason required");
  assert.equal((await voidIt(first.json.payment._id, { reason: "Wrong" }, officer)).status, 403);
  const voided = await voidIt(first.json.payment._id, { reason: "Entered twice; payroll file had one deduction." });
  assert.equal(voided.status, 200);
  assert.equal(voided.json.payment.voided, true);
  assert.equal(voided.json.loan.amountPaid, 100_000);
  s = voided.json.loan.schedule;
  assert.deepEqual([s[0].interestPaid, s[0].principalPaid, s[1].paid], [30_000, 70_000, 0], "recomputed from what is left");
  assert.equal((await voidIt(first.json.payment._id, { reason: "Again" })).status, 409);

  const detail = (await t.call(`/loans/${loan._id}`, { cookie: officer.cookie })).json;
  assert.equal(detail.payments.length, 2, "voided payments are kept");
  assert.equal(detail.payments.find((p) => p.voided).voidReason, "Entered twice; payroll file had one deduction.");
  assert.equal(detail.loan.pastDue, true);
  assert.ok((await t.call("/loans?status=past_due", { cookie: officer.cookie })).json.loans.some((l) => l._id === loan._id));

  const payoff = await pay(loan, signer.treasurer, { amount: detail.loan.balance, paidAt: daysAgo(0) });
  assert.equal(payoff.status, 201);
  assert.equal(payoff.json.loan.status, "paid");
  assert.equal(payoff.json.loan.balance, 0);
  assert.equal(payoff.json.loan.pastDue, false);
  assert.equal(payoff.json.loan.nextDue, null);
  assert.equal((await pay(loan, signer.treasurer, { amount: 1, paidAt: daysAgo(0) })).status, 409, "nothing left to pay");
  assert.equal((await t.call("/loans?status=paid", { cookie: officer.cookie })).json.loans.length, 1);

  const reopened = await voidIt(second.json.payment._id, { reason: "Bounced cash count." }, signer.treasurer);
  assert.equal(reopened.json.loan.status, "active", "voiding a payment on a paid loan reopens it");
  assert.equal(reopened.json.loan.balance, 100_000);
});

test("monthly emergency loan schedule and 404s", { skip }, async () => {
  const body = application(0, { loan: { loanType: "emergency", amount: 10_000, termMonths: 6, monthlyRate: 1.5, paymentFrequency: "monthly" } });
  const { loan } = await approvedLoan(body);
  const r = await t.call(`/loans/${loan._id}/release`, { method: "POST", cookie: signer.treasurer.cookie, body: { releasedAt: daysAgo(5), voucherNo: "CV-2" } });
  const l = r.json.loan;
  assert.equal(l.schedule.length, 6);
  assert.equal(l.totalPayable, 1_000_000 + 90_000);
  for (const x of l.schedule) {
    const d = new Date(x.dueDate);
    assert.equal(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(), d.getUTCDate(), "month end");
  }
  assert.equal((await t.call("/loans/not-an-id", { cookie: officer.cookie })).status, 404);
  assert.equal((await t.call(`/loans/${loan._id}/payments/not-an-id/void`, { method: "POST", cookie: signer.treasurer.cookie, body: { reason: "Test" } })).status, 404);
});
