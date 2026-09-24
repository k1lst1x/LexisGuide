import jwt
import pytest
from botocore.exceptions import ClientError
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import auth


class FakeJwkClient:
    def get_signing_key_from_jwt(self, token: str) -> object:
        del token
        return type("Key", (), {"key": "public-key"})()


class FakeCognitoUserPool:
    def __init__(self, user: dict | None = None, error: ClientError | None = None) -> None:
        self.user = user or {"Enabled": True}
        self.error = error
        self.requests: list[dict] = []

    def admin_get_user(self, **kwargs: object) -> dict:
        self.requests.append(kwargs)
        if self.error:
            raise self.error
        return self.user


def configure_auth_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_settings", lambda: ("us-east-1", "pool-id", "client-id"))
    monkeypatch.setattr(auth, "_jwk_client", FakeJwkClient)
    monkeypatch.setattr(auth, "_cognito_user_pool", lambda: FakeCognitoUserPool())
    monkeypatch.setattr(auth, "user_sessions_valid_after", lambda _username: 0)


def test_current_user_rejects_missing_bearer_token() -> None:
    with pytest.raises(HTTPException, match="Missing bearer token") as error:
        auth.current_user(None)

    assert error.value.status_code == 401


def test_settings_require_all_cognito_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    auth._settings.cache_clear()
    monkeypatch.delenv("AWS_REGION", raising=False)
    monkeypatch.delenv("COGNITO_USER_POOL_ID", raising=False)
    monkeypatch.delenv("COGNITO_USER_POOL_CLIENT_ID", raising=False)

    with pytest.raises(RuntimeError, match="AWS_REGION"):
        auth._settings()

    auth._settings.cache_clear()


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
            "cognito:username": "person-user",
            "token_use": "id",
            "iat": 1_800_000_000,
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


@pytest.mark.parametrize(
    "user,error",
    [
        ({"Enabled": False}, None),
        (
            None,
            ClientError(
                {"Error": {"Code": "UserNotFoundException", "Message": "missing"}},
                "AdminGetUser",
            ),
        ),
    ],
)
def test_current_user_rejects_valid_tokens_for_disabled_or_deleted_accounts(
    monkeypatch: pytest.MonkeyPatch, user: dict | None, error: ClientError | None
) -> None:
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="signed-token")
    configure_auth_dependencies(monkeypatch)
    monkeypatch.setattr(auth, "_cognito_user_pool", lambda: FakeCognitoUserPool(user, error))
    monkeypatch.setattr(
        auth.jwt,
        "decode",
        lambda *_, **__: {
            "sub": "user-123",
            "cognito:username": "person-user",
            "token_use": "id",
            "iat": 1_800_000_000,
        },
    )

    with pytest.raises(HTTPException, match="Invalid or expired") as raised:
        auth.current_user(credentials)

    assert raised.value.status_code == 401


def test_current_user_returns_503_when_the_directory_cannot_be_checked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="signed-token")
    configure_auth_dependencies(monkeypatch)
    monkeypatch.setattr(
        auth,
        "_cognito_user_pool",
        lambda: FakeCognitoUserPool(
            error=ClientError(
                {"Error": {"Code": "InternalError", "Message": "busy"}}, "AdminGetUser"
            )
        ),
    )
    monkeypatch.setattr(
        auth.jwt,
        "decode",
        lambda *_, **__: {
            "sub": "user-123",
            "cognito:username": "person-user",
            "token_use": "id",
            "iat": 1_800_000_000,
        },
    )

    with pytest.raises(HTTPException, match="temporarily unavailable") as raised:
        auth.current_user(credentials)

    assert raised.value.status_code == 503


def test_current_user_rejects_an_id_token_issued_before_global_sign_out(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="signed-token")
    configure_auth_dependencies(monkeypatch)
    monkeypatch.setattr(auth, "user_sessions_valid_after", lambda _username: 1_800_000_000)
    monkeypatch.setattr(
        auth.jwt,
        "decode",
        lambda *_, **__: {
            "sub": "user-123",
            "cognito:username": "person-user",
            "token_use": "id",
            "iat": 1_800_000_000,
        },
    )

    with pytest.raises(HTTPException, match="Invalid or expired") as raised:
        auth.current_user(credentials)

    assert raised.value.status_code == 401
