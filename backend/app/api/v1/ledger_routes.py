"""Document history on the blockchain.

The browser reports each change to a document it holds (created, reviewed,
edited, rewrite applied, renamed) with the SHA-256 of the text. The API
records it as pending, writes it to the DocumentLedger contract, and returns
the block it landed in. Reading a history also moves along anything still
pending, so a change whose request timed out confirms on the next poll.

A change can carry the document's text. That version is kept in the database
(never on chain), so the history can bring back any earlier version and prove
it is genuine: its SHA-256 must equal the fingerprint in its block. Documents
shared into a workspace have one history for the whole workspace.
"""

from hashlib import sha256
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, Field

from app.auth import current_user
from app.ledger import configured_ledger, document_key
from app.ledger_service import ledger_writer, settle
from app.storage import (
    DocumentTooLargeError,
    consume_ledger_quota,
    create_ledger_change,
    get_ledger_version,
    get_workspace_membership,
    list_ledger_changes,
)

router = APIRouter(prefix="/api/v1/ledger", tags=["ledger"])

# The POST waits this long for the writer and then for the block, which keeps
# it inside the API Lambda's 29-second timeout.
WRITER_WAIT_SECONDS = 8
BLOCK_WAIT_SECONDS = 12

Kind = Literal["created", "reviewed", "edited", "rewrite_applied", "renamed"]


class LedgerInfo(BaseModel):
    enabled: bool
    network: str = ""
    chain_id: int = 0
    explorer_url: str = ""
    contract_address: str = ""
    recorder_address: str = ""


class ChangeCreate(BaseModel):
    # Chosen by the browser, so a retried request cannot record a change twice.
    change_id: str = Field(pattern=r"^[A-Za-z0-9-]{8,64}$")
    document_id: str = Field(min_length=1, max_length=400)
    kind: Kind
    content_hash: str = Field(pattern=r"^(0x)?[0-9a-fA-F]{64}$")
    # Kept off chain, for the history view only.
    title: str = Field(default="", max_length=240)
    # The document's text at this change, kept so the version can be restored.
    text: str | None = Field(default=None, max_length=250_000)


class Change(BaseModel):
    change_id: str
    document_id: str
    kind: Kind
    content_hash: str
    title: str = ""
    status: Literal["pending", "confirmed", "failed"]
    created_at: str
    attempts: int = 0
    tx_hash: str = ""
    block_number: int | None = None
    block_time: int | None = None
    sequence: int | None = None
    entry_hash: str = ""
    previous_entry: str = ""
    error: str = ""
    has_version: bool = False
    changed_by: str = ""


class Version(BaseModel):
    """A document as it was at one change, checked against the chain."""

    change_id: str
    document_id: str
    kind: Kind
    title: str = ""
    content_hash: str
    text: str
    # The text's SHA-256 equals the fingerprint stored with the change.
    matches_fingerprint: bool
    # What the block itself says: verified (same fingerprint), mismatch,
    # pending (not mined yet), or unavailable (the chain could not be read).
    on_chain: Literal["verified", "mismatch", "pending", "unavailable"]
    block_number: int | None = None
    tx_hash: str = ""


def history_owner(user: dict[str, str], workspace_id: str | None) -> str:
    """Whose history this is: the person's own, or a workspace's shared one."""
    if not workspace_id:
        return user["sub"]
    if not get_workspace_membership(workspace_id, user["sub"]):
        raise HTTPException(status_code=403, detail="You are not a member of this workspace.")
    return f"workspace:{workspace_id}"


def _ledger_or_503():
    ledger = configured_ledger()
    if ledger is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The document ledger is not configured.",
        )
    return ledger


@router.get("", response_model=LedgerInfo)
def read_ledger(_user: dict[str, str] = Depends(current_user)) -> LedgerInfo:
    ledger = configured_ledger()
    return LedgerInfo(enabled=True, **ledger.network) if ledger else LedgerInfo(enabled=False)


@router.post("/changes", response_model=Change, status_code=status.HTTP_201_CREATED)
def record_change(payload: ChangeCreate, user: dict[str, str] = Depends(current_user)) -> Change:
    """Record one change and wait briefly for its block. A change that is not
    mined in time comes back pending and confirms on a later read."""
    ledger = _ledger_or_503()
    if not consume_ledger_quota(user["sub"]):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many document changes at once. They will be recorded shortly.",
            headers={"Retry-After": "60"},
        )
    content_hash = payload.content_hash.lower().removeprefix("0x")
    if payload.text is not None and sha256(payload.text.encode()).hexdigest() != content_hash:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The text does not match its fingerprint.",
        )
    change = {
        "change_id": payload.change_id,
        "document_id": payload.document_id,
        "kind": payload.kind,
        "content_hash": content_hash,
        "title": payload.title.strip(),
    }
    if payload.text is not None:
        change["text"] = payload.text
    try:
        row = create_ledger_change(
            user["sub"], document_key(user["sub"], payload.document_id), change
        )
    except DocumentTooLargeError as error:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=str(error)
        ) from error
    with ledger_writer(WRITER_WAIT_SECONDS) as holding:
        if holding:
            row = settle(ledger, user["sub"], row, BLOCK_WAIT_SECONDS)
    return Change(**row)


@router.get("/changes", response_model=list[Change])
def read_changes(
    document_id: str = Query(min_length=1, max_length=400),
    workspace_id: str | None = Query(default=None, pattern=r"^[A-Za-z0-9-]{1,80}$"),
    user: dict[str, str] = Depends(current_user),
) -> list[Change]:
    """One document's history, oldest first, advancing anything still pending."""
    owner = history_owner(user, workspace_id)
    rows = list_ledger_changes(owner, document_key(owner, document_id))
    ledger = configured_ledger()
    if ledger and any(row["status"] == "pending" for row in rows):
        # Never wait here: a poll must stay fast. Whoever holds the writer is
        # already moving these along.
        with ledger_writer(0) as holding:
            if holding:
                rows = [settle(ledger, owner, row, 0) for row in rows]
    return [Change(**row) for row in rows]


@router.get("/changes/{change_id}/version", response_model=Version)
def read_version(
    change_id: str = Path(pattern=r"^[A-Za-z0-9-]{8,64}$"),
    document_id: str = Query(min_length=1, max_length=400),
    workspace_id: str | None = Query(default=None, pattern=r"^[A-Za-z0-9-]{1,80}$"),
    user: dict[str, str] = Depends(current_user),
) -> Version:
    """The document as it was at one change, with proof from its block."""
    owner = history_owner(user, workspace_id)
    found = get_ledger_version(owner, document_key(owner, document_id), change_id)
    if found is None:
        raise HTTPException(status_code=404, detail="That version was not kept.")
    row, text = found
    matches = sha256(text.encode()).hexdigest() == row["content_hash"]
    on_chain: str = "pending"
    if row["status"] == "confirmed" and row.get("tx_hash"):
        ledger = configured_ledger()
        try:
            recorded = ledger.recorded_content_hash(row["tx_hash"]) if ledger else None
        except Exception:  # noqa: BLE001 - an unreachable chain is reported, not raised
            recorded = None
        if recorded is None:
            on_chain = "unavailable"
        else:
            on_chain = "verified" if recorded == row["content_hash"] and matches else "mismatch"
    return Version(
        change_id=row["change_id"],
        document_id=row["document_id"],
        kind=row["kind"],
        title=row.get("title", ""),
        content_hash=row["content_hash"],
        text=text,
        matches_fingerprint=matches,
        on_chain=on_chain,
        block_number=row.get("block_number"),
        tx_hash=row.get("tx_hash", ""),
    )
