// Bookkeeper balances from the ledger, and old loans paid off from a new loan's proceeds.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp, daysAgo, approve, releasedLoan } = require("./helpers");

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

const submit = async (body) => (await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body })).json.application;
const sign = (app, role, body = { decision: "approved" }) =>
  t.call(`/applications/${app._id}/approvals`, { method: "POST", cookie: staff.signer[role].cookie, body });
const getLoan = async (id) => (await t.call(`/loans/${id}`, { cookie: staff.officer.cookie })).json;

test("no loans on record: typed balances are kept and the Bookkeeper can correct them", { skip }, async () => {
  const none = await t.call("/loans/balances?memberId=M-0100", { cookie: staff.officer.cookie });
  assert.equal(none.status, 200);
  assert.equal(none.json.balances.hasLoans, false);
  assert.equal((await t.call("/loans/balances", { cookie: staff.officer.cookie })).status, 400, "member ID required");

  const app = await submit(application(0, {
    applicant: { memberId: "M-0100" },
    bookkeeper: { longTermBalance: 5000, longTermDueDate: "2027-03-31", shortTermBalance: 0, monthlyPayment: 900 },
  }));
  assert.equal(app.bookkeeper.source, "manual");
  assert.equal(app.bookkeeper.longTermBalance, 5000);
  assert.equal(app.bookkeeper.monthlyPayment, 900);

  const corrected = await sign(app, "bookkeeper", { decision: "approved", bookkeeper: { longTermBalance: 4200, shortTermBalance: 0, monthlyPayment: 900 } });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.json.application.bookkeeper.longTermBalance, 4200);
  assert.equal(corrected.json.application.bookkeeper.source, "manual");
});

test("a member with loans: balances come from the ledger, refreshed at the Bookkeeper's step", { skip }, async () => {
  const quincenal = await releasedLoan(t, staff, { memberId: "M-0200", loan: { loanType: "long_term", amount: 60000, termMonths: 24, paymentFrequency: "quincenal" } });
  const monthly = await releasedLoan(t, staff, { memberId: "M-0200", loan: { loanType: "emergency", amount: 10000, termMonths: 6, monthlyRate: 1.5, paymentFrequency: "monthly" } });

  const { balances } = (await t.call("/loans/balances?memberId=M-0200", { cookie: staff.officer.cookie })).json;
  assert.equal(balances.hasLoans, true);
  assert.equal(balances.longTerm.balance, quincenal.balance);
  assert.deepEqual(balances.longTerm.loans.map((l) => l.loanNo), [quincenal.loanNo]);
  assert.equal(balances.longTerm.dueDate, quincenal.maturesOn, "latest maturity");
  assert.equal(balances.longTerm.loans[0].installment, 140_910, "₱1,409.10 per cutoff");
  assert.equal(balances.longTerm.perMonth, 281_820, "quincenal: two cutoffs a month");
  assert.equal(balances.shortTerm.balance, monthly.balance);
  assert.equal(balances.shortTerm.perMonth, monthly.schedule[0].totalDue);
  assert.equal(balances.monthlyPayment, 281_820 + monthly.schedule[0].totalDue);

  // Typed values are ignored for a member with loans on record.
  const app = await submit(application(0, { applicant: { memberId: "M-0200" }, bookkeeper: { longTermBalance: 1, shortTermBalance: 1 } }));
  assert.equal(app.bookkeeper.source, "ledger");
  assert.equal(app.bookkeeper.longTermBalance, quincenal.balance / 100, "pesos, like the rest of the application");
  assert.equal(app.bookkeeper.shortTermBalance, monthly.balance / 100);
  assert.equal(app.bookkeeper.monthlyPayment, balances.monthlyPayment / 100);
  assert.deepEqual(app.bookkeeper.loans.map((l) => l.loanNo).sort(), [quincenal.loanNo, monthly.loanNo].sort());

  // A payment comes in after filing; the Bookkeeper's signature refreshes the figures and refuses edits.
  await t.call(`/loans/${quincenal._id}/payments`, { method: "POST", cookie: staff.signer.bookkeeper.cookie, body: { amount: 140_910, paidAt: daysAgo(1), method: "cash" } });
  const edit = await sign(app, "bookkeeper", { decision: "approved", bookkeeper: { longTermBalance: 0, shortTermBalance: 0 } });
  assert.equal(edit.status, 400);
  assert.match(edit.json.error, /come from the ledger/);
  const signed = await sign(app, "bookkeeper");
  assert.equal(signed.status, 200);
  assert.equal(signed.json.application.bookkeeper.longTermBalance, (quincenal.balance - 140_910) / 100);
  assert.equal(signed.json.application.bookkeeper.source, "ledger");
});

