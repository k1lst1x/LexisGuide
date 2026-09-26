"""The multi-agent team: routing, specialists in parallel, and guarded actions."""

import time
from collections import defaultdict

from lexisguide_assistant import ConversationAgent, orchestrator, parse_chat_request, run_tool
from lexisguide_assistant.orchestrator import SupervisorAgent


def text(value):
    return {
        "stopReason": "end_turn",
        "output": {"message": {"role": "assistant", "content": [{"text": value}]}},
    }


def tool(name, arguments):
    return {
        "stopReason": "tool_use",
        "output": {
            "message": {
                "role": "assistant",
                "content": [
                    {"toolUse": {"toolUseId": f"{name}-1", "name": name, "input": arguments}}
                ],
            }
        },
    }


class Team:
    """Bedrock, answering as whichever agent is calling (known from its system prompt)."""

    def __init__(self, route=None, scripts=None, lead="Final answer.", slow=(), broken=()):
        self.route = route
        self.scripts = scripts or {}
        self.lead = lead
        self.slow = set(slow)
        self.broken = set(broken)
        self.calls = defaultdict(list)

    def converse(self, **kwargs):
        system = kwargs["system"][0]["text"]
        agent = (
            system.split("]", 1)[0].removeprefix("[agent:")
            if system.startswith("[agent:")
            else "lead"
        )
        self.calls[agent].append(kwargs)
        if agent in self.broken:
            raise RuntimeError("Bedrock is down")
        if agent in self.slow:
            time.sleep(0.5)
        if agent == "router":
            if self.route is None:
                raise RuntimeError("no router")
            return tool("route", {"roles": self.route})
        if agent == "lead":
            return text(self.lead)
        script = self.scripts.get(agent, [text(f"{agent} note")])
        index = min(len(self.calls[agent]) - 1, len(script) - 1)
        return script[index]


def ask(team, *turns, **context):
    request = parse_chat_request(
        {"messages": [{"role": r, "content": c} for r, c in turns], "context": context}
    )
    return SupervisorAgent(ConversationAgent(team, "model")).chat(request)


def lead_notes(team):
    return team.calls["lead"][0]["system"][-1]["text"]


def plan(actions, auto_apply=True):
    return {"operator": [tool("plan_actions", {"actions": actions, "auto_apply": auto_apply})]}


def test_the_router_sends_a_question_to_its_specialists_in_parallel():
    team = Team(route=["law", "support"], scripts={"law": [text("Deposits: 14-60 days.")]})
    reply = ask(team, ("user", "My landlord kept my deposit. Where do I upload the lease?"))

    assert reply.reply == "Final answer."
    assert reply.agents_used == ["law", "support"]
    notes = lead_notes(team)
    assert "[law]\nDeposits: 14-60 days." in notes
    assert "[support]\nsupport note" in notes
    # Each specialist had its own instructions.
    assert "US law specialist" in team.calls["law"][0]["system"][0]["text"]
    assert "customer support" in team.calls["support"][0]["system"][0]["text"]


def test_without_the_router_the_wording_picks_the_specialists():
    team = Team(route=None)
    reply = ask(team, ("user", "Can my landlord evict me without going to court?"))
    assert "law" in reply.agents_used


def test_small_talk_uses_no_specialists():
    team = Team(route=[])
    reply = ask(team, ("user", "hi there"))
    assert reply.agents_used == []
    assert set(team.calls) == {"router", "lead"}


def test_a_command_is_carried_out_by_itself():
    team = Team(route=["operator"], scripts=plan(["apply_rewrite"]))
    reply = ask(
        team,
        ("user", "Fix this clause."),
        document_excerpt="Either party may terminate.",
        current_finding="No notice period",
    )
    assert reply.workspace_actions == ["apply_rewrite"]
    assert reply.auto_apply is True


