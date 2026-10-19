"""UEDI loan-risk service. Express calls it; the browser never does.

    python -m uvicorn app:app --port 8000
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from uedi_ml.model import LoanRiskModel

MODEL_PATH = Path(os.getenv("MODEL_PATH", Path(__file__).parent / "models" / "model.joblib"))

app = FastAPI(title="UEDI loan-risk service")
_model: LoanRiskModel | None = None


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
    return {"ok": True, "modelLoaded": MODEL_PATH.exists()}


@app.get("/model")
def model_info():
    return get_model().metrics


@app.post("/reload")
def reload_model():
    """Loads a freshly trained model without restarting the service."""
    global _model
    _model = None
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
