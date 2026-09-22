"""Tools the LexisGuide assistant can call. Each is deterministic and offline, so
answers about the product, risky wording, and legal vocabulary stay grounded."""

from __future__ import annotations

import re
from typing import Any

HELP_TOPICS: dict[str, str] = {
    "getting_started": (
        "LexisGuide reads a legal or government document, highlights unclear or risky "
        "terms, explains each one in plain language, and suggests a next step. Open the "
        "workspace, choose Add document, then work through the findings in Review."
    ),
    "add_document": (
        "Choose Add document in the sidebar or on Home. Upload a PDF, Word (.docx), HTML, "
        "RTF or text file, drag one onto the Documents page, or paste the text. Scanned "
        "PDFs without selectable text need the text pasted in. LexisGuide then opens the "
        "document in Review."
    ),
    "review": (
        "Review has three columns: the findings queue (most serious first), the document "
        "with highlighted passages, and the explanation: why it matters, the exact text, "
        "the rule it was checked against, and a recommended next step. Click a highlight "
        "to jump to its finding."
    ),
    "resolve": (
        "When you have dealt with a finding, choose Mark resolved. LexisGuide moves to the "
        "next open finding and updates progress on Home and in the sidebar. Reopen undoes it."
    ),
    "share": (
        "Use Discuss on a finding to draft a team message, or Create task to add it to "
        "Messages, Tasks. Signed-in users can create a shared workspace and invite others "
        "with an invite code from Messages."
    ),
    "search": (
        "Press Ctrl+K (or Cmd+K) to search documents and flagged language. Switch to AI "
        "Search to ask a question across all your documents."
    ),
    "scores": (
        "Each document gets a 0 to 100 clarity and fairness score. 80 is the pass line. "
        "The score reflects how many findings are high impact or need review; it is "
        "guidance, not a legal judgment."
    ),
    "deadlines": (
        "Home lists deadlines found in your documents, and flags documents that do not "
        "state a clear deadline so you can ask for one in writing."
    ),
    "privacy": (
        "Every request is checked against your signed-in account, the service reads only "
        "your own records, and the browser never holds cloud credentials. Scripts inside "
        "uploaded files never run; only readable text is extracted."
    ),
}

CLAUSE_PATTERNS: list[tuple[str, str, str, str]] = [
    (
        r"within (?:the |a )?(?:standard|reasonable|prescribed) (?:filing )?(?:period|timeframe)",
        "high",
        "Vague deadline",
        "It does not say exactly when you must act. Ask for a calendar date in writing.",
    ),
    (
        r"forfeiture of (?:all )?rights|waive[sd]? (?:any|all|your) rights?",
        "high",
        "Rights can be lost",
        "You could lose rights without a clear explanation of what or how to object.",
    ),
    (
        r"(?:sole|absolute) discretion|at any time(?: and)? (?:without|for any reason)",
        "high",
        "One-sided power",
        "One party can act without limits or notice. Ask for conditions and notice.",
    ),
    (
        r"may be adjusted|subject to change|may change (?:the )?(?:price|rent|fee)",
        "review",
        "Amount can change",
        "The amount can change without a stated method or cap.",
    ),
    (
        r"subject to deductions",
        "review",
        "Undefined deductions",
        "Deductions are allowed without saying what qualifies or how they are proven.",
    ),
    (
        r"either party may terminate(?![^.]*\b\d+\s*days)",
        "high",
        "No notice period",
        "Ending the agreement has no stated notice period.",
    ),
    (
        r"automatic(?:ally)? renew|auto-renew",
        "review",
        "Automatic renewal",
        "The agreement renews on its own. Check how and when you can cancel.",
    ),
    (
        r"binding arbitration|class action waiver",
        "review",
        "Limits on going to court",
        "Disputes may have to go to arbitration instead of court.",
    ),
    (
        r"indemnif(?:y|ies|ication)|hold harmless",
        "review",
        "You may cover their costs",
        "You may have to pay the other side's losses or legal costs.",
    ),
    (
        r"non-?refundable",
        "review",
        "Money is not returned",
        "A payment will not be returned even if plans change.",
    ),
    (
        r"may result in (?:tenant |your )?liability",
        "review",
        "Unclear responsibility",
        "Costs or blame may shift to you without a defined limit.",
    ),
    (
        r"late (?:fee|charge|payment penalty)",
        "review",
        "Late charges",
        "Check the amount, when it applies, and whether it is capped.",
    ),
]

