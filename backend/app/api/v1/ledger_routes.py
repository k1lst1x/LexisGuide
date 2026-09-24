"""Document history on the blockchain.

The browser reports each change to a document it holds (created, reviewed,
edited, rewrite applied, renamed) with the SHA-256 of the text. The API
records it as pending, writes it to the DocumentLedger contract, and returns
the block it landed in. Reading a history also moves along anything still
pending, so a change whose request timed out confirms on the next poll.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.auth import current_user
from app.ledger import configured_ledger, document_key
from app.ledger_service import ledger_writer, settle
from app.storage import consume_ledger_quota, create_ledger_change, list_ledger_changes

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
    row = create_ledger_change(
        user["sub"],
        document_key(user["sub"], payload.document_id),
        {
            "change_id": payload.change_id,
            "document_id": payload.document_id,
            "kind": payload.kind,
            "content_hash": content_hash,
            "title": payload.title.strip(),
        },
    )
    with ledger_writer(WRITER_WAIT_SECONDS) as holding:
        if holding:
            row = settle(ledger, user["sub"], row, BLOCK_WAIT_SECONDS)
    return Change(**row)


@router.get("/changes", response_model=list[Change])
def read_changes(
    document_id: str = Query(min_length=1, max_length=400),
    user: dict[str, str] = Depends(current_user),
) -> list[Change]:
    """One document's history, oldest first, advancing anything still pending."""
    rows = list_ledger_changes(user["sub"], document_key(user["sub"], document_id))
    ledger = configured_ledger()
    if ledger and any(row["status"] == "pending" for row in rows):
        # Never wait here: a poll must stay fast. Whoever holds the writer is
        # already moving these along.
        with ledger_writer(0) as holding:
            if holding:
                rows = [settle(ledger, user["sub"], row, 0) for row in rows]
    return [Change(**row) for row in rows]
