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
frontend/          React web application, deployed to GitHub Pages
backend/           FastAPI API and tests, packaged as an AWS Lambda
agentcore/runtime/ AgentCore service that performs the model invocation
infra/             Terraform for Cognito, DynamoDB, Lambda, and API Gateway
```

## Live landing page

Once GitHub Pages is enabled, the landing page is published automatically after
each push to `main` at https://k1lst1x.github.io/LexisGuide/.

The repository also runs backend tests, frontend linting/builds, and CodeQL on
every push and pull request. Dependabot opens weekly dependency-update PRs.

## Production architecture

GitHub Pages hosts only the React application. It calls the FastAPI Lambda through
an API Gateway HTTP API. API Gateway and the API both verify the Cognito ID token;
the API accesses only the caller's DynamoDB records and invokes the configured
AgentCore runtime with its own IAM role. The browser never receives AWS service
credentials.

`/api/v1/analyze` requires authentication in production. The local dashboard still
shows its built-in quick scan when no API is available, so the demo remains usable
without cloud credentials.

See [AWS_AUTH_SETUP.md](AWS_AUTH_SETUP.md) for the one-time AWS and GitHub setup.

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

Use Node.js 22.22.2 or newer for frontend tooling. This matches the current
PDF-rendering dependency and the GitHub Actions runners.

The Vite development server proxies `/api` to the backend by default. To use a
deployed API instead, set `VITE_API_BASE_URL` (see `frontend/.env.example`).

## API contract

`GET /api/v1/health` returns service status.

`POST /api/v1/analyze` requires a Cognito ID token and accepts document text. When
AgentCore is configured, it returns the document-grounded review; otherwise the
local development API returns a safe empty result rather than fabricating analysis.
