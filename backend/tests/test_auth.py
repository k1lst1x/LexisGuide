import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import auth


class FakeJwkClient:
    def get_signing_key_from_jwt(self, token: str) -> object:
        del token
        return type("Key", (), {"key": "public-key"})()


def configure_auth_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_settings", lambda: ("us-east-1", "pool-id", "client-id"))
    monkeypatch.setattr(auth, "_jwk_client", FakeJwkClient)


def test_current_user_rejects_missing_bearer_token() -> None:
    with pytest.raises(HTTPException, match="Missing bearer token") as error:
        auth.current_user(None)

    assert error.value.status_code == 401


def test_current_user_returns_claims_from_valid_cognito_id_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="signed-token")
    configure_auth_dependencies(monkeypatch)
    monkeypatch.setattr(
        auth.jwt,
        "decode",
        lambda *_, **__: {
            "sub": "user-123",
            "email": "person@example.com",
            "name": "Person",
            "token_use": "id",
        },
    )

    assert auth.current_user(credentials) == {
        "sub": "user-123",
        "email": "person@example.com",
        "name": "Person",
    }


def test_current_user_rejects_non_id_token(monkeypatch: pytest.MonkeyPatch) -> None:
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="signed-token")
    configure_auth_dependencies(monkeypatch)
    monkeypatch.setattr(
        auth.jwt, "decode", lambda *_, **__: {"sub": "user-123", "token_use": "access"}
    )

    with pytest.raises(HTTPException, match="Invalid or expired Cognito token") as error:
        auth.current_user(credentials)

    assert error.value.status_code == 401


def test_current_user_converts_invalid_jwt_to_unauthorized(monkeypatch: pytest.MonkeyPatch) -> None:
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad-token")
    configure_auth_dependencies(monkeypatch)
    monkeypatch.setattr(
        auth.jwt,
        "decode",
        lambda *_, **__: (_ for _ in ()).throw(jwt.InvalidTokenError()),
    )

    with pytest.raises(HTTPException, match="Invalid or expired Cognito token") as error:
        auth.current_user(credentials)

    assert error.value.status_code == 401
