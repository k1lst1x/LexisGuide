"""The admin portal's API.

Every route depends on ``admin_actor``: a valid Cognito ID token carrying the
admins group, confirmed live against Cognito so a removed or disabled admin is
refused at once rather than when their token expires. Each change is written to
the audit log with the admin who made it.
"""

import os

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, Field

from app import admin, lawfirm
from app.auth import current_admin
from app.ledger import configured_ledger
from app.storage import (
    admin_data_totals,
    admin_delete_user_data,
    admin_delete_workspace,
    admin_get_workspace,
    admin_list_workspaces,
    admin_remove_workspace_member,
    admin_reset_lawyer_verification,
    admin_user_data,
    list_admin_actions,
    list_workspace_members,
    record_admin_action,
    save_lawyer_verification,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# Cognito usernames here are UUIDs for email accounts and Provider_id for
# federated ones. Nothing else is accepted in a path.
USERNAME = r"^[\w.@+-]{1,128}$"
WORKSPACE_ID = r"^[A-Za-z0-9-]{8,64}$"
USER_ID = r"^[A-Za-z0-9-]{8,64}$"


def admin_actor(actor: dict[str, str] = Depends(current_admin)) -> dict[str, str]:
    if not admin.still_admin(actor["username"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account no longer has admin access.",
        )
    return actor


class AdminSession(BaseModel):
    sub: str
    username: str
    email: str
    name: str = ""


class UserTotals(BaseModel):
    total: int
    enabled: int
    disabled: int
    federated: int
    admins: int


class DataTotals(BaseModel):
    workspaces: int
    documents: int
    conversations: int
    lawyers_verified: int
    lawyers_locked: int


class AuditEntry(BaseModel):
    at: str
    actor_id: str
    actor_email: str = ""
    action: str
    target: str
    detail: str = ""


class Overview(BaseModel):
    users: UserTotals
    data: DataTotals
    recent_actions: list[AuditEntry]


class AdminUser(BaseModel):
    username: str
    sub: str
    email: str
    name: str = ""
    status: str
    enabled: bool
    created_at: str = ""
    updated_at: str = ""
    is_admin: bool
    provider: str


class UserPage(BaseModel):
    users: list[AdminUser]
    next_token: str = ""


class UserWorkspace(BaseModel):
    id: str
    name: str
    role: str


class LawyerStatus(BaseModel):
    verified: bool
    attempts_used: int
    attempts_remaining: int
    max_attempts: int
    bar_number: str = ""
    jurisdiction: str = ""
    name: str = ""
    status: str = ""
    admitted_on: str = ""
    verified_at: str = ""


class UserDetail(AdminUser):
    display_name: str = ""
    documents: int
    conversations: int
    workspaces: list[UserWorkspace]
    lawyer_verification: LawyerStatus


class AdminFlag(BaseModel):
    admin: bool


class ManualLawyerVerification(BaseModel):
    bar_number: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9-]+$")
    jurisdiction: str = Field(min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")
    name: str = Field(default="", max_length=200)
    note: str = Field(default="", max_length=500)


class AdminWorkspace(BaseModel):
    id: str
    name: str
    owner_id: str = ""
    owner_email: str = ""
    created_at: str = ""
    member_count: int
    linked_document_title: str | None = None


class AdminWorkspaceMember(BaseModel):
    user_id: str
    email: str = ""
    name: str = ""
    role: str
    joined_at: str = ""


class Done(BaseModel):
    ok: bool = True


def _target_user(username: str) -> dict:
    try:
        return admin.get_user(username)
    except admin.UserNotFoundError as error:
        raise HTTPException(status_code=404, detail="No such user.") from error


def _not_self(actor: dict[str, str], target: dict, what: str) -> None:
    """An admin cannot lock themselves out: another admin must do it."""
    if target["sub"] == actor["sub"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You cannot {what} your own account. Ask another admin.",
        )


def _label(user: dict) -> str:
    return user["email"] or user["username"]


@router.get("/session", response_model=AdminSession)
def read_session(actor: dict[str, str] = Depends(admin_actor)) -> AdminSession:
    return AdminSession(**actor)


@router.get("/overview", response_model=Overview)
def read_overview(_actor: dict[str, str] = Depends(admin_actor)) -> Overview:
    return Overview(
        users=UserTotals(**admin.user_totals()),
        data=DataTotals(**admin_data_totals()),
        recent_actions=[AuditEntry(**entry) for entry in list_admin_actions(limit=8)],
    )


@router.get("/users", response_model=UserPage)
def read_users(
    q: str = Query(default="", max_length=100, pattern=r'^[^"\\]*$'),
    next_token: str = Query(default="", max_length=4_000),
    _actor: dict[str, str] = Depends(admin_actor),
) -> UserPage:
    return UserPage(**admin.list_users(q.strip(), next_token))


@router.get("/users/{username}", response_model=UserDetail)
def read_user(
    username: str = Path(pattern=USERNAME),
    _actor: dict[str, str] = Depends(admin_actor),
) -> UserDetail:
    user = _target_user(username)
    data = admin_user_data(user["sub"]) if user["sub"] else {}
    return UserDetail(
        **user,
        display_name=data.get("display_name", ""),
        documents=data.get("documents", 0),
        conversations=data.get("conversations", 0),
        workspaces=data.get("workspaces", []),
        lawyer_verification=data.get("lawyer_verification")
        or {"verified": False, "attempts_used": 0, "attempts_remaining": 0, "max_attempts": 0},
    )


@router.post("/users/{username}/disable", response_model=Done)
def disable_user(
    username: str = Path(pattern=USERNAME), actor: dict[str, str] = Depends(admin_actor)
) -> Done:
    user = _target_user(username)
    _not_self(actor, user, "disable")
    admin.set_enabled(username, False)
    record_admin_action(actor, "user.disable", _label(user))
    return Done()


@router.post("/users/{username}/enable", response_model=Done)
def enable_user(
    username: str = Path(pattern=USERNAME), actor: dict[str, str] = Depends(admin_actor)
) -> Done:
    user = _target_user(username)
    admin.set_enabled(username, True)
    record_admin_action(actor, "user.enable", _label(user))
    return Done()


@router.post("/users/{username}/sign-out", response_model=Done)
def sign_out_user(
    username: str = Path(pattern=USERNAME), actor: dict[str, str] = Depends(admin_actor)
) -> Done:
    user = _target_user(username)
    admin.sign_out_everywhere(username)
    record_admin_action(actor, "user.sign_out", _label(user))
    return Done()


@router.put("/users/{username}/admin", response_model=Done)
def set_user_admin(
    payload: AdminFlag,
    username: str = Path(pattern=USERNAME),
    actor: dict[str, str] = Depends(admin_actor),
) -> Done:
    user = _target_user(username)
    if not payload.admin:
        _not_self(actor, user, "remove admin access from")
    admin.set_admin(username, payload.admin)
    record_admin_action(
        actor, "user.grant_admin" if payload.admin else "user.revoke_admin", _label(user)
    )
    return Done()


@router.delete("/users/{username}", response_model=Done)
def delete_user(
    username: str = Path(pattern=USERNAME), actor: dict[str, str] = Depends(admin_actor)
) -> Done:
    """Delete the account and everything stored for it. This cannot be undone."""
    user = _target_user(username)
    _not_self(actor, user, "delete")
    # Data first: if Cognito then fails the admin can retry, and nothing is
    # left behind that no account could reach.
    if user["sub"]:
        admin_delete_user_data(user["sub"])
    admin.delete_user(username)
    record_admin_action(actor, "user.delete", _label(user))
    return Done()


@router.delete("/users/{username}/lawyer-verification", response_model=LawyerStatus)
def reset_lawyer_verification(
    username: str = Path(pattern=USERNAME), actor: dict[str, str] = Depends(admin_actor)
) -> LawyerStatus:
    """Clear a verification and its spent attempts so the person can check again."""
    user = _target_user(username)
    result = admin_reset_lawyer_verification(user["sub"])
    record_admin_action(actor, "lawyer.reset", _label(user))
    return LawyerStatus(**result)


@router.post("/users/{username}/lawyer-verification", response_model=LawyerStatus)
def verify_lawyer_manually(
    payload: ManualLawyerVerification,
    username: str = Path(pattern=USERNAME),
    actor: dict[str, str] = Depends(admin_actor),
) -> LawyerStatus:
    """Record a bar membership that support has checked by hand."""
    user = _target_user(username)
    result = save_lawyer_verification(
        user["sub"],
        {
            "bar_number": payload.bar_number,
            "jurisdiction": payload.jurisdiction.upper(),
            "name": payload.name.strip(),
            "status": "Verified by support",
        },
    )
    record_admin_action(
        actor,
        "lawyer.verify",
        _label(user),
        f"{payload.jurisdiction.upper()} {payload.bar_number}"
        + (f" — {payload.note.strip()}" if payload.note.strip() else ""),
    )
    return LawyerStatus(**result)


@router.get("/workspaces", response_model=list[AdminWorkspace])
def read_workspaces(_actor: dict[str, str] = Depends(admin_actor)) -> list[AdminWorkspace]:
    return [AdminWorkspace(**workspace) for workspace in admin_list_workspaces()]


@router.get("/workspaces/{workspace_id}/members", response_model=list[AdminWorkspaceMember])
def read_workspace_members(
    workspace_id: str = Path(pattern=WORKSPACE_ID),
    _actor: dict[str, str] = Depends(admin_actor),
) -> list[AdminWorkspaceMember]:
    if not admin_get_workspace(workspace_id):
        raise HTTPException(status_code=404, detail="No such workspace.")
    return [AdminWorkspaceMember(**member) for member in list_workspace_members(workspace_id)]


@router.delete("/workspaces/{workspace_id}", response_model=Done)
def delete_workspace(
    workspace_id: str = Path(pattern=WORKSPACE_ID),
    actor: dict[str, str] = Depends(admin_actor),
) -> Done:
    workspace = admin_get_workspace(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="No such workspace.")
    admin_delete_workspace(workspace_id)
    record_admin_action(actor, "workspace.delete", workspace.get("name", workspace_id))
    return Done()


@router.delete("/workspaces/{workspace_id}/members/{user_id}", response_model=Done)
def remove_workspace_member(
    workspace_id: str = Path(pattern=WORKSPACE_ID),
    user_id: str = Path(pattern=USER_ID),
    actor: dict[str, str] = Depends(admin_actor),
) -> Done:
    workspace = admin_get_workspace(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="No such workspace.")
    if workspace.get("owner_id") == user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The host cannot be removed. Delete the workspace instead.",
        )
    admin_remove_workspace_member(workspace_id, user_id)
    record_admin_action(
        actor, "workspace.remove_member", workspace.get("name", workspace_id), user_id
    )
    return Done()


@router.get("/audit", response_model=list[AuditEntry])
def read_audit_log(
    limit: int = Query(default=100, ge=1, le=500),
    _actor: dict[str, str] = Depends(admin_actor),
) -> list[AuditEntry]:
    return [AuditEntry(**entry) for entry in list_admin_actions(limit=limit)]


class IntegrationStatus(BaseModel):
    configured: bool
    ready: bool
    detail: str = ""


class Integrations(BaseModel):
    bar_verification: IntegrationStatus
    document_ledger: IntegrationStatus


def _bar_verification_status() -> IntegrationStatus:
    """Whether the lawfirm.dev key is set up and readable.

    Loads the key from Secrets Manager but never calls lawfirm.dev, so the
    check spends none of the plan's daily lookups.
    """
    if not (os.getenv("LAWFIRM_API_KEY") or os.getenv("LAWFIRM_API_KEY_SECRET_ARN")):
        return IntegrationStatus(
            configured=False,
            ready=False,
            detail="No key is configured. Set LAWFIRM_API_KEY_SECRET_ARN and redeploy.",
        )
    try:
        loaded = bool(lawfirm.configured_api_key())
    except lawfirm.LawFirmUnavailableError:
        return IntegrationStatus(
            configured=True,
            ready=False,
            detail="The key's secret could not be read. Check the ARN and the API's access to it.",
        )
    return IntegrationStatus(
        configured=True,
        ready=loaded,
        detail="Key loaded. Bar numbers are checked live against lawfirm.dev."
        if loaded
        else "The secret is empty or has no api_key field.",
    )


def _ledger_status() -> IntegrationStatus:
    if not os.getenv("LEDGER_CONTRACT_ADDRESS"):
        return IntegrationStatus(configured=False, ready=False, detail="No contract address set.")
    try:
        ledger = configured_ledger()
    except Exception:  # noqa: BLE001 - reported to the admin, not raised
        return IntegrationStatus(
            configured=True, ready=False, detail="The recorder key could not be loaded."
        )
    network = ledger.network if ledger else {}
    return IntegrationStatus(
        configured=True,
        ready=ledger is not None,
        detail=f"{network.get('network', '')} · {network.get('contract_address', '')}",
    )


@router.get("/integrations", response_model=Integrations)
def read_integrations(_actor: dict[str, str] = Depends(admin_actor)) -> Integrations:
    """Configuration health for the outside services, without using their quotas."""
    return Integrations(
        bar_verification=_bar_verification_status(), document_ledger=_ledger_status()
    )
