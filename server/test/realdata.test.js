// Settings, members, retirement plans and reports: the pages that used to show sample data.
const test = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp, releasedLoan, daysAgo } = require("./helpers");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let staff;

test.before(async () => {
  if (skip) return;
  t = await setup();
  staff = await staffUp(t);
});
test.after(async () => t && t.close());

const rules = (overrides = {}) => ({
  products: {
    long_term: { label: "Long term", monthlyRate: 1.5, maxTermMonths: 36 },
    emergency: { label: "Emergency", monthlyRate: 2.5, maxTermMonths: 6 },
  },
  minMonthlySalary: 12000,
  branches: ["Main Office", "Panabo Campus"],
  ...overrides,
});

test("settings are public to read, saved by CreCom and above (rates by the Administrator only), and enforced on applications", { skip }, async () => {
  const before = await t.call("/settings");
  assert.equal(before.status, 200);
  assert.equal(before.json.settings.minMonthlySalary, 10000, "panel's PHP 10,000 default");

  const denied = await t.call("/settings", { method: "PUT", cookie: staff.officer.cookie, body: rules() });
  assert.equal(denied.status, 403);
  const bad = await t.call("/settings", { method: "PUT", cookie: staff.signer.crecom_chair.cookie, body: rules({ branches: [] }) });
  assert.equal(bad.status, 400);
  const rateByChair = await t.call("/settings", { method: "PUT", cookie: staff.signer.crecom_chair.cookie, body: rules() });
  assert.equal(rateByChair.status, 403, "only the Administrator changes interest rates");
  assert.match(rateByChair.json.error, /Administrator/);
  const sameRates = rules({ products: { long_term: { label: "Long term", monthlyRate: 1, maxTermMonths: 36 }, emergency: { label: "Emergency", monthlyRate: 1.5, maxTermMonths: 6 } } });
  assert.equal((await t.call("/settings", { method: "PUT", cookie: staff.signer.crecom_chair.cookie, body: sameRates })).status, 200, "the chair still sets terms, salary and branches");
  const saved = await t.call("/settings", { method: "PUT", cookie: staff.admin.cookie, body: rules() });
  assert.equal(saved.status, 200, saved.json.error);
  assert.equal(saved.json.settings.products.long_term.monthlyRate, 1.5);
  assert.deepEqual((await t.call("/settings")).json.settings.branches, ["Main Office", "Panabo Campus"]);

  const low = await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body: application(0, { applicant: { monthlySalary: 11000, netTakeHomePay: 9000 } }) });
  assert.equal(low.status, 400);
  assert.match(low.json.error, /at least ₱12,000/);
  const long = await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body: application(0, { loan: { termMonths: 48 } }) });
  assert.equal(long.status, 400);
  assert.match(long.json.error, /at most 36 months/);
  const ok = await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body: application(0, { loan: { termMonths: 12, monthlyRate: 0.1 } }) });
  assert.equal(ok.status, 201, ok.json.error);
  assert.equal(ok.json.application.loan.monthlyRate, 1.5, "the rate from Settings, not the one sent");

  // Back to the defaults for the other tests.
  await t.call("/settings", { method: "PUT", cookie: staff.admin.cookie, body: rules({ minMonthlySalary: 10000, products: { long_term: { label: "Long term", monthlyRate: 1, maxTermMonths: 120 }, emergency: { label: "Emergency", monthlyRate: 1.5, maxTermMonths: 12 } } }) });
});

test("members are saved, numbered, searched, edited and show their ledger history", { skip }, async () => {
  const add = (body) => t.call("/members", { method: "POST", cookie: staff.officer.cookie, body });
  const a = await add({ lastName: "Dela Cruz", firstName: "Ana", middleInitial: "B", phone: "09171234567", branch: "Main Office", joinedAt: "2018-06-01" });
  assert.equal(a.status, 201, a.json.error);
  assert.equal(a.json.member.memberId, "1");
  assert.equal(a.json.member.fullName, "Ana B. Dela Cruz");
  const b = await add({ memberId: "UDEI-77", lastName: "Reyes", firstName: "Jose", joinedAt: "2021-01-15" });
  assert.equal(b.status, 201, b.json.error);
  assert.equal((await add({ memberId: "UDEI-77", lastName: "X", firstName: "Y", joinedAt: "2021-01-15" })).status, 409);
  assert.equal((await add({ lastName: "Bad", firstName: "Phone", phone: "12345", joinedAt: "2021-01-15" })).status, 400);

  assert.equal((await t.call("/members", { cookie: staff.admin.cookie })).status, 200);
  const nobody = await t.register("Plain Staff", "plain@uedi.test");
  assert.equal((await t.call("/members", { cookie: nobody.cookie })).status, 403, "staff below Loan Officer can't list members");

  const found = await t.call("/members?q=dela", { cookie: staff.officer.cookie });
  assert.deepEqual(found.json.members.map((m) => m.memberId), ["1"]);
  assert.equal(found.json.nextMemberId, "2");
  const nameless = await add({ memberId: "93" });
  assert.equal(nameless.status, 201, nameless.json.error);
  assert.equal(nameless.json.member.fullName, "Member No. 93", "names can be added later");

  const edit = await t.call("/members/1", { method: "PATCH", cookie: staff.officer.cookie, body: { lastName: "Dela Cruz", firstName: "Ana", joinedAt: "2018-06-01", status: "inactive" } });
  assert.equal(edit.status, 200, edit.json.error);
  assert.equal(edit.json.member.status, "inactive");
  assert.equal(edit.json.member.phone, undefined, "a field left out is cleared");

  await releasedLoan(t, staff, { memberId: "1", loan: { amount: 20000, termMonths: 12 }, releasedAt: daysAgo(100) });
  const one = await t.call("/members/1", { cookie: staff.officer.cookie });
  assert.equal(one.json.history.priorLoans, 1);
  assert.equal(one.json.history.priorLatePayments, 1, "no payments in 100 days: past due");
  assert.ok(one.json.history.yearsAsMember >= 7);
  const list = (await t.call("/members", { cookie: staff.officer.cookie })).json.members;
  assert.equal(list.find((m) => m.memberId === "1").openLoans, 1);
});

