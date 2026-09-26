"""Official-source enrichment for the chat research specialist.

Only an explicit statute citation is looked up. This keeps the assistant from
guessing which law applies and means every returned authority has a provenance
URL supplied by lawfirm.dev.
"""

from __future__ import annotations

import re

from lexisguide_assistant import ChatRequest

from app.lawfirm import LawFirmUnavailableError, configured_lawfirm_client

STATUTE_CITATION = re.compile(r"(?:§\s*|section\s+)(\d{1,4}(?:\.\d{1,4}){1,3})", re.IGNORECASE)


def add_official_source(request: ChatRequest) -> ChatRequest:
    """Add one provider-backed statute receipt when the person named it exactly.

    Provider failures are intentionally non-fatal: the research specialist will
    clearly say that it has no receipt instead of converting a chat question
    into a false legal answer.
    """
    if request.context.authority_sources or not request.context.jurisdiction:
        return request
    text = "\n".join([request.messages[-1].content, request.context.document_excerpt or ""])
    match = STATUTE_CITATION.search(text)
    if not match:
        return request
    try:
        client = configured_lawfirm_client()
    except LawFirmUnavailableError:
        return request
    if client is None:
        return request
    citation = match.group(1)
    try:
        result = client.lookup_statute(request.context.jurisdiction, citation)
    except LawFirmUnavailableError:
        return request
    except Exception:
        # An unexpected provider response is never treated as legal authority.
        return request
    meta = result.get("_meta", {}) if isinstance(result.get("_meta"), dict) else {}
    source = {
        "citation": citation,
        "text": str(result.get("text") or result.get("statuteText") or result.get("content") or ""),
        "url": str(
            result.get("sourceUrl") or result.get("source_url") or meta.get("sourceUrl") or ""
        ),
        "retrieved_at": str(
            result.get("retrievedAt") or result.get("retrieved_at") or meta.get("retrievedAt") or ""
        ),
    }
    if not source["text"] or not source["url"]:
        return request
    context = request.context.model_copy(update={"authority_sources": [source]})
    return request.model_copy(update={"context": context})
