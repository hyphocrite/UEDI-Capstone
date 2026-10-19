"""One place that turns a Mutual Assistance application into model features.

Training and prediction both call build_features(), so the two can never drift apart.
Field names follow UEDI's paper form (camelCase, as the Express API sends them):

  Applicant:   monthlySalary, netTakeHomePay
  Loan:        loanType (long_term | emergency), loanAmount, termMonths, monthlyRate (% per month)
  Bookkeeper:  longTermBalance, shortTermBalance (Mutual Assistance balance to date)
  UEDI records (optional): yearsAsMember, priorLoans, priorLatePayments, age,
                           employmentStatus, documentsFlagged

Optional fields are only used when the training data has them. A model trained on a CSV
without `age` never looks at age, even if the API sends it.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

LOAN_TYPES = ["long_term", "emergency"]
EMPLOYMENT_STATUSES = ["permanent", "temporary", "contractual", "job_order"]

# Fields on the form itself. Every past loan and every new application must have them.
REQUIRED_FIELDS = ["loanType", "loanAmount", "termMonths", "monthlyRate", "monthlySalary", "netTakeHomePay"]

# Fields from the bookkeeper's section and UEDI's records, with the value used when blank.
OPTIONAL_FIELDS = {
    "longTermBalance": 0.0,
    "shortTermBalance": 0.0,
    "yearsAsMember": 0.0,
    "priorLoans": 0.0,
    "priorLatePayments": 0.0,
    "age": 40.0,
    "employmentStatus": "permanent",
    "documentsFlagged": 0.0,
}

RAW_FIELDS = REQUIRED_FIELDS + list(OPTIONAL_FIELDS)

# Each feature and the raw fields it needs. A feature is used only when its fields exist.
FEATURE_SOURCES: dict[str, list[str]] = {
    "loan_type_emergency": ["loanType"],
    "loan_amount": ["loanAmount"],
    "term_months": ["termMonths"],
    "monthly_rate": ["monthlyRate"],
    "monthly_salary": ["monthlySalary"],
    "monthly_installment": ["loanAmount", "termMonths", "monthlyRate"],
    "deduction_ratio": ["loanAmount", "termMonths", "monthlyRate", "netTakeHomePay"],
    "net_pay_after_loan": ["loanAmount", "termMonths", "monthlyRate", "netTakeHomePay"],
    "net_to_salary": ["netTakeHomePay", "monthlySalary"],
    "loan_to_salary": ["loanAmount", "monthlySalary"],
    "existing_balance_to_salary": ["longTermBalance", "shortTermBalance", "monthlySalary"],
    "years_as_member": ["yearsAsMember"],
    "prior_loans": ["priorLoans"],
    "late_payment_rate": ["priorLoans", "priorLatePayments"],
    "age": ["age"],
    "employment_not_permanent": ["employmentStatus"],
    "documents_flagged": ["documentsFlagged"],
}
ALL_FEATURES = list(FEATURE_SOURCES)

# Plain-language names shown to loan officers.
FEATURE_LABELS = {
    "loan_type_emergency": "Emergency loan",
    "loan_amount": "Loan amount",
    "term_months": "Loan term",
    "monthly_rate": "Interest rate per month",
    "monthly_salary": "Monthly salary",
    "monthly_installment": "Monthly installment",
    "deduction_ratio": "Share of net pay taken by this loan",
    "net_pay_after_loan": "Net pay left after this loan",
    "net_to_salary": "Net take-home pay vs salary",
    "loan_to_salary": "Loan amount vs salary",
    "existing_balance_to_salary": "Existing UEDI balances vs salary",
    "years_as_member": "Years as member",
    "prior_loans": "Past loans",
    "late_payment_rate": "Late payment rate",
    "age": "Age",
    "employment_not_permanent": "Not a permanent employee",
    "documents_flagged": "Flagged documents",
}


def monthly_installment(amount, term, monthly_rate):
    """Add-on interest: the rate is charged on the full amount for every month of the term.

    This is how the form reads ("at the rate of __% per month"). If UEDI computes interest
    on the diminishing balance instead, change this one function and retrain.
    """
    term = np.maximum(np.asarray(term, dtype=float), 1)
    return np.asarray(amount, dtype=float) * (1 + np.asarray(monthly_rate, dtype=float) / 100 * term) / term


def features_for_columns(columns) -> list[str]:
    """The features a dataset with these columns can support."""
    have = set(columns)
    return [f for f, needs in FEATURE_SOURCES.items() if all(n in have for n in needs)]


def fill_optional(raw: pd.DataFrame) -> pd.DataFrame:
    raw = raw.copy()
    for name, default in OPTIONAL_FIELDS.items():
        if name not in raw.columns:
            raw[name] = default
        else:
            raw[name] = raw[name].fillna(default)
    return raw


def build_features(raw: pd.DataFrame, features: list[str] | None = None) -> pd.DataFrame:
    missing = [c for c in REQUIRED_FIELDS if c not in raw.columns]
    if missing:
        raise ValueError(f"Missing fields: {', '.join(missing)}")
    raw = fill_optional(raw)

    salary = raw["monthlySalary"].astype(float).clip(lower=1)
    net = raw["netTakeHomePay"].astype(float)
    amount = raw["loanAmount"].astype(float)
    term = raw["termMonths"].astype(float).clip(lower=1)
    rate = raw["monthlyRate"].astype(float)
    installment = monthly_installment(amount, term, rate)
    prior = raw["priorLoans"].astype(float)
    status = raw["employmentStatus"].astype(str).str.strip().str.lower()

    out = pd.DataFrame(
        {
            "loan_type_emergency": (raw["loanType"].astype(str) == "emergency").astype(float),
            "loan_amount": amount,
            "term_months": term,
            "monthly_rate": rate,
            "monthly_salary": salary,
            "monthly_installment": installment,
            "deduction_ratio": installment / net.clip(lower=1),
            "net_pay_after_loan": net - installment,
            "net_to_salary": net / salary,
            "loan_to_salary": amount / salary,
            "existing_balance_to_salary": (
                raw["longTermBalance"].astype(float) + raw["shortTermBalance"].astype(float)
            )
            / salary,
            "years_as_member": raw["yearsAsMember"].astype(float),
            "prior_loans": prior,
            "late_payment_rate": np.where(
                prior > 0, raw["priorLatePayments"].astype(float) / prior.clip(lower=1), 0.0
            ),
            "age": raw["age"].astype(float),
            "employment_not_permanent": (status != "permanent").astype(float),
            "documents_flagged": raw["documentsFlagged"].astype(float),
        },
        index=raw.index,
    )
    return out[features or ALL_FEATURES]
