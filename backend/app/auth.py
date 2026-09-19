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


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, str]:
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
        return {
            "sub": claims["sub"],
            "email": claims.get("email", ""),
            "name": claims.get("name", ""),
        }
    except (KeyError, RuntimeError, ValueError, jwt.PyJWTError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Cognito token.",
        ) from error
