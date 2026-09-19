from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

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
