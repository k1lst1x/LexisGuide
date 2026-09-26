from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import routes


def test_analyze_rejects_empty_document(authenticated_client: TestClient) -> None:
    response = authenticated_client.post("/api/v1/analyze", json={"document_text": ""})

    assert response.status_code == 422


def test_analyze_rejects_documents_above_the_contract_limit(
    authenticated_client: TestClient,
) -> None:
    response = authenticated_client.post("/api/v1/analyze", json={"document_text": "a" * 250_001})

    assert response.status_code == 422


def test_analyze_returns_legal_disclaimer(authenticated_client: TestClient) -> None:
    response = authenticated_client.post(
        "/api/v1/analyze", json={"document_text": "Example agreement."}
    )

    assert response.status_code == 200
    assert response.json() == {
        "findings": [],
        "disclaimer": "LexisGuide provides general information, not legal advice.",
    }


def test_analyze_rejects_requests_when_the_ai_review_quota_is_exhausted(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class UnexpectedAgent:
        def review(self, *_: object, **__: object) -> dict[str, object]:
            raise AssertionError("The model must not be called after rate limiting.")

    monkeypatch.setattr(routes, "configured_agent", lambda: UnexpectedAgent())
    monkeypatch.setattr(routes, "consume_review_quota", lambda _: False)

    response = authenticated_client.post(
        "/api/v1/analyze", json={"document_text": "Example agreement."}
    )

    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
    assert response.json() == {"detail": "Review limit reached. Please try again shortly."}


def test_analyze_reserves_quota_for_a_configured_agent(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Agent:
        def review(self, *_: object, **__: object) -> dict[str, object]:
            return {
                "findings": [],
                "disclaimer": "LexisGuide provides general information, not legal advice.",
            }

    quota_subjects: list[str] = []
    releases: list[object] = []
    lease = object()
    monkeypatch.setattr(routes, "configured_agent", lambda: Agent())
    monkeypatch.setattr(
        routes, "consume_review_quota", lambda subject: quota_subjects.append(subject) or True
    )
    monkeypatch.setattr(routes, "acquire_remote_operation", lambda _: lease)
    monkeypatch.setattr(routes, "release_remote_operation", releases.append)

    response = authenticated_client.post(
        "/api/v1/analyze", json={"document_text": "Example agreement."}
    )

    assert response.status_code == 200
    assert quota_subjects == ["user-123"]
    assert releases == [lease]


def test_analyze_rejects_when_shared_remote_capacity_is_full(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class UnexpectedAgent:
        def review(self, *_: object, **__: object) -> dict[str, object]:
            raise AssertionError("The model must not be called when shared capacity is full.")

    monkeypatch.setattr(routes, "configured_agent", lambda: UnexpectedAgent())
    monkeypatch.setattr(routes, "consume_review_quota", lambda _: True)
    monkeypatch.setattr(routes, "acquire_remote_operation", lambda _: None)

    response = authenticated_client.post(
        "/api/v1/analyze", json={"document_text": "Example agreement."}
    )

    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
    assert response.json() == {"detail": "The AI service is busy. Please try again shortly."}


def test_protected_routes_reject_requests_without_a_bearer_token(client: TestClient) -> None:
    response = client.get("/api/v1/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token."}


def test_analyze_rejects_requests_without_a_bearer_token(client: TestClient) -> None:
    response = client.post("/api/v1/analyze", json={"document_text": "Example agreement."})

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token."}


def test_targeted_rewrite_validates_evidence_before_calling_the_model(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class UnexpectedAgent:
        def review(self, *_: object, **__: object) -> dict[str, object]:
            raise AssertionError("The model must not be called for stale evidence.")

    monkeypatch.setattr(routes, "configured_agent", lambda: UnexpectedAgent())
    response = authenticated_client.post(
        "/api/v1/agent/targeted-rewrite",
        json={
            "document_text": "Current clause.",
            "finding_id": "finding-1",
            "evidence": "Old clause.",
        },
    )

    assert response.status_code == 409


def test_targeted_rewrite_returns_a_structured_replacement(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    replacement = "Either party may terminate with 30 days' written notice."

    class Agent:
        def review(self, *_: object, **__: object) -> dict[str, object]:
            return {
                "findings": [
                    {
                        "title": "Clear notice",
                        "explanation": "Draft",
                        "severity": "medium",
                        "suggested_rewrite": replacement,
                    }
                ],
                "disclaimer": "LexisGuide provides general information, not legal advice.",
                "summary": "Added a written notice period.",
            }

    monkeypatch.setattr(routes, "configured_agent", lambda: Agent())
    monkeypatch.setattr(routes, "consume_review_quota", lambda _: True)
    monkeypatch.setattr(routes, "acquire_remote_operation", lambda _: object())
    monkeypatch.setattr(routes, "release_remote_operation", lambda _: None)
    response = authenticated_client.post(
        "/api/v1/agent/targeted-rewrite",
        json={
            "document_text": "Either party may terminate.",
            "finding_id": "finding-1",
            "evidence": "Either party may terminate.",
        },
    )

    assert response.status_code == 200
    assert response.json()["replacement_text"] == replacement


def test_local_frontend_origin_receives_cors_headers(client: TestClient) -> None:
    response = client.options(
        "/api/v1/analyze",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_github_pages_origin_receives_cors_headers(client: TestClient) -> None:
    response = client.options(
        "/api/v1/analyze",
        headers={
            "Origin": "https://k1lst1x.github.io",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://k1lst1x.github.io"


def test_profile_defaults_to_token_name_when_not_stored(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(routes, "get_profile", lambda _: None)

    response = authenticated_client.get("/api/v1/me")

    assert response.status_code == 200
    assert response.json() == {
        "sub": "user-123",
        "email": "person@example.com",
        "display_name": "Person",
    }


def test_profile_update_persists_authenticated_users_data(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, Any] = {}

    def fake_put_profile(user_id: str, profile: dict[str, Any]) -> dict[str, Any]:
        captured["user_id"] = user_id
        captured["profile"] = profile
        return {"PK": "USER#user-123", "SK": "PROFILE", **profile}

    monkeypatch.setattr(routes, "put_profile", fake_put_profile)

    response = authenticated_client.put("/api/v1/me", json={"display_name": "Ada Lovelace"})

    assert response.status_code == 200
    assert response.json()["display_name"] == "Ada Lovelace"
    assert captured == {
        "user_id": "user-123",
        "profile": {"display_name": "Ada Lovelace", "email": "person@example.com"},
    }


@pytest.mark.parametrize("display_name", ["", "a" * 121])
def test_profile_update_validates_display_name_length(
    authenticated_client: TestClient, display_name: str
) -> None:
    response = authenticated_client.put("/api/v1/me", json={"display_name": display_name})

    assert response.status_code == 422


def test_records_are_scoped_to_authenticated_user(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, str] = {}

    def fake_list_records(user_id: str) -> list[dict[str, Any]]:
        captured["user_id"] = user_id
        return [
            {
                "SK": "RECORD#record-id",
                "type": "document",
                "title": "Agreement",
                "payload": {"pages": 3},
            }
        ]

    monkeypatch.setattr(routes, "list_records", fake_list_records)

    response = authenticated_client.get("/api/v1/me/records")

    assert response.status_code == 200
    assert captured == {"user_id": "user-123"}
    assert response.json() == [
        {"id": "record-id", "type": "document", "title": "Agreement", "payload": {"pages": 3}}
    ]


def test_create_record_generates_id_and_validates_type(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, Any] = {}

    def fake_create_record(user_id: str, record_id: str, record: dict[str, Any]) -> dict[str, Any]:
        captured.update(user_id=user_id, record_id=record_id, record=record)
        return record

    monkeypatch.setattr(routes, "create_record_with_limit", fake_create_record)

    response = authenticated_client.post(
        "/api/v1/me/records",
        json={"type": "review", "title": "Initial review", "payload": {"score": 85}},
    )

    assert response.status_code == 201
    assert response.json()["id"] == captured["record_id"]
    assert captured["user_id"] == "user-123"
    assert captured["record"] == {
        "type": "review",
        "title": "Initial review",
        "payload": {"score": 85},
    }

    invalid_response = authenticated_client.post(
        "/api/v1/me/records", json={"type": "unknown", "title": "Invalid"}
    )
    assert invalid_response.status_code == 422


@pytest.mark.parametrize("title", ["", "a" * 201])
def test_create_record_validates_title_length(authenticated_client: TestClient, title: str) -> None:
    response = authenticated_client.post(
        "/api/v1/me/records", json={"type": "document", "title": title}
    )

    assert response.status_code == 422


def test_create_record_rejects_storage_overflow(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(routes, "create_record_with_limit", lambda *_: None)

    response = authenticated_client.post(
        "/api/v1/me/records", json={"type": "document", "title": "Notice", "payload": {}}
    )

    assert response.status_code == 429
    assert "storage limit" in response.json()["detail"]


def test_create_record_rejects_an_oversized_payload(authenticated_client: TestClient) -> None:
    response = authenticated_client.post(
        "/api/v1/me/records",
        json={"type": "document", "title": "Notice", "payload": {"text": "x" * 32_001}},
    )

    assert response.status_code == 422
