"""Bedrock-powered legal document review with strict, document-grounded output."""

from __future__ import annotations

import json
import os
from typing import Any
from uuid import uuid4

import boto3
from review_contract import SYSTEM_PROMPT, ReviewRequest, parse_review_result


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
        authority_context = (
            self._retrieve_authorities(document_text, jurisdiction)
            if self.retrieval_client and self.knowledge_base_id
            else []
        )
        request = ReviewRequest(
            action=action,
            jurisdiction=jurisdiction or "Not provided",
            user_context=user_context or "Not provided",
            goals=goals or "Understand risks and improve the user's position",
            document=document_text,
            authority_context=authority_context,
        )
        if self.runtime_arn and self.runtime_client:
            response = self.runtime_client.invoke_agent_runtime(
                agentRuntimeArn=self.runtime_arn,
                runtimeSessionId=uuid4().hex + uuid4().hex,
                payload=request.model_dump_json().encode("utf-8"),
                qualifier="DEFAULT",
            )
            raw = response["response"].read()
            parsed = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
            return parse_review_result(parsed.get("result", parsed)).model_dump(
                exclude_none=True,
                exclude_defaults=True,
            )

        if not self.model_id:
            raise RuntimeError("BEDROCK_MODEL_ID is not configured")

        response = self.client.converse(
            modelId=self.model_id,
            system=[{"text": SYSTEM_PROMPT}],
            messages=[{"role": "user", "content": [{"text": request.model_dump_json()}]}],
            inferenceConfig={"temperature": 0.1, "maxTokens": 5000},
        )
        text = "".join(
            block.get("text", "") for block in response["output"]["message"]["content"]
        ).strip()
        return parse_review_result(text).model_dump(exclude_none=True, exclude_defaults=True)

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
