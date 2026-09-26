"""Conversational assistant: the LexisGuideAssistant AgentCore runtime, or the same
agent run directly against Bedrock when no runtime is configured (local development)."""

from __future__ import annotations

import json
import os
from hashlib import sha256
from typing import Any

import boto3
from lexisguide_assistant import ChatReply, ChatRequest, SupervisorAgent, parse_chat_reply


class AssistantUnavailableError(RuntimeError):
    """The runtime answered with an error instead of a reply."""


def runtime_session_id(user_id: str, conversation_id: str, workspace_id: str = "") -> str:
    """Stable per user and conversation, so one person can never join another's session."""
    return sha256(f"{user_id}:{workspace_id}:{conversation_id}".encode()).hexdigest()


class AssistantClient:
    def __init__(self, runtime_client: Any | None = None, agent: Any | None = None) -> None:
        region = os.getenv("AWS_REGION", "us-east-1")
        self.runtime_arn = os.getenv("AGENTCORE_ASSISTANT_RUNTIME_ARN", "")
        self.runtime_client = runtime_client or (
            boto3.client("bedrock-agentcore", region_name=region) if self.runtime_arn else None
        )
        self.agent = agent or (None if self.runtime_arn else SupervisorAgent())

    def chat(self, request: ChatRequest, session_id: str) -> ChatReply:
        if self.runtime_arn and self.runtime_client:
            response = self.runtime_client.invoke_agent_runtime(
                agentRuntimeArn=self.runtime_arn,
                runtimeSessionId=session_id,
                payload=request.model_dump_json().encode("utf-8"),
                qualifier="DEFAULT",
            )
            raw = response["response"].read()
            parsed = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
            if isinstance(parsed, dict) and parsed.get("error"):
                raise AssistantUnavailableError(str(parsed["error"]))
            return parse_chat_reply(parsed)
        return self.agent.chat(request)


def configured_assistant() -> AssistantClient | None:
    if os.getenv("AGENTCORE_ASSISTANT_RUNTIME_ARN") or os.getenv("ASSISTANT_MODEL_ID"):
        return AssistantClient()
    return None
