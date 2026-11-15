"""Stacked credit-risk model: XGBoost, Random Forest and Logistic Regression each score
the applicant, and a Logistic Regression meta-model combines their three scores.

The base models are class-weighted, because defaults are rare, so their raw scores run
high. The meta-model is not weighted, so the ensemble's output is a calibrated estimate
of the chance of default. Each base model's displayed score is calibrated the same way
(Platt scaling on its out-of-fold scores), so all four numbers share one scale. Explanations use SHAP:
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

from .features import ALL_FEATURES, FEATURE_LABELS, build_features

BASE_MODELS = {
    "xgboost": "XGBoost",
    "random_forest": "Random Forest",
    "logistic_regression": "Logistic Regression",
}


@dataclass
class Thresholds:
    """Chance of default below `approve` suggests approval, at or above `deny` suggests denial.

    train.py picks these from past loans unless --approve/--deny are given.
    """

    approve: float = 0.05
    deny: float = 0.25

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


def make_stack(pos_weight: float, folds: int = 5) -> StackingClassifier:
    return StackingClassifier(
        estimators=make_base_models(pos_weight),
        final_estimator=LogisticRegression(max_iter=1000),
        stack_method="predict_proba",
        cv=StratifiedKFold(n_splits=folds, shuffle=True, random_state=42),
        n_jobs=1,
    )


@dataclass
class LoanRiskModel:
    stack: StackingClassifier
    thresholds: Thresholds = field(default_factory=Thresholds)
    metrics: dict = field(default_factory=dict)
    # The features this model was trained on (depends on which columns the training CSV had).
    features: list[str] = field(default_factory=lambda: list(ALL_FEATURES))
    # Per base model: maps its class-weighted score to a calibrated chance of default.
    calibrators: dict = field(default_factory=dict)
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

    def _calibrated(self, key: str, p: float) -> float:
        cal = self.calibrators.get(key)
        return float(cal.predict_proba([[to_logit(p)]])[0, 1]) if cal is not None else p

    def explain(self, raw: pd.DataFrame, top: int = 5) -> list[dict]:
        X = build_features(raw, self.features)
        bases = self.bases
        probs = {
            "xgboost": bases["xgboost"].predict_proba(X)[:, 1],
            "random_forest": bases["random_forest"].predict_proba(X)[:, 1],
            "logistic_regression": bases["logistic_regression"].predict_proba(X)[:, 1],
        }
        ensemble = self.stack.predict_proba(X)[:, 1]

        # TreeSHAP: one column per feature plus the bias (the explainer's expected value) last,
        # in the class-weighted XGBoost model's log-odds of default.
        xgb_all = bases["xgboost"].get_booster().predict(xgb.DMatrix(X), pred_contribs=True)
        xgb_contrib = xgb_all[:, :-1]
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
                p = self._calibrated(key, float(probs[key][i]))
                models.append(
                    {
                        "key": key,
                        "name": name,
                        "defaultProbability": round(p, 4),
                        "suggestion": self.thresholds.suggest(p),
                        "topFactors": _top_factors(contribs[key][i], X.iloc[i], self.features, top),
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
                    "shap": self._waterfall(xgb_all[i], X.iloc[i]),
                }
            )
        return results

    def _waterfall(self, contribs: np.ndarray, row: pd.Series, top: int = 8) -> dict:
        """What a SHAP waterfall needs for the XGBoost model, for one application.

        Scale: log-odds of default, after the same Platt calibration as XGBoost's displayed
        chance of default. TreeSHAP gives raw log-odds (bias + one value per feature = the raw
        margin); the calibrator maps the margin linearly (slope a, intercept b), so every value
        is multiplied by a and the base shifted to a*bias + b. They still add up exactly:
        baseValue + sum(factors) + otherFeatures = output, and sigmoid(output) is the XGBoost
        model's displayed chance of default. Positive values push toward default.
        """
        cal = self.calibrators.get("xgboost")
        a, b = (float(cal.coef_[0][0]), float(cal.intercept_[0])) if cal is not None else (1.0, 0.0)
        values = contribs[:-1] * a
        base = float(contribs[-1]) * a + b
        order = np.argsort(-np.abs(values))
        kept = [j for j in order[:top] if abs(values[j]) > 1e-9]
        rest = float(sum(values[j] for j in order[top:]))
        output = base + float(values.sum())
        return {
            "model": "xgboost",
            "scale": "log-odds",
            "baseValue": round(base, 4),
            "factors": [
                {"feature": self.features[j], "label": FEATURE_LABELS[self.features[j]], "value": round(float(row[self.features[j]]), 4), "shap": round(float(values[j]), 4)}
                for j in kept
            ],
            "otherFeatures": round(rest, 4),
            "output": round(output, 4),
            "outputProbability": round(float(1 / (1 + np.exp(-output))), 4),
        }


def to_logit(p):
    p = np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def fit_calibrator(raw_scores: np.ndarray, y: np.ndarray) -> LogisticRegression:
    """Platt scaling: learns how a class-weighted score maps to the real default rate."""
    return LogisticRegression().fit(to_logit(raw_scores).reshape(-1, 1), y)


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
                "direction": "raises risk" if v > 0 else "lowers risk",
            }
        )
    return out
