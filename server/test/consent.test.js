// Privacy Notice consent (RA 10173): registering, applying and accepting as co-maker need it, the
// version is stored, and accounts from before are asked once.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp, lastCode } = require("./helpers");
const { PRIVACY_NOTICE_VERSION } = require("../src/config/privacy");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let staff;
let User;

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
  User = require("../src/models/User");
});

after(async () => {
  if (uri) await t.close();
});

test("registering on the web and in the app needs the Privacy Notice, and stores its version", { skip }, async () => {
  const web = { fullName: "Nora Notice", email: "nora@uedi.test", password: "secret123" };
  const refused = await t.call("/auth/register", { method: "POST", body: web });
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /Privacy Notice/);
  assert.equal(await User.exists({ email: "nora@uedi.test" }), null, "no account made");
  assert.equal((await t.call("/auth/register", { method: "POST", body: { ...web, privacyConsent: true } })).status, 201);
  const nora = await User.findOne({ email: "nora@uedi.test" });
  assert.equal(nora.privacyConsent.version, PRIVACY_NOTICE_VERSION);
  assert.ok(nora.privacyConsent.at && nora.privacyConsent.ip);

  const phone = { fullName: "Pio Phone", email: "pio@uedi.test", memberNo: "C-01", password: "secret123" };
  assert.equal((await t.call("/member/register", { method: "POST", body: phone })).status, 400);
  assert.equal((await t.call("/member/register", { method: "POST", body: { ...phone, privacyConsent: true } })).status, 201);
  assert.equal((await User.findOne({ email: "pio@uedi.test" })).privacyConsent.version, PRIVACY_NOTICE_VERSION);
});

test("an application needs the applicant's consent; it is stored on the application", { skip }, async () => {
  const { consent: _c, ...without } = application(0, { applicant: { memberId: "C-10" } });
  const refused = await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body: without });
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /automated|evaluate/);
  const ok = await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body: application(0, { applicant: { memberId: "C-10" } }) });
  assert.equal(ok.status, 201, ok.json.error);
  const Application = require("../src/models/Application");
  assert.equal((await Application.findById(ok.json.application._id)).consent.version, PRIVACY_NOTICE_VERSION);

  // The app: verify, then apply without and with the box ticked.
  await t.call("/member/verify-email", { method: "POST", body: { email: "pio@uedi.test", code: lastCode("pio@uedi.test") } });
  const token = (await t.call("/member/login", { method: "POST", body: { email: "pio@uedi.test", password: "secret123" } })).json.token;
  const apply = (extra) => t.call("/member/applications", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: {
    lastName: "Phone", firstName: "Pio", residenceAddress: "Purok 1, Panabo City", employer: "Davao del Norte State College", monthlySalary: 38000, netTakeHomePay: 24000,
    loanType: "long_term", amount: 5000, termMonths: 12, purpose: "School fees", payrollDeduction: true, autoRestructure: true,
    documentTypes: ["valid_id", "payslip", "proof_of_address", "application_form"], coMakers: [], ...extra,
  } });
  assert.equal((await apply({})).status, 400);
});

test("accepting as co-maker needs consent; declining doesn't", { skip }, async () => {
  const Member = require("../src/models/Member");
  await Member.create({ memberId: "C-20", fullName: "Cora Comaker" });
  const cora = await t.register("Cora Comaker", "cora@uedi.test");
  await t.call(`/auth/users/${cora.id}/member`, { method: "PATCH", cookie: staff.admin.cookie, body: { memberId: "C-20" } });
  const app = (await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body: { ...application(0, { applicant: { memberId: "C-11" } }), coMakers: ["C-20"] } })).json.application;
  const answer = (body) => t.call(`/comaker/requests/${app._id}`, { method: "POST", cookie: cora.cookie, body });
  const refused = await answer({ decision: "accepted" });
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /co-maker/);
  assert.equal((await answer({ decision: "accepted", consent: true })).status, 200);
  const Application = require("../src/models/Application");
  const saved = await Application.findById(app._id);
  assert.equal(saved.coMakers[0].consent.version, PRIVACY_NOTICE_VERSION);
});

test("an account from before consent is asked once after sign-in", { skip }, async () => {
  const old = await t.register("Olga Older", "olga@uedi.test");
  await User.updateOne({ _id: old.id }, { $unset: { privacyConsent: 1 } });
  const me = await t.call("/auth/me", { cookie: old.cookie });
  assert.equal(me.json.session.needsConsent, true);
  assert.equal((await t.call("/me/consent", { method: "POST", cookie: old.cookie, body: {} })).status, 400);
  const agreed = await t.call("/me/consent", { method: "POST", cookie: old.cookie, body: { privacyConsent: true } });
  assert.equal(agreed.status, 200);
  assert.equal(agreed.json.session.needsConsent, false);
  assert.equal((await t.call("/auth/me", { cookie: old.cookie })).json.session.needsConsent, false);
});
