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


class LawFirmQuotaError(LawFirmUnavailableError):
    """The plan's lookup allowance is spent (free tier: 10/day, 100/month).

    Separate from every other failure because it says nothing about the person
    being checked. A caller must never read it as a failed verification.
    """


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

    def _get(self, path: str, query: dict[str, str], subject: str) -> dict[str, Any]:
        request = Request(
            f"{BASE_URL}{path}?{urlencode(query)}",
            headers={"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"},
            method="GET",
        )
        try:
            with urlopen(request, timeout=8) as response:  # nosec B310 -- fixed HTTPS host
                body = response.read().decode("utf-8")
        except HTTPError as error:
            # 429 is the plan allowance, not an answer about the subject.
            if error.code == 429:
                raise LawFirmQuotaError(f"The {subject} lookup allowance is spent.") from error
            raise LawFirmResponseError(error.code) from error
        except (URLError, TimeoutError) as error:
            raise LawFirmUnavailableError(f"The {subject} source is unavailable.") from error
        try:
            payload = json.loads(body)
        except json.JSONDecodeError as error:
            raise LawFirmUnavailableError(
                f"The {subject} source returned an invalid response."
            ) from error
        if not isinstance(payload, dict):
            raise LawFirmUnavailableError(f"The {subject} source returned an invalid response.")
        return payload

    def lookup_statute(
        self, jurisdiction: str, citation: str, as_of: date | None = None
    ) -> dict[str, Any]:
        if not self.api_key:
            raise LawFirmUnavailableError("Statute lookup is not configured.")
        query = {"jurisdiction": jurisdiction.strip().lower(), "citation": citation.strip()}
        if as_of:
            query["asOf"] = as_of.isoformat()
        return self._get("/statutes/lookup", query, "statute")

    def lookup_attorney(self, bar_number: str, jurisdiction: str) -> dict[str, Any]:
        """Look up one bar record. A 404 means no such record and is the caller's to handle."""
        if not self.api_key:
            raise LawFirmUnavailableError("Attorney lookup is not configured.")
        query = {"bar": bar_number.strip(), "jurisdiction": jurisdiction.strip().upper()}
        return self._get("/attorneys/lookup", query, "attorney")


# A bar record counts only when the provider calls it current. Anything else
# (suspended, disbarred, inactive, retired) is a real answer, and a negative one.
ACTIVE_BAR_STATUSES = frozenset(
    {"active", "active_in_good_standing", "good_standing", "in_good_standing", "licensed"}
)


def _first(record: dict[str, Any], *names: str) -> str:
    for name in names:
        value = record.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def attorney_record(payload: dict[str, Any]) -> dict[str, Any]:
    """Unwrap the provider envelope. /statutes/lookup nests under "result"; mirror that."""
    inner = payload.get("result")
    if isinstance(inner, dict):
        payload = inner
    attorney = payload.get("attorney")
    return attorney if isinstance(attorney, dict) else payload


def read_bar_status(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalise one bar record.

    The provider's exact field names for this endpoint are not confirmed against
    a live response, so each value is read from the plausible spellings and an
    unrecognised status is treated as not verified rather than as verified.
    """
    record = attorney_record(payload)
    status = _first(record, "status", "barStatus", "licenseStatus", "standing").lower()
    normalised = status.replace(" ", "_").replace("-", "_")
    return {
        "active": normalised in ACTIVE_BAR_STATUSES,
        "status": status,
        "name": _first(record, "name", "fullName", "displayName"),
        "bar_number": _first(record, "barNumber", "bar", "licenseNumber"),
        "jurisdiction": _first(record, "jurisdiction", "state", "barJurisdiction"),
        "admitted_on": _first(record, "admissionDate", "admittedOn", "admitted"),
        "source_checked_at": _first(record, "verifiedAt", "lastVerified", "retrievedAt"),
    }


def configured_lawfirm_client() -> LawFirmClient | None:
    client = LawFirmClient()
    return client if client.configured else None
