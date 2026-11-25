// UDEI's loan rules. Until someone saves the Settings page, the defaults below apply.
const Setting = require("../models/Setting");

const KEY = "loan";

const DEFAULTS = Object.freeze({
  products: {
    // From UDEI's 2026 loan ledger: 2% a month for long term (more than 6 months, up to a year),
    // 3% a month for short term (up to 6 months), charged on the remaining balance.
    long_term: { label: "Long term", monthlyRate: 2.0, maxTermMonths: 12 },
    // The bookkeeper (2026-11-24): short term is 1 to 5 months; unpaid at the end it becomes long term.
    emergency: { label: "Short term (Emergency)", monthlyRate: 3.0, maxTermMonths: 5 },
  },
  minMonthlySalary: 10000,
  branches: ["Main Office"],
  // Members never need a co-maker by amount: signers ask case by case. Kept for older saved settings.
  coMakersRequired: 0,
  // Signers are reminded that UDEI usually asks for a co-maker from this amount (pesos). 0: no reminder.
  coMakersFromAmount: 50000,
  // Applicants not linked to a UDEI member number: at most this much, with a member as co-maker.
  nonMemberMaxAmount: 5000,
  // Expected bonus release dates (month, day). UDEI to confirm: guesses until the bookkeeper checks.
  bonusCalendar: {
    mid_year: { month: 5, day: 15 }, // UDEI to confirm
    year_end: { month: 11, day: 15 }, // UDEI to confirm
    cna: { month: 12, day: 15 }, // UDEI to confirm
    sri: { month: 12, day: 20 }, // UDEI to confirm
  },
  // HR is billed in the first week of the month, so mode changes on or before this day start this
  // month, later ones next month. UDEI to confirm
  modeChangeCutoffDay: 7,
  // Days after a short term's last due date before it becomes long term. UDEI to confirm
  shortTermGraceDays: 0,
  // Months a converted short-term balance is spread over at the long-term rate. UDEI to confirm
  conversionTermMonths: 12,
  // 1% service fee, taken only from payroll deduction postings (the bookkeeper mentioned it as why
  // some members pay cash). Who pays it is not confirmed yet. UDEI to confirm
  serviceFee: { rate: 1, appliesTo: ["payroll"] },
});

// Every application needs at least this net take-home pay (pesos).
const MIN_NET_TAKE_HOME_PAY = 5000;

/** Whether signers should be reminded to consider a co-maker for a loan of this amount (pesos). Never a requirement. */
function coMakerSuggested(rules, amount) {
  const from = rules.coMakersFromAmount ?? DEFAULTS.coMakersFromAmount;
  return from > 0 && Number(amount) >= from;
}

function shape(doc) {
  const d = doc || DEFAULTS;
  return {
    products: {
      long_term: { ...DEFAULTS.products.long_term, ...pick(d.products?.long_term) },
      emergency: { ...DEFAULTS.products.emergency, ...pick(d.products?.emergency) },
    },
    minMonthlySalary: d.minMonthlySalary ?? DEFAULTS.minMonthlySalary,
    branches: d.branches?.length ? [...d.branches] : [...DEFAULTS.branches],
    coMakersRequired: d.coMakersRequired ?? DEFAULTS.coMakersRequired,
    coMakersFromAmount: d.coMakersFromAmount ?? DEFAULTS.coMakersFromAmount,
    nonMemberMaxAmount: d.nonMemberMaxAmount ?? DEFAULTS.nonMemberMaxAmount,
    bonusCalendar: Object.fromEntries(Object.entries(DEFAULTS.bonusCalendar).map(([k, v]) => [k, { ...v, ...pickDate(d.bonusCalendar?.[k]) }])),
    modeChangeCutoffDay: d.modeChangeCutoffDay ?? DEFAULTS.modeChangeCutoffDay,
    shortTermGraceDays: d.shortTermGraceDays ?? DEFAULTS.shortTermGraceDays,
    conversionTermMonths: d.conversionTermMonths ?? DEFAULTS.conversionTermMonths,
    serviceFee: {
      rate: d.serviceFee?.rate ?? DEFAULTS.serviceFee.rate,
      appliesTo: d.serviceFee?.appliesTo ? [...d.serviceFee.appliesTo] : [...DEFAULTS.serviceFee.appliesTo],
    },
    updatedAt: doc?.updatedAt ?? null,
    updatedByName: doc?.updatedByName ?? null,
  };
}

const pickDate = (v) => (v?.month && v?.day ? { month: v.month, day: v.day } : {});
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
    return `${product.label} mutual assistance runs at most ${product.maxTermMonths} months.`;
  }
  return null;
}

/**
 * One-time fixes to a saved Settings document. "short-term-5-months": short term became 1 to 5
 * months (it was 6) and is labelled "Short term (Emergency)"; only a product still at the old
 * untouched default (Emergency, 3%, 6 months) is updated, so a value the office chose is kept.
 * Safe to run on every start.
 */
async function migrate() {
  const done = "short-term-5-months";
  const doc = await Setting.findOne({ key: KEY }).lean();
  if (!doc || (doc.migrations || []).includes(done)) return false;
  const e = doc.products?.emergency;
  const untouched = e && e.label === "Emergency" && e.monthlyRate === 3 && e.maxTermMonths === 6;
  const set = untouched ? { "products.emergency.label": DEFAULTS.products.emergency.label, "products.emergency.maxTermMonths": DEFAULTS.products.emergency.maxTermMonths } : {};
  await Setting.updateOne({ key: KEY, migrations: { $ne: done } }, { $set: set, $push: { migrations: done } });
  return untouched;
}

module.exports = { DEFAULTS, migrate, MIN_NET_TAKE_HOME_PAY, get, save, checkApplication, coMakerSuggested };
