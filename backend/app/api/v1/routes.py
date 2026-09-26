import json
from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from lexisguide_assistant import ChatReply, ChatRequest
from lexisguide_assistant.models import MAX_TURN_CHARS
from pydantic import BaseModel, Field, field_validator
from review_contract import ReviewResult

from app.assistant_research import add_official_source
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
    add_channel_member,
    channel_name_taken,
    consume_chat_quota,
    consume_review_quota,
    consume_statute_quota,
    consume_workspace_invite,
    create_record_with_limit,
    create_workspace,
    create_workspace_channel,
    create_workspace_invite,
    create_workspace_message,
    delete_workspace,
    delete_workspace_channel,
    delete_workspace_message,
    get_conversation,
    get_lawyer_verification,
    get_profile,
    get_workspace_channel,
    get_workspace_membership,
    get_workspace_message,
    is_channel_member,
    list_channel_members,
    list_conversations,
    list_records,
    list_workspace_channels,
    list_workspace_members,
    list_workspace_messages,
    list_workspaces,
    put_profile,
    release_lawyer_attempt,
    release_remote_operation,
    remove_channel_member,
    remove_workspace_member,
    reserve_lawyer_attempt,
    save_conversation_with_limit,
    save_lawyer_verification,
    set_workspace_linked_document,
    set_workspace_member_role,
    update_workspace_channel,
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

    @field_validator("payload")
    @classmethod
    def bound_serialized_payload(cls, value: dict) -> dict:
        # Count and per-item bounds together cap a user's persistent footprint.
        if len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()) > 32_000:
            raise ValueError("Record payload is too large.")
        return value


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


class WorkspaceMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4_000)
    attachment: str | None = Field(default=None, max_length=160)
    channel_id: str = Field(default="general", pattern=r"^[A-Za-z0-9-]{1,80}$")

    @field_validator("text")
    @classmethod
    def strip_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message text must not be blank")
        return value


class WorkspaceMessage(BaseModel):
    id: str
    user: str
    author_id: str = ""
    author_email: str = ""
    text: str
    created_at: str
    attachment: str | None = None
    channel_id: str = "general"


def _clean_channel_name(value: str) -> str:
    value = " ".join(value.strip().lstrip("#").split())
    if not value:
        raise ValueError("Channel name must not be blank")
    return value


class WorkspaceChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=250)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return _clean_channel_name(value)


class WorkspaceChannelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=250)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return None if value is None else _clean_channel_name(value)


class WorkspaceChannel(BaseModel):
    id: str
    name: str
    description: str = ""
    created_by: str = ""
    created_by_name: str = ""
    created_at: str
    last_message_at: str = ""
    member_count: int = 0
    is_member: bool = False
    # Its creator or a workspace admin may edit it; only admins may delete it.
    can_manage: bool = False
    can_delete: bool = False


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


CONVERSATION_ID = r"^[A-Za-z0-9-]{8,64}$"
MAX_STORED_TURNS = 60


class StoredAttachment(BaseModel):
    """A file shown on a message. Only its name and size are kept, not its text."""

    name: str = Field(min_length=1, max_length=200)
    kind: str = Field(default="", max_length=60)
    chars: int = Field(default=0, ge=0)


class StoredTurn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=MAX_TURN_CHARS)
    local: bool = False
    attachments: list[StoredAttachment] = Field(default_factory=list, max_length=5)


class ConversationBody(BaseModel):
    """What the browser sends back to be kept. Bounded so one person cannot
    fill the table; storage compresses the turns into one DynamoDB item."""

    turns: list[StoredTurn] = Field(max_length=MAX_STORED_TURNS)
    title: str = Field(default="", max_length=160)


class Conversation(BaseModel):
    conversation_id: str
    turns: list[StoredTurn] = Field(default_factory=list)
    updated_at: str = ""
    title: str = ""


class ConversationSummary(BaseModel):
    conversation_id: str
    title: str = ""
    updated_at: str = ""


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


@router.post("/chat", response_model=ChatReply, response_model_exclude_defaults=True)
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
    workspace_id = request.context.workspace_id or ""
    if workspace_id and not get_workspace_membership(workspace_id, user["sub"]):
        raise HTTPException(status_code=403, detail="You are not a member of this workspace.")
    request = add_official_source(request)
    try:
        return assistant.chat(
            request, runtime_session_id(user["sub"], payload.conversation_id, workspace_id)
        )
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

    if not record["found"]:
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
        )

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


