"""Amazon Bedrock AgentCore entrypoint for the LexisGuide conversational assistant."""

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from lexisguide_assistant import ConversationAgent, parse_chat_request
from pydantic import ValidationError

app = BedrockAgentCoreApp()
agent = ConversationAgent()


@app.entrypoint
def invoke(payload: dict) -> dict:
    """AgentCore Runtime invocation contract: a chat request in, a chat reply out."""
    try:
        request = parse_chat_request(payload)
    except ValidationError as error:
        return {"error": "Invalid chat request", "details": error.errors(include_url=False)}
    return agent.chat(request).model_dump()


if __name__ == "__main__":
    app.run()
