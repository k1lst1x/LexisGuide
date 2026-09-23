from __future__ import annotations

import os
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

security = HTTPBearer(auto_error=False)


@lru_cache
def _settings() -> tuple[str, str, str]:
    region = os.getenv("AWS_REGION", "")
    user_pool_id = os.getenv("COGNITO_USER_POOL_ID", "")
    client_id = os.getenv("COGNITO_USER_POOL_CLIENT_ID", "")
    if not all((region, user_pool_id, client_id)):
        raise RuntimeError(
            "AWS_REGION, COGNITO_USER_POOL_ID, and COGNITO_USER_POOL_CLIENT_ID are required."
        )
    return region, user_pool_id, client_id


@lru_cache
def _jwk_client() -> PyJWKClient:
    region, user_pool_id, _ = _settings()
    return PyJWKClient(
        f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"
    )


ADMIN_GROUP = "admins"


def _verified_claims(credentials: HTTPAuthorizationCredentials | None) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )
    try:
        region, user_pool_id, client_id = _settings()
        token = credentials.credentials
        signing_key = _jwk_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}",
        )
        if claims.get("token_use") != "id":
            raise ValueError("Expected Cognito ID token.")
        if "sub" not in claims:
            raise ValueError("A token without a subject identifies no one.")
        return claims
    except (KeyError, RuntimeError, ValueError, jwt.PyJWTError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Cognito token.",
        ) from error


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, str]:
    claims = _verified_claims(credentials)
    return {
        "sub": claims["sub"],
        "email": claims.get("email", ""),
        "name": claims.get("name", ""),
    }


def current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, str]:
    """A signed-in member of the Cognito admins group, or a 403.

    Membership is read from the signed ID token, so it is Cognito's word and
    never the browser's. Someone added to the group needs a fresh token (sign
    in again, or refresh) before the claim appears.
    """
    claims = _verified_claims(credentials)
    groups = claims.get("cognito:groups") or []
    if ADMIN_GROUP not in groups:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account does not have admin access.",
        )
    return {
        "sub": claims["sub"],
        "username": claims.get("cognito:username", ""),
        "email": claims.get("email", ""),
        "name": claims.get("name", ""),
    }
