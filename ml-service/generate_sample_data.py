"""Creates a SAMPLE history of past loans so the models can be trained and demoed.

These rows are synthetic. Replace data/sample_loans.csv with UEDI's real, anonymized
loan history (same columns, plus `defaulted` = 1 if the loan went bad) before
presenting any accuracy numbers as real.

    python generate_sample_data.py --rows 3000
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


def generate(rows: int, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    employment = rng.choice(["wage", "self", "informal", "other"], size=rows, p=[0.55, 0.2, 0.18, 0.07])
    income = np.round(rng.lognormal(mean=np.log(22000), sigma=0.45, size=rows), -2).clip(6000, 150000)
    product = rng.choice(["regular", "emergency", "salary", "plan-backed"], size=rows, p=[0.45, 0.2, 0.25, 0.1])
    rate = np.select([product == "regular", product == "emergency", product == "salary"], [12, 10, 14], 8).astype(float)
    max_term = np.select([product == "regular", product == "emergency", product == "salary"], [36, 12, 24], 60)
    term = np.array([rng.choice([t for t in (6, 12, 18, 24, 36, 48, 60) if t <= m]) for m in max_term])
    # Borrowers mostly ask for what they can afford; some over-borrow.
    payment_share = rng.beta(2.2, 6, size=rows)
    amount = np.round(income * payment_share * term / (1 + rate / 100 * term / 12), -3).clip(5000, 500000)
    existing_debt = np.round(income * rng.beta(1.5, 6, size=rows), -2)
    years = rng.integers(0, 25, size=rows)
    prior = np.minimum(rng.poisson(years / 3), 15)
    late_rate = rng.beta(1, 8, size=rows)
    late = np.round(prior * late_rate).astype(int)
    co_maker = rng.random(rows) < 0.55
    plan = rng.random(rows) < 0.35
    flagged = rng.poisson(0.3, size=rows).clip(0, 4)
    age = rng.integers(21, 66, size=rows)

    payment = amount * (1 + rate / 100 * term / 12) / term
    dti = (payment + existing_debt) / income

    # How the synthetic "truth" is made: higher DTI, late history, informal work and
    # flagged documents raise default risk; tenure, co-makers and plans lower it.
    logit = (
        -2.5
        + 4.2 * np.clip(dti - 0.35, -0.3, 1.2)
        + 3.0 * np.where(prior > 0, late / np.maximum(prior, 1), 0.15)
        + 0.6 * (employment == "informal")
        + 0.3 * (employment == "self")
        + 0.45 * flagged
        - 0.05 * years
        - 0.45 * co_maker
        - 0.5 * plan
        + 0.02 * np.abs(age - 40)
        + 1.0 * ((employment == "informal") & (dti > 0.45))
        + 0.8 * ((years < 2) & (co_maker == 0))
        + rng.normal(0, 0.3, size=rows)
    )
    defaulted = (rng.random(rows) < 1 / (1 + np.exp(-logit))).astype(int)

    return pd.DataFrame(
        {
            "age": age,
            "employmentType": employment,
            "monthlyIncome": income,
            "existingMonthlyDebt": existing_debt,
            "loanProduct": product,
            "loanAmount": amount,
            "termMonths": term,
            "annualRate": rate,
            "yearsAsMember": years,
            "priorLoans": prior,
            "priorLatePayments": late,
            "hasCoMaker": co_maker.astype(int),
            "hasRetirementPlan": plan.astype(int),
            "documentsFlagged": flagged,
            "defaulted": defaulted,
        }
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=3000)
    parser.add_argument("--out", default=str(Path(__file__).parent / "data" / "sample_loans.csv"))
    args = parser.parse_args()
    df = generate(args.rows)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)
    print(f"Wrote {len(df)} rows to {args.out} ({df['defaulted'].mean():.1%} defaulted)")
