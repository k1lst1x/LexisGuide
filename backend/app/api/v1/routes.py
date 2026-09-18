from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1", tags=["v1"])


class HealthResponse(BaseModel):
    status: str


class AnalyzeRequest(BaseModel):
    document_text: str = Field(min_length=1, max_length=100_000)


class Finding(BaseModel):
    title: str
    explanation: str
    severity: str
    source_text: str | None = None


class AnalyzeResponse(BaseModel):
    findings: list[Finding]
    disclaimer: str


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_document(payload: AnalyzeRequest) -> AnalyzeResponse:
    """Temporary contract for the forthcoming document-analysis pipeline."""
    del payload
    return AnalyzeResponse(
        findings=[],
        disclaimer="LexisGuide provides general information, not legal advice.",
    )
