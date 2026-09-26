# LexisGuide assistant runtime

The AgentCore Runtime entrypoint for the conversational assistant behind the chat
popup. The agent itself (prompt, tools, Converse tool-use loop) lives in the shared
[`packages/assistant_agent`](../../packages/assistant_agent) package, so the API's
local mode and this runtime behave identically.

Payload in: `{"messages": [{"role": "user", "content": "..."}], "context": {...}}`.
Payload out: `{"reply": "...", "workspace_actions": [...], "tasks": [...], "auto_apply": false, ...}`. See [`packages/assistant_agent`](../../packages/assistant_agent) for how the agent team works and how to deploy it.

## Local test

From this directory, with AWS credentials that can call Bedrock:

    agentcore dev --no-browser
    curl -s localhost:8080/invocations -H 'content-type: application/json' \
      -d '{"messages":[{"role":"user","content":"What is a lien?"}]}'

## Deploy

From `agentcore/`, run `agentcore deploy --diff` to preview, then
`agentcore deploy -y`. Put the resulting runtime ARN in the GitHub variable
`AGENTCORE_ASSISTANT_RUNTIME_ARN` so the API can invoke it.
