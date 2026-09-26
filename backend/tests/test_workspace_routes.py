"""The saved workspace survives a refresh, and only its owner can see it.

Requests run through the real routes and storage code against moto's
in-memory DynamoDB, so conditions, transactions and binary bodies behave as
they do in AWS.
"""

from collections.abc import Iterator
from hashlib import sha256

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app import storage
from app.api.v1 import workspace_routes
from app.auth import current_user
from app.main import app


def key(document_id: str) -> str:
    return sha256(document_id.encode()).hexdigest()


def lease(text: str = "The tenant shall pay rent monthly.") -> dict:
    return {
        "id": "upload-lease.pdf-1-2",
        "title": "Lease",
        "type": "Lease",
        "text": text,
        "score": 62,
        "findings": [{"id": "f1", "title": "Vague deadline", "severity": "warning"}],
    }


@pytest.fixture
def api(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    with mock_aws():
        table = boto3.resource("dynamodb", region_name="us-east-1").create_table(
            TableName="user-data",
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        monkeypatch.setattr(storage, "_table", lambda: table)
        app.dependency_overrides[current_user] = lambda: {"sub": "ada", "email": "ada@example.com"}
        yield client


def save(api: TestClient, document: dict, resolved: list[str] | None = None):
    return api.put(
        f"/api/v1/me/documents/{key(document['id'])}",
        json={"document_id": document["id"], "document": document, "resolved": resolved or []},
    )


def test_a_saved_document_comes_back_after_a_refresh(api: TestClient) -> None:
    assert save(api, lease(), ["f1"]).status_code == 200

    [restored] = api.get("/api/v1/me/documents").json()

    assert restored["document"] == lease()
    assert restored["resolved"] == ["f1"]
    assert restored["document_key"] == key(lease()["id"])


def test_saving_again_replaces_the_document(api: TestClient) -> None:
    save(api, lease("First draft"))
    save(api, lease("Second draft"))

    documents = api.get("/api/v1/me/documents").json()

    assert len(documents) == 1
    assert documents[0]["document"]["text"] == "Second draft"


def test_documents_are_listed_most_recent_first(api: TestClient) -> None:
    save(api, {**lease(), "id": "upload-a"})
    save(api, {**lease(), "id": "upload-b"})
    save(api, {**lease("edited"), "id": "upload-a"})

    ids = [entry["document_id"] for entry in api.get("/api/v1/me/documents").json()]

    assert ids == ["upload-a", "upload-b"]


def test_a_deleted_document_stays_deleted_and_frees_its_place(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(storage, "MAX_DOCUMENTS_PER_USER", 1)
    save(api, lease())
    assert save(api, {**lease(), "id": "upload-other"}).status_code == 429

    assert api.delete(f"/api/v1/me/documents/{key(lease()['id'])}").status_code == 204

    assert api.get("/api/v1/me/documents").json() == []
    assert save(api, {**lease(), "id": "upload-other"}).status_code == 200


def test_a_large_legal_document_fits_once_compressed(api: TestClient) -> None:
    """250k characters is the review limit; saved, it must still fit one item."""
    clause = "The tenant shall maintain the premises in good repair at all times. "
    text = (clause * (250_000 // len(clause) + 1))[:250_000]

    assert save(api, lease(text)).status_code == 200
    assert api.get("/api/v1/me/documents").json()[0]["document"]["text"] == text


def test_one_persons_documents_are_invisible_to_another(api: TestClient) -> None:
    save(api, lease())
    app.dependency_overrides[current_user] = lambda: {"sub": "bob", "email": "bob@example.com"}

    assert api.get("/api/v1/me/documents").json() == []
    assert api.get(f"/api/v1/me/documents/{key(lease()['id'])}").status_code == 404


def test_a_key_that_does_not_match_the_document_is_refused(api: TestClient) -> None:
    response = api.put(
        f"/api/v1/me/documents/{key('upload-something-else')}",
        json={"document_id": lease()["id"], "document": lease()},
    )
    assert response.status_code == 422


def test_the_list_stays_under_the_lambda_response_limit(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Past the budget, documents come back without a body to fetch one by one."""
    monkeypatch.setattr(workspace_routes, "LIST_BYTES_BUDGET", 300)
    save(api, {**lease(), "id": "upload-a"})
    save(api, {**lease(), "id": "upload-b"})

    listed = api.get("/api/v1/me/documents").json()

    assert [entry["document"] is not None for entry in listed] == [True, False]
    fetched = api.get(f"/api/v1/me/documents/{listed[1]['document_key']}").json()
    assert fetched["document"]["id"] == "upload-a"


def test_where_the_person_left_off_is_restored(api: TestClient) -> None:
    state = {
        "selected_document_id": "upload-lease.pdf-1-2",
        "jurisdiction": "Florida",
        "hidden_samples": ["benefits-notice"],
        "tasks": [{"id": "t1", "title": "Call the landlord", "detail": "", "completed": True}],
    }
    assert api.put("/api/v1/me/workspace-state", json=state).status_code == 200

    assert api.get("/api/v1/me/workspace-state").json() == state


def test_a_new_person_starts_with_an_empty_workspace_state(api: TestClient) -> None:
    assert api.get("/api/v1/me/workspace-state").json() == {
        "selected_document_id": None,
        "jurisdiction": "",
        "hidden_samples": [],
        "tasks": None,
    }


def test_saving_requires_a_signed_in_person(client: TestClient) -> None:
    assert client.get("/api/v1/me/documents").status_code == 401
