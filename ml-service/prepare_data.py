"""Turns UEDI's own loan records (Excel or CSV, any column names) into the training CSV.

    python prepare_data.py records.xlsx --map column_map.json
    python prepare_data.py records.csv  --map column_map.json --out data/uedi_loans.csv

column_map.json says which of UEDI's columns is which form field, how to read the loan
type, and how to tell a defaulted loan. Copy column_map.example.json and edit it.

What it does:
  1. Renames columns, converts "₱12,500.00", "1.5%", "2 yrs" and dates into numbers.
  2. Derives fields UEDI may not store directly: termMonths from years, yearsAsMember and
     age from dates, and priorLoans / priorLatePayments from each member's earlier loans.
  3. Labels `defaulted` with the rule in the map.
  4. Drops names, member IDs and every column the model doesn't use, then runs the same
     checks as train.py and writes the result. The output has no personal details.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from uedi_ml.dataset import LABEL, check_training_data
from uedi_ml.features import RAW_FIELDS

HERE = Path(__file__).parent
KEEP = RAW_FIELDS + [LABEL, "applicationDate"]
# Fields that help derive others but are never written out.
HELPERS = {"memberId", "memberSince", "birthDate", "outcome", "daysPastDue", "termYears", "endedLate"}


def to_number(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return series.astype(float)
    cleaned = series.astype(str).str.replace(r"(?i)php|₱|pesos?|%|yrs?|years?|mos?|months?", "", regex=True)
    cleaned = cleaned.str.replace(r"^\s*P(?=\s*[\d.])", "", regex=True).str.replace(r"[,\s]", "", regex=True)
    return pd.to_numeric(cleaned, errors="coerce")


def normalize(text) -> str:
    return re.sub(r"\s+", " ", str(text)).strip().lower()


def map_values(series: pd.Series, mapping: dict[str, str]) -> pd.Series:
    lookup = {normalize(k): v for k, v in mapping.items()}
    return series.map(lambda v: lookup.get(normalize(v), normalize(v).replace(" ", "_")))


def years_between(start: pd.Series, end: pd.Series) -> pd.Series:
    return ((pd.to_datetime(end, errors="coerce") - pd.to_datetime(start, errors="coerce")).dt.days / 365.25).round(1)


def label_defaults(df: pd.DataFrame, rule: dict) -> pd.Series:
    source = rule.get("from", LABEL)
    if source not in df.columns:
        raise SystemExit(f'The "defaulted" rule reads "{source}", but no column is mapped to it.')
    col = df[source]
    if "badValues" in rule:
        bad = {normalize(v) for v in rule["badValues"]}
        good = {normalize(v) for v in rule.get("goodValues", [])}
        labels = col.map(lambda v: 1 if normalize(v) in bad else (0 if not good or normalize(v) in good else np.nan))
        unknown = sorted({str(v) for v, lab in zip(col, labels) if pd.isna(lab)})
        if unknown:
            print(f"Note: rows with these {source} values are not in badValues or goodValues and are skipped: {', '.join(unknown[:10])}")
        return labels
    if "atLeast" in rule:
        n = to_number(col)
        return np.where(n.isna(), np.nan, (n >= float(rule["atLeast"])).astype(float))
    return to_number(col)


def prior_history(df: pd.DataFrame) -> pd.DataFrame:
    """Counts each member's earlier loans, and how many of those went bad or ended late."""
    order = pd.to_datetime(df["applicationDate"], errors="coerce")
    df = df.assign(_order=order).sort_values(["memberId", "_order"])
    bad = df["endedLate"] if "endedLate" in df.columns else df[LABEL]
    df["_bad"] = to_number(bad).fillna(0).clip(0, 1)
    grouped = df.groupby("memberId", sort=False)
    if "priorLoans" not in df.columns:
        df["priorLoans"] = grouped.cumcount()
    if "priorLatePayments" not in df.columns:
        df["priorLatePayments"] = grouped["_bad"].cumsum() - df["_bad"]
    return df.drop(columns=["_order", "_bad"]).sort_index()


def prepare(raw: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    columns: dict[str, str] = cfg.get("columns", {})
    absent = [c for c in columns if c not in raw.columns]
    if absent:
        raise SystemExit(f"These columns in the map are not in the file: {', '.join(absent)}\nFile has: {', '.join(map(str, raw.columns))}")
    df = raw[list(columns)].rename(columns=columns)

    for field, mapping in cfg.get("values", {}).items():
        if field in df.columns:
            df[field] = map_values(df[field], mapping)

    numeric = [c for c in df.columns if c not in {"loanType", "employmentStatus", "memberId", "applicationDate",
                                                  "memberSince", "birthDate", "outcome"}]
    for c in numeric:
        df[c] = to_number(df[c])

    if "termYears" in df.columns and "termMonths" not in df.columns:
        df["termMonths"] = (df["termYears"] * 12).round()
    elif cfg.get("termUnit") == "years" and "termMonths" in df.columns:
        df["termMonths"] = (df["termMonths"] * 12).round()
    if cfg.get("rateUnit") == "yearly" and "monthlyRate" in df.columns:
        df["monthlyRate"] = df["monthlyRate"] / 12
    if cfg.get("salaryUnit") == "semi-monthly":
        for c in ("monthlySalary", "netTakeHomePay"):
            if c in df.columns:
                df[c] = df[c] * 2

    if "applicationDate" in df.columns:
        df["applicationDate"] = pd.to_datetime(df["applicationDate"], errors="coerce").dt.strftime("%Y-%m-%d")
        if "memberSince" in df.columns and "yearsAsMember" not in df.columns:
            df["yearsAsMember"] = years_between(df["memberSince"], df["applicationDate"]).clip(lower=0)
        if "birthDate" in df.columns and "age" not in df.columns:
            df["age"] = years_between(df["birthDate"], df["applicationDate"]).round()

    df[LABEL] = label_defaults(df, cfg.get("defaulted", {"from": LABEL}))

    if "memberId" in df.columns and "applicationDate" in df.columns:
        df = prior_history(df)

    return df[[c for c in KEEP if c in df.columns]]


def read_any(path: Path, sheet: str | None) -> pd.DataFrame:
    if path.suffix.lower() in {".xlsx", ".xlsm", ".xls"}:
        return pd.read_excel(path, sheet_name=sheet or 0)
    return pd.read_csv(path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("records", type=Path, help="UEDI's loan records, .xlsx or .csv")
    parser.add_argument("--map", type=Path, default=HERE / "column_map.json")
    parser.add_argument("--out", type=Path, default=HERE / "data" / "uedi_loans.csv")
    args = parser.parse_args(argv)

    cfg = json.loads(args.map.read_text(encoding="utf-8"))
    raw = read_any(args.records, cfg.get("sheet"))
    print(f"Read {len(raw)} rows from {args.records.name}.")
    prepared = prepare(raw, cfg)
    try:
        checked = check_training_data(prepared)
    except ValueError as e:
        sys.exit(str(e))

    for line in checked.dropped[:30]:
        print(f"  skipped {line}")
    if len(checked.dropped) > 30:
        print(f"  ... and {len(checked.dropped) - 30} more")
    for w in checked.warnings:
        print(f"Warning: {w}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    checked.df.to_csv(args.out, index=False)
    y = checked.df[LABEL]
    print(f"Wrote {len(checked.df)} loans to {args.out} ({int(y.sum())} defaulted, {y.mean():.1%}).")
    print(f"Columns: {', '.join(checked.df.columns)}")
    print(f"Next: python train.py --data {args.out}")


if __name__ == "__main__":
    main()
