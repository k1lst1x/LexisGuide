"""The saved workspace: each person's documents and where they left off.

The browser saves a document shortly after it changes and restores the whole
workspace on sign-in, so a refresh or another device opens it exactly as it
was. Everything lives in the caller's own partition.
"""

import json
from hashlib import sha256

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field

from app.auth import current_user
from app.storage import (
    DocumentTooLargeError,
    consume_document_save_quota,
    delete_document,
    get_document,
    get_workspace_state,
    list_documents,
    put_workspace_state,
    save_document,
)

router = APIRouter(prefix="/api/v1/me", tags=["workspace"])

DOCUMENT_KEY = r"^[0-9a-f]{64}$"
# A Lambda response stops at 6 MB. The list carries full documents up to this
# budget; any beyond it come back without a body for the browser to fetch.
LIST_BYTES_BUDGET = 4_000_000
# Uncompressed size a single saved document may reach (250k characters of text
# plus its findings and review).
MAX_DOCUMENT_JSON_BYTES = 1_500_000


def document_key(document_id: str) -> str:
    return sha256(document_id.encode("utf-8")).hexdigest()


class SavedDocument(BaseModel):
    document_key: str
    document_id: str
    # None when the list ran past its size budget; fetch it by key.
    document: dict | None
    resolved: list[str] = Field(default_factory=list)
    updated_at: str = ""


class DocumentSave(BaseModel):
    document_id: str = Field(min_length=1, max_length=400)
    document: dict
    resolved: list[str] = Field(default_factory=list, max_length=500)


class Task(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(max_length=300)
    detail: str = Field(default="", max_length=1_000)
    completed: bool = False


class WorkspaceState(BaseModel):
    selected_document_id: str | None = Field(default=None, max_length=400)
    jurisdiction: str = Field(default="", max_length=200)
    # Built-in sample documents the person removed.
    hidden_samples: list[str] = Field(default_factory=list, max_length=50)
    tasks: list[Task] | None = Field(default=None, max_length=200)


@router.get("/documents", response_model=list[SavedDocument])
def read_documents(user: dict[str, str] = Depends(current_user)) -> list[SavedDocument]:
    saved: list[SavedDocument] = []
    spent = 0
    for entry in list_documents(user["sub"]):
        size = len(json.dumps(entry["document"]))
        included = spent + size <= LIST_BYTES_BUDGET
        spent += size if included else 0
        saved.append(
            SavedDocument(
                document_key=document_key(entry["document_id"]),
                document_id=entry["document_id"],
                document=entry["document"] if included else None,
                resolved=entry["resolved"],
                updated_at=entry["updated_at"],
            )
        )
    return saved


@router.get("/documents/{key}", response_model=SavedDocument)
def read_document(
    key: str = Path(pattern=DOCUMENT_KEY), user: dict[str, str] = Depends(current_user)
) -> SavedDocument:
    entry = get_document(user["sub"], key)
    if entry is None:
        raise HTTPException(status_code=404, detail="No such document.")
    return SavedDocument(document_key=key, **entry)


@router.put("/documents/{key}", response_model=SavedDocument)
def write_document(
    payload: DocumentSave,
    key: str = Path(pattern=DOCUMENT_KEY),
    user: dict[str, str] = Depends(current_user),
) -> SavedDocument:
    if key != document_key(payload.document_id):
        raise HTTPException(status_code=422, detail="The key does not match the document.")
    if payload.document.get("id") != payload.document_id:
        raise HTTPException(status_code=422, detail="The document's id does not match.")
    if len(json.dumps(payload.document)) > MAX_DOCUMENT_JSON_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="This document is too large to save.",
        )
    if not consume_document_save_quota(user["sub"]):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Saving too often. Your changes will be saved shortly.",
            headers={"Retry-After": "30"},
        )
    try:
        result = save_document(
            user["sub"], key, payload.document_id, payload.document, payload.resolved
        )
    except DocumentTooLargeError as error:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=str(error)
        ) from error
    if result == "limit":
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You have reached the number of documents that can be saved. Remove one first.",
        )
    return SavedDocument(
        document_key=key,
        document_id=payload.document_id,
        document=payload.document,
        resolved=payload.resolved,
    )


@router.delete("/documents/{key}", status_code=status.HTTP_204_NO_CONTENT)
def remove_document(
    key: str = Path(pattern=DOCUMENT_KEY), user: dict[str, str] = Depends(current_user)
) -> None:
    delete_document(user["sub"], key)


@router.get("/workspace-state", response_model=WorkspaceState)
def read_workspace_state(user: dict[str, str] = Depends(current_user)) -> WorkspaceState:
    return WorkspaceState(**get_workspace_state(user["sub"]))


@router.put("/workspace-state", response_model=WorkspaceState)
def write_workspace_state(
    payload: WorkspaceState, user: dict[str, str] = Depends(current_user)
) -> WorkspaceState:
    if not consume_document_save_quota(user["sub"]):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Saving too often. Your changes will be saved shortly.",
            headers={"Retry-After": "30"},
        )
    return WorkspaceState(**put_workspace_state(user["sub"], payload.model_dump()))
