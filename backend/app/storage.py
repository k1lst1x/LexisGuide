from __future__ import annotations

import gzip
import json
import os
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from functools import lru_cache
from hashlib import sha256
from typing import Any
from uuid import uuid4

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

INVITE_TTL_SECONDS = 24 * 60 * 60
LAWYER_VERIFICATION_MAX_ATTEMPTS = 3
REVIEW_RATE_LIMIT_WINDOW_SECONDS = 60
REVIEW_RATE_LIMIT_PER_WINDOW = 10
CHAT_RATE_LIMIT_WINDOW_SECONDS = 60
CHAT_RATE_LIMIT_PER_WINDOW = 20
STATUTE_RATE_LIMIT_WINDOW_SECONDS = 60
STATUTE_RATE_LIMIT_PER_WINDOW = 20
# Every ledger change is a transaction the recorder wallet pays for.
LEDGER_RATE_LIMIT_PER_WINDOW = 30
REMOTE_OPERATION_PER_USER_CONCURRENCY = 2
REMOTE_OPERATION_GLOBAL_CONCURRENCY = 8
# The API Lambda times out after 29 seconds. A one-minute lease releases a
# crashed invocation without allowing a live request to lose its slot early.
REMOTE_OPERATION_LEASE_SECONDS = 60
# A bounded item size plus a bounded item count puts a hard ceiling on durable
# user-controlled data, even when an authenticated client writes continuously.
MAX_RECORDS_PER_USER = 500
MAX_CONVERSATIONS_PER_USER = 100
MAX_DOCUMENTS_PER_USER = 200
# DynamoDB items stop at 400 KB. Compressed bodies stay well under it, leaving
# room for the other attributes.
MAX_DOCUMENT_BYTES = 350_000
RESOURCE_WRITE_RETRIES = 5


@dataclass(frozen=True)
class RemoteOperationLease:
    slots: tuple[tuple[str, str, str], ...]


def _bounded_positive_int(name: str, default: int, maximum: int) -> int:
    """Read a deployment setting without allowing an invalid value to disable a guardrail."""
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return value if 0 < value <= maximum else default


@lru_cache
def _table():
    table_name = os.getenv("USER_DATA_TABLE", "")
    if not table_name:
        raise RuntimeError("USER_DATA_TABLE is required.")
    return boto3.resource("dynamodb", region_name=os.getenv("AWS_REGION")).Table(table_name)


def get_profile(user_id: str) -> dict[str, Any] | None:
    return _table().get_item(Key={"PK": f"USER#{user_id}", "SK": "PROFILE"}).get("Item")


def put_profile(user_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    item = {"PK": f"USER#{user_id}", "SK": "PROFILE", **profile}
    _table().put_item(Item=item)
    return item


def invalidate_user_sessions(username: str) -> int:
    """Reject all ID tokens issued at or before this administrator action."""
    valid_after = int(time.time())
    _table().put_item(
        Item={
            "PK": f"AUTH#{username}",
            "SK": "SESSION",
            "valid_after": valid_after,
        }
    )
    return valid_after


def user_sessions_valid_after(username: str) -> int:
    item = _table().get_item(Key={"PK": f"AUTH#{username}", "SK": "SESSION"}).get("Item", {})
    valid_after = item.get("valid_after", 0)
    return valid_after if isinstance(valid_after, int) and valid_after >= 0 else 0


def save_record(user_id: str, record_id: str, record: dict[str, Any]) -> dict[str, Any]:
    item = {"PK": f"USER#{user_id}", "SK": f"RECORD#{record_id}", **record}
    _table().put_item(Item=item)
    return item


def _count_user_resources(user_id: str, prefix: str) -> int:
    """Count all matching rows, including legacy rows created before quotas existed."""
    query_args: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with(prefix),
        "Select": "COUNT",
    }
    total = 0
    while True:
        response = _table().query(**query_args)
        total += response.get("Count", len(response.get("Items", [])))
        last_evaluated_key = response.get("LastEvaluatedKey")
        if last_evaluated_key is None:
            return total
        query_args["ExclusiveStartKey"] = last_evaluated_key


def _quota_count(user_id: str, kind: str) -> int:
    item = _table().get_item(Key={"PK": f"USER#{user_id}", "SK": f"QUOTA#{kind}"}).get("Item", {})
    # DynamoDB hands numbers back as Decimal, never int.
    value = item.get("count", 0)
    return int(value) if isinstance(value, int | Decimal) and value >= 0 else 0


def _cancellation_reason(error: ClientError, index: int) -> str | None:
    reasons = error.response.get("CancellationReasons", [])
    if index >= len(reasons):
        return None
    return reasons[index].get("Code")


def _create_resource_with_limit(
    user_id: str,
    *,
    kind: str,
    prefix: str,
    limit: int,
    item: dict[str, Any],
) -> str:
    """Atomically write one new row and its exact user quota.

    Values go to ``table.meta.client`` as plain Python: a DynamoDB resource's
    client serializes them itself, so pre-serialized values would be encoded
    twice and every transaction rejected.

    The initial count is reconciled from existing rows, so accounts created
    before this guardrail cannot receive a second allocation. A conditional
    transaction keeps the item and quota inseparable under concurrent writes.
    """
    for _ in range(RESOURCE_WRITE_RETRIES):
        stored_count = _count_user_resources(user_id, prefix)
        observed_quota = _quota_count(user_id, kind)
        count = max(stored_count, observed_quota)
        if count >= limit:
            return "limit"

        table = _table()
        try:
            table.meta.client.transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": table.name,
                            "Item": item,
                            "ConditionExpression": "attribute_not_exists(PK)",
                        }
                    },
                    {
                        "Update": {
                            "TableName": table.name,
                            "Key": {"PK": f"USER#{user_id}", "SK": f"QUOTA#{kind}"},
                            "UpdateExpression": "SET #count = :new_count",
                            "ConditionExpression": (
                                "attribute_not_exists(#count) OR #count = :observed_count"
                            ),
                            "ExpressionAttributeNames": {"#count": "count"},
                            "ExpressionAttributeValues": {
                                ":new_count": count + 1,
                                ":observed_count": observed_quota,
                            },
                        }
                    },
                ]
            )
            return "created"
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") != "TransactionCanceledException":
                raise
            if _cancellation_reason(error, 0) == "ConditionalCheckFailed":
                return "exists"
            # Another request updated the quota after our read. Reconcile and retry.
    raise RuntimeError("Could not reserve persistent storage after concurrent writes.")


def create_record_with_limit(
    user_id: str, record_id: str, record: dict[str, Any]
) -> dict[str, Any] | None:
    item = {"PK": f"USER#{user_id}", "SK": f"RECORD#{record_id}", **record}
    result = _create_resource_with_limit(
        user_id,
        kind="RECORDS",
        prefix="RECORD#",
        limit=MAX_RECORDS_PER_USER,
        item=item,
    )
    if result == "limit":
        return None
    if result != "created":
        raise RuntimeError("A generated record id unexpectedly already exists.")
    return item


