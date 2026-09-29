"""One place that turns a loan application into model features.

Training and prediction both call build_features(), so the two can never drift apart.
Column names match the fields the Express API sends (camelCase).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

EMPLOYMENT_TYPES = ["wage", "self", "informal", "other"]

# Raw fields every historical record and every new application must have.
RAW_FIELDS = [
    "age",
    "employmentType",
    "monthlyIncome",
    "existingMonthlyDebt",
    "loanAmount",
    "termMonths",
    "annualRate",
    "yearsAsMember",
    "priorLoans",
    "priorLatePayments",
    "hasCoMaker",
    "hasRetirementPlan",
    "documentsFlagged",
]

FEATURES = [
    "age",
    "monthly_income",
    "loan_amount",
    "term_months",
    "annual_rate",
    "monthly_payment",
    "debt_to_income",
    "loan_to_income",
    "years_as_member",
    "prior_loans",
    "late_payment_rate",
    "has_co_maker",
    "has_retirement_plan",
    "documents_flagged",
] + [f"employment_{e}" for e in EMPLOYMENT_TYPES]

# Plain-language names shown to loan officers.
FEATURE_LABELS = {
    "age": "Age",
    "monthly_income": "Monthly income",
    "loan_amount": "Loan amount",
    "term_months": "Loan term",
    "annual_rate": "Interest rate",
    "monthly_payment": "Monthly payment",
    "debt_to_income": "Debt-to-income ratio",
    "loan_to_income": "Loan-to-income ratio",
    "years_as_member": "Years as member",
    "prior_loans": "Past loans",
    "late_payment_rate": "Late payment rate",
    "has_co_maker": "Has a co-maker",
    "has_retirement_plan": "Has a retirement plan",
    "documents_flagged": "Flagged documents",
    "employment_wage": "Employed (wage)",
    "employment_self": "Self-employed",
    "employment_informal": "Informal work",
    "employment_other": "Other employment",
}


def build_features(raw: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in RAW_FIELDS if c not in raw.columns]
    if missing:
        raise ValueError(f"Missing fields: {', '.join(missing)}")

    income = raw["monthlyIncome"].astype(float).clip(lower=1)
    amount = raw["loanAmount"].astype(float)
    term = raw["termMonths"].astype(float).clip(lower=1)
    rate = raw["annualRate"].astype(float)
    # Add-on interest, as UEDI's Settings page computes it.
    payment = amount * (1 + rate / 100 * term / 12) / term
    prior = raw["priorLoans"].astype(float)

    out = pd.DataFrame(
        {
            "age": raw["age"].astype(float),
            "monthly_income": income,
            "loan_amount": amount,
            "term_months": term,
            "annual_rate": rate,
            "monthly_payment": payment,
            "debt_to_income": (payment + raw["existingMonthlyDebt"].astype(float)) / income,
            "loan_to_income": amount / (income * 12),
            "years_as_member": raw["yearsAsMember"].astype(float),
            "prior_loans": prior,
            "late_payment_rate": np.where(prior > 0, raw["priorLatePayments"].astype(float) / prior.clip(lower=1), 0.0),
            "has_co_maker": raw["hasCoMaker"].astype(bool).astype(float),
            "has_retirement_plan": raw["hasRetirementPlan"].astype(bool).astype(float),
            "documents_flagged": raw["documentsFlagged"].astype(float),
        }
    )
    emp = raw["employmentType"].astype(str).where(raw["employmentType"].isin(EMPLOYMENT_TYPES), "other")
    for e in EMPLOYMENT_TYPES:
        out[f"employment_{e}"] = (emp == e).astype(float)
    return out[FEATURES]
