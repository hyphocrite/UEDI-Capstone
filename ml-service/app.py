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
    age: int = Field(ge=18, le=100)
    employmentType: Literal["wage", "self", "informal", "other"]
    monthlyIncome: float = Field(gt=0)
    existingMonthlyDebt: float = Field(ge=0, default=0)
    loanAmount: float = Field(gt=0)
    termMonths: int = Field(ge=1, le=120)
    annualRate: float = Field(ge=0, le=100)
    yearsAsMember: float = Field(ge=0, default=0)
    priorLoans: int = Field(ge=0, default=0)
    priorLatePayments: int = Field(ge=0, default=0)
    hasCoMaker: bool = False
    hasRetirementPlan: bool = False
    documentsFlagged: int = Field(ge=0, default=0)


@app.get("/health")
def health():
    return {"ok": True, "modelLoaded": MODEL_PATH.exists()}


@app.get("/model")
def model_info():
    return get_model().metrics


@app.post("/predict")
def predict(applicant: Applicant):
    if applicant.priorLatePayments > applicant.priorLoans:
        raise HTTPException(422, "priorLatePayments cannot exceed priorLoans.")
    model = get_model()
    row = pd.DataFrame([applicant.model_dump()])
    return model.explain(row)[0]
