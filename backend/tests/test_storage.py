from typing import Any

import pytest

from app import storage


class FakeTable:
    def __init__(self, responses: list[dict[str, Any]] | None = None) -> None:
        self.responses = responses or []
        self.get_requests: list[dict[str, Any]] = []
        self.put_requests: list[dict[str, Any]] = []
        self.query_requests: list[dict[str, Any]] = []

    def get_item(self, **kwargs: Any) -> dict[str, Any]:
        self.get_requests.append(kwargs)
        return {"Item": {"display_name": "Ada"}}

    def put_item(self, **kwargs: Any) -> None:
        self.put_requests.append(kwargs)

    def query(self, **kwargs: Any) -> dict[str, Any]:
        self.query_requests.append(kwargs)
        return self.responses.pop(0)


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
