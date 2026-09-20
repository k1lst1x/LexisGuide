# LexisGuide AgentCore deployment

This directory contains the AgentCore deployment configuration and generated CDK
project for LexisGuide. The sole runtime source is in [`runtime/`](runtime/):
`agentcore.json` explicitly deploys that directory as `LexisGuideLegalReviewer`.

Do not add a second runtime entrypoint at this level. See
[`runtime/README.md`](runtime/README.md) for local development and deployment
instructions.
