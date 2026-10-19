import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app as service  # noqa: E402

GOOD = {
    "loanType": "long_term", "loanAmount": 40000, "termMonths": 24, "monthlyRate": 1.0,
    "monthlySalary": 55000, "netTakeHomePay": 42000, "longTermBalance": 0, "shortTermBalance": 0,
    "yearsAsMember": 20, "priorLoans": 8, "priorLatePayments": 0, "age": 45,
    "employmentStatus": "permanent", "documentsFlagged": 0,
}
RISKY = {
    **GOOD, "loanAmount": 150000, "termMonths": 36, "monthlySalary": 16000, "netTakeHomePay": 6000,
    "longTermBalance": 40000, "shortTermBalance": 8000, "yearsAsMember": 1, "priorLoans": 4,
    "priorLatePayments": 3, "employmentStatus": "job_order", "documentsFlagged": 2,
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
    assert client.post("/predict", json={**GOOD, "monthlySalary": -5}).status_code == 422
    assert client.post("/predict", json={**GOOD, "priorLatePayments": 9}).status_code == 422
    assert client.post("/predict", json={**GOOD, "netTakeHomePay": 90000}).status_code == 422
    assert client.post("/predict", json={**GOOD, "loanType": "regular"}).status_code == 422


def test_only_form_fields_are_required(client):
    minimal = {k: GOOD[k] for k in ["loanType", "loanAmount", "termMonths", "monthlyRate", "monthlySalary", "netTakeHomePay"]}
    assert client.post("/predict", json=minimal).status_code == 200


def test_model_metrics(client):
    m = client.get("/model").json()
    assert set(m["models"]) == {"xgboost", "random_forest", "logistic_regression", "ensemble"}
    assert "fold stratified" in m["validation"]
    assert m["thresholds"]["approve"] < m["thresholds"]["deny"]
    assert "deduction_ratio" in m["features"]
