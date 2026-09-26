"""Give the assistant's inbox agent the person's recent workspace messages.

Only when the question is about messages, tasks or priorities (or the person
is in Messages), and only from channels the person has joined in workspaces
they belong to: the same messages they can already read. Failures are
non-fatal; the assistant then says it has no messages to work from.
"""

from __future__ import annotations

import logging
from typing import Any

from lexisguide_assistant import ChatRequest
from lexisguide_assistant.models import MAX_INBOX, InboxMessage
from lexisguide_assistant.orchestrator import INBOX_QUERY

from app.storage import list_workspace_channels, list_workspace_messages, list_workspaces

logger = logging.getLogger(__name__)

MAX_WORKSPACES = 6
MAX_CHANNELS = 12
MESSAGES_PER_CHANNEL = 12


def wants_inbox(request: ChatRequest) -> bool:
    page = (request.context.page or "").lower()
    return "message" in page or bool(INBOX_QUERY.search(request.messages[-1].content))


def _mentions(message: dict[str, Any], user: dict[str, str]) -> bool:
    if any(
        mention.get("type") == "user" and mention.get("id") == user["sub"]
        for mention in message.get("mentions") or []
    ):
        return True
    text = str(message.get("text", "")).lower()
    names = {user.get("name", ""), (user.get("email") or "").split("@")[0]}
    return any(name and f"@{name.lower()}" in text for name in names)


def gather_inbox(user: dict[str, str]) -> list[InboxMessage]:
    collected: list[tuple[str, InboxMessage]] = []
    channels_read = 0
    for workspace in list_workspaces(user["sub"])[:MAX_WORKSPACES]:
        workspace_id = workspace.get("id") or workspace.get("workspace_id")
        if not workspace_id:
            continue
        for channel in list_workspace_channels(workspace_id, user["sub"]):
            if not channel.get("is_member") or channels_read >= MAX_CHANNELS:
                continue
            channels_read += 1
            for message in list_workspace_messages(
                workspace_id, channel["id"], limit=MESSAGES_PER_CHANNEL
            ):
                text = str(message.get("text", "")).strip()
                if not text:
                    continue
                mine = message.get("author_id") == user["sub"]
                collected.append(
                    (
                        str(message.get("created_at", "")),
                        InboxMessage(
                            workspace=str(workspace.get("name", ""))[:200],
                            channel=str(channel.get("name", ""))[:120],
                            author="You" if mine else str(message.get("user", ""))[:200],
                            text=text[:1_000],
                            sent_at=str(message.get("created_at", ""))[:40],
                            mentions_me=not mine and _mentions(message, user),
                        ),
                    )
                )
    collected.sort(key=lambda item: item[0], reverse=True)
    return [message for _, message in collected[:MAX_INBOX]]


def add_inbox(request: ChatRequest, user: dict[str, str]) -> ChatRequest:
    if not wants_inbox(request):
        return request
    try:
        inbox = gather_inbox(user)
    except Exception as error:  # noqa: BLE001 - the answer goes on without messages
        logger.warning("Could not gather messages for the assistant: %s", error)
        return request
    return request.model_copy(
        update={"context": request.context.model_copy(update={"inbox": inbox})}
    )