test("release: old loans deducted from the proceeds are closed by offset payments", { skip }, async () => {
  const before = (await t.call("/loans?q=M-0200", { cookie: staff.officer.cookie })).json.loans; // search is by number or name
  assert.ok(Array.isArray(before));
  const { balances } = (await t.call("/loans/balances?memberId=M-0200", { cookie: staff.officer.cookie })).json;
  const oldLong = balances.longTerm.loans[0];
  const oldShort = balances.shortTerm.loans[0];

  // A renewal: a new long-term loan for the same member.
  const renewal = await approve(t, staff, application(0, { applicant: { memberId: "M-0200" }, loan: { amount: 80000 } }));
  const forRelease = await getLoan(renewal.loanId);
  const others = forRelease.otherActiveLoans;
  assert.equal(others.length, 2);
  assert.equal(others.find((o) => o.loanNo === oldLong.loanNo).suggested, true, "same loan type is pre-checked");
  assert.equal(others.find((o) => o.loanNo === oldShort.loanNo).suggested, false);

  const stranger = await releasedLoan(t, staff, { memberId: "M-0999", loan: { amount: 5000, termMonths: 3 } });
  const release = (body) => t.call(`/loans/${renewal.loanId}/release`, { method: "POST", cookie: staff.signer.treasurer.cookie, body: { releasedAt: daysAgo(0), voucherNo: "CV-RENEW", ...body } });
  assert.equal((await release({ offsetLoanIds: [stranger._id] })).status, 400, "only the borrower's own loans");

  const r = await release({ offsetLoanIds: [String(oldLong.loanId)] });
  assert.equal(r.status, 200, r.json.error);
  assert.equal(r.json.loan.release.netProceeds, 8_000_000 - oldLong.balance);
  assert.deepEqual(r.json.loan.release.offsets.map((o) => [o.loanNo, o.amount]), [[oldLong.loanNo, oldLong.balance]]);

  const closed = await getLoan(oldLong.loanId);
  assert.equal(closed.loan.status, "paid");
  assert.equal(closed.loan.balance, 0);
  const offset = closed.payments.find((p) => p.method === "offset");
  assert.equal(offset.amount, oldLong.balance);
  assert.equal(offset.reference, `Offset by ${r.json.loan.loanNo}`);

  const voidIt = await t.call(`/loans/${oldLong.loanId}/payments/${offset._id}/void`, { method: "POST", cookie: staff.signer.treasurer.cookie, body: { reason: "Try" } });
  assert.equal(voidIt.status, 409);
  assert.match(voidIt.json.error, /cancelling that release/);
  assert.equal((await t.call(`/loans/${oldLong.loanId}/payments`, { method: "POST", cookie: staff.signer.bookkeeper.cookie, body: { amount: 100, paidAt: daysAgo(0), method: "offset" } })).status, 400, "offsets can't be recorded by hand");
});

test("release is refused when the old balances exceed the new loan", { skip }, async () => {
  const { balances } = (await t.call("/loans/balances?memberId=M-0200", { cookie: staff.officer.cookie })).json;
  const oldShort = balances.shortTerm.loans[0];
  const small = await approve(t, staff, application(0, { applicant: { memberId: "M-0200" }, loan: { loanType: "emergency", amount: 1000, termMonths: 3, paymentFrequency: "monthly" } }));
  const r = await t.call(`/loans/${small.loanId}/release`, { method: "POST", cookie: staff.signer.treasurer.cookie, body: { releasedAt: daysAgo(0), voucherNo: "CV-SMALL", offsetLoanIds: [String(oldShort.loanId)] } });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /more than this loan/);
  assert.equal((await getLoan(oldShort.loanId)).loan.status, "active", "nothing was written");
  assert.equal((await getLoan(small.loanId)).loan.status, "for_release");
});
