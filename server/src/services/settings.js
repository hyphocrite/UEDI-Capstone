// UDEI's loan rules. Until someone saves the Settings page, the defaults below apply.
const Setting = require("../models/Setting");

const KEY = "loan";

const DEFAULTS = Object.freeze({
  products: {
    // From UDEI's 2026 loan ledger: 2% a month for long term (more than 6 months, up to a year),
    // 3% a month for short term (up to 6 months), charged on the remaining balance.
    long_term: { label: "Long term", monthlyRate: 2.0, maxTermMonths: 12 },
    emergency: { label: "Emergency", monthlyRate: 3.0, maxTermMonths: 6 },
  },
  minMonthlySalary: 10000,
  branches: ["Main Office"],
});

function shape(doc) {
  const d = doc || DEFAULTS;
  return {
    products: {
      long_term: { ...DEFAULTS.products.long_term, ...pick(d.products?.long_term) },
      emergency: { ...DEFAULTS.products.emergency, ...pick(d.products?.emergency) },
    },
    minMonthlySalary: d.minMonthlySalary ?? DEFAULTS.minMonthlySalary,
    branches: d.branches?.length ? [...d.branches] : [...DEFAULTS.branches],
    updatedAt: doc?.updatedAt ?? null,
    updatedByName: doc?.updatedByName ?? null,
  };
}

const pick = (p) => (p ? { label: p.label, monthlyRate: p.monthlyRate, maxTermMonths: p.maxTermMonths } : {});

/** The current rules (saved values, or the defaults). */
async function get() {
  return shape(await Setting.findOne({ key: KEY }).lean());
}

async function save(data, user) {
  const doc = await Setting.findOneAndUpdate(
    { key: KEY },
    { $set: { ...data, key: KEY, updatedBy: user._id, updatedByName: user.fullName } },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  return shape(doc);
}

/** An error message when the application breaks a rule, else null. */
function checkApplication(rules, { monthlySalary, loanType, termMonths }) {
  if (monthlySalary < rules.minMonthlySalary) {
    return `UDEI requires a monthly salary of at least ₱${rules.minMonthlySalary.toLocaleString("en-PH")}.`;
  }
  const product = rules.products[loanType];
  if (product && termMonths > product.maxTermMonths) {
    return `${product.label} loans run at most ${product.maxTermMonths} months.`;
  }
  return null;
}

module.exports = { DEFAULTS, get, save, checkApplication };
