from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


def test_auth_me_requires_authentication() -> None:
    client = TestClient(app)
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_cases_requires_authentication() -> None:
    client = TestClient(app)
    response = client.get("/cases")
    assert response.status_code == 401