"""Slack-style channels: create, browse, join, leave, members, and delete.

Runs the real routes and storage code against moto's in-memory DynamoDB.
Ada owns the workspace; Bob is an ordinary member; Cy is not in it at all.
"""

from collections.abc import Iterator

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app import storage
from app.auth import current_user
from app.main import app

ADA = {"sub": "ada-0001", "email": "ada@example.com", "name": "Ada"}
BOB = {"sub": "bob-0002", "email": "bob@example.com", "name": "Bob"}
CY = {"sub": "cy-00003", "email": "cy@example.com", "name": "Cy"}


def as_user(user: dict[str, str]) -> None:
    app.dependency_overrides[current_user] = lambda: user


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
        yield client


@pytest.fixture
def workspace(api: TestClient) -> str:
    """Ada's workspace, which Bob has joined with an invite."""
    as_user(ADA)
    workspace_id = api.post("/api/v1/workspaces", json={"name": "Lease review"}).json()["id"]
    code = api.post(f"/api/v1/workspaces/{workspace_id}/invites").json()["invite_code"]
    as_user(BOB)
    assert api.post("/api/v1/workspaces/join", json={"invite_code": code}).status_code == 200
    return workspace_id


def channels(api: TestClient, workspace_id: str) -> dict[str, dict]:
    listed = api.get(f"/api/v1/workspaces/{workspace_id}/channels").json()
    return {channel["name"]: channel for channel in listed}


