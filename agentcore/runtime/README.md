# LexisGuide Legal Agent

This is the Amazon Bedrock AgentCore Runtime entrypoint. It uses Bedrock Converse
with a low-temperature, JSON-only legal-document review prompt and returns findings,
plain-language explanations, negotiation points, and optional rewrites.

## Local test

From this directory, set `AWS_REGION` and `BEDROCK_MODEL_ID`, then run the AgentCore
dev server. The runtime's `pyproject.toml` resolves the shared
`packages/review_contract` package from a wheel built into `vendor/` (see Deploy).
`agentcore dev --no-browser` exposes `/invocations` on port 8080.

## Deploy

Install the AgentCore CLI (`npm install -g @aws/agentcore`) and authenticate AWS.
From `agentcore/`, run `scripts/build-shared-wheels.sh` first. The CLI installs
dependencies from prebuilt wheels only, and an editable path install would record a
path on the build machine instead of bundling the code, so the shared contract is
built into `vendor/` and packaged normally. Then run `agentcore deploy --diff` to
preview and `agentcore deploy -y` to deploy.

The runtime role needs Bedrock model invocation and CloudWatch Logs permissions. Do
not put AWS keys in the frontend or commit `.env` files.
