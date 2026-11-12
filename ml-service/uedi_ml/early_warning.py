"""Early warning: the chance that an ACTIVE loan misses a payment in the next 60 days, so the
office can reach the borrower before it happens. A second use of the same pipeline as the
application model: XGBoost with TreeSHAP explanations, checked with stratified cross-validation,
next to a Logistic Regression baseline.

The inputs are what the system already records about a borrower month by month: savings
(retirement plan contributions), loan payments and payroll deductions, meeting attendance,
utility/load bill payments and co-makers. A member who stops their savings deposits is the
classic early sign; the model sees that before any loan payment is missed.

Missing values (no plan, no meetings held, no bills recorded) are left as NaN: XGBoost learns
what "unknown" means instead of us guessing a number.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler

# Feature, label for staff, and the sentence used when it raises the risk.
FEATURES: dict[str, tuple[str, str]] = {
    "months_since_last_contribution": ("Months since the last savings deposit", "No savings deposit in {v:.0f} month(s)."),
    "contributions_missed_3m": ("Savings deposits missed in the last 3 months", "Missed {v:.0f} of the last 3 monthly savings deposits."),
    "contribution_rate_12m": ("Share of months with a savings deposit (12 months)", "Saved in only {p} of the last 12 months."),
    "has_plan": ("Has a retirement plan", "Has no savings plan with UDEI."),
    "payment_ratio_90d": ("Paid vs due, last 90 days", "Paid only {p} of what was due in the last 90 days."),
    "days_since_last_payment": ("Days since the last loan payment", "No loan payment in {v:.0f} days."),
    "missed_deductions_6m": ("Missed or partial payroll deductions (6 months)", "{v:.0f} missed or partial payroll deduction(s) in 6 months."),
    "installment_to_net_pay": ("Installment vs net take-home pay", "The installment takes {p} of take-home pay."),
    "balance_ratio": ("Share of the loan still unpaid", "{p} of the loan is still unpaid."),
    "loan_age_months": ("Months since release", "Early in the loan ({v:.0f} months in)."),
    "prior_late_rate": ("Late payment rate on past loans", "Was late on {p} of past loans."),
    "meeting_attendance_12m": ("Meetings attended (12 months)", "Attended {p} of member meetings in the last 12 months."),
    "bills_late_rate_12m": ("Utility/load bills paid late (12 months)", "Paid {p} of recorded utility or load bills late."),
    "co_makers": ("Co-makers on the loan", "Has {v:.0f} co-maker(s) vouching for the loan."),
    "on_amnesty": ("On amnesty for an earlier loan", "Was put on amnesty for an earlier loan."),
}
FEATURE_NAMES = list(FEATURES)

# Risk levels shown to staff.
WATCH = 0.15
HIGH = 0.35


def level(p: float) -> str:
    return "high" if p >= HIGH else "watch" if p >= WATCH else "low"


def generate_sample(rows: int = 4000, seed: int = 7) -> pd.DataFrame:
    """SAMPLE monthly snapshots of active loans with the outcome 60 days later.

    Synthetic, built around one hidden "financial stress" value per borrower that drives both
    the early signs (savings stop, bills late, meetings skipped) and later missed payments.
    Replace with real snapshots from server/scripts/export-early-warning.js when there is history.
    """
    rng = np.random.default_rng(seed)
    stress = rng.normal(0, 1, rows)
    has_plan = (rng.random(rows) < 0.85).astype(float)

    months_since = np.where(has_plan == 1, np.clip(rng.poisson(np.exp(-1.2 + 0.9 * stress.clip(-2, 3))), 0, 24), np.nan)
    missed3 = np.where(has_plan == 1, np.clip(np.round(months_since * 0.8 + rng.normal(0, 0.4, rows)), 0, 3), np.nan)
    rate12 = np.where(has_plan == 1, np.clip(0.95 - 0.12 * stress + rng.normal(0, 0.08, rows), 0, 1), np.nan)
    pay_ratio = np.clip(1.02 - 0.18 * np.maximum(stress - 0.3, 0) + rng.normal(0, 0.06, rows), 0, 1.3)
    days_since_pay = np.clip(rng.normal(15 + 20 * np.maximum(stress, 0), 8, rows), 0, 365)
    missed_ded = np.clip(rng.poisson(np.maximum(0.05 + 0.6 * np.maximum(stress - 0.5, 0), 0)), 0, 12)
    inst_ratio = np.clip(rng.normal(0.28 + 0.06 * stress, 0.08, rows), 0.02, 1.2)
    balance_ratio = rng.uniform(0.05, 1, rows)
    loan_age = np.round(rng.uniform(0, 24, rows))
    prior_late = np.clip(rng.beta(1, 8, rows) + 0.08 * np.maximum(stress, 0), 0, 1)
    meetings_held = rng.random(rows) < 0.8
    attendance = np.where(meetings_held, np.clip(0.75 - 0.15 * stress + rng.normal(0, 0.15, rows), 0, 1), np.nan)
    bills_recorded = rng.random(rows) < 0.5
    bills_late = np.where(bills_recorded, np.clip(0.08 + 0.12 * stress + rng.normal(0, 0.08, rows), 0, 1), np.nan)
    co_makers = rng.choice([0, 1, 2], rows, p=[0.15, 0.45, 0.4]).astype(float)
    amnesty = (rng.random(rows) < 0.04 + 0.05 * (stress > 1)).astype(float)

    logit = (
        -3.4
        + 0.55 * np.nan_to_num(missed3, nan=1.0)
        + 0.10 * np.nan_to_num(months_since, nan=2.0)
        - 1.4 * (np.nan_to_num(rate12, nan=0.6) - 0.85)
        - 3.0 * (pay_ratio - 1.0)
        + 0.012 * days_since_pay
        + 0.55 * missed_ded
        + 2.4 * (inst_ratio - 0.3)
        + 1.6 * prior_late
        - 0.9 * (np.nan_to_num(attendance, nan=0.6) - 0.6)
        + 1.4 * np.nan_to_num(bills_late, nan=0.1)
        - 0.25 * co_makers
        + 0.9 * amnesty
        + 0.6 * (loan_age < 3)
        + rng.normal(0, 0.5, rows)
    )
    missed_next_60d = (rng.random(rows) < 1 / (1 + np.exp(-logit))).astype(int)

    return pd.DataFrame({
        "months_since_last_contribution": months_since,
        "contributions_missed_3m": missed3,
        "contribution_rate_12m": rate12,
        "has_plan": has_plan,
        "payment_ratio_90d": pay_ratio,
        "days_since_last_payment": days_since_pay,
        "missed_deductions_6m": missed_ded.astype(float),
        "installment_to_net_pay": inst_ratio,
        "balance_ratio": balance_ratio,
        "loan_age_months": loan_age,
        "prior_late_rate": prior_late,
        "meeting_attendance_12m": attendance,
        "bills_late_rate_12m": bills_late,
        "co_makers": co_makers,
        "on_amnesty": amnesty,
        "missed_next_60d": missed_next_60d,
    })


def _xgb(pos_weight: float = 1.0) -> xgb.XGBClassifier:
    # Not class-weighted, so the output stays a usable chance (the share of loans that go bad).
    return xgb.XGBClassifier(
        n_estimators=250, max_depth=3, learning_rate=0.05, subsample=0.9, colsample_bytree=0.9,
        min_child_weight=3, eval_metric="logloss", scale_pos_weight=pos_weight, n_jobs=2, random_state=7,
    )


def _baseline():
    return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(max_iter=1000))


def _scores(y, p, threshold=HIGH):
    pred = (p >= threshold).astype(int)
    return {
        "aucRoc": round(float(roc_auc_score(y, p)), 4),
        "averagePrecision": round(float(average_precision_score(y, p)), 4),
        "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y, pred, zero_division=0)), 4),
    }


@dataclass
class EarlyWarningModel:
    model: xgb.XGBClassifier
    metrics: dict = field(default_factory=dict)
    features: list[str] = field(default_factory=lambda: list(FEATURE_NAMES))

    @classmethod
    def train(cls, data: pd.DataFrame, source: str, folds: int = 5) -> "EarlyWarningModel":
        X = data[FEATURE_NAMES].astype(float)
        y = data["missed_next_60d"].astype(int).to_numpy()
        cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=7)
        oof = np.zeros(len(y))
        oof_base = np.zeros(len(y))
        for tr, te in cv.split(X, y):
            oof[te] = _xgb().fit(X.iloc[tr], y[tr]).predict_proba(X.iloc[te])[:, 1]
            oof_base[te] = _baseline().fit(X.iloc[tr], y[tr]).predict_proba(X.iloc[te])[:, 1]
        model = _xgb().fit(X, y)
        flagged = oof >= HIGH
        metrics = {
            "name": "Early warning (XGBoost)",
            "trainedOn": source,
            "rows": int(len(y)),
            "positiveRate": round(float(y.mean()), 4),
            "horizonDays": 60,
            "thresholds": {"watch": WATCH, "high": HIGH},
            "folds": folds,
            "xgboost": _scores(y, oof),
            "logisticBaseline": _scores(y, oof_base),
            # How much of the trouble the "high" list catches, and how full it is.
            "flaggedShare": round(float(flagged.mean()), 4),
            "features": [{"key": k, "label": FEATURES[k][0]} for k in FEATURE_NAMES],
        }
        return cls(model=model, metrics=metrics)

    def score(self, rows: pd.DataFrame, top: int = 3) -> list[dict]:
        X = rows.reindex(columns=self.features).astype(float)
        p = self.model.predict_proba(X)[:, 1]
        # TreeSHAP contributions (log-odds); the last column is the bias.
        contrib = self.model.get_booster().predict(xgb.DMatrix(X, missing=np.nan), pred_contribs=True)[:, :-1]
        out = []
        for i in range(len(X)):
            order = np.argsort(-contrib[i])
            reasons = []
            for j in order[:top]:
                if contrib[i, j] <= 0.02:
                    break
                name = self.features[j]
                v = X.iloc[i, j]
                if np.isnan(v):
                    continue
                reasons.append({
                    "feature": name,
                    "label": FEATURES[name][0],
                    "value": round(float(v), 4),
                    "impact": round(float(contrib[i, j]), 4),
                    "text": FEATURES[name][1].format(v=v, p=f"{round(v * 100)}%"),
                })
            out.append({"probability": round(float(p[i]), 4), "level": level(float(p[i])), "reasons": reasons})
        return out
