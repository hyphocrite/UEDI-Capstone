"""UEDI loan-risk service. Express calls it; the browser never does.

    python -m uvicorn app:app --port 8000
"""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from uedi_ml.early_warning import FEATURE_NAMES as EW_FEATURES, EarlyWarningModel
from uedi_ml.model import LoanRiskModel

MODEL_PATH = Path(os.getenv("MODEL_PATH", Path(__file__).parent / "models" / "model.joblib"))
# benchmark.py and plot_results.py write their results next to the model.
BENCHMARKS = {"german_credit": "German Credit (1,000 real loans)", "sample_loans": "UEDI-shaped sample loans"}

_model: LoanRiskModel | None = None
EW_PATH = MODEL_PATH.parent / "early_warning.joblib"
_ew: EarlyWarningModel | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Load the model and run one prediction at startup, so the first real request isn't slow.
    # On Render's free CPU the first SHAP call can take longer than the API is willing to wait.
    try:
        predict(Applicant(loanType="long_term", loanAmount=10000, termMonths=12, monthlyRate=2, monthlySalary=20000, netTakeHomePay=15000))
        print("Model loaded and warmed up.")
    except Exception as err:  # noqa: BLE001 - a missing model must not stop the service from starting
        print(f"Model warm-up skipped: {err}")
    try:
        early_warning_score(EarlyWarningBatch(loans=[LoanSnapshot(id="warm-up")]))
        print("Early-warning model loaded.")
    except Exception as err:  # noqa: BLE001
        print(f"Early-warning warm-up skipped: {err}")
    yield


app = FastAPI(title="UEDI loan-risk service", lifespan=lifespan)


def get_model() -> LoanRiskModel:
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise HTTPException(503, "No trained model yet. Run `python train.py` first.")
        _model = joblib.load(MODEL_PATH)
    return _model


class Applicant(BaseModel):
    """One Mutual Assistance application, in the fields of UEDI's form."""

    # From the applicant's part of the form
    loanType: Literal["long_term", "emergency"]
    loanAmount: float = Field(gt=0)
    termMonths: int = Field(ge=1, le=120)
    monthlyRate: float = Field(ge=0, le=10, description="% per month")
    monthlySalary: float = Field(gt=0)
    netTakeHomePay: float = Field(gt=0)
    # From the bookkeeper's part and UEDI's records
    longTermBalance: float = Field(ge=0, default=0)
    shortTermBalance: float = Field(ge=0, default=0)
    yearsAsMember: float = Field(ge=0, default=0)
    priorLoans: int = Field(ge=0, default=0)
    priorLatePayments: int = Field(ge=0, default=0)
    age: int | None = Field(default=None, ge=18, le=100)
    employmentStatus: Literal["permanent", "temporary", "contractual", "job_order"] = "permanent"
    documentsFlagged: int = Field(ge=0, default=0)


@app.get("/health")
def health():
    return {"ok": True, "modelLoaded": _model is not None, "modelFile": MODEL_PATH.exists(), "earlyWarningFile": EW_PATH.exists()}


def get_ew() -> EarlyWarningModel:
    global _ew
    if _ew is None:
        if not EW_PATH.exists():
            raise HTTPException(503, "No early-warning model yet. Run `python train_early_warning.py` first.")
        _ew = joblib.load(EW_PATH)
    return _ew


class LoanSnapshot(BaseModel):
    """What the server knows about one active loan and its borrower today. Unknowns are null."""

    id: str
    months_since_last_contribution: float | None = Field(default=None, ge=0, le=240)
    contributions_missed_3m: float | None = Field(default=None, ge=0, le=3)
    contribution_rate_12m: float | None = Field(default=None, ge=0, le=1)
    has_plan: float | None = Field(default=None, ge=0, le=1)
    payment_ratio_90d: float | None = Field(default=None, ge=0, le=10)
    days_since_last_payment: float | None = Field(default=None, ge=0, le=3650)
    missed_deductions_6m: float | None = Field(default=None, ge=0, le=24)
    installment_to_net_pay: float | None = Field(default=None, ge=0, le=10)
    balance_ratio: float | None = Field(default=None, ge=0, le=1.5)
    loan_age_months: float | None = Field(default=None, ge=0, le=600)
    prior_late_rate: float | None = Field(default=None, ge=0, le=1)
    meeting_attendance_12m: float | None = Field(default=None, ge=0, le=1)
    bills_late_rate_12m: float | None = Field(default=None, ge=0, le=1)
    co_makers: float | None = Field(default=None, ge=0, le=5)
    on_amnesty: float | None = Field(default=None, ge=0, le=1)


class EarlyWarningBatch(BaseModel):
    loans: list[LoanSnapshot] = Field(max_length=5000)


@app.get("/early-warning/model")
def early_warning_model():
    return get_ew().metrics


@app.post("/early-warning/score")
def early_warning_score(batch: EarlyWarningBatch):
    model = get_ew()
    if not batch.loans:
        return {"results": [], "version": model.metrics.get("version")}
    rows = pd.DataFrame([{k: (v if v is not None else float("nan")) for k, v in s.model_dump(exclude={"id"}).items()} for s in batch.loans], columns=EW_FEATURES)
    scored = model.score(rows)
    return {"results": [{"id": s.id, **r} for s, r in zip(batch.loans, scored)], "version": model.metrics.get("version")}


@app.get("/model")
def model_info():
    return get_model().metrics


@app.get("/benchmark")
def benchmark():
    """The 8-classifier comparison from benchmark.py and plot_results.py, for the Credit Model page."""
    out_dir = MODEL_PATH.parent
    datasets = []
    for key, name in BENCHMARKS.items():
        path = out_dir / f"benchmark_{key}_weights.json"
        if path.exists():
            datasets.append({"key": key, "name": name, **json.loads(path.read_text())})
    if not datasets:
        raise HTTPException(404, "No benchmark yet. Run benchmark.py, then plot_results.py (see ml-service/README.md).")
    matrices = out_dir / "figures" / "confusion_matrices.json"
    return {"datasets": datasets, "confusion": json.loads(matrices.read_text()) if matrices.exists() else None}


@app.post("/reload")
def reload_model():
    """Loads a freshly trained model without restarting the service."""
    global _model, _ew
    _model = None
    _ew = None
    return {"version": get_model().metrics.get("version")}


@app.post("/predict")
def predict(applicant: Applicant):
    if applicant.priorLatePayments > applicant.priorLoans:
        raise HTTPException(422, "priorLatePayments cannot exceed priorLoans.")
    if applicant.netTakeHomePay > applicant.monthlySalary * 1.05:
        raise HTTPException(422, "netTakeHomePay cannot be more than monthlySalary.")
    model = get_model()
    row = pd.DataFrame([applicant.model_dump(exclude_none=True)])
    return model.explain(row)[0]
