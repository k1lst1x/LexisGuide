from io import BytesIO

import pytest

from app.legal_agent import LegalDocumentAgent


class FakeRuntimeClient:
    def invoke_agent_runtime(self, **_: object) -> dict[str, BytesIO]:
        return {"response": BytesIO(b'{"result": {"findings": [], "disclaimer": "test"}}')}


def test_agentcore_runtime_does_not_require_direct_bedrock_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "AGENTCORE_RUNTIME_ARN", "arn:aws:bedrock-agentcore:us-east-1:123:runtime/test"
    )
    monkeypatch.delenv("BEDROCK_MODEL_ID", raising=False)
    monkeypatch.setattr(
        "app.legal_agent.boto3.client",
        lambda service, **_: FakeRuntimeClient() if service == "bedrock-agentcore" else object(),
    )

    agent = LegalDocumentAgent()

    assert agent.review("Example agreement.") == {"findings": [], "disclaimer": "test"}
