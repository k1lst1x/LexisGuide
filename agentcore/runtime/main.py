"""Amazon Bedrock AgentCore entrypoint for LexisGuide."""

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from legal_agent import LegalDocumentAgent
from pydantic import ValidationError
from review_contract import parse_review_request

app = BedrockAgentCoreApp()
agent = LegalDocumentAgent()


@app.entrypoint
def invoke(payload: dict) -> dict:
    """AgentCore Runtime invocation contract."""
    try:
        request = parse_review_request(payload)
    except ValidationError as error:
        return {"error": "Invalid review request", "details": error.errors()}
    return agent.review(request)


if __name__ == "__main__":
    app.run()