@router.get("/me/conversations", response_model=list[ConversationSummary])
async def list_my_conversations(
    user: dict[str, str] = Depends(current_user),
) -> list[ConversationSummary]:
    return [ConversationSummary(**row) for row in list_conversations(user["sub"])]


@router.get("/me/conversations/{conversation_id}", response_model=Conversation)
async def read_conversation(
    conversation_id: str = Path(pattern=CONVERSATION_ID),
    user: dict[str, str] = Depends(current_user),
) -> Conversation:
    """Read one conversation. The user's own id is the partition, so this can
    only ever return their history, whatever id is asked for."""
    stored = get_conversation(user["sub"], conversation_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="No such conversation.")
    return Conversation(**stored)


@router.put("/me/conversations/{conversation_id}", response_model=Conversation)
async def write_conversation(
    payload: ConversationBody,
    conversation_id: str = Path(pattern=CONVERSATION_ID),
    user: dict[str, str] = Depends(current_user),
) -> Conversation:
    outcome, saved = save_conversation_with_limit(
        user["sub"],
        conversation_id,
        [turn.model_dump() for turn in payload.turns],
        payload.title.strip(),
    )
    if outcome == "limit":
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Conversation storage limit reached. Update an existing conversation instead.",
        )
    if saved is None:  # Defensive guard for a future storage implementation.
        raise RuntimeError("Conversation storage returned no saved conversation.")
    return Conversation(**saved)


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
    record = create_record_with_limit(user["sub"], record_id, payload.model_dump())
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Record storage limit reached.",
        )
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


class MemberRoleUpdate(BaseModel):
    role: str = Field(pattern="^(admin|member)$")


USER_ID = r"^[A-Za-z0-9_.@+-]{1,128}$"


CHANNEL_ID = r"^[A-Za-z0-9-]{1,80}$"


def _workspace_member(workspace_id: str, user: dict[str, str]) -> dict:
    membership = get_workspace_membership(workspace_id, user["sub"])
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this workspace.")
    return membership


