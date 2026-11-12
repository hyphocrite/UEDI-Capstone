// Member mobile app API: self-registration, own applications and loans only, no staff routes.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup } = require("./helpers");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let admin;
let signer;

before(async () => {
  if (!uri) return;
  t = await setup();
  admin = await t.register("Admin One", "admin@uedi.test");
  signer = {};
  for (const role of ["bookkeeper", "treasurer", "crecom_chair", "president"]) signer[role] = await t.userWithRole(admin.cookie, role);
});

after(async () => {
  if (uri) await t.close();
});

/** Calls the API with a Bearer token, like the mobile app does. */
async function as(token, path, { method = "GET", body } = {}) {
  const res = await t.call(path, { method, body, cookie: undefined, headers: { Authorization: `Bearer ${token}` } });
  return res;
}

async function member(email, memberNo = "M-0042") {
  const r = await t.call("/member/register", {
    method: "POST",
    body: { fullName: "Maria C. Santos", email, memberNo, password: "secret123" },
  });
  assert.equal(r.status, 201, r.json.error);
  return r.json.token;
}

const apply = (overrides = {}) => ({
  lastName: "Santos", firstName: "Maria", middleInitial: "C", residenceAddress: "Purok 3, New Visayas, Panabo City",
  employer: "Davao del Norte State College", monthlySalary: 38000, netTakeHomePay: 24000,
  loanType: "long_term", amount: 30000, termMonths: 12, paymentFrequency: "monthly", purpose: "School fees",
  payrollDeduction: true, autoRestructure: true, ...overrides,
});

test("a member registers, applies and follows the application to a loan", { skip }, async () => {
  const token = await member("maria@uedi.test");

  const me = await as(token, "/member/me");
  assert.equal(me.json.session.role, "member");
  assert.equal(me.json.session.memberNo, "M-0042");

  const tooLong = await as(token, "/member/applications", { method: "POST", body: apply({ loanType: "emergency", termMonths: 12 }) });
  assert.equal(tooLong.status, 400);

  const created = await as(token, "/member/applications", { method: "POST", body: apply() });
  assert.equal(created.status, 201, created.json.error);
  assert.equal(created.json.application.waitingFor, "Bookkeeper");
  assert.equal(created.json.application.loan.monthlyRate, 1);
  assert.equal(created.json.application.assessment, undefined, "members do not see model scores");

  const again = await as(token, "/member/applications", { method: "POST", body: apply() });
  assert.equal(again.status, 409, "one pending application at a time");

  const id = created.json.application.id;
  const staffView = (await t.call(`/applications/${id}`, { cookie: admin.cookie })).json.application;
  assert.equal(staffView.applicant.memberId, "M-0042");
  for (const role of ["bookkeeper", "treasurer", "crecom_chair", "president"]) {
    const r = await t.call(`/applications/${id}/approvals`, { method: "POST", cookie: signer[role].cookie, body: { decision: "approved" } });
    assert.equal(r.status, 200, r.json.error);
  }

  const apps = (await as(token, "/member/applications")).json.applications;
  assert.equal(apps[0].status, "approved");
  assert.equal(apps[0].signed.length, 4);

  const list = (await as(token, "/member/loans")).json.loans;
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "for_release");

  await t.call(`/loans/${list[0].id}/release`, {
    method: "POST", cookie: signer.treasurer.cookie, body: { releasedAt: new Date().toISOString().slice(0, 10), voucherNo: "DV-1" },
  });
  const detail = await as(token, `/member/loans/${list[0].id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.loan.status, "active");
  assert.ok(detail.json.loan.nextDue);
  assert.equal(detail.json.loan.schedule.length, 12);
});

test("members only see their own records and cannot use staff routes", { skip }, async () => {
  const mine = await member("ana@uedi.test", "M-0050");
  const other = await member("ben@uedi.test", "M-0051");
  const created = await as(mine, "/member/applications", { method: "POST", body: apply() });
  assert.equal(created.status, 201, created.json.error);

  assert.equal((await as(other, "/member/applications")).json.applications.length, 0);
  assert.equal((await as(other, "/applications")).status, 403);
  assert.equal((await as(other, "/loans")).status, 403);
  assert.equal((await as(other, "/auth/users")).status, 403);

  const web = await t.call("/auth/login", { method: "POST", body: { email: "ana@uedi.test", password: "secret123" } });
  assert.equal(web.status, 403, "member accounts don't sign in on the office web app");

  const staffOnPhone = await t.call("/member/login", { method: "POST", body: { email: "admin@uedi.test", password: "secret123" } });
  assert.equal(staffOnPhone.status, 403);
  assert.equal((await t.call("/member/me", { cookie: admin.cookie })).status, 403);
});
