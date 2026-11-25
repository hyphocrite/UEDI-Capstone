// Short term unpaid at the end of its term becomes long term (the bookkeeper, 2026-11-24).
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp, approve } = require("./helpers");

const skip = !uri && "TEST_MONGODB_URI not set";
const key = (d) => new Date(d).toISOString().slice(0, 10);
const day = (s) => new Date(`${s}T00:00:00Z`);
let t;
let staff;
let conversions;
let Loan;

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
  conversions = require("../src/services/conversions");
  Loan = require("../src/models/Loan");
});

after(async () => {
  if (uri) await t.close();
});

/** Short term, monthly, released Aug 1: due Aug 31, Sep 30 and Oct 31 (3 months) or Aug 31, Sep 30 (2). */
async function shortTerm(memberId, termMonths = 3) {
  const app = await approve(t, staff, application(0, {
    applicant: { memberId },
    loan: { loanType: "emergency", amount: 10000, termMonths, paymentFrequency: "monthly" },
    bookkeeper: { longTermBalance: 0, shortTermBalance: 0 },
  }));
  const r = await t.call(`/loans/${app.loanId}/release`, { method: "POST", cookie: staff.signer.treasurer.cookie, body: { releasedAt: "2026-08-01", voucherNo: `CV-${memberId}` } });
  assert.equal(r.status, 200, r.json.error);
  return r.json.loan;
}

test("one day past maturity with a balance converts once; a paid one doesn't; twice doesn't double-convert", { skip }, async () => {
  const unpaid = await shortTerm("CV-1");
  const paid = await shortTerm("CV-2");
  assert.equal(key(unpaid.schedule.at(-1).dueDate), "2026-10-31");
  // One payment on time, then nothing: the balance is left at maturity.
  await t.call(`/loans/${unpaid._id}/payments`, { method: "POST", cookie: staff.signer.bookkeeper.cookie, body: { amount: unpaid.schedule[0].totalDue, paidAt: "2026-08-31", method: "payroll" } });
  await t.call(`/loans/${paid._id}/payments`, { method: "POST", cookie: staff.signer.bookkeeper.cookie, body: { amount: paid.balance, paidAt: "2026-10-31", method: "payroll" } });

  assert.equal((await conversions.convertOverdueShortTerm(day("2026-10-31"))).length, 0, "not past maturity yet");
  const first = await conversions.convertOverdueShortTerm(day("2026-11-01"));
  assert.deepEqual(first.map((l) => l.loanNo), [unpaid.loanNo], "only the unpaid one");
  assert.equal((await conversions.convertOverdueShortTerm(day("2026-11-01"))).length, 0, "running it again does nothing");
  // Two at once (two server instances): still one conversion.
  const both = await Promise.all([conversions.convertOverdueShortTerm(day("2026-11-02")), conversions.convertOverdueShortTerm(day("2026-11-02"))]);
  assert.equal(both.flat().length, 0);

  const loan = await Loan.findById(unpaid._id);
  assert.equal(loan.loanType, "long_term");
  assert.equal(loan.loanNo, unpaid.loanNo, "same loan, same number");
  assert.equal(loan.conversions.length, 1);
  const c = loan.conversions[0];
  assert.deepEqual([c.fromType, c.toType, c.newTermMonths, c.monthlyRate], ["emergency", "long_term", 12, 1]);
  assert.equal(c.oldSchedule.length, 3, "the old schedule is kept");
  const oldBalance = unpaid.totalPayable - unpaid.schedule[0].totalDue;
  assert.equal(c.balance, oldBalance, "principal and unpaid interest");

  // The new schedule: the paid installment stays settled, then 12 new ones.
  const fresh = loan.schedule.filter((x) => x.dueDate > day("2026-11-01"));
  assert.equal(fresh.length, 12);
  assert.equal(key(fresh[0].dueDate), "2026-11-30", "from the next cutoff");
  assert.equal(fresh.reduce((s, x) => s + x.principalDue, 0), c.balance);
  assert.equal(fresh.reduce((s, x) => s + x.totalDue, 0), c.balance + fresh.reduce((s, x) => s + x.interestDue, 0), "converted balance plus new interest");
  assert.equal(loan.schedule[0].paid, unpaid.schedule[0].totalDue, "the payment still covers the settled installment");
  assert.equal(loan.paymentMode, "payroll", "the mode is kept");

  assert.equal((await Loan.findById(paid._id)).loanType, "emergency");
  const AuditLog = require("../src/models/AuditLog");
  const entry = await AuditLog.findOne({ action: "Short term converted to long term" });
  assert.equal(entry.userName, "System");
  assert.match(entry.target, new RegExp(unpaid.loanNo));

  // The Bookkeeper section now counts it as long term.
  const balances = (await t.call("/loans/balances?memberId=CV-1", { cookie: staff.officer.cookie })).json.balances;
  assert.equal(balances.shortTerm.balance, 0);
  assert.equal(balances.longTerm.loans[0].loanNo, unpaid.loanNo);
});

test("a deduction run created after maturity uses the converted installment", { skip }, async () => {
  const loan = await shortTerm("CV-3", 2); // last due Sep 30, long past by today
  const run = await t.call("/deductions", { method: "POST", cookie: staff.signer.bookkeeper.cookie, body: { cutoffDate: "2026-12-31" } });
  assert.equal(run.status, 201, run.json.error);
  const converted = await Loan.findById(loan._id);
  assert.equal(converted.loanType, "long_term", "converted before the run was built");
  const due = converted.schedule.find((x) => key(x.dueDate) === "2026-12-31");
  const line = run.json.run.lines.find((l) => l.loanNo === loan.loanNo);
  assert.equal(line.expected, due.totalDue, "the new installment");
  assert.equal(line.loanType, "long_term");
});

test("the one-time migration only changes an untouched short-term default", { skip }, async () => {
  const settings = require("../src/services/settings");
  const Setting = require("../src/models/Setting");
  assert.equal(await settings.migrate(), false, "the test settings were chosen (1.5%, 12 months): kept");
  assert.equal((await settings.get()).products.emergency.maxTermMonths, 12);
  assert.equal(await settings.migrate(), false, "only once");

  await Setting.updateOne({ key: "loan" }, { $set: { "products.emergency": { label: "Emergency", monthlyRate: 3, maxTermMonths: 6 }, migrations: [] } });
  assert.equal(await settings.migrate(), true);
  const e = (await settings.get()).products.emergency;
  assert.deepEqual([e.label, e.monthlyRate, e.maxTermMonths], ["Short term (Emergency)", 3, 5]);
});