def _pack_turns(turns: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], bytes]:
    """Compress a conversation to fit one DynamoDB item.

    Long pasted questions and long answers made the raw turns overflow the
    400 KB item limit, so the whole save failed and the conversation was lost.
    Compressed, a long conversation fits easily; if one ever does not, its
    oldest turns go first rather than the save failing.
    """
    kept = list(turns)
    while True:
        body = gzip.compress(json.dumps(kept, separators=(",", ":")).encode("utf-8"))
        if len(body) <= MAX_DOCUMENT_BYTES or len(kept) <= 1:
            return kept, body
        kept = kept[1:]


def _unpack_turns(item: dict[str, Any]) -> list[dict[str, Any]]:
    packed = item.get("turns_gz")
    if packed is not None:
        raw = getattr(packed, "value", packed)  # boto3 returns a Binary wrapper.
        return json.loads(gzip.decompress(bytes(raw)).decode("utf-8"))
    # Conversations saved before compression kept their turns as a plain list.
    return list(item.get("turns", []))


def get_conversation(user_id: str, conversation_id: str) -> dict[str, Any] | None:
    """Read one of this user's saved conversations.

    Conversations are keyed under the user's own partition, so a query can only
    ever reach that person's own history. The conversation id never widens it.
    """
    item = (
        _table()
        .get_item(Key={"PK": f"USER#{user_id}", "SK": f"CHAT#{conversation_id}"})
        .get("Item")
    )
    if not item:
        return None
    return {
        "conversation_id": conversation_id,
        "turns": _unpack_turns(item),
        "updated_at": item.get("updated_at", ""),
        "title": item.get("title", ""),
    }


def save_conversation(
    user_id: str, conversation_id: str, turns: list[dict[str, Any]], title: str = ""
) -> dict[str, Any]:
    """Write a conversation back to the user's own partition."""
    now = datetime.now(UTC).isoformat()
    kept, packed = _pack_turns(turns)
    _table().put_item(
        Item={
            "PK": f"USER#{user_id}",
            "SK": f"CHAT#{conversation_id}",
            "turns_gz": packed,
            "title": title,
            "updated_at": now,
        }
    )
    return {"conversation_id": conversation_id, "turns": kept, "updated_at": now, "title": title}


def save_conversation_with_limit(
    user_id: str, conversation_id: str, turns: list[dict[str, Any]], title: str = ""
) -> tuple[str, dict[str, Any] | None]:
    """Create a conversation under its cap, or safely update an existing one.

    A concurrent first write with the same id sees the conditional item write
    fail and becomes an update; it never consumes another capacity slot.
    """
    if get_conversation(user_id, conversation_id) is not None:
        return "updated", save_conversation(user_id, conversation_id, turns, title)

    now = datetime.now(UTC).isoformat()
    kept, packed = _pack_turns(turns)
    item = {
        "PK": f"USER#{user_id}",
        "SK": f"CHAT#{conversation_id}",
        "turns_gz": packed,
        "title": title,
        "updated_at": now,
    }
    result = _create_resource_with_limit(
        user_id,
        kind="CONVERSATIONS",
        prefix="CHAT#",
        limit=MAX_CONVERSATIONS_PER_USER,
        item=item,
    )
    if result == "created":
        return "created", {
            "conversation_id": conversation_id,
            "turns": kept,
            "updated_at": now,
            "title": title,
        }
    if result == "exists":
        return "updated", save_conversation(user_id, conversation_id, turns, title)
    return "limit", None


def list_conversations(user_id: str, limit: int = 30) -> list[dict[str, Any]]:
    """The user's conversations, most recently updated first."""
    response = _table().query(
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("CHAT#"),
    )
    conversations = [
        {
            "conversation_id": item["SK"].removeprefix("CHAT#"),
            "title": item.get("title", ""),
            "updated_at": item.get("updated_at", ""),
            "turns": [],
        }
        for item in response.get("Items", [])
    ]
    conversations.sort(key=lambda entry: entry["updated_at"], reverse=True)
    return conversations[:limit]


def list_records(user_id: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    query_args: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("RECORD#")
    }

    while True:
        response = _table().query(**query_args)
        records.extend(response.get("Items", []))
        last_evaluated_key = response.get("LastEvaluatedKey")
        if last_evaluated_key is None:
            return records
        query_args["ExclusiveStartKey"] = last_evaluated_key


def create_workspace(owner: dict[str, str], name: str) -> dict[str, Any]:
    workspace_id = str(uuid4())
    now = datetime.now(UTC).isoformat()
    workspace = {"id": workspace_id, "name": name, "owner_id": owner["sub"], "created_at": now}
    table = _table()
    table.put_item(Item={"PK": f"WORKSPACE#{workspace_id}", "SK": "META", **workspace})
    table.put_item(
        Item={
            "PK": f"WORKSPACE#{workspace_id}",
            "SK": f"MEMBER#{owner['sub']}",
            "workspace_id": workspace_id,
            "user_id": owner["sub"],
            "email": owner.get("email", ""),
            "name": owner.get("name", ""),
            "role": "owner",
            "joined_at": now,
        }
    )
    table.put_item(
        Item={
            "PK": f"USER#{owner['sub']}",
            "SK": f"WORKSPACE#{workspace_id}",
            "workspace_id": workspace_id,
            "role": "owner",
            "name": name,
            "joined_at": now,
        }
    )
    table.put_item(
        Item={
            "PK": f"WORKSPACE#{workspace_id}",
            "SK": "CHANNEL#general",
            "id": "general",
            "workspace_id": workspace_id,
            "name": "General",
            "created_at": now,
        }
    )
    return workspace


def list_workspaces(user_id: str) -> list[dict[str, Any]]:
    response = _table().query(
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("WORKSPACE#")
    )
    workspaces = []
    for membership in response.get("Items", []):
        workspace = (
            _table()
            .get_item(Key={"PK": f"WORKSPACE#{membership['workspace_id']}", "SK": "META"})
            .get("Item")
        )
        if workspace:
            workspaces.append({**workspace, "role": membership.get("role", "member")})
    return workspaces


def set_workspace_linked_document(
    workspace_id: str, document_id: str, document_title: str
) -> dict[str, Any]:
    """Persist the host-selected document shown in a shared workspace."""
    response = _table().update_item(
        Key={"PK": f"WORKSPACE#{workspace_id}", "SK": "META"},
        UpdateExpression=(
            "SET linked_document_id = :document_id, linked_document_title = :document_title"
        ),
        ExpressionAttributeValues={":document_id": document_id, ":document_title": document_title},
        ReturnValues="ALL_NEW",
    )
    return response["Attributes"]


