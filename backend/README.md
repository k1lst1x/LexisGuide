# LexisGuide API

FastAPI service for the LexisGuide web client.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload
```

Run checks with `ruff check .` and `pytest`.
