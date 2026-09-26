"""The LexisGuide multi-agent assistant.

A turn goes through three steps:

1. The router (a small Bedrock call, with a rule-based fallback) picks the
   specialists the question needs.
2. The specialists work in parallel. Support, law, inbox and operator are
   Bedrock agents with their own instructions and tools; review, research and
   drafting are fast deterministic notes. Each returns an internal note, and
   the inbox and operator agents also return tasks and app actions.
3. The lead agent (``ConversationAgent``) writes one natural-language answer
   from the notes.

The app performs actions, never the model. An action runs by itself only when
the person's own words told the assistant to do it; otherwise it is offered.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, wait
from typing import Any

from .agent import ConversationAgent
from .models import ChatReply, ChatRequest, ProposedTask
from .specialists import (
    InboxAgent,
    LawAgent,
    OperatorAgent,
    SpecialistNote,
    SupportAgent,
    deterministic_actions,
    drafting_note,
    explicitly_told,
    plain_actions,
    research_note,
    review_note,
)

ROLES: tuple[str, ...] = (
    "review",
    "research",
    "drafting",
    "law",
    "support",
    "inbox",
    "operator",
)

# Specialists answer in parallel; one slower than this is left out of the
# answer rather than holding it up (the API has about 29 seconds in total).
SPECIALIST_DEADLINE_SECONDS = 9
ROUTER_MAX_TOKENS = 200

ROUTER_INSTRUCTIONS = (
    "[agent:router] You route one message to LexisGuide's specialist agents. Call route "
    "once with every role that should help:\n"
    "- review: the person asks about the open document, an attached file, a finding or "
    "clause.\n"
    "- research: they ask about a specific statute, citation or official rule.\n"
    "- drafting: they want wording drafted, rewritten or negotiated.\n"
    "- law: any question about US law, rights, legal terms, deadlines or legal help.\n"
    "- support: how to use the LexisGuide website, or a problem with it (sign-in, saving, "
    "uploads, messages, blockchain history, errors).\n"
    "- inbox: their messages, mentions, channels, tasks, priorities or what to do next.\n"
    "- operator: they ask the assistant to do something in the app: fix or apply a change, "
    "resolve a finding, re-check the document, suggest negotiation points, create tasks.\n"
    "Choose none for greetings and small talk."
)

ROUTE_TOOL = {
    "toolSpec": {
        "name": "route",
        "description": "Choose the specialist roles for this message.",
        "inputSchema": {
            "json": {
                "type": "object",
                "properties": {
                    "roles": {"type": "array", "items": {"type": "string", "enum": list(ROLES)}}
                },
                "required": ["roles"],
            }
        },
    }
}

INBOX_QUERY = re.compile(
    r"\b(messages?|inbox|mentions?|channels?|unread|summari[sz]e|priorit|to-?dos?|tasks?|"
    r"what should i (?:do|work on)|catch me up|what did i miss)\b",
    re.IGNORECASE,
)
SUPPORT_QUERY = re.compile(
    r"\b(how do i|where (?:is|do|can)|can't|cannot|won't|doesn't work|not working|error|"
    r"bug|sign ?in|log ?in|password|upload|not saved|saving|button|page|website|app|"
    r"invite|workspace|blockchain|history|settings|account|support)\b",
    re.IGNORECASE,
)
LAW_QUERY = re.compile(
    r"\b(law|legal|rights?|statute|court|evict|lease|landlord|tenant|appeal|benefits?|"
    r"contract|debt|sue|lawsuit|lawyer|attorney|deadline|visa|immigration|employer|fired|"
    r"what does .* mean)\b",
    re.IGNORECASE,
)
ACTION_QUERY = re.compile(
    r"\b(fix|apply|resolve|mark|re-?check|review again|negotiat|create|add|make) ", re.IGNORECASE
)


class SupervisorAgent:
    """Routes a chat turn to the specialist agents and composes one answer."""

    def __init__(self, agent: ConversationAgent | None = None, *, team: bool = True) -> None:
        self.agent = agent or ConversationAgent()
        # With team=False only the deterministic specialists run: one Bedrock call per turn.
        self.team = team
        self.deterministic: dict[str, Callable[[ChatRequest], SpecialistNote]] = {
            "review": review_note,
            "research": research_note,
            "drafting": drafting_note,
        }

    # ── Routing ────────────────────────────────────────────────────────────

    @staticmethod
    def plan(request: ChatRequest) -> list[str]:
        """Roles implied by the context and wording alone."""
        question = request.messages[-1].content.lower()
        roles: list[str] = []
        has_document = bool(
            request.context.attachments
            or request.context.document_excerpt
            or request.context.current_finding
        )
        if has_document or re.search(
            r"\b(clause|finding|risk|deadline|notice|document)\b", question
        ):
            roles.append("review")
        if request.context.authority_sources or re.search(
            r"\b(statute|section|§|citation|licensed|licen[cs]e|bar number|attorney)\b", question
        ):
            roles.append("research")
        if re.search(
            r"\b(draft|rewrite|clearer wording|reword|negotiate|negotiation|fix|change)\b", question
        ):
            roles.append("drafting")
        return roles

    @staticmethod
    def team_plan(request: ChatRequest) -> list[str]:
        """Which Bedrock specialists the wording calls for, without asking a model."""
        question = request.messages[-1].content
        roles: list[str] = []
        if LAW_QUERY.search(question):
            roles.append("law")
        if SUPPORT_QUERY.search(question):
            roles.append("support")
        if INBOX_QUERY.search(question) or (
            request.context.inbox and "message" in (request.context.page or "").lower()
        ):
            roles.append("inbox")
        if ACTION_QUERY.search(question + " ") or explicitly_told(request):
            roles.append("operator")
        return roles

    def route(self, request: ChatRequest) -> list[str]:
        roles = self.plan(request)
        if not self.team:
            return roles
        chosen = self._llm_route(request)
        if chosen is None:
            chosen = self.team_plan(request)
        # The context can require a role the router missed: an inbox question
        # needs the inbox, a command needs the operator.
        for role in self.team_plan(request):
            if role in {"inbox", "operator"} and role not in chosen:
                chosen.append(role)
        return [role for role in ROLES if role in set(roles) | set(chosen)]

    def _llm_route(self, request: ChatRequest) -> list[str] | None:
        try:
            response = self.agent.client.converse(
                modelId=self.agent.model_id,
                system=[{"text": ROUTER_INSTRUCTIONS}],
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "text": f"Page: {request.context.page or 'unknown'}\n"
                                f"Document open: {request.context.document_title or 'none'}\n"
                                f"Message: {request.messages[-1].content[:2_000]}"
                            }
                        ],
                    }
                ],
                toolConfig={"tools": [ROUTE_TOOL], "toolChoice": {"any": {}}},
                inferenceConfig={"temperature": 0, "maxTokens": ROUTER_MAX_TOKENS},
            )
        except Exception:  # noqa: BLE001 - the rule-based plan takes over
            return None
        for block in response.get("output", {}).get("message", {}).get("content", []):
            use = block.get("toolUse")
            if use and use.get("name") == "route":
                roles = (use.get("input") or {}).get("roles", [])
                if isinstance(roles, list):
                    return [role for role in roles if role in ROLES]
        return None

    # ── Specialists ────────────────────────────────────────────────────────

    def _bedrock_specialist(self, role: str) -> Any:
        agents = {
            "law": LawAgent,
            "support": SupportAgent,
            "inbox": InboxAgent,
            "operator": OperatorAgent,
        }
        return agents[role](self.agent.client, self.agent.model_id)

    def consult(self, request: ChatRequest, roles: list[str]) -> list[SpecialistNote]:
        notes = [self.deterministic[role](request) for role in roles if role in self.deterministic]
        team = [role for role in roles if role not in self.deterministic]
        if not team:
            return notes
        specialists = {role: self._bedrock_specialist(role) for role in team}
        pool = ThreadPoolExecutor(max_workers=len(team))
        try:
            futures = {role: pool.submit(specialists[role].run, request) for role in team}
            wait(futures.values(), timeout=SPECIALIST_DEADLINE_SECONDS)
            for role in team:
                future = futures[role]
                notes.append(
                    future.result() if future.done() else specialists[role].fallback(request)
                )
        finally:
            # Do not wait for a specialist that missed the deadline.
            pool.shutdown(wait=False, cancel_futures=True)
        return notes

    # ── A turn ─────────────────────────────────────────────────────────────

    @staticmethod
    def proposed_workspace_actions(request: ChatRequest) -> list[str]:
        """Actions implied by the wording alone, for a runtime without the operator."""
        if not request.context.document_excerpt:
            return []
        question = request.messages[-1].content.lower()
        prior = (
            request.messages[-2].content.lower()
            if len(request.messages) > 1 and request.messages[-2].role == "assistant"
            else ""
        )
        affirmative = re.fullmatch(
            r"(?:yes|yeah|yep|please do|go ahead|do it|make the change)[!. ]*", question
        )
        if affirmative and "would you like me to make this change" in prior:
            return ["apply_rewrite"]
        if affirmative:
            return []
        return deterministic_actions(request)

    def chat(self, request: ChatRequest) -> ChatReply:
        roles = self.route(request)
        notes = self.consult(request, roles)
        specialist_context = "\n\n".join(
            f"[{note.name}]\n{note.text}" for note in notes if note.text
        )
        reply = self.agent.chat(request, specialist_context=specialist_context)

        operator = next((note for note in notes if note.name == "operator"), None)
        if operator is not None:
            actions, auto_apply = operator.actions, operator.auto_apply
        else:
            actions, auto_apply = self.proposed_workspace_actions(request), False
        tasks: list[ProposedTask] = [task for note in notes for task in note.tasks][:10]
        asked_for_tasks = re.search(
            r"(tasks?|to-?dos?|reminders?|follow-?ups?)", request.messages[-1].content, re.I
        )
        if tasks and asked_for_tasks and explicitly_told(request):
            # "Add these as tasks": the inbox agent's tasks are the ones to add.
            auto_apply = True
        tools = list(reply.tools_used) + [tool for note in notes for tool in note.tools_used]
        return reply.model_copy(
            update={
                "agents_used": roles,
                "workspace_actions": plain_actions(actions),
                "auto_apply": bool(auto_apply and (actions or tasks)),
                "tasks": tasks,
                "tools_used": list(dict.fromkeys(tools)),
            }
        )