def create(api: TestClient, workspace_id: str, name: str, description: str = "") -> dict:
    response = api.post(
        f"/api/v1/workspaces/{workspace_id}/channels",
        json={"name": name, "description": description},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_general_includes_everyone_and_cannot_be_left_or_deleted(
    api: TestClient, workspace: str
) -> None:
    general = channels(api, workspace)["General"]
    assert general["is_member"] and general["member_count"] == 2
    assert api.post(f"/api/v1/workspaces/{workspace}/channels/general/leave").status_code == 400
    as_user(ADA)
    assert api.delete(f"/api/v1/workspaces/{workspace}/channels/general").status_code == 400


def test_any_member_can_create_a_channel_with_a_description(
    api: TestClient, workspace: str
) -> None:
    as_user(BOB)
    channel = create(api, workspace, "#deadlines", "Every date we must not miss.")

    assert channel["name"] == "deadlines"
    assert channel["description"] == "Every date we must not miss."
    assert channel["created_by_name"] == "Bob"
    assert channel["is_member"] and channel["member_count"] == 1


def test_channel_names_are_unique_whatever_the_case(api: TestClient, workspace: str) -> None:
    create(api, workspace, "Deadlines")
    response = api.post(f"/api/v1/workspaces/{workspace}/channels", json={"name": "deadlines"})
    assert response.status_code == 409


def test_others_can_browse_preview_and_join(api: TestClient, workspace: str) -> None:
    as_user(BOB)
    channel = create(api, workspace, "deadlines")
    api.post(
        f"/api/v1/workspaces/{workspace}/messages",
        json={"text": "Filing is due Friday.", "channel_id": channel["id"]},
    )

    as_user(ADA)
    browsed = channels(api, workspace)["deadlines"]
    assert not browsed["is_member"] and browsed["member_count"] == 1
    # Reading before joining is allowed, as in Slack.
    preview = api.get(f"/api/v1/workspaces/{workspace}/messages?channel_id={channel['id']}")
    assert [message["text"] for message in preview.json()] == ["Filing is due Friday."]
    # Posting is not.
    blocked = api.post(
        f"/api/v1/workspaces/{workspace}/messages",
        json={"text": "Hello", "channel_id": channel["id"]},
    )
    assert blocked.status_code == 403
    assert "Join #deadlines" in blocked.json()["detail"]

    joined = api.post(f"/api/v1/workspaces/{workspace}/channels/{channel['id']}/join").json()
    assert joined["is_member"] and joined["member_count"] == 2
    members = api.get(f"/api/v1/workspaces/{workspace}/channels/{channel['id']}/members").json()
    assert [member["name"] for member in members] == ["Bob", "Ada"]
    assert {member["name"]: member["role"] for member in members} == {
        "Bob": "member",
        "Ada": "owner",
    }


def test_leaving_removes_you_from_the_channel(api: TestClient, workspace: str) -> None:
    as_user(BOB)
    channel = create(api, workspace, "deadlines")

    left = api.post(f"/api/v1/workspaces/{workspace}/channels/{channel['id']}/leave").json()

    assert not left["is_member"] and left["member_count"] == 0


def test_only_the_creator_or_an_admin_can_edit_or_delete(api: TestClient, workspace: str) -> None:
    as_user(ADA)
    channel = create(api, workspace, "strategy")
    path = f"/api/v1/workspaces/{workspace}/channels/{channel['id']}"

    as_user(BOB)
    assert channels(api, workspace)["strategy"]["can_manage"] is False
    assert api.patch(path, json={"description": "Mine now"}).status_code == 403
    assert api.delete(path).status_code == 403

    as_user(ADA)
    assert channels(api, workspace)["strategy"]["can_manage"] is True
    edited = api.patch(path, json={"name": "case-strategy", "description": "How we argue it."})
    assert edited.json()["name"] == "case-strategy"
    assert edited.json()["description"] == "How we argue it."


def test_a_workspace_owner_can_delete_a_members_channel_and_its_messages(
    api: TestClient, workspace: str
) -> None:
    as_user(BOB)
    channel = create(api, workspace, "offtopic")
    api.post(
        f"/api/v1/workspaces/{workspace}/messages",
        json={"text": "Lunch?", "channel_id": channel["id"]},
    )

    as_user(ADA)
    assert api.delete(f"/api/v1/workspaces/{workspace}/channels/{channel['id']}").status_code == 204

    assert "offtopic" not in channels(api, workspace)
    gone = api.get(f"/api/v1/workspaces/{workspace}/messages?channel_id={channel['id']}")
    assert gone.status_code == 404


def test_a_quiet_channel_still_shows_its_messages_in_a_busy_workspace(
    api: TestClient, workspace: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Each channel is read on its own, not filtered from the busiest one."""
    as_user(BOB)
    quiet = create(api, workspace, "quiet")
    api.post(
        f"/api/v1/workspaces/{workspace}/messages",
        json={"text": "The only message here", "channel_id": quiet["id"]},
    )
    for index in range(5):
        api.post(f"/api/v1/workspaces/{workspace}/messages", json={"text": f"busy {index}"})

    shown = storage.list_workspace_messages(workspace, quiet["id"], limit=3)

    assert [message["text"] for message in shown] == ["The only message here"]


def test_a_channel_records_when_it_last_had_a_message(api: TestClient, workspace: str) -> None:
    as_user(BOB)
    api.post(f"/api/v1/workspaces/{workspace}/messages", json={"text": "Hi all"})
    assert channels(api, workspace)["General"]["last_message_at"]


def test_people_can_delete_their_own_messages_and_admins_any(
    api: TestClient, workspace: str
) -> None:
    as_user(BOB)
    mine = api.post(f"/api/v1/workspaces/{workspace}/messages", json={"text": "typo"}).json()
    as_user(ADA)
    theirs = api.post(f"/api/v1/workspaces/{workspace}/messages", json={"text": "notice"}).json()

    as_user(BOB)
    assert api.delete(f"/api/v1/workspaces/{workspace}/messages/{theirs['id']}").status_code == 403
    assert api.delete(f"/api/v1/workspaces/{workspace}/messages/{mine['id']}").status_code == 204
    as_user(ADA)
    assert api.delete(f"/api/v1/workspaces/{workspace}/messages/{theirs['id']}").status_code == 204

    assert api.get(f"/api/v1/workspaces/{workspace}/messages").json() == []


def test_channels_made_before_membership_stay_open_to_everyone(
    api: TestClient, workspace: str
) -> None:
    """An older channel has no member rows; everyone keeps access to it."""
    storage._table().put_item(
        Item={
            "PK": f"WORKSPACE#{workspace}",
            "SK": "CHANNEL#legacy-channel",
            "id": "legacy-channel",
            "workspace_id": workspace,
            "name": "Old channel",
            "created_at": "2026-09-25T10:00:00+00:00",
        }
    )

    old = channels(api, workspace)["Old channel"]

    assert old["is_member"] and old["member_count"] == 2


def test_outsiders_see_nothing(api: TestClient, workspace: str) -> None:
    as_user(CY)
    assert api.get(f"/api/v1/workspaces/{workspace}/channels").status_code == 403
    assert (
        api.post(f"/api/v1/workspaces/{workspace}/channels", json={"name": "x"}).status_code == 403
    )
    assert api.get(f"/api/v1/workspaces/{workspace}/channels/general/members").status_code == 403


# ── Admin rights and the workspace itself ───────────────────────────────────


def roster(api: TestClient, workspace_id: str) -> dict[str, str]:
    members = api.get(f"/api/v1/workspaces/{workspace_id}/members").json()
    return {member["name"]: member["role"] for member in members}


def test_only_admins_can_delete_a_channel_even_its_creator(api: TestClient, workspace: str) -> None:
    as_user(BOB)
    channel = create(api, workspace, "bobs-channel")
    assert channel["can_manage"] is True and channel["can_delete"] is False

    assert api.delete(f"/api/v1/workspaces/{workspace}/channels/{channel['id']}").status_code == 403

    as_user(ADA)
    assert channels(api, workspace)["bobs-channel"]["can_delete"] is True
    assert api.delete(f"/api/v1/workspaces/{workspace}/channels/{channel['id']}").status_code == 204


def test_the_owner_grants_and_removes_admin_rights(api: TestClient, workspace: str) -> None:
    as_user(ADA)
    granted = api.put(
        f"/api/v1/workspaces/{workspace}/members/{BOB['sub']}/role", json={"role": "admin"}
    )
    assert granted.status_code == 200
    assert roster(api, workspace) == {"Ada": "owner", "Bob": "admin"}

    # Bob, now an admin, can delete channels and sees himself as an admin.
    as_user(BOB)
    assert api.get("/api/v1/workspaces").json()[0]["role"] == "admin"
    channel = create(api, workspace, "temporary")
    assert api.delete(f"/api/v1/workspaces/{workspace}/channels/{channel['id']}").status_code == 204

    as_user(ADA)
    api.put(f"/api/v1/workspaces/{workspace}/members/{BOB['sub']}/role", json={"role": "member"})
    assert roster(api, workspace) == {"Ada": "owner", "Bob": "member"}


def test_only_the_owner_hands_out_admin_rights(api: TestClient, workspace: str) -> None:
    as_user(ADA)
    api.put(f"/api/v1/workspaces/{workspace}/members/{BOB['sub']}/role", json={"role": "admin"})

    as_user(BOB)
    # An admin cannot promote others or demote the owner.
    demote = api.put(
        f"/api/v1/workspaces/{workspace}/members/{ADA['sub']}/role", json={"role": "member"}
    )
    assert demote.status_code == 403
    assert roster(api, workspace)["Ada"] == "owner"


def test_members_can_leave_and_admins_can_remove_them(api: TestClient, workspace: str) -> None:
    as_user(BOB)
    channel = create(api, workspace, "bobs-notes")
    assert api.delete(f"/api/v1/workspaces/{workspace}/members/{BOB['sub']}").status_code == 204

    as_user(ADA)
    assert roster(api, workspace) == {"Ada": "owner"}
    # Leaving also took Bob out of every channel he had joined.
    assert channels(api, workspace)["bobs-notes"]["member_count"] == 0
    assert channel["id"]


def test_a_member_cannot_remove_others_and_nobody_removes_the_owner(
    api: TestClient, workspace: str
) -> None:
    as_user(BOB)
    assert api.delete(f"/api/v1/workspaces/{workspace}/members/{ADA['sub']}").status_code == 400
    as_user(ADA)
    assert api.delete(f"/api/v1/workspaces/{workspace}/members/{ADA['sub']}").status_code == 400


def test_only_admins_can_delete_the_workspace(api: TestClient, workspace: str) -> None:
    as_user(BOB)
    assert api.delete(f"/api/v1/workspaces/{workspace}").status_code == 403

    as_user(ADA)
    assert api.delete(f"/api/v1/workspaces/{workspace}").status_code == 204

    assert api.get("/api/v1/workspaces").json() == []
    as_user(BOB)
    assert api.get("/api/v1/workspaces").json() == []
    assert api.get(f"/api/v1/workspaces/{workspace}/channels").status_code == 403
