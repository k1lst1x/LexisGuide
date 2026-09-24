"""Saved conversations belong to one person and stay that way.

Each conversation lives under the caller's own partition key, so the id in the
URL selects among *their* conversations and can never reach anyone else's.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import routes

CONVERSATION = "abcd1234-5678"


class FakeStore:
    """Stands in for DynamoDB, keyed the same way: user first, then conversation."""

    def __init__(self) -> None:
        self.rows: dict[tuple[str, str], dict[str, Any]] = {}

    def install(self, monkeypatch: pytest.MonkeyPatch) -> "FakeStore":
        monkeypatch.setattr(routes, "get_conversation", self.get)
        monkeypatch.setattr(routes, "save_conversation_with_limit", self.save_with_limit)
        monkeypatch.setattr(routes, "list_conversations", self.list)
        return self

    def get(self, user_id: str, conversation_id: str) -> dict[str, Any] | None:
        return self.rows.get((user_id, conversation_id))

    def save(
        self, user_id: str, conversation_id: str, turns: list[dict[str, Any]], title: str = ""
    ) -> dict[str, Any]:
        row = {
            "conversation_id": conversation_id,
            "turns": turns,
            "title": title,
            "updated_at": "2026-09-23T00:00:00+00:00",
        }
        self.rows[(user_id, conversation_id)] = row
        return row

    def save_with_limit(
        self, user_id: str, conversation_id: str, turns: list[dict[str, Any]], title: str = ""
    ) -> tuple[str, dict[str, Any]]:
        outcome = "updated" if (user_id, conversation_id) in self.rows else "created"
        return outcome, self.save(user_id, conversation_id, turns, title)

    def list(self, user_id: str, limit: int = 30) -> list[dict[str, Any]]:
        return [
            {**row, "turns": []}
            for (owner, _), row in self.rows.items()
            if owner == user_id
        ][:limit]


TURNS = [
    {"id": "t1", "role": "user", "content": "What is a lien?", "local": False},
    {"id": "t2", "role": "assistant", "content": "A claim against property.", "local": False},
]


def test_a_conversation_is_saved_and_read_back(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    FakeStore().install(monkeypatch)

    saved = authenticated_client.put(
        f"/api/v1/me/conversations/{CONVERSATION}", json={"turns": TURNS, "title": "Lien"}
    )
    assert saved.status_code == 200

    read = authenticated_client.get(f"/api/v1/me/conversations/{CONVERSATION}")
    assert read.status_code == 200
    body = read.json()
    assert [turn["content"] for turn in body["turns"]] == [
        "What is a lien?",
        "A claim against property.",
    ]
    assert body["title"] == "Lien"


def test_one_persons_conversation_is_invisible_to_another(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The id is not a capability: it only selects within the caller's own keys."""
    store = FakeStore().install(monkeypatch)
    store.save("user-123", CONVERSATION, TURNS)

    from app.auth import current_user
    from app.main import app

    app.dependency_overrides[current_user] = lambda: {
        "sub": "someone-else",
        "email": "other@example.com",
        "name": "Other",
    }

    assert client.get(f"/api/v1/me/conversations/{CONVERSATION}").status_code == 404


def test_a_missing_conversation_is_a_404(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    FakeStore().install(monkeypatch)
    assert authenticated_client.get(f"/api/v1/me/conversations/{CONVERSATION}").status_code == 404


def test_conversations_are_listed_for_their_owner_only(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = FakeStore().install(monkeypatch)
    store.save("user-123", CONVERSATION, TURNS, "Mine")
    store.save("someone-else", "zzzz9999-0000", TURNS, "Theirs")

    listed = authenticated_client.get("/api/v1/me/conversations").json()

    assert [row["title"] for row in listed] == ["Mine"]


def test_saving_requires_a_signed_in_person(client: TestClient) -> None:
    assert client.put(
        f"/api/v1/me/conversations/{CONVERSATION}", json={"turns": TURNS}
    ).status_code == 401


@pytest.mark.parametrize("conversation_id", ["short", "has spaces", "../escape", "x" * 65])
def test_a_malformed_conversation_id_is_refused(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch, conversation_id: str
) -> None:
    FakeStore().install(monkeypatch)
    response = authenticated_client.put(
        f"/api/v1/me/conversations/{conversation_id}", json={"turns": TURNS}
    )
    assert response.status_code in {404, 422}


def test_an_over_long_conversation_is_refused(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """One person must not be able to fill the table."""
    FakeStore().install(monkeypatch)
    too_many = [
        {"id": f"t{i}", "role": "user", "content": "x", "local": False}
        for i in range(routes.MAX_STORED_TURNS + 1)
    ]

    response = authenticated_client.put(
        f"/api/v1/me/conversations/{CONVERSATION}", json={"turns": too_many}
    )

    assert response.status_code == 422


def test_a_new_conversation_is_refused_at_the_storage_limit(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = FakeStore().install(monkeypatch)
    monkeypatch.setattr(routes, "save_conversation_with_limit", lambda *_: ("limit", None))

    response = authenticated_client.put(
        f"/api/v1/me/conversations/{CONVERSATION}", json={"turns": TURNS}
    )

    assert response.status_code == 429
    assert store.rows == {}


def test_updating_an_existing_conversation_does_not_consume_another_slot(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = FakeStore().install(monkeypatch)
    store.save("user-123", CONVERSATION, TURNS)
    response = authenticated_client.put(
        f"/api/v1/me/conversations/{CONVERSATION}", json={"turns": TURNS, "title": "Updated"}
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Updated"
