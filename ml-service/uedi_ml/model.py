"""Stacked credit-risk model: XGBoost, Random Forest and Logistic Regression each score
the applicant, and a Logistic Regression meta-model combines their three scores.

Every score is the probability that the loan will default. Explanations use SHAP:
XGBoost's built-in TreeSHAP, shap.TreeExplainer for the Random Forest, and exact
coefficient x value contributions for Logistic Regression.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .features import FEATURE_LABELS, FEATURES, build_features

BASE_MODELS = {
    "xgboost": "XGBoost",
    "random_forest": "Random Forest",
    "logistic_regression": "Logistic Regression",
}


@dataclass
class Thresholds:
    """Default probability below `approve` suggests approval, at or above `deny` suggests denial."""

    approve: float = 0.20
    deny: float = 0.50

    def suggest(self, p: float) -> str:
        if p < self.approve:
            return "approve"
        if p >= self.deny:
            return "deny"
        return "review"


def make_base_models(pos_weight: float) -> list[tuple[str, object]]:
    return [
        (
            "xgboost",
            xgb.XGBClassifier(
                n_estimators=300,
                max_depth=4,
                learning_rate=0.05,
                subsample=0.9,
                colsample_bytree=0.9,
                scale_pos_weight=pos_weight,
                eval_metric="logloss",
                random_state=42,
                n_jobs=2,
            ),
        ),
        (
            "random_forest",
            RandomForestClassifier(
                n_estimators=300,
                min_samples_leaf=5,
                class_weight="balanced",
                random_state=42,
                n_jobs=2,
            ),
        ),
        (
            "logistic_regression",
            Pipeline(
                [
                    ("scale", StandardScaler()),
                    ("lr", LogisticRegression(class_weight="balanced", max_iter=2000)),
                ]
            ),
        ),
    ]


def make_stack(pos_weight: float) -> StackingClassifier:
    return StackingClassifier(
        estimators=make_base_models(pos_weight),
        final_estimator=LogisticRegression(class_weight="balanced"),
        stack_method="predict_proba",
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
        n_jobs=1,
    )


@dataclass
class LoanRiskModel:
    stack: StackingClassifier
    thresholds: Thresholds = field(default_factory=Thresholds)
    metrics: dict = field(default_factory=dict)
    _rf_explainer: object = field(default=None, repr=False)

    @property
    def bases(self) -> dict:
        return dict(self.stack.named_estimators_)

    def _rf_shap(self, X: pd.DataFrame) -> np.ndarray:
        if self._rf_explainer is None:
            self._rf_explainer = shap.TreeExplainer(self.bases["random_forest"])
        values = self._rf_explainer.shap_values(X, check_additivity=False)
        # Newer shap returns (rows, features, classes); older returns a list per class.
        values = values[1] if isinstance(values, list) else values[..., 1]
        return np.asarray(values)

    def explain(self, raw: pd.DataFrame, top: int = 5) -> list[dict]:
        X = build_features(raw)
        bases = self.bases
        probs = {
            "xgboost": bases["xgboost"].predict_proba(X)[:, 1],
            "random_forest": bases["random_forest"].predict_proba(X)[:, 1],
            "logistic_regression": bases["logistic_regression"].predict_proba(X)[:, 1],
        }
        ensemble = self.stack.predict_proba(X)[:, 1]

        xgb_contrib = bases["xgboost"].get_booster().predict(xgb.DMatrix(X), pred_contribs=True)[:, :-1]
        rf_contrib = self._rf_shap(X)
        lr = bases["logistic_regression"]
        lr_contrib = lr.named_steps["scale"].transform(X) * lr.named_steps["lr"].coef_[0]
        contribs = {"xgboost": xgb_contrib, "random_forest": rf_contrib, "logistic_regression": lr_contrib}

        meta = self.stack.final_estimator_
        # Meta-model columns are [p(no default), p(default)] per base model; keep the default one.
        weights = dict(zip(BASE_MODELS, meta.coef_[0][1::2])) if meta.coef_.shape[1] == 6 else dict(zip(BASE_MODELS, meta.coef_[0]))

        results = []
        for i in range(len(X)):
            models = []
            for key, name in BASE_MODELS.items():
                p = float(probs[key][i])
                models.append(
                    {
                        "key": key,
                        "name": name,
                        "defaultProbability": round(p, 4),
                        "suggestion": self.thresholds.suggest(p),
                        "topFactors": _top_factors(contribs[key][i], X.iloc[i], top),
                        "cvMetrics": self.metrics.get("models", {}).get(key),
                    }
                )
            p = float(ensemble[i])
            results.append(
                {
                    "ensemble": {
                        "name": "Stacked ensemble",
                        "defaultProbability": round(p, 4),
                        "suggestion": self.thresholds.suggest(p),
                        "modelWeights": {k: round(float(v), 3) for k, v in weights.items()},
                        "cvMetrics": self.metrics.get("models", {}).get("ensemble"),
                    },
                    "models": models,
                    "thresholds": {"approve": self.thresholds.approve, "deny": self.thresholds.deny},
                    "modelVersion": self.metrics.get("version"),
                }
            )
        return results


def _top_factors(values: np.ndarray, row: pd.Series, top: int) -> list[dict]:
    order = np.argsort(-np.abs(values))[:top]
    out = []
    for j in order:
        name = FEATURES[j]
        v = float(values[j])
        if abs(v) < 1e-9:
            continue
        out.append(
            {
                "feature": name,
                "label": FEATURE_LABELS[name],
                "value": round(float(row[name]), 4),
                "impact": round(v, 4),
                "direction": "raises risk" if v > 0 else "lowers risk",
            }
        )
    return out
