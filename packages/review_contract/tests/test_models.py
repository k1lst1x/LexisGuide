import pytest
from pydantic import ValidationError

from review_contract import (
    DEFAULT_DISCLAIMER,
    ReviewRequest,
    parse_review_request,
    parse_review_result,
)


def test_review_request_normalizes_the_legacy_document_text_field() -> None:
    request = parse_review_request({"document_text": "Example agreement."})

    assert request == ReviewRequest(document="Example agreement.")
    assert request.action == "review"


def test_review_result_parses_fenced_json_and_applies_the_disclaimer() -> None:
    result = parse_review_result('```json\n{"findings": []}\n```')

    assert result.findings == []
    assert result.disclaimer == DEFAULT_DISCLAIMER


def test_review_contract_rejects_unknown_fields_and_invalid_severity() -> None:
    with pytest.raises(ValidationError):
        parse_review_request({"document": "Agreement", "unexpected": "value"})

    with pytest.raises(ValidationError):
        parse_review_result(
            {"findings": [{"title": "Clause", "explanation": "Reason", "severity": "urgent"}]}
        )
