"""Amazon Bedrock AgentCore entrypoint for LexisGuide."""

from bedrock_agentcore.runtime import BedrockAgentCoreApp

from legal_agent import LegalDocumentAgent

app = BedrockAgentCoreApp()
agent = LegalDocumentAgent()


@app.entrypoint
def invoke(payload: dict) -> dict:
    """AgentCore Runtime invocation contract."""
    document = payload.get("document_text") or payload.get("document")
    if not document:
        return {"error": "document_text is required"}
    return agent.review(
        document,
        action=payload.get("action", "review"),
        jurisdiction=payload.get("jurisdiction"),
        user_context=payload.get("user_context"),
        goals=payload.get("goals"),
    )


if __name__ == "__main__":
    app.run()
