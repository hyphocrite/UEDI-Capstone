// Turns the models' top factors into plain sentences: what counted against an application, what
// counted for it, and what the borrower can do. Age and the interest rate are never given as
// reasons: a borrower can't change them, and age is not a fair reason to give.

const peso = (n) => `₱${Math.round(n).toLocaleString("en-PH")}`;
const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * For each feature: the reason when it raised risk, when it lowered risk, and a tip. A "for" that
 * returns null is left out: the model can count something in the applicant's favor that isn't
 * true of them in plain words (a flagged document is not "matched the form").
 */
const TEXT = {
  deduction_ratio: {
    against: (v) => `The installment would take about ${pct(v)} of your net take-home pay.`,
    for: () => "The installment is a manageable share of your take-home pay.",
    tip: "A smaller amount or a longer term lowers the installment.",
  },
  net_pay_after_loan: {
    against: (v) => `Only about ${peso(v)} of your take-home pay would be left each month after this loan.`,
    for: () => "Enough of your take-home pay is left after this loan.",
    tip: "A smaller amount or a longer term leaves more of your pay.",
  },
  monthly_installment: {
    against: (v) => `The monthly installment (about ${peso(v)}) is high.`,
    for: () => "The monthly installment is modest.",
    tip: "A smaller amount or a longer term lowers the installment.",
  },
  loan_to_salary: {
    against: (v) => `The amount is about ${Math.round(v * 10) / 10} times your monthly salary.`,
    for: () => "The amount is reasonable for your salary.",
    tip: "Applying for a smaller amount helps.",
  },
  loan_amount: {
    against: () => "The loan amount is large.",
    for: () => "The loan amount is modest.",
    tip: "Applying for a smaller amount helps.",
  },
  term_months: {
    against: () => "The loan runs for a long time.",
    for: () => "The loan term is short.",
    tip: "A shorter term, if you can afford the installment, helps.",
  },
  existing_balance_to_salary: {
    against: () => "Your existing UDEI loan balances are high compared with your salary.",
    for: () => "You owe UDEI little on other loans.",
    tip: "Paying down your current UDEI loans first improves your chances.",
  },
  late_payment_rate: {
    against: () => "Some of your past UDEI loans had late payments.",
    for: (v) => (v === 0 ? "Your past UDEI loans were paid on time." : null),
    tip: "Keeping your current loans up to date helps future applications.",
  },
  prior_loans: {
    against: () => "You have had many loans with UDEI.",
    for: () => "You have a record of past loans with UDEI.",
    tip: null,
  },
  years_as_member: {
    against: () => "You have been a UDEI member for a short time.",
    for: () => "You have been a UDEI member for a long time.",
    tip: null,
  },
  monthly_salary: {
    against: () => "Your monthly salary is low for this loan.",
    for: () => "Your salary supports this loan.",
    tip: "Applying for a smaller amount helps.",
  },
  net_to_salary: {
    against: () => "A large part of your salary already goes to other deductions.",
    for: () => "Most of your salary reaches you after deductions.",
    tip: null,
  },
  employment_not_permanent: {
    against: () => "Your employment is not permanent.",
    for: (v) => (v === 0 ? "You are a permanent employee." : null),
    tip: null,
  },
  documents_flagged: {
    against: () => "Some supporting documents did not match the form or could not be read.",
    for: (v) => (v === 0 ? "Your supporting documents matched the form." : null),
    tip: "Upload clear photos of documents that match what you typed.",
  },
  loan_type_emergency: {
    against: () => "Emergency loans have had more late payments in UDEI's records.",
    for: (v) => (v === 0 ? "Long term loans have had fewer late payments in UDEI's records." : null),
    tip: null,
  },
};

// Features that measure the same thing. A point in favor is left out when the same topic is
// already listed against, so the borrower doesn't read "too high" and "fine" about one thing.
const TOPIC = {
  deduction_ratio: "affordability",
  net_pay_after_loan: "affordability",
  monthly_installment: "affordability",
  loan_to_salary: "affordability",
  loan_amount: "affordability",
  monthly_salary: "affordability",
  term_months: "affordability",
  net_to_salary: "affordability",
  existing_balance_to_salary: "debts",
  late_payment_rate: "history",
  prior_loans: "history",
  years_as_member: "membership",
  employment_not_permanent: "employment",
  documents_flagged: "documents",
  loan_type_emergency: "loan type",
};

/**
 * The plain-language explanation of an assessment: up to three reasons against, two for, and the
 * tips that go with the reasons against. Impacts are added up across the models, weighted like
 * the ensemble.
 */
function explain(assessment) {
  if (!assessment?.models?.length) return null;
  const weights = assessment.ensemble?.modelWeights || {};
  const total = new Map();
  const value = new Map();
  for (const m of assessment.models) {
    const w = weights[m.key] ?? 1 / assessment.models.length;
    for (const f of m.topFactors || []) {
      if (!TEXT[f.feature]) continue;
      total.set(f.feature, (total.get(f.feature) || 0) + w * f.impact);
      if (!value.has(f.feature)) value.set(f.feature, f.value);
    }
  }
  const ranked = [...total.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const against = ranked.filter(([, v]) => v > 0).slice(0, 3).map(([k]) => ({ feature: k, text: TEXT[k].against(value.get(k)), tip: TEXT[k].tip }));
  const topicsAgainst = new Set(against.map((r) => TOPIC[r.feature]));
  const inFavor = ranked
    .filter(([k, v]) => v < 0 && !topicsAgainst.has(TOPIC[k]))
    .map(([k]) => ({ feature: k, text: TEXT[k].for(value.get(k)) }))
    .filter((r) => r.text)
    .slice(0, 2);
  const tips = [...new Set(against.map((r) => r.tip).filter(Boolean))];
  return { against: against.map(({ feature, text }) => ({ feature, text })), inFavor, tips };
}

module.exports = { explain };
