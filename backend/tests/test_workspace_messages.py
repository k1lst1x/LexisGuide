from fastapi.testclient import TestClient

from app.api.v1 import routes


def test_workspace_messages_require_membership(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(routes, "get_workspace_membership", lambda *_: None)

    response = authenticated_client.get("/api/v1/workspaces/workspace-123/messages")

    assert response.status_code == 403


def test_members_can_post_and_read_workspace_messages(
    authenticated_client: TestClient, monkeypatch
) -> None:
    stored = {
        "id": "message-123",
        "workspace_id": "workspace-123",
        "user": "Person",
        "author_email": "person@example.com",
        "text": "Please review the deadline.",
        "created_at": "2026-09-25T12:00:00+00:00",
        "attachment": "doc-1",
    }
    monkeypatch.setattr(routes, "get_workspace_membership", lambda *_: {"role": "member"})
    monkeypatch.setattr(routes, "get_workspace_channel", lambda *_: {"id": "general"})
    monkeypatch.setattr(routes, "is_channel_member", lambda *_: True)
    monkeypatch.setattr(routes, "create_workspace_message", lambda *_: stored)
    monkeypatch.setattr(routes, "list_workspace_messages", lambda *_: [stored])

    created = authenticated_client.post(
        "/api/v1/workspaces/workspace-123/messages",
        json={"text": "Please review the deadline.", "attachment": "doc-1"},
    )
    listed = authenticated_client.get("/api/v1/workspaces/workspace-123/messages")

    assert created.status_code == 201
    assert created.json()["author_email"] == "person@example.com"
    assert listed.status_code == 200
    assert listed.json()[0]["text"] == "Please review the deadline."
