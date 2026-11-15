// The XGBoost SHAP waterfall is saved with the assessment and shown to staff only.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp } = require("./helpers");

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

test("the SHAP waterfall is saved with the assessment, for staff only", { skip }, async () => {
  const member = await t.register("Wanda Waterfall", "wanda@uedi.test");
  const filed = await t.call("/applications", { method: "POST", cookie: member.cookie, body: application(0) });
  assert.equal(filed.status, 201, filed.json.error);
  assert.equal(filed.json.application.assessment, undefined, "members never get the scores");

  const staffView = (await t.call(`/applications/${filed.json.application._id}`, { cookie: staff.officer.cookie })).json.application;
  const w = staffView.assessment.shap;
  assert.equal(w.model, "xgboost");
  assert.equal(w.factors.length, 2);
  const total = w.baseValue + w.factors.reduce((s, f) => s + f.shap, 0) + w.otherFeatures;
  assert.ok(Math.abs(total - w.output) < 1e-9, "stored as sent, still adding up");

  const memberView = (await t.call(`/applications/${filed.json.application._id}`, { cookie: member.cookie })).json.application;
  assert.equal(memberView.assessment, undefined);
  assert.ok(!JSON.stringify(memberView).includes("baseValue"), "no SHAP numbers anywhere in the member's view");
});
