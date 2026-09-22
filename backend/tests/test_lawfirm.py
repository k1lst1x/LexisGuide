from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import lawfirm
from app.api.v1 import routes


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self) -> bytes:
        return self.body


def test_statute_lookup_uses_bearer_auth_and_preserves_provider_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_open(request: object, timeout: int) -> FakeResponse:
        captured["request"] = request
        captured["timeout"] = timeout
        return FakeResponse(
            b'{"text":"Statute text","sourceUrl":"https://state.example/statute","contentHash":"abc"}'
        )

    monkeypatch.setattr(lawfirm, "urlopen", fake_open)
    client = lawfirm.LawFirmClient("rotated-test-key")

    result = client.lookup_statute("FL", "768.28", date(2020, 3, 14))

    request = captured["request"]
    assert result["contentHash"] == "abc"
    assert captured["timeout"] == 8
    assert request.get_header("Authorization") == "Bearer rotated-test-key"
    assert "jurisdiction=fl" in request.full_url
    assert "asOf=2020-03-14" in request.full_url


def test_json_secret_accepts_only_the_api_key_field() -> None:
    assert lawfirm._secret_value('{"api_key":"lf_live_replacement"}') == "lf_live_replacement"
    assert lawfirm._secret_value('{"other":"value"}') == ""


def test_statute_lookup_route_requires_configured_provider(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(routes, "configured_lawfirm_client", lambda: None)

    response = authenticated_client.get("/api/v1/statutes/lookup?jurisdiction=fl&citation=768.28")

    assert response.status_code == 503
    assert response.json() == {"detail": "Statute lookup is not configured."}


def test_statute_lookup_route_returns_full_provenance_payload(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Client:
        def lookup_statute(
            self, jurisdiction: str, citation: str, as_of: date | None
        ) -> dict[str, str]:
            assert (jurisdiction, citation, as_of) == ("fl", "768.28", date(2020, 3, 14))
            return {
                "text": "Statute text",
                "sourceUrl": "https://state.example/statute",
                "contentHash": "abc",
            }

    lease = object()
    releases: list[object] = []
    monkeypatch.setattr(routes, "configured_lawfirm_client", lambda: Client())
    monkeypatch.setattr(routes, "consume_statute_quota", lambda _: True)
    monkeypatch.setattr(routes, "acquire_remote_operation", lambda _: lease)
    monkeypatch.setattr(routes, "release_remote_operation", releases.append)
    response = authenticated_client.get(
        "/api/v1/statutes/lookup?jurisdiction=fl&citation=768.28&asOf=2020-03-14"
    )

    assert response.status_code == 200
    assert response.json()["result"]["contentHash"] == "abc"
    assert releases == [lease]


def test_statute_lookup_rejects_when_shared_capacity_is_full(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Client:
        def lookup_statute(self, *_: object) -> dict[str, str]:
            raise AssertionError("The provider must not be called when shared capacity is full.")

    monkeypatch.setattr(routes, "configured_lawfirm_client", lambda: Client())
    monkeypatch.setattr(routes, "consume_statute_quota", lambda _: True)
    monkeypatch.setattr(routes, "acquire_remote_operation", lambda _: None)

    response = authenticated_client.get("/api/v1/statutes/lookup?jurisdiction=fl&citation=768.28")

    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
    assert response.json() == {"detail": "The statute service is busy. Please try again shortly."}
