from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import current_user
from app.legal_agent import configured_agent
from app.storage import (
    consume_workspace_invite,
    create_workspace,
    create_workspace_invite,
    get_profile,
    get_workspace_membership,
    list_records,
    list_workspace_members,
    list_workspaces,
    put_profile,
    save_record,
)

router = APIRouter(prefix="/api/v1", tags=["v1"])


class HealthResponse(BaseModel):
    status: str


class AnalyzeRequest(BaseModel):
    document_text: str = Field(min_length=1, max_length=100_000)
    action: str = Field(default="review", pattern="^(review|negotiate|rewrite)$")
    jurisdiction: str | None = Field(default=None, max_length=200)
    user_context: str | None = Field(default=None, max_length=5_000)
    goals: str | None = Field(default=None, max_length=2_000)


class Finding(BaseModel):
    title: str
    explanation: str
    severity: str
    source_text: str | None = None
    why_it_matters: str | None = None
    negotiation_point: str | None = None
    suggested_rewrite: str | None = None


class Source(BaseModel):
    title: str = ""
    citation: str = ""
    url: str | None = None
    support: str = ""


class AnalyzeResponse(BaseModel):
    findings: list[Finding]
    disclaimer: str
    overall_assessment: str | None = None
    confidence: str | None = None
    document_score: int | None = Field(default=None, ge=0, le=100)
    priority_score: int | None = Field(default=None, ge=0, le=100)
    deadline: str | None = None
    deadline_confidence: str | None = None
    summary: str | None = None
    next_steps: list[str] = Field(default_factory=list)
    questions_for_user: list[str] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)


class ProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)


class UserProfile(BaseModel):
    sub: str
    email: str
    display_name: str = ""


class UserRecordCreate(BaseModel):
    type: str = Field(pattern="^(document|review|workspace)$")
    title: str = Field(min_length=1, max_length=200)
    payload: dict = Field(default_factory=dict)


class UserRecord(BaseModel):
    id: str
    type: str
    title: str
    payload: dict


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class Workspace(BaseModel):
    id: str
    name: str
    owner_id: str
    created_at: str
    role: str = "member"


class WorkspaceMember(BaseModel):
    user_id: str
    email: str = ""
    name: str = ""
    role: str
    joined_at: str


class WorkspaceInvite(BaseModel):
    invite_code: str


class WorkspaceJoinResponse(Workspace):
    pass


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    response_model_exclude_none=True,
    response_model_exclude_defaults=True,
)
async def analyze_document(payload: AnalyzeRequest) -> AnalyzeResponse:
    """Review a document when Bedrock is configured; retain a safe local stub otherwise."""
    agent = configured_agent()
    if agent is None:
        return AnalyzeResponse(
            findings=[],
            disclaimer="LexisGuide provides general information, not legal advice.",
        )
    result = agent.review(
        payload.document_text,
        action=payload.action,
        jurisdiction=payload.jurisdiction,
        user_context=payload.user_context,
        goals=payload.goals,
    )
    return AnalyzeResponse(**result)


@router.get("/me", response_model=UserProfile)
async def read_me(user: dict[str, str] = Depends(current_user)) -> UserProfile:
    profile = get_profile(user["sub"]) or {}
    return UserProfile(
        sub=user["sub"],
        email=user["email"],
        display_name=profile.get("display_name", user["name"]),
    )


@router.put("/me", response_model=UserProfile)
async def update_me(
    payload: ProfileUpdate,
    user: dict[str, str] = Depends(current_user),
) -> UserProfile:
    profile = put_profile(
        user["sub"],
        {"display_name": payload.display_name, "email": user["email"]},
    )
    return UserProfile(
        sub=user["sub"],
        email=user["email"],
        display_name=profile["display_name"],
    )


@router.get("/me/records", response_model=list[UserRecord])
async def read_records(user: dict[str, str] = Depends(current_user)) -> list[UserRecord]:
    return [
        UserRecord(
            id=item["SK"].removeprefix("RECORD#"),
            type=item["type"],
            title=item["title"],
            payload=item.get("payload", {}),
        )
        for item in list_records(user["sub"])
    ]


@router.post("/me/records", response_model=UserRecord, status_code=201)
async def create_record(
    payload: UserRecordCreate,
    user: dict[str, str] = Depends(current_user),
) -> UserRecord:
    record_id = str(uuid4())
    record = save_record(user["sub"], record_id, payload.model_dump())
    return UserRecord(
        id=record_id,
        type=record["type"],
        title=record["title"],
        payload=record["payload"],
    )


@router.get("/workspaces", response_model=list[Workspace])
async def read_workspaces(user: dict[str, str] = Depends(current_user)) -> list[Workspace]:
    return [Workspace(**workspace) for workspace in list_workspaces(user["sub"])]


@router.post("/workspaces", response_model=Workspace, status_code=status.HTTP_201_CREATED)
async def create_shared_workspace(
    payload: WorkspaceCreate, user: dict[str, str] = Depends(current_user)
) -> Workspace:
    return Workspace(**create_workspace(user, payload.name.strip()))


@router.get("/workspaces/{workspace_id}/members", response_model=list[WorkspaceMember])
async def read_workspace_members(
    workspace_id: str, user: dict[str, str] = Depends(current_user)
) -> list[WorkspaceMember]:
    if not get_workspace_membership(workspace_id, user["sub"]):
        raise HTTPException(status_code=403, detail="You are not a member of this workspace.")
    return [WorkspaceMember(**member) for member in list_workspace_members(workspace_id)]


@router.post("/workspaces/{workspace_id}/invites", response_model=WorkspaceInvite)
async def create_shared_workspace_invite(
    workspace_id: str, user: dict[str, str] = Depends(current_user)
) -> WorkspaceInvite:
    membership = get_workspace_membership(workspace_id, user["sub"])
    if not membership or membership.get("role") not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Only workspace owners or admins can invite members.")
    invite = create_workspace_invite(workspace_id, user["sub"])
    return WorkspaceInvite(invite_code=invite["token"])


@router.post("/workspaces/join", response_model=WorkspaceJoinResponse)
async def join_shared_workspace(
    payload: WorkspaceInvite, user: dict[str, str] = Depends(current_user)
) -> WorkspaceJoinResponse:
    workspace = consume_workspace_invite(payload.invite_code, user)
    if not workspace:
        raise HTTPException(status_code=404, detail="Invite code is invalid or expired.")
    return WorkspaceJoinResponse(**workspace, role="member")
