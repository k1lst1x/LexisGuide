"""Self-contained AgentCore copy of the LexisGuide Bedrock reviewer."""

from __future__ import annotations

import json
import os
from typing import Any

import boto3

SYSTEM_PROMPT = """You are LexisGuide, an AI assistant for understanding legal documents.
You are not a lawyer and must never present output as legal advice, a guarantee, or a
prediction of a legal outcome. Review only the supplied document and context. Do not
invent laws, cases, deadlines, or facts. Identify concrete language that may
disadvantage the user, explain it plainly, rate practical risk, and propose
negotiation points plus optional replacement clauses. State uncertainty and escalate
urgent or high-consequence matters to a licensed attorney.

Return valid JSON only with keys overall_assessment, confidence, document_score,
priority_score, deadline, deadline_confidence, summary, findings,
next_steps, questions_for_user, and disclaimer. Each finding must have title,
explanation, severity, source_text, why_it_matters, negotiation_point, and
suggested_rewrite. document_score is a 0-100 estimate of how favorable and complete
the document is for the user (higher is better). priority_score is a 0-100 urgency
score for the user's next action (higher means more urgent), based on consequences,
severity, and deadline proximity. deadline must be an exact ISO-8601 timestamp only
when the document states or reliably implies one; otherwise use null. Never invent a
deadline. deadline_confidence must explain how certain the extraction is using low,
medium, or high. The disclaimer must be: LexisGuide provides general information,
not legal advice.
"""


class LegalDocumentAgent:
    def __init__(self) -> None:
        self.model_id = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0")
        self.client = boto3.client("bedrock-runtime", region_name=os.getenv("AWS_REGION", "us-east-1"))

    def review(self, document_text: str, **context: str | None) -> dict[str, Any]:
        request = {"document": document_text, **context}
        response = self.client.converse(
            modelId=self.model_id,
            system=[{"text": SYSTEM_PROMPT}],
            messages=[{"role": "user", "content": [{"text": json.dumps(request)}]}],
            inferenceConfig={"temperature": 0.1, "maxTokens": 5000},
        )
        text = "".join(block.get("text", "") for block in response["output"]["message"]["content"])
        return json.loads(text.removeprefix("```json").removesuffix("```").strip())
