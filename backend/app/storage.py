from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any
from uuid import uuid4

import boto3
from boto3.dynamodb.conditions import Attr, Key


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
    now = datetime.now(timezone.utc).isoformat()
    workspace = {"id": workspace_id, "name": name, "owner_id": owner["sub"], "created_at": now}
    table = _table()
    table.put_item(Item={"PK": f"WORKSPACE#{workspace_id}", "SK": "META", **workspace})
    table.put_item(Item={
        "PK": f"WORKSPACE#{workspace_id}", "SK": f"MEMBER#{owner['sub']}",
        "workspace_id": workspace_id, "user_id": owner["sub"], "email": owner.get("email", ""),
        "name": owner.get("name", ""), "role": "owner", "joined_at": now,
    })
    table.put_item(Item={
        "PK": f"USER#{owner['sub']}", "SK": f"WORKSPACE#{workspace_id}",
        "workspace_id": workspace_id, "role": "owner", "name": name, "joined_at": now,
    })
    return workspace


def list_workspaces(user_id: str) -> list[dict[str, Any]]:
    response = _table().query(
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("WORKSPACE#")
    )
    workspaces = []
    for membership in response.get("Items", []):
        workspace = _table().get_item(
            Key={"PK": f"WORKSPACE#{membership['workspace_id']}", "SK": "META"}
        ).get("Item")
        if workspace:
            workspaces.append({**workspace, "role": membership.get("role", "member")})
    return workspaces


def get_workspace_membership(workspace_id: str, user_id: str) -> dict[str, Any] | None:
    return _table().get_item(
        Key={"PK": f"WORKSPACE#{workspace_id}", "SK": f"MEMBER#{user_id}"}
    ).get("Item")


def list_workspace_members(workspace_id: str) -> list[dict[str, Any]]:
    response = _table().query(
        KeyConditionExpression=Key("PK").eq(f"WORKSPACE#{workspace_id}") & Key("SK").begins_with("MEMBER#")
    )
    return response.get("Items", [])


def create_workspace_invite(workspace_id: str, inviter_id: str) -> dict[str, Any]:
    token = secrets.token_urlsafe(18)
    now = datetime.now(timezone.utc).isoformat()
    invite = {"token": token, "workspace_id": workspace_id, "created_by": inviter_id, "created_at": now}
    _table().put_item(Item={"PK": f"WORKSPACE#{workspace_id}", "SK": f"INVITE#{token}", **invite})
    return invite


def consume_workspace_invite(token: str, user: dict[str, str]) -> dict[str, Any] | None:
    table = _table()
    response = table.scan(
        FilterExpression=Attr("SK").eq(f"INVITE#{token}")
    )
    invite = response.get("Items", [None])[0]
    if not invite:
        return None
    workspace_id = invite["workspace_id"]
    now = datetime.now(timezone.utc).isoformat()
    table.put_item(Item={
        "PK": f"WORKSPACE#{workspace_id}", "SK": f"MEMBER#{user['sub']}",
        "workspace_id": workspace_id, "user_id": user["sub"], "email": user.get("email", ""),
        "name": user.get("name", ""), "role": "member", "joined_at": now,
    })
    table.put_item(Item={
        "PK": f"USER#{user['sub']}", "SK": f"WORKSPACE#{workspace_id}",
        "workspace_id": workspace_id, "role": "member", "joined_at": now,
    })
    table.delete_item(Key={"PK": invite["PK"], "SK": invite["SK"]})
    return table.get_item(Key={"PK": f"WORKSPACE#{workspace_id}", "SK": "META"}).get("Item")