def get_workspace_membership(workspace_id: str, user_id: str) -> dict[str, Any] | None:
    return (
        _table()
        .get_item(Key={"PK": f"WORKSPACE#{workspace_id}", "SK": f"MEMBER#{user_id}"})
        .get("Item")
    )


def set_workspace_member_role(workspace_id: str, user_id: str, role: str) -> None:
    """Change a member's role, on both the roster row and their own pointer."""
    for key in (
        {"PK": f"WORKSPACE#{workspace_id}", "SK": f"MEMBER#{user_id}"},
        {"PK": f"USER#{user_id}", "SK": f"WORKSPACE#{workspace_id}"},
    ):
        _table().update_item(
            Key=key,
            UpdateExpression="SET #role = :role",
            ConditionExpression=Attr("PK").exists(),
            ExpressionAttributeNames={"#role": "role"},
            ExpressionAttributeValues={":role": role},
        )


def remove_workspace_member(workspace_id: str, user_id: str) -> None:
    """Take someone out of a workspace, including every channel they joined."""
    keys = [
        {"PK": f"WORKSPACE#{workspace_id}", "SK": f"MEMBER#{user_id}"},
        {"PK": f"USER#{user_id}", "SK": f"WORKSPACE#{workspace_id}"},
    ]
    keys += [
        {"PK": item["PK"], "SK": item["SK"]}
        for item in _query_prefix(workspace_id, "CHANMEM#")
        if item.get("user_id") == user_id
    ]
    with _table().batch_writer() as batch:
        for key in keys:
            batch.delete_item(Key=key)


def delete_workspace(workspace_id: str) -> None:
    """Delete a workspace with its channels, messages, and every membership."""
    admin_delete_workspace(workspace_id)


def list_workspace_members(workspace_id: str) -> list[dict[str, Any]]:
    response = _table().query(
        KeyConditionExpression=Key("PK").eq(f"WORKSPACE#{workspace_id}")
        & Key("SK").begins_with("MEMBER#")
    )
    return response.get("Items", [])


GENERAL = "general"


def _channel_key(workspace_id: str, channel_id: str) -> dict[str, str]:
    return {"PK": f"WORKSPACE#{workspace_id}", "SK": f"CHANNEL#{channel_id}"}


def _channel_member_sk(channel_id: str, user_id: str) -> str:
    return f"CHANMEM#{channel_id}#{user_id}"


def _query_prefix(workspace_id: str, prefix: str, **extra: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    args: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(f"WORKSPACE#{workspace_id}")
        & Key("SK").begins_with(prefix),
        **extra,
    }
    while True:
        response = _table().query(**args)
        items.extend(response.get("Items", []))
        last = response.get("LastEvaluatedKey")
        if last is None or "Limit" in extra:
            return items
        args["ExclusiveStartKey"] = last


def _general(workspace_id: str) -> dict[str, Any]:
    return {
        **_channel_key(workspace_id, GENERAL),
        "id": GENERAL,
        "workspace_id": workspace_id,
        "name": "General",
        "description": (
            "Everyone in the workspace. Announcements and anything that fits no other channel."
        ),
        "created_at": datetime.now(UTC).isoformat(),
    }


def _seed_channel_members(workspace_id: str, channel: dict[str, Any]) -> None:
    """Channels made before membership existed were open to everyone; keep
    that by making every current workspace member a member, once."""
    with _table().batch_writer() as batch:
        for member in list_workspace_members(workspace_id):
            batch.put_item(
                Item={
                    "PK": f"WORKSPACE#{workspace_id}",
                    "SK": _channel_member_sk(channel["id"], member["user_id"]),
                    "channel_id": channel["id"],
                    "user_id": member["user_id"],
                    "email": member.get("email", ""),
                    "name": member.get("name", ""),
                    "joined_at": channel.get("created_at", ""),
                }
            )
    _table().update_item(
        Key=_channel_key(workspace_id, channel["id"]),
        UpdateExpression="SET members_seeded = :true",
        ExpressionAttributeValues={":true": True},
    )


def list_workspace_channels(workspace_id: str, user_id: str | None = None) -> list[dict[str, Any]]:
    """Every channel in a workspace, with its member count and whether
    ``user_id`` belongs to it. General comes first, then by name."""
    channels = _query_prefix(workspace_id, "CHANNEL#")
    # Workspaces created before channels shipped get General lazily, without
    # losing any of their existing messages.
    if not any(channel["id"] == GENERAL for channel in channels):
        general = _general(workspace_id)
        _table().put_item(Item=general)
        channels.append(general)
    for channel in channels:
        if channel["id"] != GENERAL and not channel.get("members_seeded"):
            _seed_channel_members(workspace_id, channel)
    memberships = _query_prefix(workspace_id, "CHANMEM#")
    workspace_members = list_workspace_members(workspace_id)
    counts: dict[str, int] = {}
    mine: set[str] = set()
    for membership in memberships:
        counts[membership["channel_id"]] = counts.get(membership["channel_id"], 0) + 1
        if membership.get("user_id") == user_id:
            mine.add(membership["channel_id"])
    listed = []
    for channel in channels:
        is_general = channel["id"] == GENERAL
        listed.append(
            {
                **channel,
                "member_count": len(workspace_members)
                if is_general
                else counts.get(channel["id"], 0),
                "is_member": is_general or channel["id"] in mine,
            }
        )
    return sorted(listed, key=lambda channel: (channel["id"] != GENERAL, channel["name"].lower()))


def get_workspace_channel(workspace_id: str, channel_id: str) -> dict[str, Any] | None:
    channel = _table().get_item(Key=_channel_key(workspace_id, channel_id)).get("Item")
    if channel is None and channel_id == GENERAL:
        # Backfill General for a pre-channel workspace before its first read or
        # write, even when the client has not opened the channel list yet.
        channel = _general(workspace_id)
        _table().put_item(Item=channel)
    return channel


def channel_name_taken(workspace_id: str, name: str, except_id: str | None = None) -> bool:
    wanted = name.casefold()
    return any(
        channel["name"].casefold() == wanted and channel["id"] != except_id
        for channel in _query_prefix(workspace_id, "CHANNEL#")
    )


def create_workspace_channel(
    workspace_id: str, name: str, description: str = "", creator: dict[str, str] | None = None
) -> dict[str, Any]:
    """Create a channel; whoever creates it is its first member."""
    channel_id = str(uuid4())
    now = datetime.now(UTC).isoformat()
    creator = creator or {}
    channel = {
        **_channel_key(workspace_id, channel_id),
        "id": channel_id,
        "workspace_id": workspace_id,
        "name": name,
        "description": description,
        "created_by": creator.get("sub", ""),
        "created_by_name": creator.get("name") or creator.get("email", ""),
        "created_at": now,
        "members_seeded": True,
    }
    _table().put_item(Item=channel)
    if creator.get("sub"):
        add_channel_member(workspace_id, channel_id, creator)
    return channel


