# LexisGuide assistant

The conversational agent behind the LexisGuide chat popup. It runs as the
`LexisGuideAssistant` AgentCore runtime, and the API can also run it directly
against Bedrock for local development.

- `models.py`: the chat request/response contract, validated on both sides.
- `tools.py`: the agent's tools (product guide, clause check, legal glossary).
- `agent.py`: a Bedrock Converse tool-use loop over those tools.

The client sends recent turns with each request, so the agent itself is
stateless and safe to scale; AgentCore session IDs keep a conversation on one
warm session.
