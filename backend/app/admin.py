"""Cognito account administration for the admin portal.

The API Lambda's role holds only the Cognito admin actions used here, scoped to
its own user pool. Routes reach these functions through ``current_admin``.
"""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from typing import Any

import boto3
from botocore.exceptions import ClientError

from app.auth import ADMIN_GROUP, _settings

# Enough to tally a hackathon-sized pool in a few calls without letting one
# overview request page through an unbounded directory.
MAX_USERS_TALLIED = 5_000
LIST_PAGE_SIZE = 60


class UserNotFoundError(LookupError):
    pass


@lru_cache
def _cognito() -> tuple[Any, str]:
    region, user_pool_id, _ = _settings()
    return boto3.client("cognito-idp", region_name=region), user_pool_id


def _iso(value: datetime | str | None) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return value or ""


def _user_view(user: dict[str, Any], admin_usernames: set[str]) -> dict[str, Any]:
    """One Cognito user as the portal shows it."""
    attributes = {
        attribute["Name"]: attribute["Value"]
        for attribute in user.get("Attributes") or user.get("UserAttributes") or []
    }
    username = user["Username"]
    return {
        "username": username,
        "sub": attributes.get("sub", ""),
        "email": attributes.get("email", ""),
        "name": attributes.get("name", ""),
        "status": user.get("UserStatus", ""),
        "enabled": bool(user.get("Enabled", True)),
        "created_at": _iso(user.get("UserCreateDate")),
        "updated_at": _iso(user.get("UserLastModifiedDate")),
        "is_admin": username in admin_usernames,
        # Federated accounts are named after their provider, e.g. Google_1234.
        "provider": username.split("_", 1)[0]
        if user.get("UserStatus") == "EXTERNAL_PROVIDER"
        else "Email",
    }


def admin_usernames() -> set[str]:
    client, pool = _cognito()
    names: set[str] = set()
    args: dict[str, Any] = {"UserPoolId": pool, "GroupName": ADMIN_GROUP, "Limit": 60}
    while True:
        try:
            response = client.list_users_in_group(**args)
        except ClientError as error:
            # A pool deployed before the group existed simply has no admins yet.
            if error.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
                return names
            raise
        names.update(user["Username"] for user in response.get("Users", []))
        token = response.get("NextToken")
        if not token:
            return names
        args["NextToken"] = token


def still_admin(username: str) -> bool:
    """Ask Cognito, not the token, whether this account is an enabled admin.

    An ID token keeps its group claim for up to an hour, so removing someone
    from the group or disabling them would otherwise take that long to bite.
    """
    if not username:
        return False
    client, pool = _cognito()
    try:
        user = client.admin_get_user(UserPoolId=pool, Username=username)
        groups = client.admin_list_groups_for_user(UserPoolId=pool, Username=username, Limit=60)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "UserNotFoundException":
            return False
        raise
    return bool(user.get("Enabled", True)) and any(
        group.get("GroupName") == ADMIN_GROUP for group in groups.get("Groups", [])
    )


def list_users(email_prefix: str = "", pagination_token: str = "") -> dict[str, Any]:
    """One page of accounts, optionally narrowed to emails starting with a prefix."""
    client, pool = _cognito()
    args: dict[str, Any] = {"UserPoolId": pool, "Limit": LIST_PAGE_SIZE}
    if email_prefix:
        # The route admits no quotes or backslashes, so the filter cannot be escaped.
        args["Filter"] = f'email ^= "{email_prefix}"'
    if pagination_token:
        args["PaginationToken"] = pagination_token
    response = client.list_users(**args)
    admins = admin_usernames()
    return {
        "users": [_user_view(user, admins) for user in response.get("Users", [])],
        "next_token": response.get("PaginationToken") or "",
    }


def user_totals() -> dict[str, int]:
    client, pool = _cognito()
    totals = {"total": 0, "enabled": 0, "disabled": 0, "federated": 0, "admins": 0}
    args: dict[str, Any] = {"UserPoolId": pool, "Limit": LIST_PAGE_SIZE}
    while totals["total"] < MAX_USERS_TALLIED:
        response = client.list_users(**args)
        for user in response.get("Users", []):
            totals["total"] += 1
            totals["enabled" if user.get("Enabled", True) else "disabled"] += 1
            if user.get("UserStatus") == "EXTERNAL_PROVIDER":
                totals["federated"] += 1
        token = response.get("PaginationToken")
        if not token:
            break
        args["PaginationToken"] = token
    totals["admins"] = len(admin_usernames())
    return totals


def get_user(username: str) -> dict[str, Any]:
    client, pool = _cognito()
    try:
        user = client.admin_get_user(UserPoolId=pool, Username=username)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "UserNotFoundException":
            raise UserNotFoundError(username) from error
        raise
    return _user_view(user, admin_usernames())


def set_enabled(username: str, enabled: bool) -> None:
    client, pool = _cognito()
    if enabled:
        client.admin_enable_user(UserPoolId=pool, Username=username)
    else:
        client.admin_disable_user(UserPoolId=pool, Username=username)
        # A disabled account keeps any refresh token it holds; revoke those too.
        client.admin_user_global_sign_out(UserPoolId=pool, Username=username)


def sign_out_everywhere(username: str) -> None:
    client, pool = _cognito()
    client.admin_user_global_sign_out(UserPoolId=pool, Username=username)


def set_admin(username: str, admin: bool) -> None:
    client, pool = _cognito()
    if admin:
        client.admin_add_user_to_group(UserPoolId=pool, Username=username, GroupName=ADMIN_GROUP)
    else:
        client.admin_remove_user_from_group(
            UserPoolId=pool, Username=username, GroupName=ADMIN_GROUP
        )


def delete_user(username: str) -> None:
    client, pool = _cognito()
    client.admin_delete_user(UserPoolId=pool, Username=username)
