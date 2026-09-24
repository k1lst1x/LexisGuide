"""Configuration tests for the ledger recorder key."""

from app.ledger import _secret_region


def test_secret_arn_uses_its_own_region(monkeypatch) -> None:
    monkeypatch.setenv("AWS_REGION", "us-west-2")

    secret_arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:recorder"
    assert _secret_region(secret_arn) == "us-east-1"


def test_non_arn_secret_uses_the_runtime_region(monkeypatch) -> None:
    monkeypatch.setenv("AWS_REGION", "us-west-2")

    assert _secret_region("recorder-key") == "us-west-2"