def test_a_question_about_fixing_is_only_offered_even_if_the_model_says_run_it():
    team = Team(route=["operator"], scripts=plan(["apply_rewrite"]))
    reply = ask(
        team,
        ("user", "How would you fix this clause?"),
        document_excerpt="Either party may terminate.",
        current_finding="No notice period",
    )
    assert reply.workspace_actions == ["apply_rewrite"]
    assert reply.auto_apply is False


def test_an_action_that_needs_a_selected_finding_is_dropped_without_one():
    team = Team(route=["operator"], scripts=plan(["apply_rewrite", "resolve"]))
    reply = ask(team, ("user", "Fix it."), document_excerpt="Either party may terminate.")
    assert reply.workspace_actions == []
    assert reply.auto_apply is False


def test_yes_to_the_assistants_offer_applies_the_change():
    team = Team(route=[], broken={"operator"})
    reply = ask(
        team,
        ("user", "This clause looks unfair."),
        ("assistant", "Would you like me to make this change to your working copy?"),
        ("user", "Yes"),
        document_excerpt="Either party may terminate.",
        current_finding="No notice period",
    )
    # The router chose nothing, but a yes to an offer is a command: the operator
    # runs, and even with Bedrock down its rule-based fallback applies the change.
    assert "operator" in reply.agents_used
    assert reply.workspace_actions == ["apply_rewrite"]
    assert reply.auto_apply is True


def test_the_inbox_agent_summarises_messages_and_adds_the_tasks_asked_for():
    team = Team(
        route=["inbox"],
        scripts={
            "inbox": [
                tool(
                    "propose_tasks",
                    {
                        "tasks": [
                            {"title": "Reply to Maya about the deadline", "priority": "high"},
                            {"title": "Existing task"},
                        ]
                    },
                ),
                text("Maya asked you about October 14."),
            ]
        },
    )
    reply = ask(
        team,
        ("user", "Summarize my messages and add tasks for what I need to do."),
        inbox=[
            {
                "channel": "general",
                "author": "Maya",
                "text": "@Ada can you confirm Oct 14?",
                "mentions_me": True,
            }
        ],
        open_tasks=["Existing task"],
    )
    assert [task.title for task in reply.tasks] == ["Reply to Maya about the deadline"]
    assert reply.tasks[0].priority == "high"
    assert reply.auto_apply is True
    brief = team.calls["inbox"][0]["messages"][0]["content"][0]["text"]
    assert "(mentions you): @Ada can you confirm Oct 14?" in brief


def test_suggested_tasks_are_not_added_unless_asked():
    team = Team(
        route=["inbox"],
        scripts={
            "inbox": [tool("propose_tasks", {"tasks": [{"title": "Reply to Maya"}]}), text("ok")]
        },
    )
    reply = ask(team, ("user", "What did I miss?"), inbox=[{"text": "Hello", "author": "Maya"}])
    assert [task.title for task in reply.tasks] == ["Reply to Maya"]
    assert reply.auto_apply is False


def test_a_failing_specialist_falls_back_and_the_answer_still_comes():
    team = Team(route=["law"], broken={"law"})
    reply = ask(team, ("user", "What are my rights if I get evicted?"))
    assert reply.reply == "Final answer."
    assert "Law specialist (primer)" in lead_notes(team)


def test_a_slow_specialist_is_left_out_rather_than_holding_up_the_answer(monkeypatch):
    monkeypatch.setattr(orchestrator, "SPECIALIST_DEADLINE_SECONDS", 0.05)
    team = Team(route=["support"], slow={"support"})
    started = time.monotonic()
    reply = ask(team, ("user", "The upload button is not working"))
    assert time.monotonic() - started < 0.45
    assert reply.reply == "Final answer."
    assert "Support specialist: answer from the LexisGuide site guide" in lead_notes(team)


def test_the_knowledge_tools():
    assert "History" in run_tool("site_guide", {"topic": "history"})["guidance"]
    assert "support@lexisguide.app" in run_tool("support_help", {"issue": "sign_in"})["contact"]
    law = run_tool("us_law", {"topic": "My landlord will not return my deposit"})
    assert "landlord_tenant" in law["topics"]
    assert "not legal advice" in law["caution"]
