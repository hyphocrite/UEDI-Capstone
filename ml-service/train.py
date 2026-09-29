"""Train the stacked loan-risk model on past loans and record honest cross-validated metrics.

    python train.py                          # uses data/sample_loans.csv
    python train.py --data path/to/uedi_loans.csv

The CSV needs the columns in uedi_ml.features.RAW_FIELDS plus `defaulted` (1 or 0).
Writes models/model.joblib and models/metrics.json.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict

from uedi_ml.features import RAW_FIELDS, build_features
from uedi_ml.model import BASE_MODELS, LoanRiskModel, Thresholds, make_base_models, make_stack

HERE = Path(__file__).parent


def scores(y: np.ndarray, p: np.ndarray, threshold: float = 0.5) -> dict:
    pred = (p >= threshold).astype(int)
    return {
        "aucRoc": round(float(roc_auc_score(y, p)), 4),
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y, pred, zero_division=0)), 4),
    }


def train(data_path: Path, out_dir: Path) -> dict:
    df = pd.read_csv(data_path)
    missing = [c for c in RAW_FIELDS + ["defaulted"] if c not in df.columns]
    if missing:
        raise SystemExit(f"{data_path} is missing columns: {', '.join(missing)}")

    X = build_features(df)
    y = df["defaulted"].astype(int).to_numpy()
    pos_weight = float((y == 0).sum() / max((y == 1).sum(), 1))
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=7)

    metrics: dict = {"models": {}}
    for key, est in make_base_models(pos_weight):
        p = cross_val_predict(clone(est), X, y, cv=cv, method="predict_proba")[:, 1]
        metrics["models"][key] = {"name": BASE_MODELS[key], **scores(y, p)}
        print(f"{BASE_MODELS[key]:<22} AUC {metrics['models'][key]['aucRoc']:.3f}  recall {metrics['models'][key]['recall']:.3f}")

    p = cross_val_predict(make_stack(pos_weight), X, y, cv=cv, method="predict_proba")[:, 1]
    metrics["models"]["ensemble"] = {"name": "Stacked ensemble", **scores(y, p)}
    print(f"{'Stacked ensemble':<22} AUC {metrics['models']['ensemble']['aucRoc']:.3f}  recall {metrics['models']['ensemble']['recall']:.3f}")

    stack = make_stack(pos_weight).fit(X, y)
    trained_at = datetime.now(timezone.utc)
    metrics.update(
        {
            "version": trained_at.strftime("%Y%m%d-%H%M%S"),
            "trainedAt": trained_at.isoformat(),
            "rows": int(len(df)),
            "defaultRate": round(float(y.mean()), 4),
            "dataFile": data_path.name,
            "sampleData": data_path.name == "sample_loans.csv",
            "validation": "5-fold stratified cross-validation",
        }
    )

    model = LoanRiskModel(stack=stack, thresholds=Thresholds(), metrics=metrics)
    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, out_dir / "model.joblib")
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(f"Saved model {metrics['version']} to {out_dir}")
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(HERE / "data" / "sample_loans.csv"))
    parser.add_argument("--out", default=str(HERE / "models"))
    args = parser.parse_args()
    train(Path(args.data), Path(args.out))
