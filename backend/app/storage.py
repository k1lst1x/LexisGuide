from __future__ import annotations

import os
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
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
REMOTE_OPERATION_PER_USER_CONCURRENCY = 2
REMOTE_OPERATION_GLOBAL_CONCURRENCY = 8
# The API Lambda times out after 29 seconds. A one-minute lease releases a
# crashed invocation without allowing a live request to lose its slot early.
REMOTE_OPERATION_LEASE_SECONDS = 60


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


def save_record(user_id: str, record_id: str, record: dict[str, Any]) -> dict[str, Any]:
    item = {"PK": f"USER#{user_id}", "SK": f"RECORD#{record_id}", **record}
    _table().put_item(Item=item)
    return item


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
        "turns": item.get("turns", []),
        "updated_at": item.get("updated_at", ""),
        "title": item.get("title", ""),
    }


def save_conversation(
    user_id: str, conversation_id: str, turns: list[dict[str, Any]], title: str = ""
) -> dict[str, Any]:
    """Write a conversation back to the user's own partition."""
    now = datetime.now(UTC).isoformat()
    _table().put_item(
        Item={
            "PK": f"USER#{user_id}",
            "SK": f"CHAT#{conversation_id}",
            "turns": turns,
            "title": title,
            "updated_at": now,
        }
    )
    return {"conversation_id": conversation_id, "turns": turns, "updated_at": now, "title": title}


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


def list_workspace_members(workspace_id: str) -> list[dict[str, Any]]:
    response = _table().query(
        KeyConditionExpression=Key("PK").eq(f"WORKSPACE#{workspace_id}")
        & Key("SK").begins_with("MEMBER#")
    )
    return response.get("Items", [])


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
    if not isinstance(expires_at, int) or expires_at <= now_timestamp:
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
        elif sk.startswith("RECORD#"):
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
        "documents": sum(item["SK"].startswith("RECORD#") for item in items),
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
