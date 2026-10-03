"""A stand-in for the email provider, and helpers that read the sign-in links it
received."""

import re

from webauthn.helpers import base64url_to_bytes

from app.services.email import EmailMessage

SIGN_IN_LINK_PATTERN = re.compile(r"(?P<link>\S+/sign-in/link#token=(?P<token>\S+))")


class FakeEmailSender:
    """Keeps every message instead of sending it."""

    def __init__(self) -> None:
        self.sent_messages: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.sent_messages.append(message)


def sign_in_link(message: EmailMessage) -> str:
    link_match = SIGN_IN_LINK_PATTERN.search(message.body)
    assert link_match is not None, message.body
    return link_match["link"]


def sign_in_token(message: EmailMessage) -> bytes:
    """The token in the message's sign-in link, decoded from base64url."""
    link_match = SIGN_IN_LINK_PATTERN.search(message.body)
    assert link_match is not None, message.body
    return base64url_to_bytes(link_match["token"])
