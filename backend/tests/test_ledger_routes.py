"""The document-history API, end to end on an in-memory chain.

Requests go through the real routes, storage functions and settle logic to the
compiled DocumentLedger contract running on eth-tester. Only DynamoDB is an
in-memory stand-in.
"""

import json
from hashlib import sha256
from typing import Any

import pytest

pytest.importorskip("eth_tester")

from eth_tester import EthereumTester, PyEVMBackend  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from web3 import Web3  # noqa: E402

from app import ledger, storage  # noqa: E402
from app.api.v1 import ledger_routes  # noqa: E402
from app.auth import current_user  # noqa: E402
from app.main import app  # noqa: E402


class MemoryTable:
    """DynamoDB, reduced to the key conditions and updates the ledger uses."""

    def __init__(self) -> None:
        self.items: dict[tuple[str, str], dict[str, Any]] = {}

    def put_item(self, Item: dict[str, Any], **_: Any) -> None:  # noqa: N803 - boto3's name
        self.items[(Item["PK"], Item["SK"])] = dict(Item)

    def delete_item(self, Key: dict[str, str], **_: Any) -> None:  # noqa: N803
        self.items.pop((Key["PK"], Key["SK"]), None)

    def update_item(
        self, Key: dict[str, str], ExpressionAttributeNames, ExpressionAttributeValues, **_
    ):  # noqa: N803
        item = self.items[(Key["PK"], Key["SK"])]
        for placeholder, name in ExpressionAttributeNames.items():
            item[name] = ExpressionAttributeValues[placeholder.replace("#f", ":v")]

    def query(self, KeyConditionExpression: Any, **_: Any) -> dict[str, Any]:  # noqa: N803
        matches = [
            item for item in self.items.values() if self._match(KeyConditionExpression, item)
        ]
        return {"Items": sorted(matches, key=lambda item: item["SK"])}

    def _match(self, condition: Any, item: dict[str, Any]) -> bool:
        expression = condition.get_expression()
        operator = expression["operator"]
        left, right = expression["values"]
        if operator == "AND":
            return self._match(left, item) and self._match(right, item)
        if operator == "=":
            return item.get(left.name) == right
        if operator == "begins_with":
            return str(item.get(left.name, "")).startswith(right)
        raise NotImplementedError(operator)


def fingerprint(text: str) -> str:
    return sha256(text.encode()).hexdigest()


@pytest.fixture
def chain_ledger() -> ledger.Ledger:
    backend = PyEVMBackend()
    web3 = Web3(Web3.EthereumTesterProvider(EthereumTester(backend)))
    artifact = json.loads(ledger.ARTIFACT.read_text(encoding="utf-8"))
    factory = web3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
    receipt = web3.eth.wait_for_transaction_receipt(
        factory.constructor(web3.eth.accounts[1]).transact({"from": web3.eth.accounts[0]})
    )
    return ledger.Ledger(
        web3, receipt["contractAddress"], backend.account_keys[1].to_hex(), web3.eth.chain_id
    )


@pytest.fixture
def api(client: TestClient, chain_ledger, monkeypatch: pytest.MonkeyPatch):
    table = MemoryTable()
    monkeypatch.setattr(storage, "_table", lambda: table)
    monkeypatch.setattr(ledger_routes, "configured_ledger", lambda: chain_ledger)
    monkeypatch.setattr(ledger_routes, "consume_ledger_quota", lambda user_id: True)
    app.dependency_overrides[current_user] = lambda: {"sub": "ada", "email": "ada@example.com"}
    return client


