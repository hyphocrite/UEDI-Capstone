"""Creates a SAMPLE history of past Mutual Assistance loans so the models can be trained and demoed.

These rows are synthetic, shaped like UEDI's form (DNSC employees, payroll-deducted
long-term and emergency loans). Train on UEDI's real history before presenting any
accuracy numbers: see README.md, "Training on UEDI's real loans".

    python generate_sample_data.py --rows 3000
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from uedi_ml.features import monthly_installment


def generate(rows: int, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    status = rng.choice(["permanent", "temporary", "contractual", "job_order"], size=rows, p=[0.68, 0.07, 0.1, 0.15])
    # Government salary grades run from about 13k to 90k a month; job orders sit at the bottom.
    salary = np.round(rng.lognormal(mean=np.log(30000), sigma=0.42, size=rows), -2).clip(12000, 95000)
    salary = np.where(status == "job_order", np.round(salary * 0.55, -2).clip(10000, 30000), salary)
    # Net take-home pay after GSIS, PhilHealth, Pag-IBIG, tax and other deductions.
    net_share = rng.beta(6, 3, size=rows).clip(0.2, 0.95)
    net = np.round(salary * net_share, -1)

    loan_type = rng.choice(["long_term", "emergency"], size=rows, p=[0.62, 0.38])
    long_term = loan_type == "long_term"
    rate = np.where(long_term, 1.0, 1.5)
    term = np.where(
        long_term,
        rng.choice([12, 18, 24, 36], size=rows, p=[0.3, 0.2, 0.35, 0.15]),
        rng.choice([3, 6, 12], size=rows, p=[0.3, 0.5, 0.2]),
    )
    # Members mostly ask for what their net pay can carry; some stretch it.
    share_of_net = rng.beta(2.2, 5, size=rows)
    amount = np.round(net * share_of_net * term / (1 + rate / 100 * term), -3)
    amount = np.where(long_term, amount.clip(10000, 300000), amount.clip(3000, 50000))

    years = rng.integers(0, 30, size=rows)
    prior = np.minimum(rng.poisson(years / 2.5), 20)
    late = np.round(prior * rng.beta(1, 10, size=rows)).astype(int)
    long_bal = np.where(rng.random(rows) < 0.45, np.round(salary * rng.uniform(0.5, 4, size=rows), -2), 0)
    short_bal = np.where(rng.random(rows) < 0.3, np.round(salary * rng.uniform(0.1, 0.8, size=rows), -2), 0)
    age = rng.integers(22, 65, size=rows)
    flagged = rng.poisson(0.2, size=rows).clip(0, 3)

    installment = monthly_installment(amount, term, rate)
    deduction_ratio = installment / net
    left = net - installment

    # How the synthetic "truth" is made: loans that eat most of net pay, leave little
    # take-home pay, or go to non-permanent staff on long terms go bad more often.
    logit = (
        -3.2
        + 3.5 * np.clip(deduction_ratio - 0.3, -0.3, 1.2)
        + 1.4 * (left < 5000)
        + 3.0 * np.where(prior > 0, late / np.maximum(prior, 1), 0.1)
        + 0.9 * (status == "job_order")
        + 0.5 * np.isin(status, ["temporary", "contractual"])
        + 0.6 * ((status != "permanent") & (term > 12))
        + 0.5 * np.clip((long_bal + short_bal) / salary - 1.5, 0, 3)
        + 0.8 * np.clip(0.55 - net / salary, 0, 1) * 3
        + 0.35 * flagged
        - 0.04 * years
        + 0.03 * np.clip(age - 58, 0, 10) * 3
        + rng.normal(0, 0.3, size=rows)
    )
    defaulted = (rng.random(rows) < 1 / (1 + np.exp(-logit))).astype(int)

    return pd.DataFrame(
        {
            "loanType": loan_type,
            "loanAmount": amount,
            "termMonths": term,
            "monthlyRate": rate,
            "monthlySalary": salary,
            "netTakeHomePay": net,
            "longTermBalance": long_bal,
            "shortTermBalance": short_bal,
            "yearsAsMember": years,
            "priorLoans": prior,
            "priorLatePayments": late,
            "age": age,
            "employmentStatus": status,
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
