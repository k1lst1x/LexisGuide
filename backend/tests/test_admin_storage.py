"""Admin deletions remove exactly what they should, and nothing else."""

from contextlib import contextmanager
from typing import Any

import pytest

from app import storage


class MemoryTable:
    """A dict keyed by (PK, SK), answering the few calls the admin helpers make."""

    def __init__(self, items: list[dict[str, Any]]) -> None:
        self.items = {(item["PK"], item["SK"]): item for item in items}

    def get_item(self, Key: dict[str, str]) -> dict[str, Any]:  # noqa: N803 - boto3's name
        item = self.items.get((Key["PK"], Key["SK"]))
        return {"Item": item} if item else {}

    def put_item(self, Item: dict[str, Any], **_: Any) -> None:  # noqa: N803
        self.items[(Item["PK"], Item["SK"])] = Item

    def delete_item(self, Key: dict[str, str], **_: Any) -> None:  # noqa: N803
        self.items.pop((Key["PK"], Key["SK"]), None)

    def query(self, KeyConditionExpression: Any, **_: Any) -> dict[str, Any]:  # noqa: N803
        partition = KeyConditionExpression.get_expression()["values"][1]
        return {"Items": [item for (pk, _), item in self.items.items() if pk == partition]}

    @contextmanager
    def batch_writer(self):
        yield self

    def keys(self) -> set[tuple[str, str]]:
        return set(self.items)


def _membership(workspace: str, user: str, role: str) -> list[dict[str, Any]]:
    return [
        {"PK": f"WORKSPACE#{workspace}", "SK": f"MEMBER#{user}", "user_id": user, "role": role},
        {
            "PK": f"USER#{user}",
            "SK": f"WORKSPACE#{workspace}",
            "workspace_id": workspace,
            "role": role,
        },
    ]


@pytest.fixture
def table(monkeypatch: pytest.MonkeyPatch) -> MemoryTable:
    fake = MemoryTable(
        [
            {"PK": "USER#ada", "SK": "PROFILE", "display_name": "Ada"},
            {"PK": "USER#ada", "SK": "RECORD#r1", "type": "document", "title": "Lease"},
            {"PK": "USER#ada", "SK": "CHAT#c1", "turns": []},
            {"PK": "USER#ada", "SK": "LAWYER", "attempts": 3, "verified": False},
            # Ada hosts "hosted" (Bob is a member) and is a member of Bob's "joined".
            {"PK": "WORKSPACE#hosted", "SK": "META", "name": "Hosted", "owner_id": "ada"},
            *_membership("hosted", "ada", "owner"),
            *_membership("hosted", "bob", "member"),
            {"PK": "WORKSPACE#joined", "SK": "META", "name": "Joined", "owner_id": "bob"},
            *_membership("joined", "bob", "owner"),
            *_membership("joined", "ada", "member"),
            {"PK": "USER#bob", "SK": "PROFILE", "display_name": "Bob"},
        ]
    )
    monkeypatch.setattr(storage, "_table", lambda: fake)
    return fake


def test_erasing_a_person_removes_their_rows_and_the_workspaces_they_host(
    table: MemoryTable,
) -> None:
    storage.admin_delete_user_data("ada")

    assert table.keys() == {
        # Bob's own workspace survives; only Ada's membership in it is gone.
        ("WORKSPACE#joined", "META"),
        ("WORKSPACE#joined", "MEMBER#bob"),
        ("USER#bob", "WORKSPACE#joined"),
        ("USER#bob", "PROFILE"),
    }


def test_user_data_summarises_one_partition(table: MemoryTable) -> None:
    summary = storage.admin_user_data("ada")

    assert summary["documents"] == 1
    assert summary["conversations"] == 1
    assert sorted((w["name"], w["role"]) for w in summary["workspaces"]) == [
        ("Hosted", "owner"),
        ("Joined", "member"),
    ]
    assert summary["lawyer_verification"]["attempts_remaining"] == 0


def test_resetting_a_bar_verification_gives_the_attempts_back(table: MemoryTable) -> None:
    result = storage.admin_reset_lawyer_verification("ada")

    assert result["attempts_remaining"] == result["max_attempts"]
    assert ("USER#ada", "LAWYER") not in table.keys()


def test_an_invite_to_a_deleted_workspace_cannot_be_redeemed(table: MemoryTable) -> None:
    table.put_item(
        Item={
            "PK": "INVITE#tok",
            "SK": "META",
            "workspace_id": "hosted",
            "expires_at": 4_000_000_000,
        }
    )
    storage.admin_delete_workspace("hosted")

    assert storage.consume_workspace_invite("tok", {"sub": "carol"}) is None
    assert ("WORKSPACE#hosted", "MEMBER#carol") not in table.keys()
