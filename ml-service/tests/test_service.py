import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app as service  # noqa: E402

GOOD = {
    "age": 42, "employmentType": "wage", "monthlyIncome": 40000, "existingMonthlyDebt": 1000,
    "loanAmount": 50000, "termMonths": 24, "annualRate": 12, "yearsAsMember": 12,
    "priorLoans": 5, "priorLatePayments": 0, "hasCoMaker": True, "hasRetirementPlan": True,
    "documentsFlagged": 0,
}
RISKY = {
    **GOOD, "employmentType": "informal", "monthlyIncome": 12000, "existingMonthlyDebt": 4000,
    "loanAmount": 150000, "yearsAsMember": 0, "priorLoans": 4, "priorLatePayments": 3,
    "hasCoMaker": False, "hasRetirementPlan": False, "documentsFlagged": 2,
}


@pytest.fixture(scope="module")
def client():
    if not service.MODEL_PATH.exists():
        pytest.skip("Run train.py first")
    return TestClient(service.app)


def test_predict_returns_all_three_models_and_ensemble(client):
    r = client.post("/predict", json=GOOD)
    assert r.status_code == 200
    body = r.json()
    assert [m["key"] for m in body["models"]] == ["xgboost", "random_forest", "logistic_regression"]
    for m in body["models"] + [body["ensemble"]]:
        assert 0 <= m["defaultProbability"] <= 1
        assert m["suggestion"] in {"approve", "review", "deny"}
    assert all(m["topFactors"] for m in body["models"])


def test_risky_applicant_scores_higher(client):
    good = client.post("/predict", json=GOOD).json()["ensemble"]["defaultProbability"]
    risky = client.post("/predict", json=RISKY).json()["ensemble"]["defaultProbability"]
    assert risky > good
    assert client.post("/predict", json=RISKY).json()["ensemble"]["suggestion"] == "deny"
    assert client.post("/predict", json=GOOD).json()["ensemble"]["suggestion"] == "approve"


def test_rejects_bad_input(client):
    assert client.post("/predict", json={**GOOD, "monthlyIncome": -5}).status_code == 422
    assert client.post("/predict", json={**GOOD, "priorLatePayments": 9}).status_code == 422


def test_model_metrics(client):
    m = client.get("/model").json()
    assert set(m["models"]) == {"xgboost", "random_forest", "logistic_regression", "ensemble"}
    assert m["validation"].startswith("5-fold")
