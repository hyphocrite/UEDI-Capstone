"""Compares the 8 classifiers from the research objective, plus the stacked ensemble the app uses.

    python benchmark.py --german                              # public German Credit data
    python benchmark.py --data data/sample_loans.csv          # UEDI-shaped loans
    python benchmark.py --german --balance weights            # class weights instead of SMOTE

Every model is scored with 5 x 5 repeated stratified cross-validation, so each number is a
mean over 25 test folds with its standard deviation. "Recall" is the share of bad loans
the model caught. Results go to models/benchmark_<dataset>_<balance>.json and .md.

Class imbalance: with --balance smote (default), SMOTE oversamples the bad loans inside
each training fold only, so the test folds stay untouched. With --balance weights, models
that support it weight the classes instead, and the rest train on the data as is.
"""

from __future__ import annotations

import argparse
import json
import re
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import RepeatedStratifiedKFold, StratifiedKFold, cross_validate
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

from uedi_ml.dataset import LABEL, load_training_csv
from uedi_ml.features import build_features

HERE = Path(__file__).parent
GERMAN = HERE / "data" / "public" / "german_credit.csv"
METRICS = {"aucRoc": "roc_auc", "accuracy": "accuracy", "precision": "precision", "recall": "recall", "f1": "f1"}


def load_german(path: Path) -> tuple[pd.DataFrame, np.ndarray]:
    """South German Credit (Grömping 2019): 1,000 loans, 300 bad. credit_risk is 1 = good, 0 = bad."""
    df = pd.read_csv(path)
    y = (df.pop("credit_risk") == 0).astype(int).to_numpy()
    X = pd.get_dummies(df, drop_first=True, dtype=float)
    # XGBoost rejects column names with [, ] or <, which the category labels contain.
    X.columns = [re.sub(r"[^0-9a-zA-Z]+", "_", c).strip("_") for c in X.columns]
    return X, y


def load_uedi(path: Path) -> tuple[pd.DataFrame, np.ndarray]:
    checked = load_training_csv(path)
    return build_features(checked.df, checked.features), checked.df[LABEL].to_numpy()


def models(pos_weight: float, weighted: bool) -> dict[str, object]:
    cw = "balanced" if weighted else None
    scaled = lambda est: Pipeline([("scale", StandardScaler()), ("model", est)])  # noqa: E731
    xgb_params = dict(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.9, colsample_bytree=0.9,
                      eval_metric="logloss", random_state=42, n_jobs=2)
    found = {
        "Logistic Regression": scaled(LogisticRegression(class_weight=cw, max_iter=2000)),
        "Random Forest": RandomForestClassifier(n_estimators=300, min_samples_leaf=5, class_weight=cw, random_state=42, n_jobs=2),
        "XGBoost": xgb.XGBClassifier(scale_pos_weight=pos_weight if weighted else 1.0, **xgb_params),
        "Naive Bayes": scaled(GaussianNB()),
        "SVM": scaled(SVC(kernel="rbf", class_weight=cw, probability=True, random_state=42)),
        "KNN": scaled(KNeighborsClassifier(n_neighbors=15)),
        "Decision Tree": DecisionTreeClassifier(max_depth=5, min_samples_leaf=10, class_weight=cw, random_state=42),
        "MLP": scaled(MLPClassifier(hidden_layer_sizes=(32, 16), alpha=1e-3, max_iter=1000, early_stopping=True, random_state=42)),
    }
    # The app's model: XGBoost + Random Forest + Logistic Regression, Logistic Regression on top.
    found["Stacked ensemble (app)"] = StackingClassifier(
        estimators=[("xgboost", found["XGBoost"]), ("random_forest", found["Random Forest"]),
                    ("logistic_regression", found["Logistic Regression"])],
        final_estimator=LogisticRegression(max_iter=1000),
        stack_method="predict_proba",
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
    )
    return found


def run(X: pd.DataFrame, y: np.ndarray, balance: str, repeats: int = 5) -> list[dict]:
    pos_weight = float((y == 0).sum() / max((y == 1).sum(), 1))
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=repeats, random_state=7)
    rows = []
    for name, est in models(pos_weight, weighted=balance == "weights").items():
        if balance == "smote":
            est = ImbPipeline([("smote", SMOTE(random_state=42)), ("model", est)])
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            res = cross_validate(est, X, y, cv=cv, scoring=METRICS, n_jobs=1)
        row = {"model": name}
        for key in METRICS:
            vals = res[f"test_{key}"]
            row[key] = round(float(np.mean(vals)), 4)
            row[f"{key}Sd"] = round(float(np.std(vals)), 4)
        rows.append(row)
        print(f"{name:<24} AUC {row['aucRoc']:.3f} ± {row['aucRocSd']:.3f}   recall {row['recall']:.2f}   F1 {row['f1']:.2f}")
    return sorted(rows, key=lambda r: -r["aucRoc"])


def to_markdown(rows: list[dict], title: str) -> str:
    lines = [f"# {title}", "", "| Model | AUC-ROC | Accuracy | Precision | Recall | F1 |", "| --- | --- | --- | --- | --- | --- |"]
    for r in rows:
        cells = [f"{r[k]:.3f} ± {r[k + 'Sd']:.3f}" for k in METRICS]
        lines.append(f"| {r['model']} | " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--german", action="store_true", help=f"use {GERMAN.relative_to(HERE)}")
    src.add_argument("--data", type=Path, help="a training CSV in UEDI's format")
    parser.add_argument("--balance", choices=["smote", "weights"], default="smote")
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--out", type=Path, default=HERE / "models")
    args = parser.parse_args()

    X, y = load_german(GERMAN) if args.german else load_uedi(args.data)
    name = "german_credit" if args.german else args.data.stem
    print(f"{name}: {len(y)} loans, {int(y.sum())} bad ({y.mean():.0%}), {X.shape[1]} features, balance={args.balance}\n")
    rows = run(X, y, args.balance, args.repeats)

    args.out.mkdir(parents=True, exist_ok=True)
    stem = args.out / f"benchmark_{name}_{args.balance}"
    meta = {"dataset": name, "rows": int(len(y)), "bad": int(y.sum()), "balance": args.balance,
            "validation": f"5-fold stratified CV repeated {args.repeats} times", "results": rows}
    stem.with_suffix(".json").write_text(json.dumps(meta, indent=2))
    title = f"{name} ({len(y)} loans, {int(y.sum())} bad), {args.balance}, 5x{args.repeats} CV"
    stem.with_suffix(".md").write_text(to_markdown(rows, title))
    print(f"\nSaved {stem}.json and .md")