GLOSSARY: dict[str, str] = {
    "appeal": "Asking a higher authority to review and change a decision.",
    "arbitration": "Settling a dispute with a private decision-maker instead of a court. "
    "It is usually binding and hard to appeal.",
    "breach": "Failing to do what a contract requires.",
    "consideration": "What each side gives or promises in exchange, such as money or services.",
    "damages": "Money one side may owe the other to make up for a loss.",
    "default": "Failing to meet an obligation, often a payment, which can trigger penalties.",
    "due process": "Your right to fair notice and a fair chance to respond before a decision "
    "that affects you is final.",
    "effective date": "The date the terms start to apply.",
    "escrow": "Money or documents held by a neutral third party until conditions are met.",
    "force majeure": "Events outside anyone's control, like disasters, that can excuse a "
    "party from performing.",
    "hearing": "A meeting, sometimes formal, where you can present your side before a "
    "decision-maker.",
    "indemnify": "To promise to pay for the other party's losses or legal costs.",
    "jurisdiction": "Which place's laws apply, and which courts can hear a dispute.",
    "liability": "Legal responsibility, often to pay for harm or loss.",
    "lien": "A legal claim on property until a debt is paid.",
    "notice period": "How far in advance one side must tell the other before acting, "
    "for example before ending a lease.",
    "null and void": "Having no legal effect.",
    "severability": "If one part of a contract is invalid, the rest still applies.",
    "statute of limitations": "The deadline for starting a legal claim.",
    "sublease": "Renting a place you rent to someone else.",
    "termination": "Ending an agreement.",
    "waiver": "Giving up a right, sometimes without realising it.",
    "warranty": "A promise that something is true or will work as described.",
}

TOOL_SPECS: list[dict[str, Any]] = [
    {
        "toolSpec": {
            "name": "lexisguide_help",
            "description": "Explain how to use a part of the LexisGuide product.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {"topic": {"type": "string", "enum": sorted(HELP_TOPICS)}},
                    "required": ["topic"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "check_clause",
            "description": "Scan a clause or passage for common unclear or risky wording. "
            "Use when the person pastes text or asks whether wording is risky.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {"text": {"type": "string", "description": "The exact wording."}},
                    "required": ["text"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "explain_term",
            "description": "Look up a plain-language definition of a legal term.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {"term": {"type": "string"}},
                    "required": ["term"],
                }
            },
        }
    },
]


def lexisguide_help(topic: str) -> dict[str, Any]:
    key = topic.strip().lower().replace(" ", "_")
    if key in HELP_TOPICS:
        return {"topic": key, "guidance": HELP_TOPICS[key]}
    return {"topic": key, "guidance": HELP_TOPICS["getting_started"], "note": "Unknown topic"}


def check_clause(text: str) -> dict[str, Any]:
    text = text[:6_000]
    matches = []
    for pattern, severity, title, why in CLAUSE_PATTERNS:
        found = re.search(pattern, text, flags=re.IGNORECASE)
        if found:
            matches.append(
                {
                    "title": title,
                    "severity": severity,
                    "evidence": found.group(0),
                    "why_it_matters": why,
                }
            )
    return {
        "findings": matches,
        "note": "A pattern check, not a full review. No match does not mean the text is safe.",
    }


def explain_term(term: str) -> dict[str, Any]:
    key = term.strip().lower()
    for candidate in (key, key.rstrip("s"), key.replace("-", " ")):
        if candidate in GLOSSARY:
            return {"term": candidate, "found": True, "definition": GLOSSARY[candidate]}
    return {"term": key, "found": False}


TOOLS = {
    "lexisguide_help": lexisguide_help,
    "check_clause": check_clause,
    "explain_term": explain_term,
}


def run_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": f"Unknown tool {name}"}
    try:
        return tool(**{key: str(value) for key, value in (arguments or {}).items()})
    except TypeError as error:
        return {"error": f"Invalid arguments for {name}: {error}"}
