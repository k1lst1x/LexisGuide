"""The admin portal is reachable only by live members of the admins group.

Cognito and DynamoDB are replaced with in-memory fakes; what is under test is
who gets in, what they are refused, and that every change is audited.
"""

from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from app import admin, auth
from app.api.v1 import admin_routes
from app.auth import current_admin
from app.main import app

ADMIN = {"sub": "admin-sub-0001", "username": "admin-user", "email": "admin@example.com"}
PERSON = {
    "username": "person-user",
    "sub": "person-sub-0002",
    "email": "person@example.com",
    "name": "Person",
    "status": "CONFIRMED",
    "enabled": True,
    "created_at": "2026-09-01T00:00:00+00:00",
    "updated_at": "2026-09-01T00:00:00+00:00",
    "is_admin": False,
    "provider": "Email",
}


class FakeDirectory:
    """Cognito and the table, reduced to what the routes touch."""

    def __init__(self) -> None:
        self.users = {
            "person-user": dict(PERSON),
            "admin-user": {**PERSON, **ADMIN, "is_admin": True},
        }
        self.live_admins = {"admin-user"}
        self.calls: list[tuple[str, ...]] = []
        self.audit: list[dict[str, Any]] = []
        self.workspaces = {
            "ws-00000001": {"name": "Lease review", "owner_id": "person-sub-0002"},
        }

    def install(self, monkeypatch: pytest.MonkeyPatch) -> "FakeDirectory":
        monkeypatch.setattr(admin, "still_admin", lambda username: username in self.live_admins)
        monkeypatch.setattr(admin, "get_user", self.get_user)
        monkeypatch.setattr(
            admin, "set_enabled", lambda u, on: self.calls.append(("enabled", u, str(on)))
        )
        monkeypatch.setattr(
            admin, "set_admin", lambda u, on: self.calls.append(("admin", u, str(on)))
        )
        monkeypatch.setattr(admin, "sign_out_everywhere", lambda u: self.calls.append(("out", u)))
        monkeypatch.setattr(admin, "delete_user", lambda u: self.calls.append(("delete", u)))
        monkeypatch.setattr(
            admin,
            "list_users",
            lambda q="", token="": {
                "users": [u for u in self.users.values() if u["email"].startswith(q)],
                "next_token": "",
            },
        )
        monkeypatch.setattr(
            admin_routes,
            "admin_delete_user_data",
            lambda sub: self.calls.append(("erase", sub)),
        )
        monkeypatch.setattr(admin_routes, "admin_get_workspace", lambda ws: self.workspaces.get(ws))
        monkeypatch.setattr(
            admin_routes, "admin_delete_workspace", lambda ws: self.calls.append(("drop", ws))
        )
        monkeypatch.setattr(
            admin_routes,
            "admin_remove_workspace_member",
            lambda ws, user: self.calls.append(("kick", ws, user)),
        )
        monkeypatch.setattr(admin_routes, "record_admin_action", self.record)
        monkeypatch.setattr(
            admin_routes, "list_admin_actions", lambda limit=100: self.audit[:limit]
        )
        return self

    def get_user(self, username: str) -> dict[str, Any]:
        if username not in self.users:
            raise admin.UserNotFoundError(username)
        return self.users[username]

    def record(self, actor: dict[str, str], action: str, target: str, detail: str = "") -> dict:
        entry = {
            "at": "2026-09-23T00:00:00+00:00",
            "actor_id": actor["sub"],
            "actor_email": actor["email"],
            "action": action,
            "target": target,
            "detail": detail,
        }
        self.audit.insert(0, entry)
        return entry


@pytest.fixture
def directory(monkeypatch: pytest.MonkeyPatch) -> FakeDirectory:
    return FakeDirectory().install(monkeypatch)


@pytest.fixture
def admin_client(client: TestClient, directory: FakeDirectory) -> TestClient:
    app.dependency_overrides[current_admin] = lambda: dict(ADMIN)
    return client


# ── Who gets in ──────────────────────────────────────────────────────────────


def test_the_portal_requires_a_token(client: TestClient) -> None:
    assert client.get("/api/v1/admin/session").status_code == 401


def _claims(monkeypatch: pytest.MonkeyPatch, claims: dict[str, Any]) -> None:
    claims.setdefault("cognito:username", "admin-user")
    claims.setdefault("iat", 1_800_000_000)
    monkeypatch.setattr(auth, "_settings", lambda: ("us-east-1", "pool-id", "client-id"))
    monkeypatch.setattr(
        auth,
        "_jwk_client",
        lambda: type(
            "Jwk", (), {"get_signing_key_from_jwt": lambda self, t: type("K", (), {"key": "k"})()}
        )(),
    )
    monkeypatch.setattr(
        auth,
        "_cognito_user_pool",
        lambda: type("Pool", (), {"admin_get_user": lambda self, **_: {"Enabled": True}})(),
    )
    monkeypatch.setattr(auth, "user_sessions_valid_after", lambda _username: 0)
    monkeypatch.setattr(auth.jwt, "decode", lambda *_, **__: claims)


