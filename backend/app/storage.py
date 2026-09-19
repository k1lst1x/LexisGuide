from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key


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
