"""A small, supervised specialist team for LexisGuide conversations.

The supervisor is deliberately deterministic: it routes a question to narrow
specialists and gives one existing Bedrock conversation agent their bounded
notes. That keeps latency, cost, and legal-safety behaviour predictable while
still separating review, research, and drafting responsibilities.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from .agent import ConversationAgent
from .models import ChatReply, ChatRequest
from .tools import check_clause


@dataclass(frozen=True)
class SpecialistNote:
    name: str
    text: str


class ReviewSpecialist:
    name = "review"

    def run(self, request: ChatRequest) -> SpecialistNote:
        excerpt = request.context.document_excerpt or ""
        findings = check_clause(excerpt)["findings"] if excerpt else []
        if not excerpt:
            return SpecialistNote(self.name, "Review specialist: no document excerpt is available.")
        evidence = "; ".join(
            f"{item['title']} — evidence: {item['evidence']}" for item in findings[:4]
        )
        return SpecialistNote(
            self.name,
            "Review specialist: use only the supplied document excerpt for "
            "document-specific claims. Pattern findings: "
            f"{evidence or 'none'}. Include exact evidence where relevant.",
        )


class ResearchSpecialist:
    name = "research"

    def run(self, request: ChatRequest) -> SpecialistNote:
        sources = request.context.authority_sources
        if not sources:
            return SpecialistNote(
                self.name,
                "Research specialist: no official source receipt is available. Do not "
                "state a statute, deadline, or licensing result as fact; ask for a "
                "jurisdiction and citation or direct the "
                "person to the verified lookup workflow.",
            )
        receipts = []
        for source in sources:
            receipts.append(
                " | ".join(
                    part
                    for part in [
                        source.get("citation", ""),
                        source.get("url", ""),
                        source.get("retrieved_at", ""),
                    ]
                    if part
                )
                + f"\n{source.get('text', '')}"
            )
        return SpecialistNote(
            self.name,
            "Research specialist: cite only these official-source receipts and "
            "state their limits:\n" + "\n---\n".join(receipts),
        )


class DraftingSpecialist:
    name = "drafting"

    def run(self, request: ChatRequest) -> SpecialistNote:
        return SpecialistNote(
            self.name,
            "Drafting specialist: provide proposed wording or negotiation points "
            "only. Label it as a draft, preserve any unknown facts as placeholders, "
            "and say that it has not changed the "
            "document. Do not promise legal effect or send/apply anything.",
        )


class SupervisorAgent:
    """Routes a chat turn to the smallest useful set of specialists."""

    def __init__(self, agent: ConversationAgent | None = None) -> None:
        self.agent = agent or ConversationAgent()
        self.specialists: dict[str, Callable[[ChatRequest], SpecialistNote]] = {
            "review": ReviewSpecialist().run,
            "research": ResearchSpecialist().run,
            "drafting": DraftingSpecialist().run,
        }

    @staticmethod
    def plan(request: ChatRequest) -> list[str]:
        question = request.messages[-1].content.lower()
        roles: list[str] = []
        has_document = bool(request.context.document_excerpt or request.context.current_finding)
        review_query = r"\b(clause|finding|risk|deadline|notice|document)\b"
        if has_document or re.search(review_query, question):
            roles.append("review")
        if request.context.authority_sources or re.search(
            r"\b(statute|law|section|§|citation|licensed|licen[cs]e|bar number|attorney)\b",
            question,
        ):
            roles.append("research")
        if re.search(r"\b(draft|rewrite|clearer wording|reword|negotiate|negotiation)\b", question):
            roles.append("drafting")
        return roles

    def chat(self, request: ChatRequest) -> ChatReply:
        roles = self.plan(request)
        notes = [self.specialists[role](request) for role in roles]
        specialist_context = "\n\n".join(f"[{note.name}]\n{note.text}" for note in notes)
        reply = self.agent.chat(request, specialist_context=specialist_context)
        return reply.model_copy(update={"agents_used": roles})