def update_workspace_channel(
    workspace_id: str, channel_id: str, name: str | None = None, description: str | None = None
) -> dict[str, Any]:
    fields = {
        key: value
        for key, value in (("name", name), ("description", description))
        if value is not None
    }
    if not fields:
        return get_workspace_channel(workspace_id, channel_id) or {}
    names = {f"#f{index}": key for index, key in enumerate(fields)}
    values = {f":v{index}": value for index, value in enumerate(fields.values())}
    response = _table().update_item(
        Key=_channel_key(workspace_id, channel_id),
        UpdateExpression="SET " + ", ".join(f"#f{i} = :v{i}" for i in range(len(fields))),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW",
    )
    return response["Attributes"]


def delete_workspace_channel(workspace_id: str, channel_id: str) -> bool:
    """Remove a channel with its memberships and messages. General stays."""
    if channel_id == GENERAL or not get_workspace_channel(workspace_id, channel_id):
        return False
    keys = [
        {"PK": item["PK"], "SK": item["SK"]}
        for item in _query_prefix(workspace_id, f"CHANMEM#{channel_id}#")
    ]
    keys += [
        {"PK": item["PK"], "SK": item["SK"]}
        for item in _query_prefix(workspace_id, f"MESSAGE#{channel_id}#")
    ]
    keys += [
        {"PK": item["PK"], "SK": item["SK"]}
        for item in _legacy_messages(workspace_id)
        if item.get("channel_id") == channel_id
    ]
    keys.append(_channel_key(workspace_id, channel_id))
    with _table().batch_writer() as batch:
        for key in keys:
            batch.delete_item(Key=key)
    return True


def is_channel_member(workspace_id: str, channel_id: str, user_id: str) -> bool:
    if channel_id == GENERAL:
        return get_workspace_membership(workspace_id, user_id) is not None
    return bool(
        _table()
        .get_item(
            Key={"PK": f"WORKSPACE#{workspace_id}", "SK": _channel_member_sk(channel_id, user_id)}
        )
        .get("Item")
    )


def add_channel_member(workspace_id: str, channel_id: str, user: dict[str, str]) -> None:
    _table().put_item(
        Item={
            "PK": f"WORKSPACE#{workspace_id}",
            "SK": _channel_member_sk(channel_id, user["sub"]),
            "channel_id": channel_id,
            "user_id": user["sub"],
            "email": user.get("email", ""),
            "name": user.get("name", ""),
            "joined_at": datetime.now(UTC).isoformat(),
        }
    )


def remove_channel_member(workspace_id: str, channel_id: str, user_id: str) -> None:
    _table().delete_item(
        Key={"PK": f"WORKSPACE#{workspace_id}", "SK": _channel_member_sk(channel_id, user_id)}
    )


def list_channel_members(workspace_id: str, channel_id: str) -> list[dict[str, Any]]:
    """Channel members with their workspace role, earliest joiner first."""
    workspace_members = {
        member["user_id"]: member for member in list_workspace_members(workspace_id)
    }
    if channel_id == GENERAL:
        people = list(workspace_members.values())
    else:
        people = [
            {**workspace_members.get(item["user_id"], {}), **item}
            for item in _query_prefix(workspace_id, f"CHANMEM#{channel_id}#")
        ]
    return sorted(
        [
            {
                "user_id": person["user_id"],
                "email": person.get("email", ""),
                "name": person.get("name", ""),
                "role": workspace_members.get(person["user_id"], {}).get("role", "member"),
                "joined_at": person.get("joined_at", ""),
            }
            for person in people
        ],
        key=lambda person: person["joined_at"],
    )


