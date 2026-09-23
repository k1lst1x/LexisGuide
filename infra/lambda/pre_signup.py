"""Confirm sign-ups without an emailed code.

Clearing auto_verified_attributes stops Cognito sending a code, but it does not
confirm anyone: SignUp still leaves the account UNCONFIRMED, and the next
sign-in fails with UserNotConfirmedException. This trigger is what actually
makes email and password work without a code.

It marks the email verified as well, because account recovery is configured for
verified_email and a password reset is refused without it.

The trade-off is deliberate and worth naming: nobody proves they own the
address they sign up with. Someone can register with another person's email,
which both denies that person the address and sends any later reset mail to an
inbox the account holder may not control. Restore auto_verified_attributes and
drop this trigger to require proof again.
"""


def handler(event: dict, _context: object) -> dict:
    event["response"]["autoConfirmUser"] = True
    if event["request"].get("userAttributes", {}).get("email"):
        event["response"]["autoVerifyEmail"] = True
    return event
