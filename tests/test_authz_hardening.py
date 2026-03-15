from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth import bootstrap_users
from app.cases import upsert_cases_from_findings
from app.main import app


def _login(client: TestClient, username: str, password: str) -> dict:
    response = client.post(
        "/auth/token",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200
    return response.json()


def test_compliance_requires_authentication() -> None:
    client = TestClient(app)
    response = client.get("/compliance")
    assert response.status_code == 401


def test_auditor_cannot_update_case_status() -> None:
    bootstrap_users()
    client = TestClient(app)
    token = _login(client, "auditor", "Audit@12345")["access_token"]

    # Use a dummy case id; auth check should run before not-found check.
    response = client.patch(
        "/cases/CASE-NOT-REAL/status",
        json={"status": "closed", "updated_by": "auditor"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_chat_endpoint_requires_auth_in_openapi_contract() -> None:
    client = TestClient(app)
    response = client.get("/openapi.json")
    assert response.status_code == 200
    spec = response.json()

    chat_post = spec["paths"]["/cases/{case_id}/chat"]["post"]
    assert "security" in chat_post
    assert chat_post["security"]


def test_auditor_case_response_redacts_vendor_name() -> None:
    bootstrap_users()
    upsert_cases_from_findings([
        {
            "risk_type": "duplicate_invoice",
            "vendor": "Hidden Vendor Pvt Ltd",
            "vendor_id": "v_hidden_001",
            "pathway": ["Vendor", "Invoice"],
            "evidence": ["Duplicate invoice pattern detected"],
            "policy_violation": "Duplicate invoice submissions must be blocked",
            "effect": "Potential double payment",
            "recommendation": "Pause payout and review",
            "graph_path": ["v_hidden_001", "i_1"],
            "governance_area": "Payments",
            "control_ids": ["CTRL-DUP-006"],
            "root_cause": "Invoice control gap",
        }
    ])

    client = TestClient(app)
    token = _login(client, "auditor", "Audit@12345")["access_token"]
    response = client.get("/cases", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    cases = response.json()["cases"]
    assert cases

    target = next((c for c in cases if c.get("vendor_id") == "v_hidden_001"), None)
    assert target is not None
    assert target["vendor"] == "v_hidden_001"
