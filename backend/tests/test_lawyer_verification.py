"""Bar verification: who spends an attempt, and who must never.

The provider's allowance is small and shared by every user (free tier: 10 a day,
100 a month). So the rules these tests hold to are:

* a person verifies once, and a verified person never calls the provider again;
* only an answer *about that person* spends one of their three attempts;
* a spent allowance or an outage is returned to their balance, and is never
  worded as a rejection.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import lawfirm, storage
from app.api.v1 import routes

ACTIVE_RECORD = {
    "verified": True,
    "admission": {
        "barNumber": "1234567",
        "jurisdiction": "FL",
        "status": "active",
        "admittedAt": 1306281600000,
    },
    "attorney": {"canonicalName": "Dana Okafor"},
}


class FakeLedger:
    """The DynamoDB item, with the same conditional rules the real table enforces."""

    def __init__(self, attempts: int = 0, verified: bool = False) -> None:
        self.attempts = attempts
        self.verified = verified
        self.record: dict[str, Any] = {}

    def install(self, monkeypatch: pytest.MonkeyPatch) -> "FakeLedger":
        monkeypatch.setattr(routes, "get_lawyer_verification", self.get)
        monkeypatch.setattr(routes, "reserve_lawyer_attempt", self.reserve)
        monkeypatch.setattr(routes, "release_lawyer_attempt", self.release)
        monkeypatch.setattr(routes, "save_lawyer_verification", self.save)
        monkeypatch.setattr(routes, "acquire_remote_operation", lambda _: object())
        monkeypatch.setattr(routes, "release_remote_operation", lambda _: None)
        return self

    def get(self, _user_id: str) -> dict[str, Any]:
        limit = storage.LAWYER_VERIFICATION_MAX_ATTEMPTS
        return {
            "verified": self.verified,
            "attempts_used": self.attempts,
            "attempts_remaining": max(limit - self.attempts, 0),
            "max_attempts": limit,
            "bar_number": self.record.get("bar_number", ""),
            "jurisdiction": self.record.get("jurisdiction", ""),
            "name": self.record.get("name", ""),
            "status": self.record.get("status", ""),
            "admitted_on": self.record.get("admitted_on", ""),
            "verified_at": self.record.get("verified_at", ""),
        }

    def reserve(self, _user_id: str) -> bool:
        if self.verified or self.attempts >= storage.LAWYER_VERIFICATION_MAX_ATTEMPTS:
            return False
        self.attempts += 1
        return True

    def release(self, _user_id: str) -> None:
        if not self.verified and self.attempts > 0:
            self.attempts -= 1

    def save(self, _user_id: str, record: dict[str, Any]) -> dict[str, Any]:
        self.verified = True
        self.record = {**record, "verified_at": "2026-09-22T00:00:00+00:00"}
        return self.get(_user_id)


def provider(monkeypatch: pytest.MonkeyPatch, behaviour: Any) -> dict[str, Any]:
    """Install a fake provider and report how it was called."""
    calls: dict[str, Any] = {"count": 0, "args": None}

    class Client:
        def lookup_attorney(self, bar_number: str, jurisdiction: str) -> dict[str, Any]:
            calls["count"] += 1
            calls["args"] = (bar_number, jurisdiction)
            if isinstance(behaviour, Exception):
                raise behaviour
            return behaviour

    monkeypatch.setattr(routes, "configured_lawfirm_client", lambda: Client())
    return calls


def post(client: TestClient, bar: str = "1234567", jurisdiction: str = "FL"):
    return client.post(
        "/api/v1/me/lawyer-verification",
        json={"bar_number": bar, "jurisdiction": jurisdiction},
    )


def test_an_active_bar_record_verifies_the_person(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ledger = FakeLedger().install(monkeypatch)
    calls = provider(monkeypatch, ACTIVE_RECORD)

    response = post(authenticated_client)

    assert response.status_code == 200
    body = response.json()
    assert body["verified"] is True
    assert body["name"] == "Dana Okafor"
    assert body["jurisdiction"] == "FL"
    assert calls["args"] == ("1234567", "FL")
    assert ledger.attempts == 1


def test_a_verified_person_is_never_looked_up_again(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """One verification per person: the second call must not spend the shared allowance."""
    FakeLedger(attempts=1, verified=True).install(monkeypatch)
    calls = provider(monkeypatch, ACTIVE_RECORD)

    response = post(authenticated_client)

    assert response.status_code == 200
    assert response.json()["verified"] is True
    assert calls["count"] == 0


def test_a_busy_shared_provider_does_not_cost_an_attempt(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ledger = FakeLedger().install(monkeypatch)
    calls = provider(monkeypatch, ACTIVE_RECORD)
    monkeypatch.setattr(routes, "acquire_remote_operation", lambda _: None)

    response = post(authenticated_client)

    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
    assert ledger.attempts == 0
    assert calls["count"] == 0


def test_an_unknown_bar_number_spends_one_attempt_and_says_how_many_remain(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ledger = FakeLedger().install(monkeypatch)
    provider(monkeypatch, lawfirm.LawFirmResponseError(404))

    response = post(authenticated_client)

    assert response.status_code == 404
    assert ledger.attempts == 1
    assert "2 attempts left" in response.json()["detail"]


def test_a_suspended_record_is_refused_and_counts(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ledger = FakeLedger().install(monkeypatch)
    provider(monkeypatch, {"verified": False, "admission": {"status": "Suspended"}, "attorney": {}})

    response = post(authenticated_client)

    assert response.status_code == 422
    assert ledger.attempts == 1
    assert "suspended" in response.json()["detail"].lower()


def test_a_spent_provider_allowance_does_not_cost_the_person_an_attempt(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The free tier runs out for everyone at once. That is not this person's failure."""
    ledger = FakeLedger().install(monkeypatch)
    provider(monkeypatch, lawfirm.LawFirmQuotaError("spent"))

    response = post(authenticated_client)

    assert response.status_code == 503
    assert ledger.attempts == 0
    detail = response.json()["detail"]
    assert "not counted" in detail
    # It must not read as a verdict on the person.
    assert "support" not in detail.lower()


