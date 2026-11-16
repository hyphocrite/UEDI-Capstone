"""Stacked credit-score model (regression).

Each base regressor predicts the applicant's Repayment Performance Score (0 to 100), and a
Linear Regression meta-model combines their predictions. The meta-model's weights are kept
non-negative, so it is a weighted blend of the base models plus a constant. The output is
the credit score shown to loan officers, clipped to 0 to 100.

The base models are the top-ranked explainable regressors from benchmark.py (by default
XGBoost, Random Forest and Linear Regression). Explanations use SHAP in score points:
XGBoost's built-in TreeSHAP, shap.TreeExplainer for tree models, and exact
coefficient x value contributions for linear models. Because the ensemble is a weighted sum
of the base models, its SHAP values are the same weighted sum of theirs, so the ensemble
gets an exact waterfall too.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.ensemble import StackingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold

from .features import ALL_FEATURES, FEATURE_LABELS, build_features
from .regressors import EXPLAINABLE, REGRESSORS, make_regressor

DEFAULT_MEMBERS = ["xgboost", "random_forest", "linear_regression"]


@dataclass
class Thresholds:
    """Credit score at or above `approve` suggests approval, below `deny` suggests denial.

    train.py picks these from past loans unless --approve/--deny are given.
    """

    approve: float = 80.0
    deny: float = 60.0

    def suggest(self, score: float) -> str:
        if score >= self.approve:
            return "approve"
        if score < self.deny:
            return "deny"
        return "review"


def make_stack(members: list[str] | None = None, folds: int = 5) -> StackingRegressor:
    members = members or DEFAULT_MEMBERS
    bad = [m for m in members if m not in EXPLAINABLE]
    if bad:
        raise ValueError(f"Ensemble members must be explainable with exact SHAP: {', '.join(bad)} is not.")
    return StackingRegressor(
        estimators=[(m, make_regressor(m)) for m in members],
        final_estimator=LinearRegression(positive=True),
        cv=KFold(n_splits=folds, shuffle=True, random_state=42),
        n_jobs=1,
    )


def clip_score(v):
    return np.clip(v, 0, 100)


@dataclass
class CreditScoreModel:
    stack: StackingRegressor
    thresholds: Thresholds = field(default_factory=Thresholds)
    metrics: dict = field(default_factory=dict)
    # The features this model was trained on (depends on which columns the training CSV had).
    features: list[str] = field(default_factory=lambda: list(ALL_FEATURES))
    _explainers: dict = field(default_factory=dict, repr=False)

    @property
    def bases(self) -> dict:
        return dict(self.stack.named_estimators_)

    @property
    def members(self) -> list[str]:
        return [name for name, _ in self.stack.estimators]

    def shap_values(self, key: str, X: pd.DataFrame) -> tuple[np.ndarray, float]:
        """SHAP values (rows x features) and the base value, in score points, for one base model."""
        est = self.bases[key]
        if key == "xgboost":
            allv = est.get_booster().predict(xgb.DMatrix(X), pred_contribs=True)
            return allv[:, :-1], float(allv[0, -1])
        if key in {"random_forest", "decision_tree"}:
            if key not in self._explainers:
                self._explainers[key] = shap.TreeExplainer(est)
            ex = self._explainers[key]
            values = np.asarray(ex.shap_values(X, check_additivity=False))
            return values, float(np.ravel(ex.expected_value)[0])
        # Linear models (scaler + linear): contribution = coefficient x scaled value. The
        # scaled training mean is 0, so the base value is the intercept.
        z = est.named_steps["scale"].transform(X)
        lin = est.named_steps["model"]
        return z * lin.coef_, float(lin.intercept_)

    def ensemble_shap(self, X: pd.DataFrame) -> tuple[np.ndarray, float, dict]:
        meta = self.stack.final_estimator_
        weights = dict(zip(self.members, meta.coef_))
        total = np.zeros(X.shape, dtype=float)
        base = float(meta.intercept_)
        per_model = {}
        for key, w in weights.items():
            values, b = self.shap_values(key, X)
            per_model[key] = values
            total += w * values
            base += w * b
        return total, base, per_model

    def explain(self, raw: pd.DataFrame, top: int = 5) -> list[dict]:
        X = build_features(raw, self.features)
        preds = {key: self.bases[key].predict(X) for key in self.members}
        ensemble = self.stack.predict(X)
        ens_shap, ens_base, contribs = self.ensemble_shap(X)
        weights = dict(zip(self.members, self.stack.final_estimator_.coef_))

        results = []
        for i in range(len(X)):
            models = []
            for key in self.members:
                score = float(clip_score(preds[key][i]))
                models.append(
                    {
                        "key": key,
                        "name": REGRESSORS[key],
                        "creditScore": round(score, 2),
                        "suggestion": self.thresholds.suggest(score),
                        "topFactors": _top_factors(contribs[key][i], X.iloc[i], self.features, top),
                        "cvMetrics": self.metrics.get("models", {}).get(key),
                    }
                )
            score = float(clip_score(ensemble[i]))
            results.append(
                {
                    "ensemble": {
                        "name": "Stacked ensemble",
                        "creditScore": round(score, 2),
                        "suggestion": self.thresholds.suggest(score),
                        "modelWeights": {k: round(float(v), 3) for k, v in weights.items()},
                        "cvMetrics": self.metrics.get("models", {}).get("ensemble"),
                    },
                    "models": models,
                    "thresholds": {"approve": self.thresholds.approve, "deny": self.thresholds.deny},
                    "modelVersion": self.metrics.get("version"),
                    "shap": _waterfall(ens_shap[i], ens_base, float(ensemble[i]), X.iloc[i], self.features),
                }
            )
        return results


def _waterfall(values: np.ndarray, base: float, raw_output: float, row: pd.Series, features: list[str], top: int = 8) -> dict:
    """What a SHAP waterfall needs for the stacked ensemble, for one application.

    Scale: credit score points. baseValue (the average applicant's score) + sum(factors.shap)
    + otherFeatures = output, the ensemble's score before clipping; creditScore is that
    clipped to 0 to 100. Positive values raise the score (safer), negative values lower it.
    """
    order = np.argsort(-np.abs(values))
    kept = [j for j in order[:top] if abs(values[j]) > 1e-9]
    rest = float(sum(values[j] for j in order[top:]))
    # Tiny gaps from the tree explainers' rounding go into "other features" so the bars add up.
    rest += raw_output - (base + float(values.sum()))
    return {
        "model": "ensemble",
        "scale": "points",
        "baseValue": round(base, 4),
        "factors": [
            {"feature": features[j], "label": FEATURE_LABELS[features[j]], "value": round(float(row[features[j]]), 4), "shap": round(float(values[j]), 4)}
            for j in kept
        ],
        "otherFeatures": round(rest, 4),
        "output": round(raw_output, 4),
        "creditScore": round(float(clip_score(raw_output)), 2),
    }


def _top_factors(values: np.ndarray, row: pd.Series, features: list[str], top: int) -> list[dict]:
    order = np.argsort(-np.abs(values))[:top]
    out = []
    for j in order:
        name = features[j]
        v = float(values[j])
        if abs(v) < 1e-9:
            continue
        out.append(
            {
                "feature": name,
                "label": FEATURE_LABELS[name],
                "value": round(float(row[name]), 4),
                "impact": round(v, 4),
                "direction": "raises score" if v > 0 else "lowers score",
            }
        )
    return out
