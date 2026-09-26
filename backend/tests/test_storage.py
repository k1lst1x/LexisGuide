from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pytest
from botocore.exceptions import ClientError

from app import storage


class FakeTable:
    def __init__(
        self,
        responses: list[dict[str, Any]] | None = None,
        get_responses: list[dict[str, Any]] | None = None,
    ) -> None:
        self.responses = responses or []
        self.get_responses = get_responses or []
        self.get_requests: list[dict[str, Any]] = []
        self.put_requests: list[dict[str, Any]] = []
        self.query_requests: list[dict[str, Any]] = []
        self.delete_requests: list[dict[str, Any]] = []
        self.update_requests: list[dict[str, Any]] = []
        self.transaction_requests: list[dict[str, Any]] = []
        self.name = "user-data"
        self.meta = SimpleNamespace(client=FakeTransactionClient(self.transaction_requests))

    def get_item(self, **kwargs: Any) -> dict[str, Any]:
        self.get_requests.append(kwargs)
        if self.get_responses:
            return self.get_responses.pop(0)
        return {"Item": {"display_name": "Ada"}}

    def put_item(self, **kwargs: Any) -> None:
        self.put_requests.append(kwargs)

    def query(self, **kwargs: Any) -> dict[str, Any]:
        self.query_requests.append(kwargs)
        return self.responses.pop(0) if self.responses else {"Items": []}

    def delete_item(self, **kwargs: Any) -> None:
        self.delete_requests.append(kwargs)

    def update_item(self, **kwargs: Any) -> None:
        self.update_requests.append(kwargs)


class FakeTransactionClient:
    def __init__(self, requests: list[dict[str, Any]]) -> None:
        self.requests = requests

    def transact_write_items(self, **kwargs: Any) -> None:
        self.requests.append(kwargs)


@pytest.fixture
def table(monkeypatch: pytest.MonkeyPatch) -> FakeTable:
    fake_table = FakeTable()
    monkeypatch.setattr(storage, "_table", lambda: fake_table)
    return fake_table


def test_profile_storage_uses_users_partition_key(table: FakeTable) -> None:
    assert storage.get_profile("user-123") == {"display_name": "Ada"}
    assert table.get_requests == [{"Key": {"PK": "USER#user-123", "SK": "PROFILE"}}]

    profile = storage.put_profile("user-123", {"display_name": "Ada", "email": "ada@example.com"})

    assert profile == {
        "PK": "USER#user-123",
        "SK": "PROFILE",
        "display_name": "Ada",
        "email": "ada@example.com",
    }
    assert table.put_requests == [{"Item": profile}]


def test_table_requires_runtime_table_name(monkeypatch: pytest.MonkeyPatch) -> None:
    storage._table.cache_clear()
    monkeypatch.delenv("USER_DATA_TABLE", raising=False)

    with pytest.raises(RuntimeError, match="USER_DATA_TABLE"):
        storage._table()

    storage._table.cache_clear()


def test_record_storage_uses_users_partition_key(table: FakeTable) -> None:
    record = storage.save_record("user-123", "record-456", {"type": "document", "title": "Notice"})

    assert record == {
        "PK": "USER#user-123",
        "SK": "RECORD#record-456",
        "type": "document",
        "title": "Notice",
    }
    assert table.put_requests == [{"Item": record}]


def test_new_record_and_its_quota_are_written_in_one_conditional_transaction(
    table: FakeTable,
) -> None:
    record = storage.create_record_with_limit(
        "user-123", "record-456", {"type": "document", "title": "Notice"}
    )

    assert record is not None
    transaction = table.transaction_requests[0]["TransactItems"]
    assert transaction[0]["Put"]["ConditionExpression"] == "attribute_not_exists(PK)"
    assert transaction[1]["Update"]["TableName"] == "user-data"
    assert transaction[1]["Update"]["ConditionExpression"] is not None


