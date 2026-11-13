// Shared setup for integration tests: a stand-in ML service, a fresh test database and an API client.
// Not a test file itself; it only exports functions.
const http = require("node:http");
const mongoose = require("mongoose");

const uri = process.env.TEST_MONGODB_URI;
process.env.AUTH_RATE_LIMIT = "off";
process.env.QUIET_MAIL = "1";

/** ML stand-in: more than one late payment means "deny", otherwise "approve". */
function startFakeMl() {
  const server = http
    .createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        // Early warning stand-in: each missed savings month in the last 3 adds 25 points.
        if (req.url.startsWith("/early-warning/score")) {
          const { loans } = JSON.parse(body || "{}");
          const results = loans.map((s) => {
            const p = Math.min(0.95, 0.05 + 0.25 * (s.contributions_missed_3m ?? 0));
            const level = p >= 0.35 ? "high" : p >= 0.15 ? "watch" : "low";
            const reasons = s.contributions_missed_3m ? [{ feature: "contributions_missed_3m", label: "Savings deposits missed", value: s.contributions_missed_3m, impact: 1, text: `Missed ${s.contributions_missed_3m} of the last 3 monthly savings deposits.` }] : [];
            return { id: s.id, probability: p, level, reasons };
          });
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ results, version: "test-ew" }));
        }
        const f = JSON.parse(body || "{}");
        const p = f.priorLatePayments > 1 ? 0.8 : 0.1;
        const suggestion = p >= 0.5 ? "deny" : "approve";
        const model = (key, name) => ({ key, name, defaultProbability: p, suggestion, topFactors: [] });
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            ensemble: { name: "Stacked ensemble", defaultProbability: p, suggestion, modelWeights: {} },
            models: [model("xgboost", "XGBoost"), model("random_forest", "Random Forest"), model("logistic_regression", "Logistic Regression")],
            thresholds: { approve: 0.2, deny: 0.5 },
            modelVersion: "test",
          }),
        );
      });
    })
    .listen(0);
  return server;
}

async function setup() {
  const fakeMl = startFakeMl();
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${fakeMl.address().port}`;
  delete require.cache[require.resolve("../src/config/env")];
  const { createApp } = require("../src/app");
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  // UDEI's real limits are 12 months (long term) and 6 (emergency); most tests use longer terms,
  // so they start with roomier limits. test/realdata.test.js checks the limits themselves.
  // Applications always get the rate set here (1% long term, 1.5% emergency), whatever they send.
  await require("../src/models/Setting").create({
    key: "loan",
    products: { long_term: { label: "Long term", monthlyRate: 1, maxTermMonths: 120 }, emergency: { label: "Emergency", monthlyRate: 1.5, maxTermMonths: 12 } },
    minMonthlySalary: 10000,
    branches: ["Main Office"],
    // Most tests file applications without co-makers; test/comakers.test.js turns this on.
    coMakersRequired: 0,
  });
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(path, { method = "GET", body, cookie, headers = {} } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json(), setCookie: res.headers.get("set-cookie") };
  }

  /** Registers an account, enters the emailed code and returns { cookie, id }. The first account becomes admin. */
  async function register(fullName, email) {
    await call("/auth/register", { method: "POST", body: { fullName, email, password: "secret123" } });
    const r = await call("/auth/verify-email", { method: "POST", body: { email, code: lastCode(email) } });
    return { cookie: r.setCookie.split(";")[0], id: r.json.session.id };
  }

  /** Registers an account and has the admin give it a role. */
  async function userWithRole(adminCookie, role, fullName = `Test ${role}`) {
    const u = await register(fullName, `${role}.${Math.random().toString(36).slice(2, 8)}@uedi.test`);
    const r = await call(`/auth/users/${u.id}/role`, { method: "PATCH", cookie: adminCookie, body: { role } });
    if (r.status !== 200) throw new Error(`Could not make ${role}: ${r.json.error}`);
    return u;
  }

  async function close() {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    server.close();
    fakeMl.close();
  }

  return { call, register, userWithRole, close, baseUrl: base };
}

/** The verification code most recently "emailed" to this address (mail isn't sent in tests). */
function lastCode(email) {
  const { outbox } = require("../src/services/mailer");
  const mail = outbox.findLast((m) => m.to === email.toLowerCase());
  return mail?.subject.match(/\d{6}/)[0];
}

const application = (late = 0, overrides = {}) => ({
  applicant: {
    lastName: "Santos", firstName: "Maria", middleInitial: "C", residenceAddress: "Purok 3, New Visayas, Panabo City",
    employer: "Davao del Norte State College", employmentStatus: "permanent", monthlySalary: 38000, netTakeHomePay: 24000,
    dateOfBirth: "1984-03-12", yearsAsMember: 5, priorLoans: 3, priorLatePayments: late, ...overrides.applicant,
  },
  loan: { loanType: "long_term", amount: 60000, termMonths: 24, monthlyRate: 1, paymentFrequency: "quincenal", ...overrides.loan },
  bookkeeper: overrides.bookkeeper ?? { longTermBalance: 12000, shortTermBalance: 0 },
  agreement: { payrollDeduction: true, autoRestructure: true, applicationDate: "2026-10-19" },
  documents: [],
});

const SIGNER_ROLES = ["bookkeeper", "treasurer", "crecom_chair", "president"];

/** Creates an admin, a loan officer and one user per signer role. */
async function staffUp(t) {
  const admin = await t.register("Admin One", "admin@uedi.test");
  const officer = await t.userWithRole(admin.cookie, "loan_officer", "Lorna Officer");
  const signer = {};
  for (const role of SIGNER_ROLES) signer[role] = await t.userWithRole(admin.cookie, role);
  return { admin, officer, signer };
}

/** Calendar date n days before today in Manila, as YYYY-MM-DD. */
function daysAgo(n) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  return new Date(new Date(`${today}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

/** Submits an application and has all four signers approve it. Returns the approved application. */
async function approve(t, staff, body) {
  const app = (await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body })).json.application;
  let res;
  for (const role of SIGNER_ROLES) {
    res = await t.call(`/applications/${app._id}/approvals`, { method: "POST", cookie: staff.signer[role].cookie, body: { decision: "approved" } });
    if (res.status !== 200) throw new Error(`${role} could not sign: ${res.json.error}`);
  }
  return res.json.application;
}

/** Approves and releases a loan for a member. Returns the released loan as the API shows it. */
async function releasedLoan(t, staff, { memberId, loan, releasedAt = daysAgo(40), offsetLoanIds }) {
  const app = await approve(t, staff, application(0, { applicant: { memberId }, loan, bookkeeper: { longTermBalance: 0, shortTermBalance: 0 } }));
  const r = await t.call(`/loans/${app.loanId}/release`, {
    method: "POST",
    cookie: staff.signer.treasurer.cookie,
    body: { releasedAt, voucherNo: `CV-${app.loanNo}`, offsetLoanIds },
  });
  if (r.status !== 200) throw new Error(`release failed: ${r.json.error}`);
  return r.json.loan;
}

module.exports = { uri, lastCode, setup, application, staffUp, daysAgo, approve, releasedLoan };