def test_a_signed_in_person_outside_the_group_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _claims(monkeypatch, {"sub": "someone", "token_use": "id", "cognito:groups": ["editors"]})
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

    with pytest.raises(HTTPException) as error:
        auth.current_admin(credentials)

    assert error.value.status_code == 403


def test_a_group_member_is_admitted_with_their_username(monkeypatch: pytest.MonkeyPatch) -> None:
    _claims(
        monkeypatch,
        {
            "sub": "admin-sub-0001",
            "token_use": "id",
            "email": "admin@example.com",
            "cognito:username": "admin-user",
            "cognito:groups": ["admins"],
        },
    )
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

    assert auth.current_admin(credentials)["username"] == "admin-user"


def test_an_access_token_is_not_an_admin_token(monkeypatch: pytest.MonkeyPatch) -> None:
    _claims(monkeypatch, {"sub": "admin", "token_use": "access", "cognito:groups": ["admins"]})
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

    with pytest.raises(HTTPException) as error:
        auth.current_admin(credentials)

    assert error.value.status_code == 401


def test_a_removed_admin_is_refused_before_their_token_expires(
    admin_client: TestClient, directory: FakeDirectory
) -> None:
    """The token still says admins; Cognito no longer does. Cognito wins."""
    directory.live_admins.clear()

    response = admin_client.get("/api/v1/admin/session")

    assert response.status_code == 403
    assert "no longer" in response.json()["detail"]


def test_an_admin_sees_their_session(admin_client: TestClient) -> None:
    body = admin_client.get("/api/v1/admin/session").json()
    assert body["email"] == "admin@example.com"


def test_global_sign_out_records_the_api_session_cutoff_first(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, str]] = []

    class Cognito:
        def admin_user_global_sign_out(self, *, UserPoolId: str, Username: str) -> None:
            assert UserPoolId == "pool-id"
            calls.append(("cognito", Username))

    monkeypatch.setattr(admin, "_cognito", lambda: (Cognito(), "pool-id"))
    monkeypatch.setattr(
        admin, "invalidate_user_sessions", lambda username: calls.append(("cutoff", username))
    )

    admin.sign_out_everywhere("person-user")

    assert calls == [("cutoff", "person-user"), ("cognito", "person-user")]


# ── Managing accounts ────────────────────────────────────────────────────────


def test_users_are_listed_and_searched_by_email(admin_client: TestClient) -> None:
    body = admin_client.get("/api/v1/admin/users", params={"q": "person"}).json()
    assert [user["email"] for user in body["users"]] == ["person@example.com"]


@pytest.mark.parametrize("query", ['a"b', "a\\b"])
def test_a_search_that_could_escape_the_cognito_filter_is_refused(
    admin_client: TestClient, query: str
) -> None:
    assert admin_client.get("/api/v1/admin/users", params={"q": query}).status_code == 422


def test_disabling_an_account_is_applied_and_audited(
    admin_client: TestClient, directory: FakeDirectory
) -> None:
    assert admin_client.post("/api/v1/admin/users/person-user/disable").status_code == 200

    assert ("enabled", "person-user", "False") in directory.calls
    assert directory.audit[0]["action"] == "user.disable"
    assert directory.audit[0]["target"] == "person@example.com"
    assert directory.audit[0]["actor_email"] == "admin@example.com"


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("post", "/api/v1/admin/users/admin-user/disable", None),
        ("delete", "/api/v1/admin/users/admin-user", None),
        ("put", "/api/v1/admin/users/admin-user/admin", {"admin": False}),
    ],
)
def test_an_admin_cannot_lock_themselves_out(
    admin_client: TestClient, directory: FakeDirectory, method: str, path: str, body: Any
) -> None:
    response = admin_client.request(method.upper(), path, json=body)

    assert response.status_code == 409
    assert directory.calls == []
    assert directory.audit == []


def test_granting_admin_access_is_audited(
    admin_client: TestClient, directory: FakeDirectory
) -> None:
    response = admin_client.put("/api/v1/admin/users/person-user/admin", json={"admin": True})

    assert response.status_code == 200
    assert ("admin", "person-user", "True") in directory.calls
    assert directory.audit[0]["action"] == "user.grant_admin"


def test_deleting_an_account_erases_its_data_first(
    admin_client: TestClient, directory: FakeDirectory
) -> None:
    assert admin_client.delete("/api/v1/admin/users/person-user").status_code == 200

    assert directory.calls == [("erase", "person-sub-0002"), ("delete", "person-user")]
    assert directory.audit[0]["action"] == "user.delete"


