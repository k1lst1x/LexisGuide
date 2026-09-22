from __future__ import annotations

import os
import secrets
import time
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from hashlib import sha256
from typing import Any
from uuid import uuid4

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

INVITE_TTL_SECONDS = 24 * 60 * 60
REVIEW_RATE_LIMIT_WINDOW_SECONDS = 60
REVIEW_RATE_LIMIT_PER_WINDOW = 10
CHAT_RATE_LIMIT_WINDOW_SECONDS = 60
CHAT_RATE_LIMIT_PER_WINDOW = 20


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