def test_legacy_records_count_toward_the_new_storage_limit(
    table: FakeTable, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(storage, "_count_user_resources", lambda *_: storage.MAX_RECORDS_PER_USER)

    assert storage.create_record_with_limit("user-123", "record-456", {}) is None
    assert table.transaction_requests == []


def test_concurrent_first_write_for_one_conversation_becomes_an_update(
    table: FakeTable, monkeypatch: pytest.MonkeyPatch
) -> None:
    class ExistingConversationClient(FakeTransactionClient):
        def transact_write_items(self, **kwargs: Any) -> None:
            self.requests.append(kwargs)
            raise ClientError(
                {
                    "Error": {"Code": "TransactionCanceledException", "Message": "exists"},
                    "CancellationReasons": [{"Code": "ConditionalCheckFailed"}, {"Code": "None"}],
                },
                "TransactWriteItems",
            )

    table.meta = SimpleNamespace(client=ExistingConversationClient(table.transaction_requests))
    table.get_responses = [{}]
    saved = storage.save_conversation_with_limit("user-123", "chat-456", [], "Updated")

    assert saved[0] == "updated"
    assert table.put_requests[0]["Item"]["SK"] == "CHAT#chat-456"


def test_existing_conversation_remains_updatable_when_the_storage_cap_is_full(
    table: FakeTable, monkeypatch: pytest.MonkeyPatch
) -> None:
    table.get_responses = [{"Item": {"turns": [], "title": "Old", "updated_at": "then"}}]
    monkeypatch.setattr(
        storage, "_count_user_resources", lambda *_: storage.MAX_CONVERSATIONS_PER_USER
    )

    outcome, saved = storage.save_conversation_with_limit("user-123", "chat-456", [], "New")

    assert outcome == "updated"
    assert saved is not None
    assert table.transaction_requests == []


def test_record_list_collects_all_dynamodb_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    table = FakeTable(
        [
            {
                "Items": [{"SK": "RECORD#first"}],
                "LastEvaluatedKey": {"PK": "USER#user-123", "SK": "RECORD#first"},
            },
            {"Items": [{"SK": "RECORD#second"}]},
        ]
    )
    monkeypatch.setattr(storage, "_table", lambda: table)

    assert storage.list_records("user-123") == [{"SK": "RECORD#first"}, {"SK": "RECORD#second"}]
    assert len(table.query_requests) == 2
    assert table.query_requests[1]["ExclusiveStartKey"] == {
        "PK": "USER#user-123",
        "SK": "RECORD#first",
    }


def test_workspace_invites_use_a_direct_key_and_are_consumed_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(storage.secrets, "token_urlsafe", lambda _: "invite-token")
    created_table = FakeTable()
    monkeypatch.setattr(storage, "_table", lambda: created_table)

    invite = storage.create_workspace_invite("workspace-123", "owner-123")

    assert invite["token"] == "invite-token"
    assert created_table.put_requests[0]["Item"]["PK"] == "INVITE#invite-token"
    assert created_table.put_requests[0]["Item"]["SK"] == "META"
    assert created_table.put_requests[0]["Item"]["expires_at"] > 0

    consuming_table = FakeTable(
        get_responses=[
            {"Item": invite},
            {
                "Item": {
                    "id": "workspace-123",
                    "name": "Shared review",
                    "owner_id": "owner-123",
                    "created_at": "2026-01-01T00:00:00+00:00",
                }
            },
        ]
    )
    monkeypatch.setattr(storage, "_table", lambda: consuming_table)

    workspace = storage.consume_workspace_invite(
        "invite-token", {"sub": "member-123", "email": "member@example.com", "name": "Member"}
    )

    assert workspace is not None
    assert consuming_table.get_requests[0] == {"Key": {"PK": "INVITE#invite-token", "SK": "META"}}
    assert consuming_table.delete_requests[0]["Key"] == {
        "PK": "INVITE#invite-token",
        "SK": "META",
    }
    assert consuming_table.delete_requests[0]["ConditionExpression"] is not None
    assert [request["Item"]["SK"] for request in consuming_table.put_requests] == [
        "MEMBER#member-123",
        "WORKSPACE#workspace-123",
    ]


def test_expired_workspace_invites_cannot_be_redeemed(table: FakeTable) -> None:
    table.get_responses = [
        {
            "Item": {
                "PK": "INVITE#expired-token",
                "SK": "META",
                "workspace_id": "workspace-123",
                "expires_at": 1,
            }
        }
    ]

    assert storage.consume_workspace_invite("expired-token", {"sub": "member-123"}) is None
    assert table.delete_requests == []
    assert table.put_requests == []


def test_workspace_invites_accept_dynamodb_decimal_timestamps(table: FakeTable) -> None:
    table.get_responses = [
        {
            "Item": {
                "PK": "INVITE#valid-token",
                "SK": "META",
                "workspace_id": "workspace-123",
                "expires_at": Decimal(str(int(storage.time.time()) + 600)),
            }
        },
        {
            "Item": {
                "id": "workspace-123",
                "name": "Shared review",
                "owner_id": "owner-123",
                "created_at": "2026-01-01T00:00:00+00:00",
            }
        },
    ]

    workspace = storage.consume_workspace_invite("valid-token", {"sub": "member-123"})

    assert workspace is not None
    assert table.delete_requests[0]["Key"] == {"PK": "INVITE#valid-token", "SK": "META"}


def test_review_quota_uses_an_atomic_expiring_counter(table: FakeTable) -> None:
    assert storage.consume_review_quota("user-123") is True

    request = table.update_requests[0]
    assert request["Key"]["PK"].startswith("RATE#REVIEW#")
    assert request["Key"]["SK"].startswith("WINDOW#")
    assert request["ExpressionAttributeValues"][":increment"] == 1
    assert request["ExpressionAttributeValues"][":expires_at"] > 0


def test_statute_quota_uses_a_separate_atomic_expiring_counter(table: FakeTable) -> None:
    assert storage.consume_statute_quota("user-123") is True

    request = table.update_requests[0]
    assert request["Key"]["PK"].startswith("RATE#STATUTE#")
    assert request["Key"]["SK"].startswith("WINDOW#")
    assert request["ExpressionAttributeValues"][":increment"] == 1


def test_review_quota_rejects_a_conditional_limit_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    class FullQuotaTable(FakeTable):
        def update_item(self, **kwargs: Any) -> None:
            raise ClientError(
                {"Error": {"Code": "ConditionalCheckFailedException", "Message": "limit reached"}},
                "UpdateItem",
            )

    monkeypatch.setattr(storage, "_table", lambda: FullQuotaTable())

    assert storage.consume_review_quota("user-123") is False


def test_remote_operation_claims_global_and_user_slots_then_releases_them(
    table: FakeTable,
) -> None:
    lease = storage.acquire_remote_operation("user-123")

    assert lease is not None
    assert len(table.put_requests) == 2
    assert table.put_requests[0]["Item"]["PK"] == "REMOTE#GLOBAL"
    assert table.put_requests[1]["Item"]["PK"].startswith("REMOTE#USER#")
    assert all(request["ConditionExpression"] is not None for request in table.put_requests)

    storage.release_remote_operation(lease)

    assert len(table.delete_requests) == 2
    assert all(request["ConditionExpression"] is not None for request in table.delete_requests)


def test_remote_operation_rejects_when_all_slots_are_held(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FullSlotsTable(FakeTable):
        def put_item(self, **kwargs: Any) -> None:
            raise ClientError(
                {"Error": {"Code": "ConditionalCheckFailedException", "Message": "slot held"}},
                "PutItem",
            )

    monkeypatch.setattr(storage, "_table", lambda: FullSlotsTable())
    monkeypatch.setenv("REMOTE_OPERATION_GLOBAL_CONCURRENCY", "1")

    assert storage.acquire_remote_operation("user-123") is None


def test_remote_operation_releases_global_slot_when_user_slots_are_full(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class UserSlotsFullTable(FakeTable):
        def put_item(self, **kwargs: Any) -> None:
            self.put_requests.append(kwargs)
            if kwargs["Item"]["PK"].startswith("REMOTE#USER#"):
                raise ClientError(
                    {"Error": {"Code": "ConditionalCheckFailedException", "Message": "slot held"}},
                    "PutItem",
                )

    fake_table = UserSlotsFullTable()
    monkeypatch.setattr(storage, "_table", lambda: fake_table)
    monkeypatch.setenv("REMOTE_OPERATION_PER_USER_CONCURRENCY", "1")

    assert storage.acquire_remote_operation("user-123") is None
    assert len(fake_table.delete_requests) == 1
    assert fake_table.delete_requests[0]["Key"]["PK"] == "REMOTE#GLOBAL"