def test_an_unknown_user_is_a_404(admin_client: TestClient) -> None:
    assert admin_client.post("/api/v1/admin/users/nobody-here/disable").status_code == 404


def test_a_malformed_username_never_reaches_cognito(
    admin_client: TestClient, directory: FakeDirectory
) -> None:
    response = admin_client.post("/api/v1/admin/users/bad%20name/disable")
    assert response.status_code == 422
    assert directory.calls == []


def test_manual_bar_verification_records_the_admin_and_note(
    admin_client: TestClient, directory: FakeDirectory, monkeypatch: pytest.MonkeyPatch
) -> None:
    saved: dict[str, Any] = {}

    def save(sub: str, record: dict[str, Any]) -> dict[str, Any]:
        saved.update(record, sub=sub)
        return {"verified": True, "attempts_used": 3, "attempts_remaining": 0, "max_attempts": 3}

    monkeypatch.setattr(admin_routes, "save_lawyer_verification", save)

    response = admin_client.post(
        "/api/v1/admin/users/person-user/lawyer-verification",
        json={"bar_number": "12345", "jurisdiction": "fl", "note": "Checked by phone"},
    )

    assert response.status_code == 200
    assert saved["sub"] == "person-sub-0002"
    assert saved["jurisdiction"] == "FL"
    assert directory.audit[0]["detail"] == "FL 12345 — Checked by phone"


# ── Managing workspaces ──────────────────────────────────────────────────────


def test_a_workspace_is_deleted_and_audited(
    admin_client: TestClient, directory: FakeDirectory
) -> None:
    assert admin_client.delete("/api/v1/admin/workspaces/ws-00000001").status_code == 200
    assert ("drop", "ws-00000001") in directory.calls
    assert directory.audit[0]["target"] == "Lease review"


def test_the_workspace_host_cannot_be_removed_as_a_member(
    admin_client: TestClient, directory: FakeDirectory
) -> None:
    response = admin_client.delete("/api/v1/admin/workspaces/ws-00000001/members/person-sub-0002")
    assert response.status_code == 409
    assert directory.calls == []


def test_the_audit_log_is_readable(admin_client: TestClient, directory: FakeDirectory) -> None:
    admin_client.post("/api/v1/admin/users/person-user/sign-out")

    entries = admin_client.get("/api/v1/admin/audit").json()

    assert [entry["action"] for entry in entries] == ["user.sign_out"]


# ── Integrations health, without spending provider quota ────────────────────


def test_bar_verification_health_loads_the_key_without_calling_lawfirm(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app import lawfirm

    monkeypatch.setenv("LAWFIRM_API_KEY_SECRET_ARN", "arn:aws:secretsmanager:us-east-1:1:secret:x")
    monkeypatch.setattr(lawfirm, "configured_api_key", lambda: "lf_live_key")

    def no_lookups(*_: Any, **__: Any) -> None:
        raise AssertionError("The health check must not spend a lawfirm.dev lookup.")

    monkeypatch.setattr(lawfirm.LawFirmClient, "_get", no_lookups)

    body = admin_client.get("/api/v1/admin/integrations").json()

    assert body["bar_verification"]["configured"] is True
    assert body["bar_verification"]["ready"] is True


def test_bar_verification_health_says_when_no_key_is_set(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("LAWFIRM_API_KEY", raising=False)
    monkeypatch.delenv("LAWFIRM_API_KEY_SECRET_ARN", raising=False)

    body = admin_client.get("/api/v1/admin/integrations").json()

    assert body["bar_verification"] == {
        "configured": False,
        "ready": False,
        "detail": "No key is configured. Set LAWFIRM_API_KEY_SECRET_ARN and redeploy.",
    }


def test_the_lawfirm_key_is_read_from_the_region_in_its_arn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import lawfirm

    regions: list[str] = []

    class FakeSecrets:
        def get_secret_value(self, SecretId: str) -> dict:  # noqa: N803 - boto3's name
            return {"SecretString": '{"api_key": "lf_key"}'}

    monkeypatch.setattr(
        lawfirm.boto3,
        "client",
        lambda _service, region_name: regions.append(region_name) or FakeSecrets(),
    )
    monkeypatch.delenv("LAWFIRM_API_KEY", raising=False)
    monkeypatch.setenv("AWS_REGION", "us-west-2")
    monkeypatch.setenv(
        "LAWFIRM_API_KEY_SECRET_ARN", "arn:aws:secretsmanager:us-east-1:1:secret:lexisguide/lawfirm"
    )
    lawfirm.configured_api_key.cache_clear()
    try:
        assert lawfirm.configured_api_key() == "lf_key"
    finally:
        lawfirm.configured_api_key.cache_clear()
    assert regions == ["us-east-1"]
