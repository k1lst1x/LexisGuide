import json
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from lexisguide_assistant import ChatReply

from app.api.v1 import routes
from app.chat_agent import AssistantClient, runtime_session_id

CHAT = {
    "conversation_id": "conv-12345678",
    "messages": [{"role": "user", "content": "What is a lien?"}],
    "context": {"page": "Review", "signed_in": False},
}


def test_chat_requires_a_bearer_token(client: TestClient) -> None:
    assert client.post("/api/v1/chat", json=CHAT).status_code == 401


def test_chat_reports_when_the_assistant_is_not_configured(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(routes, "configured_assistant", lambda: None)
    response = authenticated_client.post("/api/v1/chat", json=CHAT)
    assert response.status_code == 503


def test_chat_replies_with_a_per_user_session_and_marks_the_user_signed_in(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = []

    class Assistant:
        def chat(self, request, session_id):
            calls.append((request, session_id))
            return ChatReply(reply="A lien is a legal claim.", tools_used=["explain_term"])

    monkeypatch.setattr(routes, "configured_assistant", lambda: Assistant())
    monkeypatch.setattr(routes, "consume_chat_quota", lambda _: True)

    response = authenticated_client.post("/api/v1/chat", json=CHAT)

    assert response.status_code == 200
    assert response.json() == {"reply": "A lien is a legal claim.", "tools_used": ["explain_term"]}
    request, session_id = calls[0]
    assert request.context.signed_in is True
    assert session_id == runtime_session_id("user-123", "conv-12345678")


def test_chat_is_rate_limited(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Assistant:
        def chat(self, *_):
            raise AssertionError("The model must not be called after rate limiting.")

    monkeypatch.setattr(routes, "configured_assistant", lambda: Assistant())
    monkeypatch.setattr(routes, "consume_chat_quota", lambda _: False)
    response = authenticated_client.post("/api/v1/chat", json=CHAT)
    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"


@pytest.mark.parametrize(
    "body",
    [
        {**CHAT, "conversation_id": "bad id!"},
        {**CHAT, "messages": [{"role": "assistant", "content": "hi"}]},
        {**CHAT, "messages": [{"role": "user", "content": "x" * 4001}]},
    ],
)
def test_chat_validates_requests(authenticated_client: TestClient, body: dict) -> None:
    assert authenticated_client.post("/api/v1/chat", json=body).status_code == 422


def test_runtime_client_invokes_agentcore_with_the_chat_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AGENTCORE_ASSISTANT_RUNTIME_ARN", "arn:aws:bedrock-agentcore:rt/assistant")
    sent = {}

    class Runtime:
        def invoke_agent_runtime(self, **kwargs):
            sent.update(kwargs)
            body = json.dumps({"reply": "Hello", "tools_used": []}).encode()
            return {"response": BytesIO(body)}

    from lexisguide_assistant import parse_chat_request

    reply = AssistantClient(runtime_client=Runtime()).chat(
        parse_chat_request({"messages": [{"role": "user", "content": "hi"}]}), "s" * 64
    )

    assert reply.reply == "Hello"
    assert sent["agentRuntimeArn"] == "arn:aws:bedrock-agentcore:rt/assistant"
    assert sent["runtimeSessionId"] == "s" * 64
    assert json.loads(sent["payload"])["messages"][0]["content"] == "hi"


def test_session_ids_differ_per_user_and_meet_agentcore_length() -> None:
    first = runtime_session_id("user-a", "conv-12345678")
    assert first != runtime_session_id("user-b", "conv-12345678")
    assert len(first) >= 33
