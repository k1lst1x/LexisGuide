from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from lexisguide_assistant import ChatReply, ChatRequest
from pydantic import BaseModel, Field
from review_contract import ReviewResult

from app.auth import current_user
from app.chat_agent import AssistantUnavailableError, configured_assistant, runtime_session_id
from app.lawfirm import LawFirmResponseError, LawFirmUnavailableError, configured_lawfirm_client
from app.legal_agent import configured_agent
from app.storage import (
    acquire_remote_operation,
    consume_chat_quota,
    consume_review_quota,
    consume_statute_quota,
    consume_workspace_invite,
    create_workspace,
    create_workspace_invite,
    get_profile,
    get_workspace_membership,
    list_records,
    list_workspace_members,
    list_workspaces,
    put_profile,
    release_remote_operation,
    save_record,
    set_workspace_linked_document,
)

router = APIRouter(prefix="/api/v1", tags=["v1"])


class ChatPayload(ChatRequest):
    conversation_id: str = Field(pattern=r"^[A-Za-z0-9-]{8,64}$")


class HealthResponse(BaseModel):
    status: str


class AnalyzeRequest(BaseModel):
    document_text: str = Field(min_length=1, max_length=250_000)
    action: str = Field(default="review", pattern="^(review|negotiate|rewrite)$")
    jurisdiction: str | None = Field(default=None, max_length=200)
    user_context: str | None = Field(default=None, max_length=5_000)
    goals: str | None = Field(default=None, max_length=2_000)


AnalyzeResponse = ReviewResult


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
    linked_document_id: str | None = None
    linked_document_title: str | None = None


class WorkspaceMember(BaseModel):
    user_id: str
    email: str = ""
    name: str = ""
    role: str
    joined_at: str


class WorkspaceInvite(BaseModel):
    invite_code: str


class WorkspaceLinkedDocument(BaseModel):
    document_id: str = Field(min_length=1, max_length=160)
    document_title: str = Field(min_length=1, max_length=240)


class WorkspaceJoinResponse(Workspace):
    pass


class StatuteLookup(BaseModel):
    """Provider response, retained so provenance fields are never discarded."""

    result: dict


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    response_model_exclude_none=True,
    response_model_exclude_defaults=True,
)
async def analyze_document(
    payload: AnalyzeRequest, _user: dict[str, str] = Depends(current_user)
) -> AnalyzeResponse:
    """Review a document when Bedrock is configured; retain a safe local stub otherwise."""
    agent = configured_agent()
    if agent is None:
        return AnalyzeResponse(
            findings=[],
            disclaimer="LexisGuide provides general information, not legal advice.",
        )
    if not consume_review_quota(_user["sub"]):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Review limit reached. Please try again shortly.",
            headers={"Retry-After": "60"},
        )
    lease = acquire_remote_operation(_user["sub"])
    if lease is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The AI service is busy. Please try again shortly.",
            headers={"Retry-After": "60"},
        )
    try:
        result = agent.review(
            payload.document_text,
            action=payload.action,
            jurisdiction=payload.jurisdiction,
            user_context=payload.user_context,
            goals=payload.goals,
        )
    finally:
        release_remote_operation(lease)
    return AnalyzeResponse(**result)


@router.post("/chat", response_model=ChatReply)
async def chat(payload: ChatPayload, user: dict[str, str] = Depends(current_user)) -> ChatReply:
    """Talk to the LexisGuide assistant (the LexisGuideAssistant AgentCore runtime)."""
    assistant = configured_assistant()
    if assistant is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The assistant is not configured.",
        )
    if not consume_chat_quota(user["sub"]):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Message limit reached. Please try again shortly.",
            headers={"Retry-After": "60"},
        )
    lease = acquire_remote_operation(user["sub"])
    if lease is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The AI service is busy. Please try again shortly.",
            headers={"Retry-After": "60"},
        )
    request = ChatRequest(
        messages=payload.messages,
        context=payload.context.model_copy(update={"signed_in": True}),
    )
    try:
        return assistant.chat(request, runtime_session_id(user["sub"], payload.conversation_id))
    except AssistantUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The assistant could not answer right now.",
        ) from error
    finally:
        release_remote_operation(lease)


@router.get("/statutes/lookup", response_model=StatuteLookup)
async def lookup_statute(
    jurisdiction: str = Query(min_length=2, max_length=40),
    citation: str = Query(min_length=1, max_length=160),
    as_of: date | None = Query(default=None, alias="asOf"),
    _user: dict[str, str] = Depends(current_user),
) -> StatuteLookup:
    """Retrieve a point-in-time statute with the provider's full provenance receipt."""
    client = configured_lawfirm_client()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Statute lookup is not configured.",
        )
    if not consume_statute_quota(_user["sub"]):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Statute lookup limit reached. Please try again shortly.",
            headers={"Retry-After": "60"},
        )
    lease = acquire_remote_operation(_user["sub"])
    if lease is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The statute service is busy. Please try again shortly.",
            headers={"Retry-After": "60"},
        )
    try:
        return StatuteLookup(result=client.lookup_statute(jurisdiction, citation, as_of))
    except LawFirmResponseError as error:
        if error.status_code == 404:
            raise HTTPException(
                status_code=404, detail="No statute version is on file for that request."
            ) from error
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The statute source could not complete the lookup.",
        ) from error
    except LawFirmUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The statute source is temporarily unavailable.",
        ) from error
    finally:
        release_remote_operation(lease)


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


@router.put("/workspaces/{workspace_id}/linked-document", response_model=Workspace)
async def update_workspace_linked_document(
    workspace_id: str,
    payload: WorkspaceLinkedDocument,
    user: dict[str, str] = Depends(current_user),
) -> Workspace:
    membership = get_workspace_membership(workspace_id, user["sub"])
    if not membership or membership.get("role") != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only the workspace host can change the linked document.",
        )
    workspace = set_workspace_linked_document(
        workspace_id, payload.document_id, payload.document_title.strip()
    )
    return Workspace(**workspace, role=membership["role"])


@router.post("/workspaces/{workspace_id}/invites", response_model=WorkspaceInvite)
async def create_shared_workspace_invite(
    workspace_id: str, user: dict[str, str] = Depends(current_user)
) -> WorkspaceInvite:
    membership = get_workspace_membership(workspace_id, user["sub"])
    if not membership or membership.get("role") not in {"owner", "admin"}:
        raise HTTPException(
            status_code=403, detail="Only workspace owners or admins can invite members."
        )
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
