"""Compares the 8 regression algorithms from the research objective, plus the stacked ensemble.

    python benchmark.py                                   # data/sample_loans.csv
    python benchmark.py --data data/uedi_loans.csv        # UEDI's real loans (see prepare_data.py)

Every model predicts the Repayment Performance Score (0 to 100, `repaymentScore`) and is
scored with 5-fold cross-validation repeated 5 times, so each number is a mean over 25 test
folds with its standard deviation:

  MAE   mean absolute error: how many score points off a prediction is, on average
  RMSE  root mean squared error: like MAE, but large misses count more
  R²    share of the variation in past scores the model explains (1 = perfect, 0 = no
        better than always guessing the average)

The algorithms are ranked by R². The stacked ensemble then combines the top-ranked
explainable models (see uedi_ml.regressors.EXPLAINABLE) with a Linear Regression
meta-model; it is benchmarked with the top 2 and the top 3, and the app uses the better one.
Results go to models/benchmark_<dataset>.json and .md.

There is no class imbalance to correct in regression, so SMOTE and class weights no longer
apply. The public German Credit data only says good or bad, so it cannot train a regressor.
"""

from __future__ import annotations

import argparse
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import KFold, RepeatedKFold, cross_validate

from uedi_ml.dataset import TARGET, load_training_csv
from uedi_ml.features import build_features
from uedi_ml.model import make_stack
from uedi_ml.regressors import EXPLAINABLE, REGRESSORS, make_regressor

HERE = Path(__file__).parent
METRICS = {"mae": "neg_mean_absolute_error", "rmse": "neg_root_mean_squared_error", "r2": "r2"}


def load_uedi(path: Path) -> tuple[pd.DataFrame, np.ndarray]:
    checked = load_training_csv(path)
    return build_features(checked.df, checked.features), checked.df[TARGET].to_numpy(dtype=float)


def evaluate(name: str, est, X: pd.DataFrame, y: np.ndarray, repeats: int) -> dict:
    cv = RepeatedKFold(n_splits=5, n_repeats=repeats, random_state=7)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        res = cross_validate(est, X, y, cv=cv, scoring=METRICS, n_jobs=1)
    row = {"model": name}
    for key in METRICS:
        vals = res[f"test_{key}"] * (-1 if key != "r2" else 1)
        row[key] = round(float(np.mean(vals)), 4)
        row[f"{key}Sd"] = round(float(np.std(vals)), 4)
    print(f"{name:<34} MAE {row['mae']:6.2f}   RMSE {row['rmse']:6.2f}   R² {row['r2']:.3f} ± {row['r2Sd']:.3f}")
    return row


def pick_members(rows: list[dict], k: int) -> list[str]:
    """The k highest-R² algorithms that can be explained exactly with SHAP."""
    by_name = {v: key for key, v in REGRESSORS.items()}
    ranked = [by_name[r["model"]] for r in sorted(rows, key=lambda r: -r["r2"]) if r["model"] in by_name]
    return [key for key in ranked if key in EXPLAINABLE][:k]


def run(X: pd.DataFrame, y: np.ndarray, repeats: int = 5) -> dict:
    rows = [evaluate(name, make_regressor(key), X, y, repeats) for key, name in REGRESSORS.items()]
    stacks = {}
    for k in (2, 3):
        members = pick_members(rows, k)
        name = f"Stacked ensemble (top {k}: " + " + ".join(REGRESSORS[m] for m in members) + ")"
        row = evaluate(name, make_stack(members), X, y, repeats)
        row["members"] = members
        rows.append(row)
        stacks[k] = row
    best = max(stacks.values(), key=lambda r: r["r2"])
    best["usedByApp"] = True
    return {"results": sorted(rows, key=lambda r: -r["r2"]), "ensembleMembers": best["members"]}


def to_markdown(rows: list[dict], title: str) -> str:
    lines = [f"# {title}", "", "| Rank | Model | MAE | RMSE | R² |", "| --- | --- | --- | --- | --- |"]
    for i, r in enumerate(rows, 1):
        cells = [f"{r[k]:.3f} ± {r[k + 'Sd']:.3f}" for k in METRICS]
        lines.append(f"| {i} | {r['model']}{' (app)' if r.get('usedByApp') else ''} | " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=HERE / "data" / "sample_loans.csv")
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--out", type=Path, default=HERE / "models")
    args = parser.parse_args()

    X, y = load_uedi(args.data)
    name = args.data.stem
    print(f"{name}: {len(y)} loans, repayment score mean {y.mean():.1f} (SD {y.std():.1f}), {X.shape[1]} features\n")
    out = run(X, y, args.repeats)

    args.out.mkdir(parents=True, exist_ok=True)
    stem = args.out / f"benchmark_{name}"
    meta = {"dataset": name, "rows": int(len(y)), "target": TARGET, "targetMean": round(float(y.mean()), 2),
            "targetSd": round(float(y.std()), 2), "validation": f"5-fold CV repeated {args.repeats} times", **out}
    stem.with_suffix(".json").write_text(json.dumps(meta, indent=2))
    stem.with_suffix(".md").write_text(to_markdown(out["results"], f"{name} ({len(y)} loans), 5x{args.repeats} CV, ranked by R²"))
    print(f"\nThe app's ensemble: {' + '.join(REGRESSORS[m] for m in out['ensembleMembers'])}")
    print(f"Saved {stem}.json and .md")
