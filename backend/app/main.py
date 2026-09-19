from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.api.v1.routes import router as v1_router

load_dotenv()

app = FastAPI(
    title="LexisGuide API",
    version="0.1.0",
    description="AI-assisted legal document guidance. Not legal advice.",
)

# Local development origins. Set explicit production origins before deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)
