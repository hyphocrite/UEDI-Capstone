// Document files, address lists, sessions that really end, and plain-language reasons.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { uri, setup, application, staffUp } = require("./helpers");
const { explain } = require("../src/services/explain");

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

const upload = (cookie, appId, index, buf, type = "image/png") =>
  fetch(`${t.baseUrl}/applications/${appId}/documents/${index}`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": type }, body: buf });

test("supporting document files: only the checked file, by the filer, readable by staff and the applicant", { skip }, async () => {
  const file = Buffer.from("fake png bytes for the payslip");
  const other = Buffer.from("a different file");
  const sha = crypto.createHash("sha256").update(file).digest("hex");
  const body = application(0, {});
  body.documents = [{ fileName: "payslip.png", type: "payslip", verdict: "verified", sha256: sha }];
  const app = (await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body })).json.application;
  assert.equal(app.documents[0].fileId, undefined, "the client can't set a file id");

  assert.equal((await upload(staff.signer.treasurer.cookie, app._id, 0, file)).status, 403, "only the filer uploads");
  assert.equal((await upload(staff.officer.cookie, app._id, 0, other)).status, 400, "must be the checked file");
  assert.equal((await upload(staff.officer.cookie, app._id, 0, file, "text/html")).status, 415);
  assert.equal((await upload(staff.officer.cookie, app._id, 3, file)).status, 404);
  assert.equal((await upload(staff.officer.cookie, app._id, 0, file)).status, 200);
  assert.equal((await upload(staff.officer.cookie, app._id, 0, file)).status, 409, "once only");

  const read = await fetch(`${t.baseUrl}/applications/${app._id}/documents/0/file`, { headers: { Cookie: staff.signer.treasurer.cookie } });
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await read.arrayBuffer()), file);

  const stranger = await t.register("Some Member", "stranger@uedi.test");
  assert.equal((await fetch(`${t.baseUrl}/applications/${app._id}/documents/0/file`, { headers: { Cookie: stranger.cookie } })).status, 404);
});

test("address lists come from the PSGC data and old addresses are split into them", { skip }, async () => {
  const c = staff.officer.cookie;
  assert.equal((await t.call("/locations/provinces")).status, 401, "signed in only");
  const provinces = (await t.call("/locations/provinces", { cookie: c })).json.provinces;
  const dn = provinces.find((p) => p.name === "Davao del Norte");
  assert.ok(dn && provinces.some((p) => p.name === "Metro Manila"));
  const towns = (await t.call(`/locations/towns?province=${dn.code}`, { cookie: c })).json.towns;
  const panabo = towns.find((x) => x.name === "City of Panabo");
  const brgys = (await t.call(`/locations/barangays?town=${panabo.code}`, { cookie: c })).json.barangays;
  assert.equal(brgys.length, 40);
  const parsed = (await t.call(`/locations/parse?address=${encodeURIComponent("Purok 3, New Visayas, Panabo City, Davao del Norte")}`, { cookie: c })).json.address;
  assert.deepEqual([parsed.street, parsed.barangay.name, parsed.town.name, parsed.province.name], ["Purok 3", "New Visayas", "City of Panabo", "Davao del Norte"]);
});

test("logging out ends the session for good; Stay signed in swaps it; a password change ends the others", { skip }, async () => {
  const u = await t.register("Sam Session", "sam@uedi.test");
  const me = await t.call("/auth/me", { cookie: u.cookie });
  assert.ok(Date.parse(me.json.expiresAt) > Date.now());

  const fresh = await t.call("/auth/refresh", { method: "POST", cookie: u.cookie });
  assert.equal(fresh.status, 200);
  const freshCookie = fresh.setCookie.split(";")[0];
  assert.equal((await t.call("/auth/me", { cookie: u.cookie })).json.session, null, "the old token stops working");
  assert.equal((await t.call("/auth/me", { cookie: freshCookie })).json.session.email, "sam@uedi.test");

  // A copy of the cookie on another device:
  const login = async () => (await t.call("/auth/login", { method: "POST", body: { email: "sam@uedi.test", password: "secret123" } })).setCookie.split(";")[0];
  const phone = await login();
  await new Promise((r) => setTimeout(r, 1100)); // tokens record their start in whole seconds
  const pw = await t.call("/auth/password", { method: "POST", cookie: freshCookie, body: { currentPassword: "secret123", newPassword: "newsecret456" } });
  assert.equal(pw.status, 200, pw.json.error);
  assert.equal((await t.call("/auth/me", { cookie: phone })).json.session, null, "other sessions end on a password change");
  const afterPw = pw.setCookie.split(";")[0];
  assert.equal((await t.call("/auth/me", { cookie: afterPw })).json.session.email, "sam@uedi.test", "this one continues");

  assert.equal((await t.call("/auth/logout", { method: "POST", cookie: afterPw })).status, 200);
  assert.equal((await t.call("/auth/me", { cookie: afterPw })).json.session, null, "a copied cookie is useless after logout");
});

test("plain-language reasons from the model factors, without age", () => {
  const factor = (feature, value, impact) => ({ feature, label: feature, value, impact, direction: impact > 0 ? "raises risk" : "lowers risk" });
  const model = (key, factors) => ({ key, name: key, defaultProbability: 0.6, suggestion: "deny", topFactors: factors });
  const e = explain({
    ensemble: { modelWeights: { xgboost: 0.5, random_forest: 0.3, logistic_regression: 0.2 } },
    models: [
      model("xgboost", [factor("deduction_ratio", 0.62, 0.4), factor("age", 25, 0.9), factor("years_as_member", 12, -0.3)]),
      model("random_forest", [factor("late_payment_rate", 0.5, 0.2), factor("deduction_ratio", 0.62, 0.1)]),
      model("logistic_regression", [factor("existing_balance_to_salary", 1.2, 0.05)]),
    ],
  });
  assert.equal(e.against[0].text, "The installment would take about 62% of your net take-home pay.");
  assert.ok(!e.against.some((r) => r.feature === "age"), "age is never a reason");
  assert.deepEqual(e.inFavor.map((r) => r.feature), ["years_as_member"]);
  assert.ok(e.tips.includes("A smaller amount or a longer term lowers the installment."));
  assert.equal(explain(null), null);
});
