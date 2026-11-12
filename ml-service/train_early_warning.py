"""Trains the early-warning model (uedi_ml/early_warning.py) and saves it next to the
application model.

    python train_early_warning.py                       # SAMPLE snapshots, for demos
    python train_early_warning.py --data snapshots.csv  # real ones from server/scripts/export-early-warning.js

Real snapshots need the same columns as the sample, plus missed_next_60d (1 if the loan missed
a payment within 60 days of the snapshot).
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd

from uedi_ml.early_warning import FEATURE_NAMES, EarlyWarningModel, generate_sample

OUT = Path(os.getenv("MODEL_PATH", Path(__file__).parent / "models" / "model.joblib")).parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", help="CSV of real loan snapshots")
    ap.add_argument("--rows", type=int, default=4000, help="sample rows when no --data")
    args = ap.parse_args()

    if args.data:
        data = pd.read_csv(args.data)
        missing = [c for c in [*FEATURE_NAMES, "missed_next_60d"] if c not in data.columns]
        if missing:
            raise SystemExit(f"{args.data} is missing columns: {', '.join(missing)}")
        if data["missed_next_60d"].nunique() < 2 or data["missed_next_60d"].sum() < 10:
            raise SystemExit("Need at least 10 snapshots that went on to miss a payment, and some that didn't.")
        source = f"real ({Path(args.data).name})"
    else:
        data = generate_sample(args.rows)
        source = "sample"

    model = EarlyWarningModel.train(data, source)
    model.metrics["version"] = datetime.now(timezone.utc).strftime("ew-%Y%m%d-%H%M%S")
    model.metrics["trainedAt"] = datetime.now(timezone.utc).isoformat()
    OUT.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, OUT / "early_warning.joblib")
    (OUT / "early_warning_metrics.json").write_text(json.dumps(model.metrics, indent=2))
    m = model.metrics
    print(f"Early warning trained on {m['rows']} {source} snapshots ({m['positiveRate']:.1%} went on to miss a payment).")
    print(f"  XGBoost  AUC {m['xgboost']['aucRoc']:.3f}  avg precision {m['xgboost']['averagePrecision']:.3f}  "
          f"high list: precision {m['xgboost']['precision']:.2f}, recall {m['xgboost']['recall']:.2f}")
    print(f"  Logistic AUC {m['logisticBaseline']['aucRoc']:.3f}  (baseline)")


if __name__ == "__main__":
    main()