def create_workspace_message(
    workspace_id: str,
    user: dict[str, str],
    text: str,
    attachment: str | None = None,
    channel_id: str = GENERAL,
) -> dict[str, Any]:
    """Store a message inside one shared workspace's partition.

    Messages never live under a browser or a user partition, so every member
    who passes the membership check reads the same ordered thread. Each
    channel's messages share a key prefix, so reading one channel never reads
    another's.
    """
    now = datetime.now(UTC).isoformat()
    message_id = str(uuid4())
    message = {
        "id": message_id,
        "workspace_id": workspace_id,
        "channel_id": channel_id,
        "author_id": user.get("sub", ""),
        "user": user.get("name") or user.get("email") or "Workspace member",
        "author_email": user.get("email", ""),
        "text": text,
        "created_at": now,
        "attachment": attachment or "",
    }
    _table().put_item(
        Item={
            "PK": f"WORKSPACE#{workspace_id}",
            # ISO-8601 is lexicographically ordered, keeping DynamoDB reads in
            # conversation order without a table-wide scan.
            "SK": f"MESSAGE#{channel_id}#{now}#{message_id}",
            **message,
        }
    )
    try:
        _table().update_item(
            Key=_channel_key(workspace_id, channel_id),
            UpdateExpression="SET last_message_at = :at",
            ConditionExpression=Attr("PK").exists(),
            ExpressionAttributeValues={":at": now},
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
    return message


def _legacy_messages(workspace_id: str, limit: int | None = None) -> list[dict[str, Any]]:
    """Messages stored before each channel had its own key prefix. Their key
    is MESSAGE#<timestamp>#<id>, and all were written in 2026 or later."""
    extra: dict[str, Any] = {"ScanIndexForward": False}
    if limit:
        extra["Limit"] = limit
    return [
        item
        for item in _query_prefix(workspace_id, "MESSAGE#20", **extra)
        if len(item["SK"].split("#")) == 3
    ]


def list_workspace_messages(
    workspace_id: str, channel_id: str = GENERAL, limit: int = 200
) -> list[dict[str, Any]]:
    """A channel's newest messages, oldest first."""
    current = _query_prefix(
        workspace_id, f"MESSAGE#{channel_id}#", ScanIndexForward=False, Limit=limit
    )
    legacy = [
        item
        for item in _legacy_messages(workspace_id, limit)
        # Messages written before channels belong to General.
        if item.get("channel_id", GENERAL) == channel_id
    ]
    merged = sorted(current + legacy, key=lambda item: item["created_at"])
    return merged[-limit:]


def get_workspace_message(
    workspace_id: str, channel_id: str, message_id: str
) -> dict[str, Any] | None:
    return next(
        (
            item
            for item in list_workspace_messages(workspace_id, channel_id, limit=1_000)
            if item["id"] == message_id
        ),
        None,
    )


def delete_workspace_message(workspace_id: str, message: dict[str, Any]) -> None:
    _table().delete_item(Key={"PK": message["PK"], "SK": message["SK"]})


def consume_review_quota(user_id: str) -> bool:
    """Atomically reserve one bounded Bedrock review per authenticated user.

    The durable counter works across warm Lambda instances. Its partition key uses
    a hash so user identifiers are not exposed in operational table views.
    """
    return _consume_quota(
        "REVIEW",
        user_id,
        _bounded_positive_int(
            "REVIEW_RATE_LIMIT_WINDOW_SECONDS", REVIEW_RATE_LIMIT_WINDOW_SECONDS, 3_600
        ),
        _bounded_positive_int("REVIEW_RATE_LIMIT_PER_WINDOW", REVIEW_RATE_LIMIT_PER_WINDOW, 1_000),
    )


def consume_chat_quota(user_id: str) -> bool:
    """Reserve one assistant message per user, counted separately from reviews."""
    return _consume_quota(
        "CHAT",
        user_id,
        _bounded_positive_int(
            "CHAT_RATE_LIMIT_WINDOW_SECONDS", CHAT_RATE_LIMIT_WINDOW_SECONDS, 3_600
        ),
        _bounded_positive_int("CHAT_RATE_LIMIT_PER_WINDOW", CHAT_RATE_LIMIT_PER_WINDOW, 1_000),
    )


def consume_statute_quota(user_id: str) -> bool:
    """Reserve a bounded provider lookup for an authenticated user."""
    return _consume_quota(
        "STATUTE",
        user_id,
        _bounded_positive_int(
            "STATUTE_RATE_LIMIT_WINDOW_SECONDS", STATUTE_RATE_LIMIT_WINDOW_SECONDS, 3_600
        ),
        _bounded_positive_int(
            "STATUTE_RATE_LIMIT_PER_WINDOW", STATUTE_RATE_LIMIT_PER_WINDOW, 1_000
        ),
    )


def _remote_operation_limit(name: str, default: int) -> int:
    return _bounded_positive_int(name, default, 100)


def _acquire_remote_slot(partition: str, limit: int) -> tuple[str, str, str] | None:
    """Atomically claim one expiring DynamoDB slot, or return ``None`` when full."""
    now = int(time.time())
    lease_id = secrets.token_urlsafe(18)
    expires_at = now + REMOTE_OPERATION_LEASE_SECONDS
    for slot in range(limit):
        key = {"PK": partition, "SK": f"SLOT#{slot}"}
        try:
            _table().put_item(
                Item={**key, "lease_id": lease_id, "expires_at": expires_at},
                ConditionExpression=Attr("PK").not_exists() | Attr("expires_at").lte(now),
            )
            return partition, key["SK"], lease_id
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise
    return None


def acquire_remote_operation(user_id: str) -> RemoteOperationLease | None:
    """Claim global and per-user capacity for one synchronous remote operation.

    Individual expiring slots make the guard self-healing if a Lambda is
    terminated before its ``finally`` block runs. The global pool intentionally
    stays below Lambda reserved concurrency, leaving slots for ordinary API work.
    """
    global_slot = _acquire_remote_slot(
        "REMOTE#GLOBAL",
        _remote_operation_limit(
            "REMOTE_OPERATION_GLOBAL_CONCURRENCY", REMOTE_OPERATION_GLOBAL_CONCURRENCY
        ),
    )
    if global_slot is None:
        return None

    user_slot = _acquire_remote_slot(
        f"REMOTE#USER#{sha256(user_id.encode('utf-8')).hexdigest()}",
        _remote_operation_limit(
            "REMOTE_OPERATION_PER_USER_CONCURRENCY", REMOTE_OPERATION_PER_USER_CONCURRENCY
        ),
    )
    if user_slot is None:
        release_remote_operation(RemoteOperationLease((global_slot,)))
        return None
    return RemoteOperationLease((global_slot, user_slot))


def release_remote_operation(lease: RemoteOperationLease) -> None:
    """Release only slots owned by this request; expired/reclaimed slots stay intact."""
    for partition, sort_key, lease_id in lease.slots:
        try:
            _table().delete_item(
                Key={"PK": partition, "SK": sort_key},
                ConditionExpression=Attr("lease_id").eq(lease_id),
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise


def _consume_quota(kind: str, user_id: str, window_seconds: int, request_limit: int) -> bool:
    now = int(time.time())
    window_start = now - (now % window_seconds)
    subject_hash = sha256(user_id.encode("utf-8")).hexdigest()

    try:
        _table().update_item(
            Key={
                "PK": f"RATE#{kind}#{subject_hash}",
                "SK": f"WINDOW#{window_start}",
            },
            UpdateExpression="SET expires_at = :expires_at ADD request_count :increment",
            ConditionExpression="attribute_not_exists(request_count) OR request_count < :limit",
            ExpressionAttributeValues={
                ":expires_at": window_start + window_seconds + 300,
                ":increment": 1,
                ":limit": request_limit,
            },
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise
    return True


def get_lawyer_verification(user_id: str) -> dict[str, Any]:
    """Return this user's bar-verification record, defaulted for a first-time caller."""
    item = _table().get_item(Key={"PK": f"USER#{user_id}", "SK": "LAWYER"}).get("Item") or {}
    attempts = int(item.get("attempts", 0))
    return {
        "verified": bool(item.get("verified", False)),
        "attempts_used": attempts,
        "attempts_remaining": max(LAWYER_VERIFICATION_MAX_ATTEMPTS - attempts, 0),
        "max_attempts": LAWYER_VERIFICATION_MAX_ATTEMPTS,
        "bar_number": item.get("bar_number", ""),
        "jurisdiction": item.get("jurisdiction", ""),
        "name": item.get("name", ""),
        "status": item.get("status", ""),
        "admitted_on": item.get("admitted_on", ""),
        "verified_at": item.get("verified_at", ""),
    }


def reserve_lawyer_attempt(user_id: str) -> bool:
    """Claim one of the attempts before calling the provider.

    Reserving first is what actually enforces the cap: two requests in flight
    together cannot both pass a read-then-write check. The provider is metered
    and the allowance is shared by every user, so an over-run costs everyone.
    A reservation that never reaches a verdict is returned by
    ``release_lawyer_attempt``.
    """
    try:
        _table().update_item(
            Key={"PK": f"USER#{user_id}", "SK": "LAWYER"},
            UpdateExpression="ADD attempts :increment",
            ConditionExpression=(
                "(attribute_not_exists(attempts) OR attempts < :limit) "
                "AND (attribute_not_exists(verified) OR verified = :false)"
            ),
            ExpressionAttributeValues={
                ":increment": 1,
                ":limit": LAWYER_VERIFICATION_MAX_ATTEMPTS,
                ":false": False,
            },
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise
    return True


def release_lawyer_attempt(user_id: str) -> None:
    """Give back a reserved attempt when the provider never returned a verdict.

    Only an answer about the person spends an attempt. A spent allowance, a
    timeout, or an outage must not count against them.
    """
    try:
        _table().update_item(
            Key={"PK": f"USER#{user_id}", "SK": "LAWYER"},
            UpdateExpression="ADD attempts :decrement",
            ConditionExpression="attempts > :zero AND (attribute_not_exists(verified) "
            "OR verified = :false)",
            ExpressionAttributeValues={":decrement": -1, ":zero": 0, ":false": False},
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise


def save_lawyer_verification(user_id: str, record: dict[str, Any]) -> dict[str, Any]:
    """Record a successful verification. Attempts are left as they stand."""
    _table().update_item(
        Key={"PK": f"USER#{user_id}", "SK": "LAWYER"},
        UpdateExpression=(
            "SET verified = :true, bar_number = :bar, jurisdiction = :jurisdiction, "
            "#name = :name, #status = :status, admitted_on = :admitted, verified_at = :at"
        ),
        ExpressionAttributeNames={"#name": "name", "#status": "status"},
        ExpressionAttributeValues={
            ":true": True,
            ":bar": record.get("bar_number", ""),
            ":jurisdiction": record.get("jurisdiction", ""),
            ":name": record.get("name", ""),
            ":status": record.get("status", ""),
            ":admitted": record.get("admitted_on", ""),
            ":at": datetime.now(UTC).isoformat(),
        },
    )
    return get_lawyer_verification(user_id)


def create_workspace_invite(workspace_id: str, inviter_id: str) -> dict[str, Any]:
    token = secrets.token_urlsafe(18)
    now = datetime.now(UTC)
    invite = {
        "token": token,
        "workspace_id": workspace_id,
        "created_by": inviter_id,
        "created_at": now.isoformat(),
        "expires_at": int((now + timedelta(seconds=INVITE_TTL_SECONDS)).timestamp()),
    }
    # The random token is the partition key so joining is a constant-time read.
    # This avoids a table-wide Scan, which would both scale poorly and require
    # broader production IAM permissions.
    _table().put_item(Item={"PK": f"INVITE#{token}", "SK": "META", **invite})
    return invite


def consume_workspace_invite(token: str, user: dict[str, str]) -> dict[str, Any] | None:
    table = _table()
    invite_key = {"PK": f"INVITE#{token}", "SK": "META"}
    invite = table.get_item(Key=invite_key).get("Item")
    if not invite:
        return None

    now_timestamp = int(time.time())
    expires_at = invite.get("expires_at")
    # DynamoDB deserializes Number attributes as Decimal, not int. Reject only
    # values that cannot represent an epoch timestamp; otherwise real invites
    # would always appear invalid while in-memory tests still passed.
    if isinstance(expires_at, bool):
        return None
    try:
        expires_timestamp = int(expires_at)
    except (TypeError, ValueError):
        return None
    if expires_timestamp <= now_timestamp:
        return None

    try:
        # A conditional deletion gives the token one-use semantics even when
        # two browsers submit it at the same time.
        table.delete_item(
            Key=invite_key,
            ConditionExpression=Attr("PK").exists() & Attr("expires_at").gt(now_timestamp),
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return None
        raise

    workspace_id = invite["workspace_id"]
    # The workspace may have been deleted since the invite was issued.
    if not table.get_item(Key={"PK": f"WORKSPACE#{workspace_id}", "SK": "META"}).get("Item"):
        return None
    now = datetime.now(UTC).isoformat()
    table.put_item(
        Item={
            "PK": f"WORKSPACE#{workspace_id}",
            "SK": f"MEMBER#{user['sub']}",
            "workspace_id": workspace_id,
            "user_id": user["sub"],
            "email": user.get("email", ""),
            "name": user.get("name", ""),
            "role": "member",
            "joined_at": now,
        }
    )
    table.put_item(
        Item={
            "PK": f"USER#{user['sub']}",
            "SK": f"WORKSPACE#{workspace_id}",
            "workspace_id": workspace_id,
            "role": "member",
            "joined_at": now,
        }
    )
    return table.get_item(Key={"PK": f"WORKSPACE#{workspace_id}", "SK": "META"}).get("Item")


# ── Admin ────────────────────────────────────────────────────────────────────
# Everything below serves the admin portal only. Routes reach it through
# ``current_admin``; nothing here checks who is asking.

AUDIT_PARTITION = "AUDIT"
AUDIT_RETENTION_SECONDS = 365 * 24 * 60 * 60


def _scan(**scan_args: Any) -> list[dict[str, Any]]:
    """Read every matching item. A Scan reads the whole table, so only the
    admin portal uses it, and only for tallies and listings no key can answer."""
    items: list[dict[str, Any]] = []
    while True:
        response = _table().scan(**scan_args)
        items.extend(response.get("Items", []))
        last_evaluated_key = response.get("LastEvaluatedKey")
        if last_evaluated_key is None:
            return items
        scan_args["ExclusiveStartKey"] = last_evaluated_key


def _query_partition(partition: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    query_args: dict[str, Any] = {"KeyConditionExpression": Key("PK").eq(partition)}
    while True:
        response = _table().query(**query_args)
        items.extend(response.get("Items", []))
        last_evaluated_key = response.get("LastEvaluatedKey")
        if last_evaluated_key is None:
            return items
        query_args["ExclusiveStartKey"] = last_evaluated_key


def _delete_keys(keys: list[dict[str, str]]) -> None:
    with _table().batch_writer() as batch:
        for key in keys:
            batch.delete_item(Key=key)


def admin_data_totals() -> dict[str, int]:
    """Count what the table holds, in one pass over the user and workspace rows."""
    items = _scan(
        ProjectionExpression="PK, SK, verified, attempts",
        FilterExpression=Attr("PK").begins_with("USER#") | Attr("PK").begins_with("WORKSPACE#"),
    )
    totals = {
        "workspaces": 0,
        "documents": 0,
        "conversations": 0,
        "lawyers_verified": 0,
        "lawyers_locked": 0,
    }
    for item in items:
        pk, sk = item["PK"], item["SK"]
        if pk.startswith("WORKSPACE#") and sk == "META":
            totals["workspaces"] += 1
        elif sk.startswith(("RECORD#", "DOC#")):
            totals["documents"] += 1
        elif sk.startswith("CHAT#"):
            totals["conversations"] += 1
        elif sk == "LAWYER":
            if item.get("verified"):
                totals["lawyers_verified"] += 1
            elif int(item.get("attempts", 0)) >= LAWYER_VERIFICATION_MAX_ATTEMPTS:
                totals["lawyers_locked"] += 1
    return totals


def admin_list_workspaces() -> list[dict[str, Any]]:
    """Every workspace with its owner and member count, newest first."""
    items = _scan(FilterExpression=Attr("PK").begins_with("WORKSPACE#"))
    workspaces: dict[str, dict[str, Any]] = {}
    members: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        workspace_id = item["PK"].removeprefix("WORKSPACE#")
        if item["SK"] == "META":
            workspaces[workspace_id] = item
        elif item["SK"].startswith("MEMBER#"):
            members.setdefault(workspace_id, []).append(item)
    listed = []
    for workspace_id, meta in workspaces.items():
        roster = members.get(workspace_id, [])
        owner = next((member for member in roster if member.get("role") == "owner"), {})
        listed.append(
            {
                "id": workspace_id,
                "name": meta.get("name", ""),
                "owner_id": meta.get("owner_id", ""),
                "owner_email": owner.get("email", ""),
                "created_at": meta.get("created_at", ""),
                "member_count": len(roster),
                "linked_document_title": meta.get("linked_document_title"),
            }
        )
    listed.sort(key=lambda workspace: workspace["created_at"], reverse=True)
    return listed


def admin_get_workspace(workspace_id: str) -> dict[str, Any] | None:
    return _table().get_item(Key={"PK": f"WORKSPACE#{workspace_id}", "SK": "META"}).get("Item")


def admin_delete_workspace(workspace_id: str) -> None:
    """Remove a workspace, its memberships, and each member's pointer to it."""
    items = _query_partition(f"WORKSPACE#{workspace_id}")
    keys = [{"PK": item["PK"], "SK": item["SK"]} for item in items]
    keys += [
        {"PK": f"USER#{item['user_id']}", "SK": f"WORKSPACE#{workspace_id}"}
        for item in items
        if item["SK"].startswith("MEMBER#") and item.get("user_id")
    ]
    _delete_keys(keys)


def admin_remove_workspace_member(workspace_id: str, user_id: str) -> None:
    _delete_keys(
        [
            {"PK": f"WORKSPACE#{workspace_id}", "SK": f"MEMBER#{user_id}"},
            {"PK": f"USER#{user_id}", "SK": f"WORKSPACE#{workspace_id}"},
        ]
    )


def admin_user_data(user_id: str) -> dict[str, Any]:
    """What the table holds for one person: counts, workspaces, and bar status."""
    items = _query_partition(f"USER#{user_id}")
    workspaces = []
    for item in items:
        if item["SK"].startswith("WORKSPACE#"):
            workspace_id = item["SK"].removeprefix("WORKSPACE#")
            meta = admin_get_workspace(workspace_id) or {}
            workspaces.append(
                {
                    "id": workspace_id,
                    "name": meta.get("name") or item.get("name", ""),
                    "role": item.get("role", "member"),
                }
            )
    profile = next((item for item in items if item["SK"] == "PROFILE"), {})
    return {
        "display_name": profile.get("display_name", ""),
        "documents": sum(item["SK"].startswith(("RECORD#", "DOC#")) for item in items),
        "conversations": sum(item["SK"].startswith("CHAT#") for item in items),
        "workspaces": workspaces,
        "lawyer_verification": get_lawyer_verification(user_id),
    }


def admin_delete_user_data(user_id: str) -> None:
    """Erase one person's rows. Workspaces they host go with them, since a
    workspace without its host has no one who can manage it; elsewhere they
    are simply removed from the member list."""
    items = _query_partition(f"USER#{user_id}")
    for item in items:
        if not item["SK"].startswith("WORKSPACE#"):
            continue
        workspace_id = item["SK"].removeprefix("WORKSPACE#")
        if item.get("role") == "owner":
            admin_delete_workspace(workspace_id)
        else:
            admin_remove_workspace_member(workspace_id, user_id)
    _delete_keys([{"PK": item["PK"], "SK": item["SK"]} for item in items])


def admin_reset_lawyer_verification(user_id: str) -> dict[str, Any]:
    """Clear a bar verification and its spent attempts, so the person can try again."""
    _table().delete_item(Key={"PK": f"USER#{user_id}", "SK": "LAWYER"})
    return get_lawyer_verification(user_id)


def record_admin_action(
    actor: dict[str, str], action: str, target: str, detail: str = ""
) -> dict[str, Any]:
    """Append one line to the admin audit log. Entries expire after a year."""
    now = datetime.now(UTC)
    entry = {
        "at": now.isoformat(),
        "actor_id": actor["sub"],
        "actor_email": actor.get("email", ""),
        "action": action,
        "target": target,
        "detail": detail,
    }
    _table().put_item(
        Item={
            "PK": AUDIT_PARTITION,
            "SK": f"{entry['at']}#{uuid4()}",
            "expires_at": int(now.timestamp()) + AUDIT_RETENTION_SECONDS,
            **entry,
        }
    )
    return entry


def list_admin_actions(limit: int = 100) -> list[dict[str, Any]]:
    response = _table().query(
        KeyConditionExpression=Key("PK").eq(AUDIT_PARTITION),
        ScanIndexForward=False,
        Limit=limit,
    )
    return [
        {
            "at": item.get("at", ""),
            "actor_id": item.get("actor_id", ""),
            "actor_email": item.get("actor_email", ""),
            "action": item.get("action", ""),
            "target": item.get("target", ""),
            "detail": item.get("detail", ""),
        }
        for item in response.get("Items", [])
    ]


# ── Document ledger ──────────────────────────────────────────────────────────
# One row per document change, in the owner's partition. A row is written as
# pending before anything is broadcast, and every transaction hash tried for it
# is kept, so a send whose outcome was lost can always be found again.

LEDGER_WRITER_PARTITION = "LEDGER#WRITER"


def consume_ledger_quota(user_id: str) -> bool:
    return _consume_quota(
        "LEDGER",
        user_id,
        60,
        _bounded_positive_int("LEDGER_RATE_LIMIT_PER_WINDOW", LEDGER_RATE_LIMIT_PER_WINDOW, 1_000),
    )


def acquire_ledger_writer() -> RemoteOperationLease | None:
    """Claim the single right to sign with the recorder wallet.

    One writer at a time keeps the wallet's nonces in order. The lease expires
    by itself, so a Lambda that dies mid-send cannot hold it forever.
    """
    slot = _acquire_remote_slot(LEDGER_WRITER_PARTITION, 1)
    return RemoteOperationLease((slot,)) if slot else None


def _ledger_prefix(document_key: str) -> str:
    return f"LEDGER#{document_key}#"


def _ledger_view(item: dict[str, Any]) -> dict[str, Any]:
    return {
        key: (
            int(value) if key in {"block_number", "block_time", "sequence", "attempts"} else value
        )
        for key, value in item.items()
        if key not in {"PK", "SK"}
    } | {"sort_key": item["SK"]}


def create_ledger_change(user_id: str, document_key: str, change: dict[str, Any]) -> dict[str, Any]:
    """Store a new pending change. Resubmitting the same change id is a no-op."""
    now = datetime.now(UTC).isoformat()
    item = {
        "PK": f"USER#{user_id}",
        "SK": f"{_ledger_prefix(document_key)}{now}#{change['change_id']}",
        **change,
        "document_key": document_key,
        "status": "pending",
        "created_at": now,
        "attempts": 0,
        "tx_hashes": [],
    }
    existing = find_ledger_change(user_id, document_key, change["change_id"])
    if existing:
        return existing
    _table().put_item(Item=item)
    return _ledger_view(item)


def find_ledger_change(user_id: str, document_key: str, change_id: str) -> dict[str, Any] | None:
    return next(
        (
            row
            for row in list_ledger_changes(user_id, document_key)
            if row["change_id"] == change_id
        ),
        None,
    )


def list_ledger_changes(user_id: str, document_key: str) -> list[dict[str, Any]]:
    """One document's changes, oldest first."""
    items: list[dict[str, Any]] = []
    query_args: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(f"USER#{user_id}")
        & Key("SK").begins_with(_ledger_prefix(document_key))
    }
    while True:
        response = _table().query(**query_args)
        items.extend(response.get("Items", []))
        last_evaluated_key = response.get("LastEvaluatedKey")
        if last_evaluated_key is None:
            return [_ledger_view(item) for item in items]
        query_args["ExclusiveStartKey"] = last_evaluated_key


def update_ledger_change(user_id: str, sort_key: str, fields: dict[str, Any]) -> None:
    names = {f"#f{index}": name for index, name in enumerate(fields)}
    values = {f":v{index}": value for index, value in enumerate(fields.values())}
    _table().update_item(
        Key={"PK": f"USER#{user_id}", "SK": sort_key},
        UpdateExpression="SET " + ", ".join(f"#f{i} = :v{i}" for i in range(len(fields))),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


# ── Saved workspace ──────────────────────────────────────────────────────────
# The documents a person works on, and where they left off, so a refresh or a
# new device opens the workspace exactly as it was. Each document is one item
# in the owner's partition, its body gzip-compressed JSON.


class DocumentTooLargeError(ValueError):
    pass


def consume_document_save_quota(user_id: str) -> bool:
    """Saves are debounced in the browser; this only stops a runaway client."""
    return _consume_quota(
        "DOCSAVE",
        user_id,
        60,
        _bounded_positive_int("DOCUMENT_SAVE_RATE_LIMIT_PER_WINDOW", 120, 1_000),
    )


def document_sort_key(document_key: str) -> str:
    return f"DOC#{document_key}"


def _pack(document: dict[str, Any]) -> bytes:
    body = gzip.compress(json.dumps(document, separators=(",", ":")).encode("utf-8"))
    if len(body) > MAX_DOCUMENT_BYTES:
        raise DocumentTooLargeError("This document is too large to save.")
    return body


def _unpack(item: dict[str, Any]) -> dict[str, Any]:
    body = item.get("body")
    raw = getattr(body, "value", body)  # boto3 returns a Binary wrapper.
    return {
        "document_id": item.get("document_id", ""),
        "document": json.loads(gzip.decompress(bytes(raw)).decode("utf-8")) if raw else {},
        "resolved": list(item.get("resolved") or []),
        "updated_at": item.get("updated_at", ""),
    }


def save_document(
    user_id: str,
    document_key: str,
    document_id: str,
    document: dict[str, Any],
    resolved: list[str],
) -> str:
    """Create or replace one saved document. Returns "saved", or "limit" when
    this would be a new document beyond the per-person allowance."""
    now = datetime.now(UTC).isoformat()
    fields = {
        "document_id": document_id,
        "body": _pack(document),
        "resolved": resolved,
        "updated_at": now,
    }
    key = {"PK": f"USER#{user_id}", "SK": document_sort_key(document_key)}
    try:
        # Replacing an existing document never touches the quota.
        _table().update_item(
            Key=key,
            UpdateExpression="SET #id = :id, #body = :body, #resolved = :resolved, #at = :at",
            ConditionExpression=Attr("PK").exists(),
            ExpressionAttributeNames={
                "#id": "document_id",
                "#body": "body",
                "#resolved": "resolved",
                "#at": "updated_at",
            },
            ExpressionAttributeValues={
                ":id": document_id,
                ":body": fields["body"],
                ":resolved": resolved,
                ":at": now,
            },
        )
        return "saved"
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
    result = _create_resource_with_limit(
        user_id,
        kind="DOCUMENTS",
        prefix="DOC#",
        limit=MAX_DOCUMENTS_PER_USER,
        item={**key, **fields, "created_at": now},
    )
    if result == "exists":
        # Created by a concurrent save between our two writes; replace it.
        _table().put_item(Item={**key, **fields, "created_at": now})
        return "saved"
    return "limit" if result == "limit" else "saved"


def list_documents(user_id: str) -> list[dict[str, Any]]:
    """Every saved document, most recently changed first."""
    items: list[dict[str, Any]] = []
    query_args: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("DOC#")
    }
    while True:
        response = _table().query(**query_args)
        items.extend(response.get("Items", []))
        last_evaluated_key = response.get("LastEvaluatedKey")
        if last_evaluated_key is None:
            break
        query_args["ExclusiveStartKey"] = last_evaluated_key
    documents = [_unpack(item) for item in items]
    documents.sort(key=lambda entry: entry["updated_at"], reverse=True)
    return documents


def get_document(user_id: str, document_key: str) -> dict[str, Any] | None:
    item = (
        _table()
        .get_item(Key={"PK": f"USER#{user_id}", "SK": document_sort_key(document_key)})
        .get("Item")
    )
    return _unpack(item) if item else None


def delete_document(user_id: str, document_key: str) -> None:
    """Remove a saved document and give its allowance back."""
    table = _table()
    key = {"PK": f"USER#{user_id}", "SK": document_sort_key(document_key)}
    try:
        table.meta.client.transact_write_items(
            TransactItems=[
                {
                    "Delete": {
                        "TableName": table.name,
                        "Key": key,
                        "ConditionExpression": "attribute_exists(PK)",
                    }
                },
                {
                    "Update": {
                        "TableName": table.name,
                        "Key": {"PK": f"USER#{user_id}", "SK": "QUOTA#DOCUMENTS"},
                        "UpdateExpression": "SET #count = #count - :one",
                        "ConditionExpression": "#count > :zero",
                        "ExpressionAttributeNames": {"#count": "count"},
                        "ExpressionAttributeValues": {":one": 1, ":zero": 0},
                    }
                },
            ]
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "TransactionCanceledException":
            raise
        # Already gone, or no quota row to decrement: make sure the item is gone.
        table.delete_item(Key=key)


def get_workspace_state(user_id: str) -> dict[str, Any]:
    item = _table().get_item(Key={"PK": f"USER#{user_id}", "SK": "WORKSPACE_STATE"}).get("Item")
    if not item:
        return {}
    return json.loads(item.get("state", "{}"))


def put_workspace_state(user_id: str, state: dict[str, Any]) -> dict[str, Any]:
    _table().put_item(
        Item={
            "PK": f"USER#{user_id}",
            "SK": "WORKSPACE_STATE",
            "state": json.dumps(state, separators=(",", ":")),
            "updated_at": datetime.now(UTC).isoformat(),
        }
    )
    return state
