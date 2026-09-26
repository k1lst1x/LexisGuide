"""Chat contract shared by the LexisGuide API and the assistant runtime."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

MAX_TURNS = 20
MAX_TURN_CHARS = 4_000


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_TURN_CHARS)

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message content must not be blank")
        return value


class ChatContext(BaseModel):
    """What the person is looking at. Treated as untrusted reference material."""

    page: str | None = Field(default=None, max_length=60)
    signed_in: bool = False
    document_title: str | None = Field(default=None, max_length=300)
    document_type: str | None = Field(default=None, max_length=120)
    document_score: int | None = Field(default=None, ge=0, le=100)
    document_excerpt: str | None = Field(default=None, max_length=6_000)
    open_findings: list[str] = Field(default_factory=list, max_length=12)
    current_finding: str | None = Field(default=None, max_length=1_000)
    jurisdiction: str | None = Field(default=None, max_length=200)
    # The API verifies membership before a workspace-scoped request is sent to
    # the model. It is an isolation boundary, not information the model may use
    # as authority.
    workspace_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9-]{1,80}$")
    # Official research receipts supplied by the API. The research specialist
    # may cite these, but must never make up an authority that is not present.
    authority_sources: list[dict[str, str]] = Field(default_factory=list, max_length=6)

    @field_validator("open_findings")
    @classmethod
    def clip_findings(cls, value: list[str]) -> list[str]:
        return [item.strip()[:300] for item in value if item.strip()]

    @field_validator("authority_sources")
    @classmethod
    def clip_authorities(cls, value: list[dict[str, str]]) -> list[dict[str, str]]:
        safe: list[dict[str, str]] = []
        for source in value:
            if not isinstance(source, dict):
                continue
            safe.append(
                {
                    "citation": str(source.get("citation", ""))[:160],
                    "text": str(source.get("text", ""))[:4_000],
                    "url": str(source.get("url", ""))[:1_000],
                    "retrieved_at": str(source.get("retrieved_at", ""))[:80],
                }
            )
        return safe


class ChatRequest(BaseModel):
    messages: list[ChatTurn] = Field(min_length=1, max_length=MAX_TURNS)
    context: ChatContext = Field(default_factory=ChatContext)

    @field_validator("messages")
    @classmethod
    def ends_with_user(cls, value: list[ChatTurn]) -> list[ChatTurn]:
        if value[-1].role != "user":
            raise ValueError("The last message must come from the user")
        return value


class ChatReply(BaseModel):
    reply: str
    tools_used: list[str] = Field(default_factory=list)
    agents_used: list[str] = Field(default_factory=list)


def parse_chat_request(payload: dict[str, Any]) -> ChatRequest:
    return ChatRequest.model_validate(payload)


def parse_chat_reply(payload: Any) -> ChatReply:
    if isinstance(payload, dict) and "result" in payload and "reply" not in payload:
        payload = payload["result"]
    return ChatReply.model_validate(payload)
