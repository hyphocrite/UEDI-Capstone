"""Loads and checks a training CSV before any model sees it.

Every problem is reported with the CSV row number, so whoever exported the data can fix
it at the source instead of guessing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from .features import EMPLOYMENT_STATUSES, LOAN_TYPES, OPTIONAL_FIELDS, REQUIRED_FIELDS, features_for_columns

# The regression target: the Repayment Performance Score, 0 to 100 (decimals allowed). The
# share of a loan's scheduled amortization amount that was paid in full by each due date.
TARGET = "repaymentScore"
# Optional, kept for reference and for prepare_data.py's prior-history counts. Not trained on.
LABEL = "defaulted"
# A past loan scoring below this counts as poor repayment when picking cut-offs and for the
# Type I / Type II error counts.
POOR_REPAYMENT = 60.0
NUMERIC = [
    "loanAmount",
    "termMonths",
    "monthlyRate",
    "monthlySalary",
    "netTakeHomePay",
    "longTermBalance",
    "shortTermBalance",
    "yearsAsMember",
    "priorLoans",
    "priorLatePayments",
    "age",
    "documentsFlagged",
]


@dataclass
class CheckedData:
    df: pd.DataFrame
    features: list[str]
    dropped: list[str] = field(default_factory=list)  # "row 12: reason"
    warnings: list[str] = field(default_factory=list)


def _row(i: int) -> str:
    return f"row {i + 2}"  # +1 for the header, +1 because people count from 1


def check_training_data(df: pd.DataFrame) -> CheckedData:
    """Drops rows that can't be used, and says why. Raises if the file can't be used at all."""
    missing = [c for c in REQUIRED_FIELDS + [TARGET] if c not in df.columns]
    if missing:
        raise ValueError(
            f"Missing required columns: {', '.join(missing)}. "
            f"Expected at least: {', '.join(REQUIRED_FIELDS + [TARGET])} "
            f"({TARGET} is the Repayment Performance Score, 0 to 100)."
        )

    df = df.copy()
    for c in NUMERIC:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df["loanType"] = df["loanType"].astype(str).str.strip().str.lower()
    if "employmentStatus" in df.columns:
        df["employmentStatus"] = df["employmentStatus"].astype(str).str.strip().str.lower()
    df[TARGET] = pd.to_numeric(df[TARGET], errors="coerce")

    reasons: dict[int, str] = {}

    def drop(mask: pd.Series, reason: str):
        for i in df.index[mask.fillna(True)]:
            reasons.setdefault(i, reason)

    for c in REQUIRED_FIELDS:
        if c != "loanType":
            drop(df[c].isna(), f"{c} is blank or not a number")
    drop(~df["loanType"].isin(LOAN_TYPES), f"loanType must be one of {', '.join(LOAN_TYPES)}")
    drop(df[TARGET].isna() | (df[TARGET] < 0) | (df[TARGET] > 100), f"{TARGET} must be a number from 0 to 100")
    drop(df["loanAmount"] <= 0, "loanAmount must be more than 0")
    drop((df["termMonths"] < 1) | (df["termMonths"] > 120), "termMonths must be 1 to 120")
    drop((df["monthlyRate"] < 0) | (df["monthlyRate"] > 10), "monthlyRate is % per month and must be 0 to 10")
    drop(df["monthlySalary"] <= 0, "monthlySalary must be more than 0")
    drop(df["netTakeHomePay"] <= 0, "netTakeHomePay must be more than 0")
    drop(df["netTakeHomePay"] > df["monthlySalary"] * 1.05, "netTakeHomePay is more than monthlySalary")
    if {"priorLoans", "priorLatePayments"} <= set(df.columns):
        drop(df["priorLatePayments"] > df["priorLoans"], "priorLatePayments is more than priorLoans")
    if "employmentStatus" in df.columns:
        drop(
            ~df["employmentStatus"].isin(EMPLOYMENT_STATUSES + ["nan", ""]),
            f"employmentStatus must be one of {', '.join(EMPLOYMENT_STATUSES)}",
        )
        df.loc[df["employmentStatus"].isin(["nan", ""]), "employmentStatus"] = None

    dropped = [f"{_row(i)}: {r}" for i, r in sorted(reasons.items())]
    df = df.drop(index=list(reasons)).reset_index(drop=True)
    df[TARGET] = df[TARGET].astype(float)

    warnings: list[str] = []
    poor = int((df[TARGET] < POOR_REPAYMENT).sum())
    if len(df) < 200:
        warnings.append(f"Only {len(df)} usable loans. Results will swing a lot; 500+ is better.")
    if poor < 30:
        warnings.append(
            f"Only {poor} loans scored below {POOR_REPAYMENT:g}. The models learn the low end of the score "
            "from these, so treat every number as rough until there are 50+."
        )
    if df[TARGET].std() < 1:
        warnings.append(f"{TARGET} barely varies, so there is little for a regression model to learn.")
    for c in OPTIONAL_FIELDS:
        if c in df.columns and df[c].isna().mean() > 0.3:
            warnings.append(f"{c} is blank in {df[c].isna().mean():.0%} of rows; blanks count as {OPTIONAL_FIELDS[c]!r}.")

    return CheckedData(df=df, features=features_for_columns(df.columns), dropped=dropped, warnings=warnings)


def load_training_csv(path: Path) -> CheckedData:
    return check_training_data(pd.read_csv(path))
