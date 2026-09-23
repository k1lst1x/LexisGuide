import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

# Tests must never inherit a developer's live Bedrock runtime or CORS settings
# from backend/.env. Individual tests enable a fake configured agent explicitly.
os.environ["BEDROCK_MODEL_ID"] = ""
os.environ["ASSISTANT_MODEL_ID"] = ""
os.environ["AGENTCORE_RUNTIME_ARN"] = ""
os.environ["AGENTCORE_ASSISTANT_RUNTIME_ARN"] = ""
os.environ["CORS_ALLOW_ORIGINS"] = ""

from app.auth import current_user
from app.main import app


@pytest.fixture
def client() -> Generator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def authenticated_client(client: TestClient) -> TestClient:
    app.dependency_overrides[current_user] = lambda: {
        "sub": "user-123",
        "email": "person@example.com",
        "name": "Person",
    }
    return client
