"""AgentCore executor for the shared LexisGuide review contract."""

from __future__ import annotations

import os
from typing import Any

import boto3
from review_contract import SYSTEM_PROMPT, ReviewRequest, parse_review_result


class LegalDocumentAgent:
    def __init__(self, client: Any | None = None, model_id: str | None = None) -> None:
        self.model_id = model_id or os.getenv(
            "BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0"
        )
        self._client = client

    @property
    def client(self) -> Any:
        """Created on first use, so importing the runtime never needs AWS credentials."""
        if self._client is None:
            self._client = boto3.client(
                "bedrock-runtime", region_name=os.getenv("AWS_REGION", "us-east-1")
            )
        return self._client

    def review(self, request: ReviewRequest) -> dict[str, Any]:
        response = self.client.converse(
            modelId=self.model_id,
            system=[{"text": SYSTEM_PROMPT}],
            messages=[
                {"role": "user", "content": [{"text": request.model_dump_json()}]}
            ],
            inferenceConfig={"temperature": 0.1, "maxTokens": 5000},
        )
        text = "".join(
            block.get("text", "") for block in response["output"]["message"]["content"]
        )
        return parse_review_result(text).model_dump(
            exclude_none=True, exclude_defaults=True
        )
