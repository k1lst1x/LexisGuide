"""Opt-in checks against the real lawfirm.dev API.

These are skipped unless ``LAWFIRM_LIVE_TEST=1``, because the free tier allows
only 10 lookups a day and 100 a month across the whole account. Running them on
every CI push would spend the same allowance real users need, and a drained
allowance makes verification fail for everyone.

Run them deliberately, after a deploy or when the contract looks wrong:

    LAWFIRM_API_KEY=$(aws secretsmanager get-secret-value \\
        --secret-id lexisguide/lawfirm-api-key --query SecretString --output text) \\
    LAWFIRM_LIVE_TEST=1 uv run pytest tests/test_lawfirm_live.py -v

Each test below costs one lookup. Expect roughly 3 of the day's 10.
"""

import os

import pytest

from app import lawfirm

pytestmark = pytest.mark.skipif(
    os.getenv("LAWFIRM_LIVE_TEST") != "1",
    reason="Set LAWFIRM_LIVE_TEST=1 to spend real lookups from the shared allowance.",
)

# A jurisdiction and bar number the provider is expected to hold. Override when
# the sample record changes: LIVE_BAR=... LIVE_JURISDICTION=...
LIVE_BAR = os.getenv("LIVE_BAR", "1234567")
LIVE_JURISDICTION = os.getenv("LIVE_JURISDICTION", "FL")


@pytest.fixture(scope="module")
def live_client() -> lawfirm.LawFirmClient:
    key = lawfirm.configured_api_key()
    if not key:
        pytest.skip("No key: set LAWFIRM_API_KEY or LAWFIRM_API_KEY_SECRET_ARN.")
    return lawfirm.LawFirmClient(key)


def test_the_real_api_answers_an_attorney_lookup(live_client: lawfirm.LawFirmClient) -> None:
    """Costs one lookup. Proves the endpoint, the key, and our parser agree."""
    try:
        payload = live_client.lookup_attorney(LIVE_BAR, LIVE_JURISDICTION)
    except lawfirm.LawFirmQuotaError:
        pytest.skip("The daily allowance is already spent; try again tomorrow.")
    except lawfirm.LawFirmResponseError as error:
        if error.status_code == 404:
            pytest.skip(
                f"The provider holds no record for {LIVE_JURISDICTION} {LIVE_BAR}. "
                "Set LIVE_BAR and LIVE_JURISDICTION to a record it does hold."
            )
        raise

    record = lawfirm.read_bar_status(payload)
    # The parser was written without a live sample, so this is the check that
    # matters: a real payload must yield a status we recognise, not an empty one.
    assert record["status"], f"No status field found in the live payload: {sorted(payload)}"
    assert isinstance(record["active"], bool)
    assert record["bar_number"] or record["name"], (
        "Neither a bar number nor a name was parsed from the live payload; "
        f"the field names differ from our guesses: {sorted(payload)}"
    )


def test_the_real_api_reports_an_unknown_bar_number_as_404(
    live_client: lawfirm.LawFirmClient,
) -> None:
    """Costs one lookup. A 404 is what the route turns into a spent attempt."""
    try:
        live_client.lookup_attorney("00000000", LIVE_JURISDICTION)
    except lawfirm.LawFirmQuotaError:
        pytest.skip("The daily allowance is already spent; try again tomorrow.")
    except lawfirm.LawFirmResponseError as error:
        assert error.status_code == 404
    else:
        pytest.fail("An unknown bar number returned a record rather than a 404.")


def test_a_bad_key_is_rejected_rather_than_silently_accepted() -> None:
    """Costs one rejected call. Guards against the placeholder-key mistake."""
    with pytest.raises((lawfirm.LawFirmResponseError, lawfirm.LawFirmQuotaError)) as caught:
        lawfirm.LawFirmClient("definitely-not-a-valid-key").lookup_attorney("1234567", "FL")
    if isinstance(caught.value, lawfirm.LawFirmResponseError):
        assert caught.value.status_code == 401
