// Shared setup for integration tests: a stand-in ML service, a fresh test database and an API client.
// Not a test file itself; it only exports functions.
const http = require("node:http");
const mongoose = require("mongoose");

const uri = process.env.TEST_MONGODB_URI;

/** ML stand-in: more than one late payment means "deny", otherwise "approve". */
function startFakeMl() {
  const server = http
    .createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
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
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(path, { method = "GET", body, cookie } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json(), setCookie: res.headers.get("set-cookie") };
  }

  /** Registers an account and returns { cookie, id }. The first account becomes admin. */
  async function register(fullName, email) {
    const r = await call("/auth/register", { method: "POST", body: { fullName, email, password: "secret123" } });
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

  return { call, register, userWithRole, close };
}

const application = (late = 0, overrides = {}) => ({
  applicant: {
    lastName: "Santos", firstName: "Maria", middleInitial: "C", residenceAddress: "Purok 3, New Visayas, Panabo City",
    employer: "Davao del Norte State College", employmentStatus: "permanent", monthlySalary: 38000, netTakeHomePay: 24000,
    dateOfBirth: "1984-03-12", yearsAsMember: 5, priorLoans: 3, priorLatePayments: late,
  },
  loan: { loanType: "long_term", amount: 60000, termMonths: 24, monthlyRate: 1, paymentFrequency: "quincenal", ...overrides.loan },
  bookkeeper: { longTermBalance: 12000, shortTermBalance: 0 },
  agreement: { payrollDeduction: true, autoRestructure: true, applicationDate: "2026-10-19" },
  documents: [],
});

module.exports = { uri, setup, application };