def _channel_or_404(workspace_id: str, channel_id: str) -> dict:
    channel = get_workspace_channel(workspace_id, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found.")
    return channel


ADMIN_ROLES = {"owner", "admin"}


def _is_admin(membership: dict) -> bool:
    return membership.get("role") in ADMIN_ROLES


def _can_manage(membership: dict, channel: dict, user: dict[str, str]) -> bool:
    """A channel's creator, or a workspace owner or admin, may edit it."""
    return _is_admin(membership) or channel.get("created_by") == user["sub"]


def _as_view(channel: dict, membership: dict, user: dict[str, str]) -> WorkspaceChannel:
    return WorkspaceChannel(
        **channel,
        can_manage=_can_manage(membership, channel, user),
        can_delete=_is_admin(membership) and channel["id"] != "general",
    )


def _channel_view(workspace_id: str, channel_id: str, user: dict[str, str]) -> WorkspaceChannel:
    membership = get_workspace_membership(workspace_id, user["sub"]) or {}
    listed = list_workspace_channels(workspace_id, user["sub"])
    channel = next((item for item in listed if item["id"] == channel_id), None)
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found.")
    return _as_view(channel, membership, user)


@router.put("/workspaces/{workspace_id}/members/{member_id}/role", response_model=WorkspaceMember)
async def change_member_role(
    workspace_id: str,
    payload: MemberRoleUpdate,
    member_id: str = Path(pattern=USER_ID),
    user: dict[str, str] = Depends(current_user),
) -> WorkspaceMember:
    """Only the workspace owner hands out or takes back admin rights."""
    membership = _workspace_member(workspace_id, user)
    if membership.get("role") != "owner":
        raise HTTPException(
            status_code=403, detail="Only the workspace owner can change admin rights."
        )
    target = get_workspace_membership(workspace_id, member_id)
    if not target:
        raise HTTPException(status_code=404, detail="That person is not in this workspace.")
    if target.get("role") == "owner":
        raise HTTPException(status_code=400, detail="The owner's role cannot be changed.")
    set_workspace_member_role(workspace_id, member_id, payload.role)
    return WorkspaceMember(**{**target, "role": payload.role})


@router.delete(
    "/workspaces/{workspace_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_member(
    workspace_id: str,
    member_id: str = Path(pattern=USER_ID),
    user: dict[str, str] = Depends(current_user),
) -> None:
    """Leave a workspace yourself, or, as an admin, remove someone from it.

    The owner can remove anyone but cannot leave; admins can remove members
    but not other admins.
    """
    membership = _workspace_member(workspace_id, user)
    target = get_workspace_membership(workspace_id, member_id)
    if not target:
        raise HTTPException(status_code=404, detail="That person is not in this workspace.")
    if target.get("role") == "owner":
        raise HTTPException(
            status_code=400,
            detail="The owner cannot leave or be removed. Delete the workspace instead.",
        )
    leaving = member_id == user["sub"]
    if not leaving:
        if not _is_admin(membership):
            raise HTTPException(status_code=403, detail="Only workspace admins can remove people.")
        if target.get("role") == "admin" and membership.get("role") != "owner":
            raise HTTPException(
                status_code=403, detail="Only the workspace owner can remove an admin."
            )
    remove_workspace_member(workspace_id, member_id)


@router.delete("/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_workspace(workspace_id: str, user: dict[str, str] = Depends(current_user)) -> None:
    """Delete the workspace for everyone: channels, messages, and memberships."""
    membership = _workspace_member(workspace_id, user)
    if not _is_admin(membership):
        raise HTTPException(
            status_code=403, detail="Only workspace admins can delete the workspace."
        )
    delete_workspace(workspace_id)


@router.get("/workspaces/{workspace_id}/channels", response_model=list[WorkspaceChannel])
async def read_workspace_channels(
    workspace_id: str, user: dict[str, str] = Depends(current_user)
) -> list[WorkspaceChannel]:
    """Every channel, joined or not, so people can browse and join them."""
    membership = _workspace_member(workspace_id, user)
    return [
        _as_view(channel, membership, user)
        for channel in list_workspace_channels(workspace_id, user["sub"])
    ]


@router.post(
    "/workspaces/{workspace_id}/channels",
    response_model=WorkspaceChannel,
    status_code=status.HTTP_201_CREATED,
)
async def post_workspace_channel(
    workspace_id: str,
    payload: WorkspaceChannelCreate,
    user: dict[str, str] = Depends(current_user),
) -> WorkspaceChannel:
    """Any member can start a channel, as in Slack; they join it first."""
    _workspace_member(workspace_id, user)
    if channel_name_taken(workspace_id, payload.name):
        raise HTTPException(status_code=409, detail=f"#{payload.name} already exists.")
    channel = create_workspace_channel(
        workspace_id, payload.name, payload.description.strip(), creator=user
    )
    return _channel_view(workspace_id, channel["id"], user)


@router.patch("/workspaces/{workspace_id}/channels/{channel_id}", response_model=WorkspaceChannel)
async def patch_workspace_channel(
    workspace_id: str,
    payload: WorkspaceChannelUpdate,
    channel_id: str = Path(pattern=CHANNEL_ID),
    user: dict[str, str] = Depends(current_user),
) -> WorkspaceChannel:
    membership = _workspace_member(workspace_id, user)
    channel = _channel_or_404(workspace_id, channel_id)
    if not _can_manage(membership, channel, user):
        raise HTTPException(
            status_code=403,
            detail="Only the channel's creator or a workspace admin can edit it.",
        )
    if channel_id == "general" and payload.name is not None and payload.name != channel["name"]:
        raise HTTPException(status_code=400, detail="General cannot be renamed.")
    if payload.name and channel_name_taken(workspace_id, payload.name, except_id=channel_id):
        raise HTTPException(status_code=409, detail=f"#{payload.name} already exists.")
    update_workspace_channel(
        workspace_id,
        channel_id,
        name=payload.name,
        description=None if payload.description is None else payload.description.strip(),
    )
    return _channel_view(workspace_id, channel_id, user)


@router.delete(
    "/workspaces/{workspace_id}/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_workspace_channel(
    workspace_id: str,
    channel_id: str = Path(pattern=CHANNEL_ID),
    user: dict[str, str] = Depends(current_user),
) -> None:
    membership = _workspace_member(workspace_id, user)
    _channel_or_404(workspace_id, channel_id)
    if channel_id == "general":
        raise HTTPException(status_code=400, detail="General cannot be deleted.")
    if not _is_admin(membership):
        raise HTTPException(status_code=403, detail="Only workspace admins can delete channels.")
    delete_workspace_channel(workspace_id, channel_id)


@router.post(
    "/workspaces/{workspace_id}/channels/{channel_id}/join", response_model=WorkspaceChannel
)
async def join_workspace_channel(
    workspace_id: str,
    channel_id: str = Path(pattern=CHANNEL_ID),
    user: dict[str, str] = Depends(current_user),
) -> WorkspaceChannel:
    _workspace_member(workspace_id, user)
    _channel_or_404(workspace_id, channel_id)
    if channel_id != "general":
        add_channel_member(workspace_id, channel_id, user)
    return _channel_view(workspace_id, channel_id, user)


@router.post(
    "/workspaces/{workspace_id}/channels/{channel_id}/leave", response_model=WorkspaceChannel
)
async def leave_workspace_channel(
    workspace_id: str,
    channel_id: str = Path(pattern=CHANNEL_ID),
    user: dict[str, str] = Depends(current_user),
) -> WorkspaceChannel:
    _workspace_member(workspace_id, user)
    _channel_or_404(workspace_id, channel_id)
    if channel_id == "general":
        raise HTTPException(status_code=400, detail="Everyone stays in General.")
    remove_channel_member(workspace_id, channel_id, user["sub"])
    return _channel_view(workspace_id, channel_id, user)


@router.get(
    "/workspaces/{workspace_id}/channels/{channel_id}/members",
    response_model=list[WorkspaceMember],
)
async def read_channel_members(
    workspace_id: str,
    channel_id: str = Path(pattern=CHANNEL_ID),
    user: dict[str, str] = Depends(current_user),
) -> list[WorkspaceMember]:
    _workspace_member(workspace_id, user)
    _channel_or_404(workspace_id, channel_id)
    return [WorkspaceMember(**member) for member in list_channel_members(workspace_id, channel_id)]


@router.get("/workspaces/{workspace_id}/messages", response_model=list[WorkspaceMessage])
async def read_workspace_messages(
    workspace_id: str,
    channel_id: str = Query(default="general", alias="channel_id", pattern=CHANNEL_ID),
    user: dict[str, str] = Depends(current_user),
) -> list[WorkspaceMessage]:
    """Any workspace member can read a channel, so they can look before joining."""
    _workspace_member(workspace_id, user)
    _channel_or_404(workspace_id, channel_id)
    return [
        WorkspaceMessage(**message) for message in list_workspace_messages(workspace_id, channel_id)
    ]


@router.post(
    "/workspaces/{workspace_id}/messages",
    response_model=WorkspaceMessage,
    status_code=status.HTTP_201_CREATED,
)
async def post_workspace_message(
    workspace_id: str,
    payload: WorkspaceMessageCreate,
    user: dict[str, str] = Depends(current_user),
) -> WorkspaceMessage:
    _workspace_member(workspace_id, user)
    channel = _channel_or_404(workspace_id, payload.channel_id)
    if not is_channel_member(workspace_id, payload.channel_id, user["sub"]):
        raise HTTPException(status_code=403, detail=f"Join #{channel['name']} to post in it.")
    attachment = payload.attachment.strip() if payload.attachment else None
    return WorkspaceMessage(
        **create_workspace_message(workspace_id, user, payload.text, attachment, payload.channel_id)
    )


@router.delete(
    "/workspaces/{workspace_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_workspace_message(
    workspace_id: str,
    message_id: str = Path(pattern=CHANNEL_ID),
    channel_id: str = Query(default="general", pattern=CHANNEL_ID),
    user: dict[str, str] = Depends(current_user),
) -> None:
    """Authors can delete their own messages; workspace admins can delete any."""
    membership = _workspace_member(workspace_id, user)
    message = get_workspace_message(workspace_id, channel_id, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found.")
    own = message.get("author_id") == user["sub"] or (
        not message.get("author_id")
        and bool(user.get("email"))
        and message.get("author_email", "").lower() == user["email"].lower()
    )
    if not own and membership.get("role") not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="You can only delete your own messages.")
    delete_workspace_message(workspace_id, message)


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
