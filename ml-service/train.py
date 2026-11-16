"""Train the stacked credit-score regressor on past loans and record honest metrics.

    python train.py                                   # sample data (synthetic)
    python train.py --data data/uedi_loans.csv        # UEDI's real loans (see prepare_data.py)
    python train.py --data data/uedi_loans.csv --holdout-from 2025-01-01
    python train.py --data data/uedi_loans.csv --approve 80 --deny 60

The CSV needs the columns in uedi_ml.features.REQUIRED_FIELDS plus `repaymentScore` (the
Repayment Performance Score, 0 to 100). Optional columns (balances, tenure, past loans,
age, employment status) are used when present. The ensemble's members come from the latest
benchmark.py run on the same data, or --members. Writes models/model.joblib and
models/metrics.json.
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
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict

from uedi_ml.dataset import POOR_REPAYMENT, TARGET, load_training_csv
from uedi_ml.features import ALL_FEATURES, FEATURE_LABELS, build_features
from uedi_ml.model import DEFAULT_MEMBERS, CreditScoreModel, Thresholds, clip_score, make_stack
from uedi_ml.regressors import REGRESSORS, make_regressor

HERE = Path(__file__).parent


def scores(y: np.ndarray, pred: np.ndarray) -> dict:
    pred = clip_score(pred)
    return {
        "mae": round(float(mean_absolute_error(y, pred)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(y, pred))), 4),
        "r2": round(float(r2_score(y, pred)), 4),
    }


GRID = list(range(30, 96))


def cutoff_stats(y: np.ndarray, pred: np.ndarray, t: float) -> dict:
    """What a credit-score line at t would have done to past loans."""
    poor = y < POOR_REPAYMENT
    above = pred >= t
    below = int((~above).sum())
    return {
        "threshold": t,
        # Share of loans at or above the line (suggested approve if t is the approve line).
        "shareAtOrAbove": round(float(above.mean()), 4),
        # Share of all poor repayers that scored at or above the line (the costly mistake).
        "poorAtOrAbove": round(float((poor & above).sum() / max(int(poor.sum()), 1)), 4),
        # Of the loans below the line, the share that were poor repayers.
        "poorRateBelow": round(float(poor[~above].mean()), 4) if below else None,
        "countBelow": below,
    }


def pick_thresholds(y: np.ndarray, pred: np.ndarray, max_missed: float) -> Thresholds:
    """Approve line: as low as possible while letting through at most `max_missed` of past
    poor repayers. Deny line: the highest score below which at least half of past loans
    were poor repayers."""
    stats = [cutoff_stats(y, pred, t) for t in GRID]
    ok = [s["threshold"] for s in stats if s["poorAtOrAbove"] <= max_missed]
    approve = min(ok) if ok else GRID[-1]
    deny_ok = [s["threshold"] for s in stats if s["threshold"] < approve and s["countBelow"] >= 5 and (s["poorRateBelow"] or 0) >= 0.5]
    deny = max(deny_ok) if deny_ok else min(POOR_REPAYMENT, approve - 5)
    return Thresholds(float(approve), float(deny))


def error_types(y: np.ndarray, pred: np.ndarray, thresholds: Thresholds) -> dict:
    """Type I and Type II errors at the approve line, as a 2 x 2 matrix.

    Positive = poor repayer (actual score below POOR_REPAYMENT); "flagged" = predicted below
    the approve line, so sent to review or deny.
      Type I  (false positive): a good repayer flagged.
      Type II (false negative): a poor repayer suggested for approval.
    """
    poor = y < POOR_REPAYMENT
    flagged = pred < thresholds.approve
    tp, fn = int((poor & flagged).sum()), int((poor & ~flagged).sum())
    fp, tn = int((~poor & flagged).sum()), int((~poor & ~flagged).sum())
    return {
        "poorRepaymentBelow": POOR_REPAYMENT,
        "matrix": {"truePositive": tp, "falseNegative": fn, "falsePositive": fp, "trueNegative": tn},
        "typeIRate": round(fp / max(fp + tn, 1), 4),
        "typeIIRate": round(fn / max(tp + fn, 1), 4),
        "precision": round(tp / max(tp + fp, 1), 4),
        "recall": round(tp / max(tp + fn, 1), 4),
    }


def threshold_table(y: np.ndarray, pred: np.ndarray, thresholds: Thresholds) -> list[dict]:
    points = sorted({40, 50, 60, 70, 75, 80, 85, 90, thresholds.approve, thresholds.deny})
    return [cutoff_stats(y, pred, t) for t in points]


def print_threshold_table(table: list[dict], thresholds: Thresholds):
    print(f"\nWhat each credit-score line would have done to past loans (out-of-fold; poor repayer = score below {POOR_REPAYMENT:g}):")
    print("  line  at/above line  of poor repayers at/above  poor rate below")
    for r in table:
        mark = "  <- approve line" if r["threshold"] == thresholds.approve else "  <- deny line" if r["threshold"] == thresholds.deny else ""
        rate = f"{r['poorRateBelow']:.0%}" if r["poorRateBelow"] is not None else "-"
        print(f"  {r['threshold']:>4g}  {r['shareAtOrAbove']:>13.0%}  {r['poorAtOrAbove']:>25.0%}  {rate:>15}{mark}")


def global_importance(model: CreditScoreModel, X: pd.DataFrame, sample: int = 1000) -> list[dict]:
    """SHAP summary for the stacked ensemble: the mean absolute SHAP value of each feature over
    the training data (up to `sample` rows), largest first, in credit score points."""
    rows = X.sample(n=min(sample, len(X)), random_state=42) if len(X) > sample else X
    values, _, _ = model.ensemble_shap(rows)
    mean_abs = np.abs(values).mean(axis=0)
    order = np.argsort(-mean_abs)
    return [{"feature": model.features[j], "label": FEATURE_LABELS[model.features[j]], "meanAbsShap": round(float(mean_abs[j]), 4)} for j in order]


def members_from_benchmark(data_path: Path, out_dir: Path) -> list[str]:
    path = out_dir / f"benchmark_{data_path.stem}.json"
    if path.exists():
        members = json.loads(path.read_text()).get("ensembleMembers")
        if members:
            print(f"Ensemble members from {path.name}: {', '.join(REGRESSORS[m] for m in members)}")
            return members
    print(f"No benchmark for {data_path.name}; using {', '.join(REGRESSORS[m] for m in DEFAULT_MEMBERS)}.")
    return list(DEFAULT_MEMBERS)


def train(
    data_path: Path,
    out_dir: Path,
    thresholds: Thresholds | None = None,
    holdout_from: str | None = None,
    folds: int = 5,
    max_missed: float = 0.15,
    members: list[str] | None = None,
) -> dict:
    checked = load_training_csv(data_path)
    df, features = checked.df, checked.features
    y = df[TARGET].to_numpy(dtype=float)

    print(f"{len(df)} usable loans. Repayment score mean {y.mean():.1f}, SD {y.std():.1f}; "
          f"{(y < POOR_REPAYMENT).mean():.1%} below {POOR_REPAYMENT:g}.")
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

    if len(df) < 10:
        raise SystemExit("Need at least 10 loans to train.")
    folds = min(folds, len(df) // 2)
    members = members or members_from_benchmark(data_path, out_dir)

    metrics: dict = {"models": {}}
    X = build_features(df, features)
    cv = KFold(n_splits=folds, shuffle=True, random_state=7)

    pred_ens = clip_score(cross_val_predict(make_stack(members, folds), X, y, cv=cv))
    if thresholds is None:
        thresholds = pick_thresholds(y, pred_ens, max_missed)
        print(f"Picked cut-offs from past loans: approve from {thresholds.approve:g}, deny below {thresholds.deny:g}.")

    for key in members:
        pred = cross_val_predict(clone(make_regressor(key)), X, y, cv=cv)
        metrics["models"][key] = {"name": REGRESSORS[key], **scores(y, pred)}
        m = metrics["models"][key]
        print(f"{REGRESSORS[key]:<22} MAE {m['mae']:.2f}  RMSE {m['rmse']:.2f}  R² {m['r2']:.3f}")
    metrics["models"]["ensemble"] = {"name": "Stacked ensemble", **scores(y, pred_ens)}
    m = metrics["models"]["ensemble"]
    print(f"{'Stacked ensemble':<22} MAE {m['mae']:.2f}  RMSE {m['rmse']:.2f}  R² {m['r2']:.3f}")
    table = threshold_table(y, pred_ens, thresholds)
    print_threshold_table(table, thresholds)
    errors = error_types(y, pred_ens, thresholds)
    print(f"Type I rate (good repayers flagged): {errors['typeIRate']:.0%}. "
          f"Type II rate (poor repayers suggested approve): {errors['typeIIRate']:.0%}.")

    # Optional time-based check: train on older loans, score the newer ones.
    if holdout_from:
        if "applicationDate" not in df.columns:
            raise SystemExit("--holdout-from needs an applicationDate column.")
        dates = pd.to_datetime(df["applicationDate"], errors="coerce")
        recent = dates >= pd.Timestamp(holdout_from)
        old, new = df[~recent & dates.notna()], df[recent]
        if len(old) < 10 or len(new) < 5:
            raise SystemExit(f"Not enough loans on both sides of {holdout_from} for a holdout check.")
        m = make_stack(members, min(folds, len(old) // 2)).fit(build_features(old, features), old[TARGET])
        pred_new = m.predict(build_features(new, features))
        metrics["holdout"] = {"from": holdout_from, "trainRows": int(len(old)), "testRows": int(len(new)),
                              **scores(new[TARGET].to_numpy(dtype=float), pred_new)}
        print(f"Holdout (loans from {holdout_from}, {len(new)} rows): R² {metrics['holdout']['r2']}")

    stack = make_stack(members, folds).fit(X, y)
    trained_at = datetime.now(timezone.utc)
    model = CreditScoreModel(stack=stack, thresholds=thresholds, metrics=metrics, features=features)
    metrics.update(
        {
            "version": trained_at.strftime("%Y%m%d-%H%M%S"),
            "trainedAt": trained_at.isoformat(),
            "task": "regression",
            "target": TARGET,
            "rows": int(len(df)),
            "rowsSkipped": len(checked.dropped),
            "targetMean": round(float(y.mean()), 2),
            "targetSd": round(float(y.std()), 2),
            "poorRepaymentShare": round(float((y < POOR_REPAYMENT).mean()), 4),
            "dataFile": data_path.name,
            "sampleData": data_path.name == "sample_loans.csv",
            "validation": f"{folds}-fold cross-validation",
            "members": members,
            "modelWeights": {k: round(float(w), 3) for k, w in zip(members, stack.final_estimator_.coef_)},
            "features": features,
            "thresholds": {"approve": thresholds.approve, "deny": thresholds.deny},
            "thresholdTable": table,
            "errorTypes": errors,
            "warnings": checked.warnings,
            "globalImportance": global_importance(model, X),
        }
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, out_dir / "model.joblib")
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(f"\nSaved model {metrics['version']} to {out_dir}")
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default=str(HERE / "data" / "sample_loans.csv"))
    parser.add_argument("--out", default=str(HERE / "models"))
    parser.add_argument("--approve", type=float, help="credit score at or above this suggests approve (default: picked from data)")
    parser.add_argument("--deny", type=float, help="credit score below this suggests deny (default: picked from data)")
    parser.add_argument("--max-missed", type=float, default=0.15, help="when picking the approve line, the most past poor repayers it may let through")
    parser.add_argument("--holdout-from", help="also test on loans from this date on (needs applicationDate)")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--members", help=f"comma-separated ensemble members, e.g. xgboost,random_forest (from: {', '.join(REGRESSORS)})")
    args = parser.parse_args()
    thresholds = None
    if args.approve is not None or args.deny is not None:
        if args.approve is None or args.deny is None or not 0 < args.deny < args.approve <= 100:
            parser.error("Give both --approve and --deny, with 0 < deny < approve <= 100.")
        thresholds = Thresholds(args.approve, args.deny)
    members = args.members.split(",") if args.members else None
    train(Path(args.data), Path(args.out), thresholds, args.holdout_from, args.folds, args.max_missed, members)
