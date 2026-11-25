// Mode of payment (the bookkeeper, 2026-11-24): payroll, bonus (Mid-year, Year-end, CNA, SRI),
// cash, e-money or bank transfer; the first-week change rule; bonus schedules and bonus runs.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp, approve } = require("./helpers");
const pm = require("../src/services/paymentModes");
const ledger = require("../src/services/ledger");
const { DEFAULTS } = require("../src/services/settings");

const skip = !uri && "TEST_MONGODB_URI not set";
const key = (d) => new Date(d).toISOString().slice(0, 10);
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

test("a change on or before the 7th starts this month; on the 8th it starts next month", () => {
  assert.equal(key(pm.effectiveFrom("2026-12-07", 7)), "2026-12-01");
  assert.equal(key(pm.effectiveFrom("2026-12-08", 7)), "2027-01-01");
  assert.equal(key(pm.effectiveFrom("2026-12-01", 7)), "2026-12-01");
  assert.equal(pm.whenItStarts("2026-12-08", pm.effectiveFrom("2026-12-08", 7)), "Your change starts in January. December's payroll deduction is already billed.");
  assert.equal(pm.whenItStarts("2026-12-03", pm.effectiveFrom("2026-12-03", 7)), "Your change starts this month (December).");
});

test("bonus dates: the next release at least 10 days away, and the product's longest term", () => {
  const cal = DEFAULTS.bonusCalendar;
  assert.equal(key(pm.nextBonusDate(cal, "year_end", "2026-08-01")), "2026-11-15");
  assert.equal(key(pm.nextBonusDate(cal, "year_end", "2026-11-10")), "2027-11-15", "Nov 15 is less than 10 days away");
  assert.equal(key(pm.nextBonusDate(cal, "mid_year", "2026-11-25")), "2027-05-15");
  const rules = { ...DEFAULTS, products: { ...DEFAULTS.products } };
  assert.deepEqual(pm.bonusTerm(rules, "long_term", "mid_year", "2026-11-25").termMonths, 6);
  assert.throws(() => pm.bonusTerm(rules, "emergency", "mid_year", "2026-11-25"), /6 months away, more than the 5 months/);
  // Interest to the due date on the whole balance: ₱10,000 at 2% for 4 months.
  const [one] = ledger.buildBonusSchedule({ principal: 1_000_000, monthlyRate: 2, dueDate: "2026-11-15", months: 4 });
  assert.deepEqual([key(one.dueDate), one.interestDue, one.totalDue], ["2026-11-15", 80_000, 1_080_000]);
});

const body = (memberId, loan) => application(0, { applicant: { memberId }, loan: { amount: 20000, termMonths: 6, paymentFrequency: "quincenal", ...loan }, bookkeeper: { longTermBalance: 0, shortTermBalance: 0 } });
async function released(memberId, loan) {
  const app = await approve(t, staff, body(memberId, loan));
  const r = await t.call(`/loans/${app.loanId}/release`, { method: "POST", cookie: staff.signer.treasurer.cookie, body: { releasedAt: "2026-08-01", voucherNo: `CV-${memberId}` } });
  assert.equal(r.status, 200, r.json.error);
  return r.json.loan;
}
const bk = () => staff.signer.bookkeeper.cookie;

test("each mode files and is copied to the loan; bonus needs a bonus type and has one installment on the bonus date", { skip }, async () => {
  const noType = await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body: body("PM-0", { paymentMode: "bonus" }) });
  assert.equal(noType.status, 400);
  assert.match(noType.json.error, /Choose which bonus/);

  for (const mode of ["payroll", "cash", "e_money", "bank_transfer"]) {
    const loan = await released(`PM-${mode}`, { paymentMode: mode });
    assert.equal(loan.paymentMode, mode);
    assert.equal(loan.schedule.length, 12, "6 months, quincenal");
  }
  const bonus = await released("PM-YE", { paymentMode: "bonus", bonusType: "year_end" });
  assert.deepEqual([bonus.paymentMode, bonus.bonusType, bonus.paymentModeLabel], ["bonus", "year_end", "Bonus: Year-end bonus"]);
  assert.equal(bonus.schedule.length, 1, "one installment");
  assert.equal(key(bonus.schedule[0].dueDate), "2026-11-15", "on the Year-end bonus date");
  assert.equal(bonus.schedule[0].interestDue, Math.round(2_000_000 * 0.01 * 4), "1% a month for Aug 1 to Nov 15");
  const app = (await t.call(`/applications/${bonus.application}`, { cookie: bk() })).json.application;
  assert.equal(app.loan.termMonths, 1, "the term is set from the bonus date (application dated Oct 19, bonus Nov 15)");
});

