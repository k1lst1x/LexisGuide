"""Provenance-preserving client for the optional lawfirm.dev statute API.

Keys resolve only on the backend. Production should use an AWS Secrets Manager ARN;
``LAWFIRM_API_KEY`` exists solely for local development.
"""

from __future__ import annotations

import json
import os
from datetime import date
from functools import lru_cache
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import boto3

BASE_URL = "https://api.lawfirm.dev/v1"


class LawFirmUnavailableError(RuntimeError):
    """The optional provider is not configured or could not be reached."""


class LawFirmResponseError(RuntimeError):
    """The provider rejected a valid request."""

    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
        super().__init__(f"lawfirm.dev returned HTTP {status_code}")


def _secret_value(secret: str) -> str:
    """Accept either a raw key or a JSON SecretString with an api_key field."""
    try:
        parsed = json.loads(secret)
    except json.JSONDecodeError:
        return secret.strip()
    if isinstance(parsed, dict):
        return str(parsed.get("api_key") or parsed.get("LAWFIRM_API_KEY") or "").strip()
    return ""


@lru_cache(maxsize=1)
def configured_api_key() -> str:
    """Read the key once per warm Lambda; never return it in an API response or log."""
    direct_key = os.getenv("LAWFIRM_API_KEY", "").strip()
    if direct_key:
        return direct_key
    secret_arn = os.getenv("LAWFIRM_API_KEY_SECRET_ARN", "").strip()
    if not secret_arn:
        return ""
    try:
        secret = boto3.client(
            "secretsmanager", region_name=os.getenv("AWS_REGION", "us-east-1")
        ).get_secret_value(SecretId=secret_arn)
    except Exception as error:
        raise LawFirmUnavailableError("The statute source is temporarily unavailable.") from error
    return _secret_value(str(secret.get("SecretString") or ""))


class LawFirmClient:
    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key if api_key is not None else configured_api_key()

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def lookup_statute(
        self, jurisdiction: str, citation: str, as_of: date | None = None
    ) -> dict[str, Any]:
        if not self.api_key:
            raise LawFirmUnavailableError("Statute lookup is not configured.")
        query = {"jurisdiction": jurisdiction.strip().lower(), "citation": citation.strip()}
        if as_of:
            query["asOf"] = as_of.isoformat()
        request = Request(
            f"{BASE_URL}/statutes/lookup?{urlencode(query)}",
            headers={"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"},
            method="GET",
        )
        try:
            with urlopen(request, timeout=8) as response:  # nosec B310 -- fixed HTTPS host
                body = response.read().decode("utf-8")
        except HTTPError as error:
            raise LawFirmResponseError(error.code) from error
        except (URLError, TimeoutError) as error:
            raise LawFirmUnavailableError(
                "The statute source is temporarily unavailable."
            ) from error
        try:
            payload = json.loads(body)
        except json.JSONDecodeError as error:
            raise LawFirmUnavailableError(
                "The statute source returned an invalid response."
            ) from error
        if not isinstance(payload, dict):
            raise LawFirmUnavailableError("The statute source returned an invalid response.")
        return payload


def configured_lawfirm_client() -> LawFirmClient | None:
    client = LawFirmClient()
    return client if client.configured else None
