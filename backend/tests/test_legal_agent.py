from io import BytesIO

import pytest

from app.legal_agent import LegalDocumentAgent


class FakeRuntimeClient:
    def __init__(self) -> None:
        self.payload: bytes | None = None

    def invoke_agent_runtime(self, **kwargs: object) -> dict[str, BytesIO]:
        payload = kwargs["payload"]
        assert isinstance(payload, bytes)
        self.payload = payload
        return {"response": BytesIO(b'{"result": {"findings": [], "disclaimer": "test"}}')}


def test_agentcore_runtime_does_not_require_direct_bedrock_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "AGENTCORE_RUNTIME_ARN", "arn:aws:bedrock-agentcore:us-east-1:123:runtime/test"
    )
    monkeypatch.delenv("BEDROCK_MODEL_ID", raising=False)
    runtime_client = FakeRuntimeClient()
    monkeypatch.setattr(
        "app.legal_agent.boto3.client",
        lambda service, **_: runtime_client if service == "bedrock-agentcore" else object(),
    )

    agent = LegalDocumentAgent()

    assert agent.review("Example agreement.") == {"findings": [], "disclaimer": "test"}
    assert runtime_client.payload is not None
    assert b'"document":"Example agreement."' in runtime_client.payload
    assert b'"action":"review"' in runtime_client.payload
