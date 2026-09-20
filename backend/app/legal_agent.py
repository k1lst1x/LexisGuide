"""Bedrock-powered legal document review with strict, document-grounded output."""

from __future__ import annotations

import json
import os
from typing import Any
from uuid import uuid4

import boto3

SYSTEM_PROMPT = """You are LexisGuide, an AI assistant for understanding legal documents.
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
{
  "overall_assessment": "favorable|mixed|unfavorable|insufficient_information",
  "confidence": "low|medium|high",
  "document_score": 0,
  "priority_score": 0,
  "deadline": "ISO-8601 timestamp or null when no exact deadline is stated",
  "deadline_confidence": "low|medium|high",
  "summary": "...",
  "findings": [{
    "title": "...", "explanation": "...", "severity": "low|medium|high|critical",
    "source_text": "exact short excerpt or null", "why_it_matters": "...",
    "negotiation_point": "...", "suggested_rewrite": "... or null"
  }],
  "next_steps": ["..."],
  "questions_for_user": ["..."],
  "sources": [{"title": "...", "citation": "...", "url": "... or null", "support": "..."}],
  "disclaimer": "LexisGuide provides general information, not legal advice."
}
"""


class LegalDocumentAgent:
    def __init__(self, client: Any | None = None, model_id: str | None = None) -> None:
        self.model_id = model_id or os.getenv("BEDROCK_MODEL_ID", "")
        self.runtime_arn = os.getenv("AGENTCORE_RUNTIME_ARN", "")
        self.client = client or boto3.client(
            "bedrock-runtime", region_name=os.getenv("AWS_REGION", "us-east-1")
        )
        self.runtime_client = (
            boto3.client("bedrock-agentcore", region_name=os.getenv("AWS_REGION", "us-east-1"))
            if self.runtime_arn
            else None
        )
        self.knowledge_base_id = os.getenv("BEDROCK_KNOWLEDGE_BASE_ID", "")
        self.retrieval_client = (
            boto3.client("bedrock-agent-runtime", region_name=os.getenv("AWS_REGION", "us-east-1"))
            if self.knowledge_base_id
            else None
        )

    def review(
        self,
        document_text: str,
        *,
        action: str = "review",
        jurisdiction: str | None = None,
        user_context: str | None = None,
        goals: str | None = None,
    ) -> dict[str, Any]:
        request = {
            "action": action,
            "jurisdiction": jurisdiction or "Not provided",
            "user_context": user_context or "Not provided",
            "goals": goals or "Understand risks and improve the user's position",
            "document": document_text,
        }
        if self.retrieval_client and self.knowledge_base_id:
            request["authority_context"] = self._retrieve_authorities(document_text, jurisdiction)
        if self.runtime_arn and self.runtime_client:
            response = self.runtime_client.invoke_agent_runtime(
                agentRuntimeArn=self.runtime_arn,
                runtimeSessionId=uuid4().hex + uuid4().hex,
                payload=json.dumps(request).encode("utf-8"),
                qualifier="DEFAULT",
            )
            raw = response["response"].read()
            parsed = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
            return parsed.get("result", parsed) if isinstance(parsed, dict) else parsed

        if not self.model_id:
            raise RuntimeError("BEDROCK_MODEL_ID is not configured")

        response = self.client.converse(
            modelId=self.model_id,
            system=[{"text": SYSTEM_PROMPT}],
            messages=[{"role": "user", "content": [{"text": json.dumps(request)}]}],
            inferenceConfig={"temperature": 0.1, "maxTokens": 5000},
        )
        text = "".join(
            block.get("text", "") for block in response["output"]["message"]["content"]
        ).strip()
        parsed = json.loads(text.removeprefix("```json").removesuffix("```").strip())
        parsed.setdefault(
            "disclaimer", "LexisGuide provides general information, not legal advice."
        )
        return parsed

    def _retrieve_authorities(
        self, document_text: str, jurisdiction: str | None
    ) -> list[dict[str, str]]:
        query = (
            f"{jurisdiction or 'applicable jurisdiction'} legal authorities relevant to: "
            f"{document_text[:4000]}"
        )
        response = self.retrieval_client.retrieve(
            knowledgeBaseId=self.knowledge_base_id,
            retrievalQuery={"text": query},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": 8}},
        )
        authorities = []
        for item in response.get("retrievalResults", []):
            location = item.get("location", {})
            authorities.append(
                {
                    "text": item.get("content", {}).get("text", ""),
                    "uri": location.get("webLocation", {}).get("url")
                    or location.get("s3Location", {}).get("uri", ""),
                    "score": str(item.get("score", "")),
                }
            )
        return authorities


def configured_agent() -> LegalDocumentAgent | None:
    is_configured = os.getenv("BEDROCK_MODEL_ID") or os.getenv("AGENTCORE_RUNTIME_ARN")
    return LegalDocumentAgent() if is_configured else None