test("retirement plans track contributions, missed months and voids, and feed the reports", { skip }, async () => {
  const bk = staff.signer.bookkeeper.cookie;
  const today = daysAgo(0);
  const [y, m] = today.split("-").map(Number);
  const monthsAgo = (n) => { const d = new Date(Date.UTC(y, m - 1 - n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const body = { memberId: "UDEI-77", startDate: `${monthsAgo(3)}-05`, monthlyContribution: 500_00, planShare: 400_00, openingBalance: 10_000_00 };
  assert.equal((await t.call("/retirement-plans", { method: "POST", cookie: staff.officer.cookie, body })).status, 403);
  assert.equal((await t.call("/retirement-plans", { method: "POST", cookie: bk, body: { ...body, memberId: "NOPE" } })).status, 404);
  const created = await t.call("/retirement-plans", { method: "POST", cookie: bk, body });
  assert.equal(created.status, 201, created.json.error);
  assert.equal((await t.call("/retirement-plans", { method: "POST", cookie: bk, body })).status, 409, "one plan per member");
  let plan = created.json.plan;
  assert.equal(plan.memberName, "Jose Reyes");
  assert.equal(plan.balance, 10_000_00);
  assert.deepEqual(plan.missedMonths, [monthsAgo(3), monthsAgo(2), monthsAgo(1)]);
  assert.equal(plan.status, "behind");

  const pay = (month) =>
    t.call(`/retirement-plans/${plan._id}/contributions`, { method: "POST", cookie: bk, body: { month, amount: 400_00, paidAt: daysAgo(1), method: "payroll" } });
  for (const n of [3, 2, 1]) plan = (await pay(monthsAgo(n))).json.plan;
  assert.equal(plan.status, "up_to_date");
  assert.equal(plan.balance, 11_200_00);
  assert.equal(plan.contributions[0].dues, 100_00, "dues default to contribution minus plan share");
  assert.equal((await pay(monthsAgo(1))).status, 409, "a month is paid once");

  const id = plan.contributions.find((c) => c.month === monthsAgo(1))._id;
  const voided = await t.call(`/retirement-plans/${plan._id}/contributions/${id}/void`, { method: "POST", cookie: bk, body: { reason: "Wrong member" } });
  assert.equal(voided.status, 200, voided.json.error);
  assert.equal(voided.json.plan.balance, 10_800_00);
  assert.deepEqual(voided.json.plan.missedMonths, [monthsAgo(1)]);

  const members = (await t.call("/members", { cookie: staff.officer.cookie })).json.members;
  assert.equal(members.find((x) => x.memberId === "UDEI-77").plan.balance, 10_800_00);

  assert.equal((await t.call("/reports", { cookie: staff.officer.cookie })).status, 403);
  for (const period of ["daily", "weekly", "monthly", "yearly"]) {
    const r = await t.call(`/reports?period=${period}`, { cookie: staff.signer.treasurer.cookie });
    assert.equal(r.status, 200, r.json.error);
    const sum = (k) => r.json.rows.reduce((s, x) => s + x[k], 0);
    assert.equal(sum("planContributions"), 800_00, `${period}: voided contribution left out`);
    assert.equal(sum("monthlyDues"), 200_00, period);
    assert.ok(sum("applications") >= 1, period);
  }
  const yearly = (await t.call("/reports?period=yearly", { cookie: staff.signer.treasurer.cookie })).json.rows;
  assert.equal(yearly.reduce((s, x) => s + x.loansReleased, 0), 20_000_00);
});
