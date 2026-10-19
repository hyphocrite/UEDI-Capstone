"""Train the stacked loan-risk model on past loans and record honest metrics.

    python train.py                                   # sample data (synthetic)
    python train.py --data data/uedi_loans.csv        # UEDI's real loans (see prepare_data.py)
    python train.py --data data/uedi_loans.csv --holdout-from 2025-01-01
    python train.py --data data/uedi_loans.csv --approve 0.04 --deny 0.30

The CSV needs the columns in uedi_ml.features.REQUIRED_FIELDS plus `defaulted` (1 or 0).
Optional columns (balances, tenure, past loans, age, employment status) are used when present.
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

from uedi_ml.dataset import LABEL, load_training_csv
from uedi_ml.features import ALL_FEATURES, build_features
from uedi_ml.model import BASE_MODELS, LoanRiskModel, Thresholds, fit_calibrator, make_base_models, make_stack, to_logit

HERE = Path(__file__).parent


def scores(y: np.ndarray, p: np.ndarray, threshold: float = 0.5) -> dict:
    pred = (p >= threshold).astype(int)
    return {
        "aucRoc": round(float(roc_auc_score(y, p)), 4) if len(set(y)) > 1 else None,
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y, pred, zero_division=0)), 4),
    }


GRID = [round(t, 2) for t in np.arange(0.01, 0.81, 0.01)]


def cutoff_stats(y: np.ndarray, p: np.ndarray, t: float) -> dict:
    below = p < t
    total_defaults = max(int(y.sum()), 1)
    above = int((~below).sum())
    return {
        "threshold": t,
        # Share of loans the line would have suggested approving.
        "shareBelow": round(float(below.mean()), 4),
        # Share of all defaults that would have been suggested "approve" (the costly mistake).
        "defaultsBelow": round(float(y[below].sum() / total_defaults), 4),
        # Of the loans at or above the line, the share that actually defaulted.
        "defaultRateAtOrAbove": round(float(y[~below].sum() / above), 4) if above else None,
        "countAtOrAbove": above,
    }


def pick_thresholds(y: np.ndarray, p: np.ndarray, max_missed: float) -> Thresholds:
    """Approve line: as high as possible while letting through at most `max_missed` of past
    defaults. Deny line: the lowest score where at least half of past loans went bad."""
    stats = [cutoff_stats(y, p, t) for t in GRID]
    ok = [s["threshold"] for s in stats if s["defaultsBelow"] <= max_missed]
    approve = max(ok) if ok else GRID[0]
    deny_ok = [
        s["threshold"]
        for s in stats
        if s["threshold"] > approve and s["countAtOrAbove"] >= 5 and (s["defaultRateAtOrAbove"] or 0) >= 0.5
    ]
    deny = min(deny_ok) if deny_ok else max(0.5, round(approve + 0.05, 2))
    return Thresholds(approve, deny)


def threshold_table(y: np.ndarray, p: np.ndarray, thresholds: Thresholds) -> list[dict]:
    points = sorted({0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, thresholds.approve, thresholds.deny})
    return [cutoff_stats(y, p, t) for t in points]


def print_threshold_table(table: list[dict], thresholds: Thresholds):
    print("\nWhat each cut-off would have done to past loans (out-of-fold estimates):")
    print("  cut-off  suggested approve  of all defaults approved  default rate at/above")
    for r in table:
        mark = "  <- approve line" if r["threshold"] == thresholds.approve else "  <- deny line" if r["threshold"] == thresholds.deny else ""
        rate = f"{r['defaultRateAtOrAbove']:.0%}" if r["defaultRateAtOrAbove"] is not None else "-"
        print(f"  {r['threshold']:>7.0%}  {r['shareBelow']:>17.0%}  {r['defaultsBelow']:>24.0%}  {rate:>21}{mark}")


def train(
    data_path: Path,
    out_dir: Path,
    thresholds: Thresholds | None = None,
    holdout_from: str | None = None,
    folds: int = 5,
    max_missed: float = 0.15,
) -> dict:
    checked = load_training_csv(data_path)
    df, features = checked.df, checked.features

    print(f"{len(df)} usable loans, {int(df[LABEL].sum())} defaulted ({df[LABEL].mean():.1%}).")
    if checked.dropped:
        print(f"Skipped {len(checked.dropped)} rows:")
        for line in checked.dropped[:20]:
            print(f"  {line}")
        if len(checked.dropped) > 20:
            print(f"  ... and {len(checked.dropped) - 20} more")
    for w in checked.warnings:
        print(f"Warning: {w}")
    skipped = [f for f in ALL_FEATURES if f not in features]
    print(f"Using {len(features)} features." + (f" Not in this data: {', '.join(skipped)}." if skipped else ""))

    defaults = int(df[LABEL].sum())
    if defaults < 3 or defaults > len(df) - 3:
        raise SystemExit("Need at least 3 defaulted and 3 repaid loans to train.")
    folds = min(folds, defaults, len(df) - defaults)
    if folds < 5:
        print(f"Warning: only {defaults} defaults, so using {folds}-fold cross-validation instead of 5.")

    metrics: dict = {"models": {}}

    X = build_features(df, features)
    y = df[LABEL].to_numpy()
    pos_weight = float((y == 0).sum() / max((y == 1).sum(), 1))
    cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=7)

    p_ens = cross_val_predict(make_stack(pos_weight, folds), X, y, cv=cv, method="predict_proba")[:, 1]
    if thresholds is None:
        thresholds = pick_thresholds(y, p_ens, max_missed)
        print(f"Picked cut-offs from past loans: approve below {thresholds.approve:.0%}, deny from {thresholds.deny:.0%}.")

    # "Recall" is the share of past defaults the model would NOT have suggested approving
    # (it sent them to review or deny). Precision is the share of those flags that defaulted.
    calibrators = {}
    for key, est in make_base_models(pos_weight):
        raw = cross_val_predict(clone(est), X, y, cv=cv, method="predict_proba")[:, 1]
        calibrators[key] = fit_calibrator(raw, y)
        p = calibrators[key].predict_proba(to_logit(raw).reshape(-1, 1))[:, 1]
        metrics["models"][key] = {"name": BASE_MODELS[key], **scores(y, p, thresholds.approve)}
        print(f"{BASE_MODELS[key]:<22} AUC {metrics['models'][key]['aucRoc']:.3f}  catches {metrics['models'][key]['recall']:.0%} of defaults")
    metrics["models"]["ensemble"] = {"name": "Stacked ensemble", **scores(y, p_ens, thresholds.approve)}
    print(f"{'Stacked ensemble':<22} AUC {metrics['models']['ensemble']['aucRoc']:.3f}  catches {metrics['models']['ensemble']['recall']:.0%} of defaults")
    table = threshold_table(y, p_ens, thresholds)
    print_threshold_table(table, thresholds)

    # Optional time-based check: train on older loans, score the newer ones. This is the
    # closest thing to "how would it have done last year" and catches drift that random
    # cross-validation hides.
    if holdout_from:
        if "applicationDate" not in df.columns:
            raise SystemExit("--holdout-from needs an applicationDate column.")
        dates = pd.to_datetime(df["applicationDate"], errors="coerce")
        recent = dates >= pd.Timestamp(holdout_from)
        old, new = df[~recent & dates.notna()], df[recent]
        if old[LABEL].sum() < 3 or new[LABEL].nunique() < 2:
            raise SystemExit(f"Not enough defaults on both sides of {holdout_from} for a holdout check.")
        y_old = old[LABEL].to_numpy()
        pw = float((y_old == 0).sum() / max((y_old == 1).sum(), 1))
        m = make_stack(pw, min(folds, int(y_old.sum()))).fit(build_features(old, features), y_old)
        p_new = m.predict_proba(build_features(new, features))[:, 1]
        metrics["holdout"] = {
            "from": holdout_from,
            "trainRows": int(len(old)),
            "testRows": int(len(new)),
            **scores(new[LABEL].to_numpy(), p_new, thresholds.approve),
        }
        print(f"Holdout (loans from {holdout_from}, {len(new)} rows): AUC {metrics['holdout']['aucRoc']}")

    stack = make_stack(pos_weight, folds).fit(X, y)
    trained_at = datetime.now(timezone.utc)
    metrics.update(
        {
            "version": trained_at.strftime("%Y%m%d-%H%M%S"),
            "trainedAt": trained_at.isoformat(),
            "rows": int(len(df)),
            "rowsSkipped": len(checked.dropped),
            "defaultRate": round(float(y.mean()), 4),
            "dataFile": data_path.name,
            "sampleData": data_path.name == "sample_loans.csv",
            "validation": f"{folds}-fold stratified cross-validation",
            "features": features,
            "thresholds": {"approve": thresholds.approve, "deny": thresholds.deny},
            "thresholdTable": table,
            "warnings": checked.warnings,
        }
    )

    model = LoanRiskModel(stack=stack, thresholds=thresholds, metrics=metrics, features=features, calibrators=calibrators)
    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, out_dir / "model.joblib")
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(f"\nSaved model {metrics['version']} to {out_dir}")
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default=str(HERE / "data" / "sample_loans.csv"))
    parser.add_argument("--out", default=str(HERE / "models"))
    parser.add_argument("--approve", type=float, help="chance of default below this suggests approve (default: picked from data)")
    parser.add_argument("--deny", type=float, help="chance of default at or above this suggests deny (default: picked from data)")
    parser.add_argument("--max-missed", type=float, default=0.15, help="when picking the approve line, the most past defaults it may let through")
    parser.add_argument("--holdout-from", help="also test on loans from this date on (needs applicationDate)")
    parser.add_argument("--folds", type=int, default=5)
    args = parser.parse_args()
    thresholds = None
    if args.approve is not None or args.deny is not None:
        if args.approve is None or args.deny is None or not 0 < args.approve < args.deny < 1:
            parser.error("Give both --approve and --deny, with 0 < approve < deny < 1.")
        thresholds = Thresholds(args.approve, args.deny)
    train(Path(args.data), Path(args.out), thresholds, args.holdout_from, args.folds, args.max_missed)
