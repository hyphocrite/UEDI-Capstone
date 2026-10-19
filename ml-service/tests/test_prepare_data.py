import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import prepare_data  # noqa: E402

HERE = Path(__file__).resolve().parents[1]


def messy_export() -> pd.DataFrame:
    """Looks like a bookkeeper's spreadsheet: peso signs, mixed labels, one bad row."""
    return pd.DataFrame(
        {
            "Member ID": ["M1", "M2", "M1", "M3", "M1", "M2"],
            "Name": ["Santos, Ana", "Cruz, Ben", "Santos, Ana", "Reyes, Cora", "Santos, Ana", "Cruz, Ben"],
            "Date Applied": ["2022-01-10", "2022-02-01", "2023-01-15", "2023-03-01", "2024-02-01", "2024-05-05"],
            "Type of Loan": ["Long Term", "Emergency", "LT", "short term", "Long Term", "Emergency"],
            "Amount": ["₱60,000.00", "P 10,000", "45000", "8,000", "80,000", "abc"],
            "Term (months)": [24, 6, 24, 6, 36, 6],
            "Rate per Month": ["1%", "1.5%", "1", "1.5", "1", "1.5"],
            "Monthly Salary": ["32,000", "18,000", "33,500", "21,000", "35,000", "18,500"],
            "Net Take Home Pay": ["21,500", "7,200", "22,000", "9,000", "23,000", "7,000"],
            "Date of Membership": ["2015-06-01", "2020-01-01", "2015-06-01", "2021-08-01", "2015-06-01", "2020-01-01"],
            "LT Balance": ["0", "12,000", "30,000", "0", "15,000", "8,000"],
            "ST Balance": [0, 0, 0, 2000, 0, 3000],
            "Birthday": ["1981-03-02", "1994-07-20", "1981-03-02", "1990-01-01", "1981-03-02", "1994-07-20"],
            "Employment Status": ["Permanent", "JO", "Permanent", "COS", "Permanent", "JO"],
            "Status": ["Fully Paid", "Delinquent", "Paid", "Restructured", "Current", "Written Off"],
        }
    )


def test_prepares_a_messy_export(tmp_path):
    cfg = json.loads((HERE / "column_map.example.json").read_text())
    out = prepare_data.prepare(messy_export(), cfg)
    assert "memberId" not in out.columns and "Name" not in out.columns
    assert list(out["loanType"][:4]) == ["long_term", "emergency", "long_term", "emergency"]
    assert out["loanAmount"][0] == 60000 and out["loanAmount"][1] == 10000
    assert list(out["defaulted"]) == [0, 1, 0, 0, 0, 1]
    # Ana's third loan sees two earlier loans, none bad; Ben's second sees one bad loan.
    assert out["priorLoans"].tolist() == [0, 0, 1, 0, 2, 1]
    assert out["priorLatePayments"].tolist() == [0, 0, 0, 0, 0, 1]
    assert out["yearsAsMember"][0] == 6.6
    assert out["employmentStatus"][1] == "job_order"
    assert out["age"][0] == 41 and out["longTermBalance"][1] == 12000


def test_cli_writes_checked_csv(tmp_path):
    src = tmp_path / "records.xlsx"
    messy_export().to_excel(src, sheet_name="Loans", index=False)
    cfg = tmp_path / "map.json"
    cfg.write_text((HERE / "column_map.example.json").read_text())
    out = tmp_path / "loans.csv"
    prepare_data.main([str(src), "--map", str(cfg), "--out", str(out)])
    df = pd.read_csv(out)
    assert len(df) == 5  # the "abc" amount row is skipped
    assert df["defaulted"].sum() == 1


def test_features_follow_the_columns_present():
    from uedi_ml.features import features_for_columns

    form_only = ["loanType", "loanAmount", "termMonths", "monthlyRate", "monthlySalary", "netTakeHomePay"]
    feats = features_for_columns(form_only)
    assert "deduction_ratio" in feats and "age" not in feats and "late_payment_rate" not in feats
    assert "late_payment_rate" in features_for_columns(form_only + ["priorLoans", "priorLatePayments"])
