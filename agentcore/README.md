# LexisGuide AgentCore deployment

This directory contains the AgentCore deployment configuration and generated CDK
project for LexisGuide. `agentcore.json` deploys two runtimes:

- `LexisGuideLegalReviewer` from [`runtime/`](runtime/): one-shot, JSON-only
  document review used by `/api/v1/analyze`.
- `LexisGuideAssistant` from [`assistant/`](assistant/): the conversational agent
  behind the chat popup, used by `/api/v1/chat`.

Do not add runtime entrypoints at this level. Deploy both with `agentcore deploy -y`
from this directory (preview first with `agentcore deploy --diff`).