def test_an_outage_does_not_cost_the_person_an_attempt(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ledger = FakeLedger().install(monkeypatch)
    provider(monkeypatch, lawfirm.LawFirmUnavailableError("down"))

    response = post(authenticated_client)

    assert response.status_code == 503
    assert ledger.attempts == 0
    assert "not counted" in response.json()["detail"]


def test_a_provider_error_does_not_cost_the_person_an_attempt(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ledger = FakeLedger().install(monkeypatch)
    provider(monkeypatch, lawfirm.LawFirmResponseError(500))

    response = post(authenticated_client)

    assert response.status_code == 502
    assert ledger.attempts == 0


def test_the_third_failure_locks_the_account_and_points_to_support(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ledger = FakeLedger(attempts=2).install(monkeypatch)
    provider(monkeypatch, lawfirm.LawFirmResponseError(404))

    third = post(authenticated_client)

    assert third.status_code == 404
    assert ledger.attempts == 3
    assert "support" in third.json()["detail"].lower()


def test_a_locked_account_stops_calling_the_provider(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    FakeLedger(attempts=3).install(monkeypatch)
    calls = provider(monkeypatch, ACTIVE_RECORD)

    response = post(authenticated_client)

    assert response.status_code == 429
    assert calls["count"] == 0
    assert "support" in response.json()["detail"].lower()
    assert "chat" in response.json()["detail"].lower()


def test_verification_requires_a_signed_in_person(client: TestClient) -> None:
    assert (
        client.post(
            "/api/v1/me/lawyer-verification", json={"bar_number": "1", "jurisdiction": "FL"}
        ).status_code
        == 401
    )


@pytest.mark.parametrize(
    "bar,jurisdiction",
    [("", "FL"), ("12345", "FLORIDA"), ("12345", "F"), ("bar number!", "FL"), ("1" * 41, "FL")],
)
def test_malformed_input_is_refused_before_the_provider_is_called(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch, bar: str, jurisdiction: str
) -> None:
    FakeLedger().install(monkeypatch)
    calls = provider(monkeypatch, ACTIVE_RECORD)

    assert post(authenticated_client, bar, jurisdiction).status_code == 422
    assert calls["count"] == 0


def test_status_reading_treats_anything_unrecognised_as_unverified() -> None:
    """An unfamiliar status must fail closed: never grant on a word we do not know."""
    assert lawfirm.read_bar_status(ACTIVE_RECORD)["active"] is True
    assert (
        lawfirm.read_bar_status({"verified": True, "admission": {"status": "in good standing"}})[
            "active"
        ]
        is True
    )
    for status in ["Suspended", "Disbarred", "Inactive", "Retired", "", "pending review"]:
        assert (
            lawfirm.read_bar_status({"verified": False, "admission": {"status": status}})["active"]
            is False
        )


def test_provider_no_record_response_is_not_misread_as_an_inactive_lawyer() -> None:
    record = lawfirm.read_bar_status({"verified": False, "admission": None, "attorney": None})

    assert record["found"] is False
    assert record["active"] is False


def test_attorney_lookup_sends_the_documented_query(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    class FakeResponse:
        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def read(self) -> bytes:
            return b'{"attorney":{"status":"active"}}'

    def fake_open(request: object, timeout: int) -> FakeResponse:
        captured["url"] = request.full_url
        captured["auth"] = request.get_header("Authorization")
        return FakeResponse()

    monkeypatch.setattr(lawfirm, "urlopen", fake_open)

    lawfirm.LawFirmClient("test-key").lookup_attorney("1234567", "fl")

    assert "/bar-admissions/verify?" in captured["url"]
    assert "barNumber=1234567" in captured["url"]
    assert "jurisdiction=FL" in captured["url"]
    assert captured["auth"] == "Bearer test-key"


def test_a_429_from_the_provider_becomes_a_quota_error_not_a_verdict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from urllib.error import HTTPError

    def fake_open(request: object, timeout: int) -> None:
        raise HTTPError(request.full_url, 429, "Too Many Requests", {}, None)  # type: ignore[arg-type]

    monkeypatch.setattr(lawfirm, "urlopen", fake_open)

    with pytest.raises(lawfirm.LawFirmQuotaError):
        lawfirm.LawFirmClient("test-key").lookup_attorney("1234567", "FL")
