# LexisGuide review contract

This pure-Python package is the single source of truth for the model-facing review
request, review result, JSON parsing, and the LexisGuide system prompt.

It deliberately contains no FastAPI, AWS, or AgentCore code. `backend/` remains the
authenticated API client and `agentcore/runtime/` remains the Bedrock executor.

After changing this package, deploy both consumers: the `Deploy production API`
workflow packages it into Lambda automatically, and `agentcore deploy -y` from
`agentcore/runtime/` packages the same local dependency into AgentCore.

Run its checks from the repository root:

```bash
pip install -e packages/review_contract 'pytest>=8.3,<10.0' 'ruff>=0.14,<0.17'
ruff check packages/review_contract
ruff format --check packages/review_contract
pytest packages/review_contract/tests
```
