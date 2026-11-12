import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app as service  # noqa: E402
from uedi_ml.early_warning import generate_sample, level  # noqa: E402

STEADY = {
    "id": "steady", "months_since_last_contribution": 0, "contributions_missed_3m": 0, "contribution_rate_12m": 1,
    "has_plan": 1, "payment_ratio_90d": 1, "days_since_last_payment": 10, "missed_deductions_6m": 0,
    "installment_to_net_pay": 0.2, "balance_ratio": 0.5, "loan_age_months": 8, "prior_late_rate": 0,
    "meeting_attendance_12m": 0.9, "bills_late_rate_12m": 0, "co_makers": 2, "on_amnesty": 0,
}
# Stopped saving three months ago, skipping meetings, bills late: no loan payment missed yet.
SLIPPING = {**STEADY, "id": "slipping", "months_since_last_contribution": 4, "contributions_missed_3m": 3,
            "contribution_rate_12m": 0.4, "installment_to_net_pay": 0.55, "meeting_attendance_12m": 0.1,
            "bills_late_rate_12m": 0.6, "prior_late_rate": 0.5, "co_makers": 0}


@pytest.fixture(scope="module")
def client():
    if not service.EW_PATH.exists():
        pytest.skip("Run train_early_warning.py first")
    return TestClient(service.app)


def test_sample_has_realistic_rate_and_unknowns():
    d = generate_sample(2000)
    assert 0.05 < d["missed_next_60d"].mean() < 0.25
    assert d["contribution_rate_12m"].isna().any(), "members without a plan stay unknown"


def test_levels():
    assert level(0.05) == "low" and level(0.2) == "watch" and level(0.6) == "high"


def test_scores_a_slipping_borrower_higher_with_savings_reasons(client):
    r = client.post("/early-warning/score", json={"loans": [STEADY, SLIPPING, {"id": "unknowns"}]})
    assert r.status_code == 200
    res = {x["id"]: x for x in r.json()["results"]}
    assert res["slipping"]["probability"] > res["steady"]["probability"] * 3
    assert res["slipping"]["level"] in {"watch", "high"}
    assert res["slipping"]["reasons"] and all(x["text"] for x in res["slipping"]["reasons"])
    assert 0 <= res["unknowns"]["probability"] <= 1, "all-null snapshots still score"


def test_model_info_and_bad_input(client):
    m = client.get("/early-warning/model").json()
    assert m["horizonDays"] == 60 and m["trainedOn"] == "sample"
    assert client.post("/early-warning/score", json={"loans": [{"id": "x", "balance_ratio": 9}]}).status_code == 422
