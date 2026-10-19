const env = require("../config/env");

function ageOn(dateOfBirth, today = new Date()) {
  const d = new Date(dateOfBirth);
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age;
}

/** The fields the ML service expects (ml-service/app.py `Applicant`), built from a saved application. */
function toFeatures(app) {
  const a = app.applicant;
  const books = app.bookkeeper || {};
  const features = {
    loanType: app.loan.loanType,
    loanAmount: app.loan.amount,
    termMonths: app.loan.termMonths,
    monthlyRate: app.loan.monthlyRate,
    monthlySalary: a.monthlySalary,
    netTakeHomePay: a.netTakeHomePay,
    longTermBalance: books.longTermBalance || 0,
    shortTermBalance: books.shortTermBalance || 0,
    yearsAsMember: a.yearsAsMember || 0,
    priorLoans: a.priorLoans || 0,
    priorLatePayments: a.priorLatePayments || 0,
    employmentStatus: a.employmentStatus || "permanent",
    documentsFlagged: (app.documents || []).filter((d) => d.verdict && d.verdict !== "verified").length,
  };
  if (a.dateOfBirth) features.age = ageOn(a.dateOfBirth);
  return features;
}

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(`${env.mlServiceUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("The ML service is not running. Start it with `npm run ml`.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof body.detail === "string" ? body.detail : `ML service error (${res.status}).`;
    throw new Error(detail);
  }
  return body;
}

function assess(app) {
  return call("/predict", { method: "POST", body: JSON.stringify(toFeatures(app)) });
}

function modelInfo() {
  return call("/model");
}

module.exports = { assess, modelInfo, toFeatures, ageOn };
