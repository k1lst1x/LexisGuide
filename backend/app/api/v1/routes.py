from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from lexisguide_assistant import ChatReply, ChatRequest
from pydantic import BaseModel, Field
from review_contract import ReviewResult

from app.auth import current_user
from app.chat_agent import AssistantUnavailableError, configured_assistant, runtime_session_id
from app.lawfirm import (
    LawFirmQuotaError,
    LawFirmResponseError,
    LawFirmUnavailableError,
    configured_lawfirm_client,
    read_bar_status,
)
from app.legal_agent import configured_agent
from app.storage import (
    acquire_remote_operation,
    consume_chat_quota,
    consume_review_quota,
    consume_statute_quota,
    consume_workspace_invite,
    create_workspace,
    create_workspace_invite,
    get_lawyer_verification,
    get_profile,
    get_workspace_membership,
    list_records,
    list_workspace_members,
    list_workspaces,
    put_profile,
    release_lawyer_attempt,
    release_remote_operation,
    reserve_lawyer_attempt,
    save_lawyer_verification,
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


class LawyerVerificationRequest(BaseModel):
    # Bar numbers vary by state: digits, letters, and hyphens all occur.
    bar_number: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9-]+$")
    jurisdiction: str = Field(min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")


class LawyerVerification(BaseModel):
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


SUPPORT_MESSAGE = (
    "You have used all three verification attempts. Ask support to review your bar record "
    "in the chat at the bottom right, or email support@lexisguide.app."
)


@router.get("/me/lawyer-verification", response_model=LawyerVerification)
async def read_lawyer_verification(
    user: dict[str, str] = Depends(current_user),
) -> LawyerVerification:
    return LawyerVerification(**get_lawyer_verification(user["sub"]))


@router.post("/me/lawyer-verification", response_model=LawyerVerification)
async def verify_lawyer(
    payload: LawyerVerificationRequest, user: dict[str, str] = Depends(current_user)
) -> LawyerVerification:
    """Check one bar record against lawfirm.dev and record the outcome.

    A person verifies once. Further attempts exist only because the first can
    fail, and only an answer about them spends one: a spent provider allowance
    or an outage is returned to their balance, never shown as a rejection.
    """
    current = get_lawyer_verification(user["sub"])
    if current["verified"]:
        return LawyerVerification(**current)

    client = configured_lawfirm_client()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Bar verification is not configured.",
        )
    if not reserve_lawyer_attempt(user["sub"]):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=SUPPORT_MESSAGE)

    lease = acquire_remote_operation(user["sub"])
    if lease is None:
        # A busy shared provider must not cost the person one of their attempts.
        release_lawyer_attempt(user["sub"])
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The verification service is busy. Please try again shortly.",
            headers={"Retry-After": "60"},
        )

    try:
        record = read_bar_status(client.lookup_attorney(payload.bar_number, payload.jurisdiction))
    except LawFirmResponseError as error:
        if error.status_code == 404:
            # A real answer: the bar has no such record. This one counts.
            remaining = get_lawyer_verification(user["sub"])["attempts_remaining"]
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No {payload.jurisdiction.upper()} bar record matches number "
                    f"{payload.bar_number}. "
                    + (
                        f"You have {remaining} attempt{'s' if remaining != 1 else ''} left."
                        if remaining
                        else SUPPORT_MESSAGE
                    )
                ),
            ) from error
        release_lawyer_attempt(user["sub"])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The bar directory could not complete the check. This attempt was not counted.",
        ) from error
    except LawFirmQuotaError as error:
        release_lawyer_attempt(user["sub"])
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Bar verification has reached its daily limit. Please try again tomorrow. "
                "This attempt was not counted."
            ),
        ) from error
    except LawFirmUnavailableError as error:
        release_lawyer_attempt(user["sub"])
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The bar directory is temporarily unavailable. This attempt was not counted.",
        ) from error
    finally:
        release_remote_operation(lease)

    if not record["active"]:
        remaining = get_lawyer_verification(user["sub"])["attempts_remaining"]
        described = record["status"] or "not current"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"That bar record is {described}, so it cannot be verified. "
                + (
                    f"You have {remaining} attempt{'s' if remaining != 1 else ''} left."
                    if remaining
                    else SUPPORT_MESSAGE
                )
            ),
        )
    return LawyerVerification(**save_lawyer_verification(user["sub"], record))


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