test("a cash-mode loan is on the payroll run with expected 0; a bonus run lists only that bonus's loans", { skip }, async () => {
  await released("PM-MY", { paymentMode: "bonus", bonusType: "mid_year" });
  const run = (await t.call("/deductions", { method: "POST", cookie: bk(), body: { cutoffDate: "2026-09-15" } })).json.run;
  const cash = run.lines.find((l) => l.memberId === "PM-cash");
  assert.deepEqual([cash.expected, cash.reason, cash.reasonNote], [0, "not_on_payroll", "Cash"]);
  assert.ok(run.lines.find((l) => l.memberId === "PM-payroll").expected > 0);
  assert.equal(run.lines.some((l) => l.memberId === "PM-YE"), false, "nothing due on Sep 15 for the bonus loan");
  // Sending and posting: the cash line is "full", never "missed".
  await t.call(`/deductions/${run._id}/send`, { method: "POST", cookie: bk() });
  const sent = (await t.call(`/deductions/${run._id}`, { cookie: bk() })).json.run;
  assert.equal(sent.lines.find((l) => l.memberId === "PM-cash").result, "full");

  const bonusRun = await t.call("/deductions", { method: "POST", cookie: bk(), body: { cutoffDate: "2026-11-15", kind: "bonus", bonusType: "year_end" } });
  assert.equal(bonusRun.status, 201, bonusRun.json.error);
  assert.deepEqual(bonusRun.json.run.lines.map((l) => l.memberId), ["PM-YE"], "only the Year-end loan");
  assert.equal(bonusRun.json.run.kind, "bonus");
  assert.equal((await t.call("/deductions", { method: "POST", cookie: bk(), body: { cutoffDate: "2026-11-15", kind: "bonus", bonusType: "year_end" } })).status, 409);
  const payrollSameDay = await t.call("/deductions", { method: "POST", cookie: bk(), body: { cutoffDate: "2026-11-15" } });
  assert.equal(payrollSameDay.status, 201, "a payroll run can share the date");
  const ye = payrollSameDay.json.run.lines.find((l) => l.memberId === "PM-YE");
  assert.deepEqual([ye.expected, ye.reason], [0, "not_on_payroll"], "the bonus loan is listed on payroll with nothing to deduct");
});

test("changing the mode: history, when it starts, and a move to a bonus rebuilds the unpaid schedule", { skip }, async () => {
  const loan = (await t.call("/loans", { cookie: bk() })).json.loans.find((l) => l.memberId === "PM-payroll");
  const officer = await t.call(`/loans/${loan._id}/payment-mode`, { method: "POST", cookie: staff.officer.cookie, body: { mode: "cash" } });
  assert.equal(officer.status, 404, "only the borrower or the Bookkeeper");
  assert.equal((await t.call(`/loans/${loan._id}/payment-mode`, { method: "POST", cookie: bk(), body: { mode: "bonus" } })).status, 400);

  const today = ledger.todayInManila();
  const starts = pm.effectiveFrom(today, 7);
  const r = await t.call(`/loans/${loan._id}/payment-mode`, { method: "POST", cookie: bk(), body: { mode: "cash", note: "Prefers to pay at the office" } });
  assert.equal(r.status, 200, r.json.error);
  assert.equal(r.json.message, pm.whenItStarts(today, starts));
  assert.equal(key(r.json.effectiveFrom), key(starts));
  const h = r.json.loan.paymentModeHistory;
  assert.deepEqual([h.length, h[1].mode, h[1].note, h[1].requestedByName], [2, "cash", "Prefers to pay at the office", "Test bookkeeper"]);
  assert.equal(r.json.loan.schedule.length, 12, "payroll to cash keeps the schedule");
  assert.equal((await t.call(`/loans/${loan._id}/payment-mode`, { method: "POST", cookie: bk(), body: { mode: "cash" } })).status, 409, "already cash");

  const toBonus = await t.call(`/loans/${loan._id}/payment-mode`, { method: "POST", cookie: bk(), body: { mode: "bonus", bonusType: "mid_year" } });
  assert.equal(toBonus.status, 200, toBonus.json.error);
  const s = toBonus.json.loan.schedule;
  const kept = s.filter((x) => new Date(x.dueDate) < starts);
  assert.equal(s.length, kept.length + 1, "the unpaid part becomes one installment");
  assert.equal(key(s[s.length - 1].dueDate), key(pm.nextBonusDate(DEFAULTS.bonusCalendar, "mid_year", starts)));
  assert.equal(s.reduce((a, x) => a + x.principalDue, 0), 2_000_000, "the principal is unchanged");
});
