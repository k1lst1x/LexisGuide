# LexisGuide Legal Agent

This is the Amazon Bedrock AgentCore Runtime entrypoint. It uses Bedrock Converse
with a low-temperature, JSON-only legal-document review prompt and returns findings,
plain-language explanations, negotiation points, and optional rewrites.

## Local test

From this directory, set `AWS_REGION` and `BEDROCK_MODEL_ID`, then run the AgentCore
dev server. `agentcore dev --no-browser` exposes `/invocations` on port 8080.

## Deploy

Install the current AWS CLI AgentCore plugin (`npm install -g @aws/agentcore`),
authenticate AWS, and run `agentcore validate` followed by `agentcore deploy -y`
from this directory. The runtime role
needs Bedrock model invocation and CloudWatch Logs permissions. Do not put AWS keys
in the frontend or commit `.env` files.
