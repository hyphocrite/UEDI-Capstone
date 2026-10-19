// Integration test for loan applications and officer decisions.
// Uses a stand-in ML service so it runs without Python:
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");

const uri = process.env.TEST_MONGODB_URI;
let server;
let fakeMl;
let base;
let predictCalls = 0;
let lastFeatures;

before(async () => {
  if (!uri) return;
  fakeMl = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      predictCalls++;
      const f = JSON.parse(body);
      lastFeatures = f;
      const p = f.priorLatePayments > 1 ? 0.8 : 0.1;
      const suggestion = p >= 0.5 ? "deny" : "approve";
      const model = (key, name) => ({ key, name, defaultProbability: p, suggestion, topFactors: [{ feature: "debt_to_income", label: "Debt-to-income ratio", value: 0.3, impact: 0.2, direction: "raises risk" }] });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        ensemble: { name: "Stacked ensemble", defaultProbability: p, suggestion, modelWeights: {} },
        models: [model("xgboost", "XGBoost"), model("random_forest", "Random Forest"), model("logistic_regression", "Logistic Regression")],
        thresholds: { approve: 0.2, deny: 0.5 },
        modelVersion: "test",
        received: f,
      }));
    });
  }).listen(0);
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${fakeMl.address().port}`;
  delete require.cache[require.resolve("../src/config/env")];
  const { createApp } = require("../src/app");
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (!uri) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server.close();
  fakeMl.close();
});

async function call(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json(), setCookie: res.headers.get("set-cookie") };
}

const application = (late = 0) => ({
  applicant: {
    lastName: "Santos", firstName: "Maria", middleInitial: "C", residenceAddress: "Purok 3, New Visayas, Panabo City",
    employer: "Davao del Norte State College", employmentStatus: "permanent", monthlySalary: 38000, netTakeHomePay: 24000,
    dateOfBirth: "1984-03-12", yearsAsMember: 5, priorLoans: 3, priorLatePayments: late,
  },
  loan: { loanType: "long_term", amount: 60000, termMonths: 24, monthlyRate: 1, paymentFrequency: "quincenal" },
  bookkeeper: { longTermBalance: 12000, shortTermBalance: 0 },
  agreement: { payrollDeduction: true, autoRestructure: true, applicationDate: "2026-10-19" },
  documents: [{ fileName: "id.jpg", type: "valid_id", verdict: "verified" }, { fileName: "slip.jpg", type: "payslip", verdict: "mismatch" }],
});

test("submit, score and list applications", { skip: !uri && "TEST_MONGODB_URI not set" }, async () => {
  const anon = await call("/applications");
  assert.equal(anon.status, 401);

  const admin = (await call("/auth/register", { method: "POST", body: { fullName: "Admin One", email: "admin@uedi.coop", password: "secret123" } })).setCookie.split(";")[0];
  const staff = (await call("/auth/register", { method: "POST", body: { fullName: "Staff Two", email: "staff@uedi.coop", password: "secret123" } })).setCookie.split(";")[0];

  const bad = await call("/applications", { method: "POST", cookie: staff, body: { ...application(), loan: { ...application().loan, amount: 0 } } });
  assert.equal(bad.status, 400);

  const noConsent = await call("/applications", { method: "POST", cookie: staff, body: { ...application(), agreement: { ...application().agreement, payrollDeduction: false } } });
  assert.equal(noConsent.status, 400);
  const netTooHigh = await call("/applications", { method: "POST", cookie: staff, body: { ...application(), applicant: { ...application().applicant, netTakeHomePay: 50000 } } });
  assert.equal(netTooHigh.status, 400);
  assert.match(netTooHigh.json.error, /net take-home/i);

  const good = await call("/applications", { method: "POST", cookie: staff, body: application(0) });
  assert.equal(good.status, 201);
  const app = good.json.application;
  assert.equal(app.applicant.fullName, "Maria C. Santos");
  assert.deepEqual(
    { ...lastFeatures, age: undefined },
    {
      loanType: "long_term", loanAmount: 60000, termMonths: 24, monthlyRate: 1, monthlySalary: 38000, netTakeHomePay: 24000,
      longTermBalance: 12000, shortTermBalance: 0, yearsAsMember: 5, priorLoans: 3, priorLatePayments: 0,
      employmentStatus: "permanent", documentsFlagged: 1, age: undefined,
    },
  );
  assert.ok(lastFeatures.age >= 42);
  assert.match(app.applicationNo, /^APP-\d{4}-0001$/);
  assert.equal(app.status, "pending");
  assert.equal(app.assessment.ensemble.suggestion, "approve");
  assert.equal(app.assessment.models.length, 3);
  assert.equal(predictCalls, 1);

  const risky = (await call("/applications", { method: "POST", cookie: staff, body: application(3) })).json.application;
  assert.equal(risky.assessment.ensemble.suggestion, "deny");
  assert.equal(risky.applicationNo.endsWith("0002"), true);

  const pending = await call("/applications?status=pending", { cookie: staff });
  assert.equal(pending.json.applications.length, 2);

  assert.equal(app.currentStep, "bookkeeper", "new applications wait for the Bookkeeper");
  assert.deepEqual(app.approvals, []);

  // Signing is covered in approvals.test.js; here only check that staff and admins can't sign.
  const staffSigns = await call(`/applications/${app._id}/approvals`, { method: "POST", cookie: staff, body: { decision: "approved" } });
  assert.equal(staffSigns.status, 403);
  assert.match(staffSigns.json.error, /Bookkeeper/);
  const adminSigns = await call(`/applications/${app._id}/approvals`, { method: "POST", cookie: admin, body: { decision: "approved" } });
  assert.equal(adminSigns.status, 403, "admins manage users but do not sign");
  assert.equal((await call(`/applications/${app._id}/decision`, { method: "POST", cookie: admin, body: { decision: "approved" } })).status, 404, "old route is gone");

  const rescore = await call(`/applications/${app._id}/assess`, { method: "POST", cookie: staff });
  assert.equal(rescore.status, 200);
  assert.equal(predictCalls, 3);

  assert.equal((await call("/applications?status=pending", { cookie: staff })).json.applications.length, 2);
  assert.equal((await call("/applications?awaiting=me", { cookie: staff })).json.applications.length, 0, "staff never sign");
  assert.equal((await call("/applications/not-an-id", { cookie: staff })).status, 404);
});
