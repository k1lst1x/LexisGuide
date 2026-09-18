from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_returns_typed_empty_result() -> None:
    response = client.post("/api/v1/analyze", json={"document_text": "Example agreement."})

    assert response.status_code == 200
    assert response.json()["findings"] == []