def record(api: TestClient, change_id: str, text: str, kind: str = "edited", doc: str = "lease"):
    response = api.post(
        "/api/v1/ledger/changes",
        json={
            "change_id": change_id,
            "document_id": doc,
            "kind": kind,
            "content_hash": fingerprint(text),
            "title": "Lease.pdf",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_the_ledger_describes_its_network(api: TestClient, chain_ledger) -> None:
    body = api.get("/api/v1/ledger").json()
    assert body["enabled"] is True
    assert body["contract_address"] == chain_ledger.contract.address


def test_each_change_lands_in_its_own_block_and_chains_to_the_last(api: TestClient) -> None:
    first = record(api, "change-0001", "Draft", "created")
    second = record(api, "change-0002", "Draft, revised")

    assert first["status"] == second["status"] == "confirmed"
    assert (first["sequence"], second["sequence"]) == (1, 2)
    assert second["block_number"] > first["block_number"]
    assert second["previous_entry"] == first["entry_hash"]
    assert first["content_hash"] == fingerprint("Draft")


def test_history_is_listed_oldest_first(api: TestClient) -> None:
    record(api, "change-0001", "Draft", "created")
    record(api, "change-0002", "Draft, revised")
    record(api, "change-0003", "Other document", "created", doc="notice")

    history = api.get("/api/v1/ledger/changes", params={"document_id": "lease"}).json()

    assert [entry["change_id"] for entry in history] == ["change-0001", "change-0002"]


def test_a_retried_request_records_the_change_once(api: TestClient, chain_ledger) -> None:
    first = record(api, "change-0001", "Draft", "created")
    again = record(api, "change-0001", "Draft", "created")

    assert again["tx_hash"] == first["tx_hash"]
    assert len(api.get("/api/v1/ledger/changes", params={"document_id": "lease"}).json()) == 1
    head = chain_ledger.contract.functions.heads(ledger.document_key("ada", "lease")).call()
    assert head[0] == 1


def test_a_lost_broadcast_is_resent_on_the_next_read(
    api: TestClient, chain_ledger, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The transaction was signed and stored, then the send vanished. Reading
    the history notices the network never saw it and sends it again."""
    real_broadcast = chain_ledger.broadcast
    monkeypatch.setattr(
        chain_ledger, "broadcast", lambda raw: (_ for _ in ()).throw(ConnectionError())
    )

    pending = record(api, "change-0001", "Draft", "created")
    assert pending["status"] == "pending"
    assert pending["tx_hash"]

    monkeypatch.setattr(chain_ledger, "broadcast", real_broadcast)
    [settled] = api.get("/api/v1/ledger/changes", params={"document_id": "lease"}).json()

    assert settled["status"] == "confirmed"
    assert settled["attempts"] == 2
    assert settled["sequence"] == 1


def test_one_persons_history_is_invisible_to_another(api: TestClient) -> None:
    record(api, "change-0001", "Draft", "created")
    app.dependency_overrides[current_user] = lambda: {"sub": "bob", "email": "bob@example.com"}

    assert api.get("/api/v1/ledger/changes", params={"document_id": "lease"}).json() == []


@pytest.mark.parametrize("content_hash", ["not-a-hash", "ab" * 31, "zz" * 32])
def test_only_a_sha256_fingerprint_is_accepted(api: TestClient, content_hash: str) -> None:
    response = api.post(
        "/api/v1/ledger/changes",
        json={
            "change_id": "change-0001",
            "document_id": "lease",
            "kind": "edited",
            "content_hash": content_hash,
        },
    )
    assert response.status_code == 422


def test_without_a_contract_the_ledger_reports_itself_off(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ledger_routes, "configured_ledger", lambda: None)
    app.dependency_overrides[current_user] = lambda: {"sub": "ada", "email": "ada@example.com"}

    assert client.get("/api/v1/ledger").json() == {
        "enabled": False,
        "network": "",
        "chain_id": 0,
        "explorer_url": "",
        "contract_address": "",
        "recorder_address": "",
    }
    response = client.post(
        "/api/v1/ledger/changes",
        json={
            "change_id": "change-0001",
            "document_id": "lease",
            "kind": "edited",
            "content_hash": "ab" * 32,
        },
    )
    assert response.status_code == 503


# ── Versions: the text at each change, proved against its block ─────────────


def record_version(api: TestClient, change_id: str, text: str, kind: str = "edited"):
    response = api.post(
        "/api/v1/ledger/changes",
        json={
            "change_id": change_id,
            "document_id": "lease",
            "kind": kind,
            "content_hash": fingerprint(text),
            "title": "Lease.pdf",
            "text": text,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def version(api: TestClient, change_id: str, **params: str):
    return api.get(
        f"/api/v1/ledger/changes/{change_id}/version", params={"document_id": "lease", **params}
    )


def test_an_earlier_version_comes_back_verified_by_its_block(api: TestClient) -> None:
    record_version(api, "change-0001", "Rent is due on the 1st.", "created")
    record_version(api, "change-0002", "Rent is due on the 5th.")

    [first, second] = api.get("/api/v1/ledger/changes", params={"document_id": "lease"}).json()
    assert first["has_version"] and second["has_version"]

    body = version(api, "change-0001").json()
    assert body["text"] == "Rent is due on the 1st."
    assert body["matches_fingerprint"] is True
    assert body["on_chain"] == "verified"
    assert body["block_number"] == first["block_number"]


def test_text_that_does_not_match_its_fingerprint_is_refused(api: TestClient) -> None:
    response = api.post(
        "/api/v1/ledger/changes",
        json={
            "change_id": "change-0001",
            "document_id": "lease",
            "kind": "edited",
            "content_hash": fingerprint("What the chain will say"),
            "text": "Something else",
        },
    )
    assert response.status_code == 422


def test_a_tampered_version_is_reported_as_a_mismatch(api: TestClient) -> None:
    record_version(api, "change-0001", "Rent is due on the 1st.", "created")
    table = storage._table()
    [item] = [row for row in table.items.values() if row.get("change_id") == "change-0001"]
    item["snapshot"] = storage._pack_version("Rent is due on the 30th.")

    body = version(api, "change-0001").json()
    assert body["matches_fingerprint"] is False
    assert body["on_chain"] == "mismatch"


def test_a_change_without_text_has_no_version(api: TestClient) -> None:
    record(api, "change-0001", "Draft", "created")
    assert version(api, "change-0001").status_code == 404


def test_another_persons_versions_are_out_of_reach(api: TestClient) -> None:
    record_version(api, "change-0001", "Private draft", "created")
    app.dependency_overrides[current_user] = lambda: {"sub": "bob", "email": "bob@example.com"}
    assert version(api, "change-0001").status_code == 404


def test_a_shared_document_has_one_history_for_its_workspace(
    api: TestClient, chain_ledger, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app import ledger_service

    monkeypatch.setattr(ledger_service, "configured_ledger", lambda: chain_ledger)
    monkeypatch.setattr(ledger_service, "consume_ledger_quota", lambda user_id: True)
    members = {"ada", "bob"}
    monkeypatch.setattr(
        ledger_routes,
        "get_workspace_membership",
        lambda workspace_id, user_id: {"role": "member"} if user_id in members else None,
    )
    ada = {"sub": "ada", "email": "ada@example.com", "name": "Ada"}
    bob = {"sub": "bob", "email": "bob@example.com", "name": "Bob"}
    ledger_service.record_shared_version("ws-1", ada, "lease", "Version one", "Lease.pdf")
    ledger_service.record_shared_version("ws-1", bob, "lease", "Version two", "Lease.pdf")
    # Sharing the same text again adds nothing.
    ledger_service.record_shared_version("ws-1", bob, "lease", "Version two", "Lease.pdf")

    app.dependency_overrides[current_user] = lambda: bob
    params = {"document_id": "lease", "workspace_id": "ws-1"}
    history = api.get("/api/v1/ledger/changes", params=params).json()
    assert [(row["kind"], row["changed_by"], row["status"]) for row in history] == [
        ("created", "Ada", "confirmed"),
        ("edited", "Bob", "confirmed"),
    ]
    first = version(api, history[0]["change_id"], workspace_id="ws-1").json()
    assert (first["text"], first["on_chain"]) == ("Version one", "verified")

    app.dependency_overrides[current_user] = lambda: {"sub": "eve", "email": "eve@example.com"}
    assert api.get("/api/v1/ledger/changes", params=params).status_code == 403
