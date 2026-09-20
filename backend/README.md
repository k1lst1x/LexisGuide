# LexisGuide API

FastAPI service for the LexisGuide web client.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ../packages/review_contract -e '.[dev]'
uvicorn app.main:app --reload
```

Run checks with `ruff check .` and `pytest`.

The document review route invokes the deployed Amazon Bedrock AgentCore runtime
when `AGENTCORE_RUNTIME_ARN` is set. For authority-grounded analysis, also set
`BEDROCK_KNOWLEDGE_BASE_ID` to a curated, jurisdiction-specific legal corpus.
The system must not describe that corpus as every case or current law unless its
coverage has been independently verified.
