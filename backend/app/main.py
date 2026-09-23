import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.admin_routes import router as admin_router
from app.api.v1.routes import router as v1_router

load_dotenv()

app = FastAPI(
    title="LexisGuide API",
    version="0.1.0",
    description="AI-assisted legal document guidance. Not legal advice.",
)

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://k1lst1x.github.io",
)


def cors_origins() -> list[str]:
    """Return explicit browser origins; never permit credentialed wildcard CORS.

    ``CORS_ORIGINS`` remains supported for existing local deployments. The
    production-specific name takes precedence so the Lambda configuration is
    unambiguous.
    """
    configured = os.getenv("CORS_ALLOW_ORIGINS") or os.getenv("CORS_ORIGINS", "")
    origins = [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]
    return origins or list(DEFAULT_CORS_ORIGINS)


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)
app.include_router(admin_router)
