import json
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


def test_predict_returns_each_member_and_ensemble(client):
    r = client.post("/predict", json=GOOD)
    assert r.status_code == 200
    body = r.json()
    assert [m["key"] for m in body["models"]] == client.get("/model").json()["members"]
    for m in body["models"] + [body["ensemble"]]:
        assert 0 <= m["creditScore"] <= 100
        assert m["suggestion"] in {"approve", "review", "deny"}
    assert all(m["topFactors"] for m in body["models"])


def test_risky_applicant_scores_lower(client):
    good = client.post("/predict", json=GOOD).json()["ensemble"]
    risky = client.post("/predict", json=RISKY).json()["ensemble"]
    assert risky["creditScore"] < good["creditScore"]
    assert risky["suggestion"] == "deny"
    assert good["suggestion"] == "approve"


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
    assert m["task"] == "regression" and m["target"] == "repaymentScore"
    assert set(m["models"]) == set(m["members"]) | {"ensemble"}
    for v in m["models"].values():
        assert {"mae", "rmse", "r2"} <= set(v)
    assert "fold cross-validation" in m["validation"]
    assert m["thresholds"]["deny"] < m["thresholds"]["approve"]
    assert {"typeIRate", "typeIIRate", "matrix"} <= set(m["errorTypes"])
    assert "deduction_ratio" in m["features"]


def test_benchmark(client, tmp_path, monkeypatch):
    monkeypatch.setattr(service, "MODEL_PATH", tmp_path / "model.joblib")
    assert client.get("/benchmark").status_code == 404
    row = {"model": "XGBoost", "mae": 16.0, "maeSd": 0.5, "rmse": 22.5, "rmseSd": 0.6, "r2": 0.26, "r2Sd": 0.03}
    (tmp_path / "benchmark_sample_loans.json").write_text(json.dumps({"rows": 3000, "results": [row]}))
    body = client.get("/benchmark").json()
    assert [d["key"] for d in body["datasets"]] == ["sample_loans"]
    assert body["datasets"][0]["results"] == [row]
    assert body["errorTypes"] is None


def test_shap_waterfall_adds_up_to_the_ensemble_score(client):
    body = client.post("/predict", json=RISKY).json()
    w = body["shap"]
    assert w["model"] == "ensemble" and w["scale"] == "points"
    assert 0 < len(w["factors"]) <= 8
    assert all(f["label"] and isinstance(f["shap"], float) for f in w["factors"])
    total = w["baseValue"] + sum(f["shap"] for f in w["factors"]) + w["otherFeatures"]
    assert abs(total - w["output"]) < 1e-2, "base value plus every SHAP value equals the ensemble's score"
    assert abs(w["creditScore"] - body["ensemble"]["creditScore"]) < 1e-2
    sizes = [abs(f["shap"]) for f in w["factors"]]
    assert sizes == sorted(sizes, reverse=True)


def test_ensemble_shap_is_exact_before_any_correction(client):
    """The weighted sum of the members' SHAP values reproduces the ensemble's prediction."""
    import pandas as pd
    from uedi_ml.features import build_features

    model = service.get_model()
    X = build_features(pd.DataFrame([GOOD, RISKY]), model.features)
    values, base, _ = model.ensemble_shap(X)
    assert abs(base + values.sum(axis=1) - model.stack.predict(X)).max() < 0.05


def test_metrics_have_a_shap_summary(client):
    metrics = client.get("/model").json()
    imp = metrics["globalImportance"]
    assert imp and all(i["label"] and i["meanAbsShap"] >= 0 for i in imp)
    assert [i["meanAbsShap"] for i in imp] == sorted((i["meanAbsShap"] for i in imp), reverse=True)
