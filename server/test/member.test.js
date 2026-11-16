// Member mobile app API: self-registration, own applications and loans only, no staff routes.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, lastCode } = require("./helpers");

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
  const v = await t.call("/member/verify-email", { method: "POST", body: { email, code: lastCode(email) } });
  assert.equal(v.status, 200, v.json.error);
  return v.json.token;
}

const apply = (overrides = {}) => ({
  lastName: "Santos", firstName: "Maria", middleInitial: "C", residenceAddress: "Purok 3, New Visayas, Panabo City",
  employer: "Davao del Norte State College", monthlySalary: 38000, netTakeHomePay: 24000,
  loanType: "long_term", amount: 30000, termMonths: 12, paymentFrequency: "monthly", purpose: "School fees",
  payrollDeduction: true, autoRestructure: true,
  documentTypes: ["valid_id", "payslip", "proof_of_address", "application_form"], ...overrides,
});

test("a member registers, applies and follows the application to a loan", { skip }, async () => {
  const token = await member("maria@uedi.test");

  const me = await as(token, "/member/me");
  assert.equal(me.json.session.role, "member");
  assert.equal(me.json.session.memberNo, "M-0042");

  const tooLong = await as(token, "/member/applications", { method: "POST", body: apply({ loanType: "emergency", termMonths: 13 }) });
  assert.equal(tooLong.status, 400);

  const noDocs = await as(token, "/member/applications", { method: "POST", body: apply({ documentTypes: ["valid_id"] }) });
  assert.equal(noDocs.status, 400);
  assert.match(noDocs.json.error, /Still missing: Latest payslip/);
  const lowNet = await as(token, "/member/applications", { method: "POST", body: apply({ netTakeHomePay: 4000 }) });
  assert.equal(lowNet.status, 400);
  assert.match(lowNet.json.error, /at least ₱5,000/);
  const noReason = await as(token, "/member/applications", { method: "POST", body: apply({ purpose: "" }) });
  assert.equal(noReason.status, 400, "the reason for the loan is required");
  assert.match(noReason.json.error, /reason for the loan/);

  const created = await as(token, "/member/applications", { method: "POST", body: apply() });
  assert.equal(created.status, 201, created.json.error);
  assert.equal(created.json.application.waitingFor, "Bookkeeper");
  assert.equal(created.json.application.loan.monthlyRate, 1, "the long-term rate from Settings");
  assert.equal(created.json.application.assessment, undefined, "members do not see model scores");

  const again = await as(token, "/member/applications", { method: "POST", body: apply() });
  assert.equal(again.status, 409, "one pending application at a time");

  const id = created.json.application.id;
  const staffView = (await t.call(`/applications/${id}`, { cookie: admin.cookie })).json.application;
  // Filed under their own new member ID; the typed M-0042 is only a claim until the office links it.
  assert.match(staffView.applicant.memberId, /^N-\d{4}$/);
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

test("a member must verify their email before the app gets a token", { skip }, async () => {
  const email = "pedro@uedi.test";
  const body = { fullName: "Pedro Reyes", email, memberNo: "M-0077", password: "secret123" };
  const reg = await t.call("/member/register", { method: "POST", body });
  assert.equal(reg.status, 201, reg.json.error);
  assert.equal(reg.json.verificationRequired, true);
  assert.equal(reg.json.token, undefined, "no token before the email is verified");

  const early = await t.call("/member/login", { method: "POST", body: { email, password: "secret123" } });
  assert.equal(early.status, 403);
  assert.equal(early.json.code, "EMAIL_NOT_VERIFIED");

  const code = lastCode(email);
  assert.match(code, /^\d{6}$/);
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
  assert.equal((await t.call("/member/verify-email", { method: "POST", body: { email, code: wrong } })).status, 400);

  const resend = await t.call("/member/resend-verification", { method: "POST", body: { email } });
  assert.equal(resend.status, 200);
  assert.equal(lastCode(email), code, "no new code inside the one-minute cooldown");

  const ok = await t.call("/member/verify-email", { method: "POST", body: { email, code } });
  assert.equal(ok.status, 200, ok.json.error);
  assert.ok(ok.json.token);
  assert.equal(ok.json.session.role, "member");
  assert.equal((await as(ok.json.token, "/member/me")).status, 200);

  const reuse = await t.call("/member/verify-email", { method: "POST", body: { email, code } });
  assert.equal(reuse.status, 400, "a code works once");

  const login = await t.call("/member/login", { method: "POST", body: { email, password: "secret123" } });
  assert.equal(login.status, 200);
  assert.ok(login.json.token);
});

test("a member sends supporting documents from the phone, and the office sees them", { skip }, async () => {
  const token = await member("doc@uedi.test", "M-0090");
  const other = await member("nodoc@uedi.test", "M-0091");
  const id = (await as(token, "/member/applications", { method: "POST", body: apply() })).json.application.id;
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4530000000049454e44ae426082", "hex");
  const send = (tok, body, type = "image/png", query = "?type=payslip&name=payslip.png") =>
    fetch(`${t.baseUrl}/member/applications/${id}/documents${query}`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": type }, body });

  const sent = await send(token, png);
  assert.equal(sent.status, 201);
  const docs = (await sent.json()).application.documents;
  assert.deepEqual(docs, [{ fileName: "payslip.png", type: "payslip", uploaded: true, addedAt: null }], "sent at filing, not marked as added later");

  assert.equal((await send(token, png, "text/plain")).status, 415);
  assert.equal((await send(other, png)).status, 404, "only your own application");
  const odd = await send(token, png, "image/png", "?type=nonsense&name=a%2Fb.png");
  assert.equal((await odd.json()).application.documents[1].type, "other");

  // In the member's list, and on the office's application with its file.
  const mine = (await as(token, "/member/applications")).json.applications[0];
  assert.equal(mine.documents.length, 2);
  const staffView = (await t.call(`/applications/${id}`, { cookie: admin.cookie })).json.application;
  assert.equal(staffView.documents[0].type, "payslip");
  assert.ok(staffView.documents[0].fileId);
  assert.equal(staffView.documents[0].verdict, undefined, "not checked automatically");
  assert.match(staffView.documents[0].notes[0], /member app/);
  const file = await fetch(`${t.baseUrl}/applications/${id}/documents/0/file`, { headers: { Cookie: admin.cookie } });
  assert.equal(file.status, 200);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), png);

  // Not once the application is decided.
  await t.call(`/applications/${id}/approvals`, { method: "POST", cookie: signer.bookkeeper.cookie, body: { decision: "denied", note: "Test" } });
  assert.equal((await send(token, png)).status, 409);
});
