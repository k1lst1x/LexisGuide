"""The versioned, model-facing contract for a LexisGuide document review."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

DEFAULT_DISCLAIMER = "LexisGuide provides general information, not legal advice."

SYSTEM_PROMPT = f"""You are LexisGuide, an AI assistant for understanding legal documents.
You are not a lawyer and must never present your output as legal advice, a guarantee,
or a prediction of a legal outcome. Review only the supplied document and user context.
Do not invent laws, cases, deadlines, or facts. If jurisdiction or facts are missing,
say so and explain what would change the assessment.

Your job is to identify concrete language that may disadvantage the user, explain it in
plain language, rate practical risk (low, medium, high, or critical), and propose
negotiation points and an optional replacement clause. Preserve the user's goal while
avoiding false certainty. Escalate to a licensed attorney for urgent deadlines,
criminal exposure, immigration, family safety, eviction, signing a settlement/release,
or any matter where a mistake could cause serious harm.

Authority context, when supplied, comes from a curated legal-source index. Cite only
those supplied authorities; do not claim to have searched every case or current law.

Also return document_score (0-100, higher is better for the user), priority_score
(0-100, higher means more urgent), deadline (an exact ISO-8601 timestamp or null),
and deadline_confidence (low|medium|high). Never invent a deadline; use null when
the document is vague or the jurisdiction is missing.

Return valid JSON only with this shape:
{{
  "overall_assessment": "favorable|mixed|unfavorable|insufficient_information",
  "confidence": "low|medium|high",
  "document_score": 0,
  "priority_score": 0,
  "deadline": "ISO-8601 timestamp or null when no exact deadline is stated",
  "deadline_confidence": "low|medium|high",
  "summary": "...",
  "findings": [{{
    "title": "...", "explanation": "...", "severity": "low|medium|high|critical",
    "source_text": "exact short excerpt or null", "why_it_matters": "...",
    "negotiation_point": "...", "suggested_rewrite": "... or null"
  }}],
  "next_steps": ["..."],
  "questions_for_user": ["..."],
  "sources": [{{"title": "...", "citation": "...", "url": "... or null", "support": "..."}}],
  "disclaimer": "{DEFAULT_DISCLAIMER}"
}}
"""


class AuthorityContext(BaseModel):
    """A source returned by the curated retrieval index."""

    model_config = ConfigDict(extra="forbid")

    text: str = Field(max_length=20_000)
    uri: str = Field(max_length=2_000)
    score: str = Field(max_length=100)


class ReviewRequest(BaseModel):
    """Validated request sent from the API client to the AgentCore executor."""

    model_config = ConfigDict(extra="forbid")

    document: str = Field(min_length=1, max_length=250_000)
    action: Literal["review", "negotiate", "rewrite"] = "review"
    jurisdiction: str = Field(default="Not provided", max_length=200)
    user_context: str = Field(default="Not provided", max_length=5_000)
    goals: str = Field(
        default="Understand risks and improve the user's position",
        max_length=2_000,
    )
    authority_context: list[AuthorityContext] = Field(default_factory=list, max_length=8)


class Finding(BaseModel):
    """A document-grounded issue identified by the reviewer."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=500)
    explanation: str = Field(min_length=1, max_length=10_000)
    severity: Literal["low", "medium", "high", "critical"]
    source_text: str | None = Field(default=None, max_length=5_000)
    why_it_matters: str | None = Field(default=None, max_length=10_000)
    negotiation_point: str | None = Field(default=None, max_length=10_000)
    suggested_rewrite: str | None = Field(default=None, max_length=10_000)


class Source(BaseModel):
    """A curated authority that supports the review."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(default="", max_length=500)
    citation: str = Field(default="", max_length=2_000)
    url: str | None = Field(default=None, max_length=2_000)
    support: str = Field(default="", max_length=10_000)


class ReviewResult(BaseModel):
    """Canonical model result returned through AgentCore and the public API."""

    model_config = ConfigDict(extra="forbid")

    findings: list[Finding]
    disclaimer: str
    overall_assessment: (
        Literal["favorable", "mixed", "unfavorable", "insufficient_information"] | None
    ) = None
    confidence: Literal["low", "medium", "high"] | None = None
    document_score: int | None = Field(default=None, ge=0, le=100)
    priority_score: int | None = Field(default=None, ge=0, le=100)
    deadline: str | None = Field(default=None, max_length=100)
    deadline_confidence: Literal["low", "medium", "high"] | None = None
    summary: str | None = Field(default=None, max_length=20_000)
    next_steps: list[str] = Field(default_factory=list, max_length=50)
    questions_for_user: list[str] = Field(default_factory=list, max_length=50)
    sources: list[Source] = Field(default_factory=list, max_length=50)


def parse_review_request(payload: Mapping[str, Any]) -> ReviewRequest:
    """Accept the historical ``document_text`` input while emitting one request shape."""
    normalized = dict(payload)
    if "document" not in normalized and "document_text" in normalized:
        normalized["document"] = normalized.pop("document_text")
    return ReviewRequest.model_validate(normalized)


def parse_review_result(value: Mapping[str, Any] | str | bytes) -> ReviewResult:
    """Parse the JSON-only model response and reject contract drift explicitly."""
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    if isinstance(value, str):
        value = json.loads(value.removeprefix("```json").removesuffix("```").strip())
    normalized = dict(value)
    normalized.setdefault("disclaimer", DEFAULT_DISCLAIMER)
    return ReviewResult.model_validate(normalized)
