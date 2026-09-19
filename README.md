# LexisGuide

LexisGuide is an AI-assisted legal-document guide: it identifies potentially unfair
or risky terms, explains them in plain language, and suggests practical next steps.
It is a hackathon prototype for LexHack 2026, not legal advice.

## Stack

- Backend: Python 3.12, FastAPI, Pydantic v2, Uvicorn
- Frontend: React 19, TypeScript, Vite 6

Neither FastAPI nor React uses an LTS release model comparable to Django. The
project uses constrained stable release ranges so patch updates remain available
without unexpected major upgrades.

## Repository layout

```text
backend/   FastAPI API and tests
frontend/  React web application
```

## Live landing page

Once GitHub Pages is enabled, the landing page is published automatically after
each push to `main` at https://k1lst1x.github.io/LexisGuide/.

The repository also runs backend tests, frontend linting/builds, and CodeQL on
every push and pull request. Dependabot opens weekly dependency-update PRs.

## Run locally

Start the API (terminal 1):

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload --port 8000
```

API documentation is then available at http://localhost:8000/docs.

Start the web app (terminal 2):

```bash
cd frontend
npm install
npm run dev
```

Use Node.js 20.19 or newer for frontend tooling.

The Vite development server proxies `/api` to the backend by default. To use a
deployed API instead, set `VITE_API_BASE_URL` (see `frontend/.env.example`).

## API contract (initial)

`GET /api/v1/health` returns service status.

`POST /api/v1/analyze` accepts a document's plain text and returns an empty,
typed `findings` list for now. The route is deliberately a safe stub: it does not
claim to have analyzed a legal document until the analysis pipeline is implemented.
