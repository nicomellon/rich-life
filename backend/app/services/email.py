"""Sending email. `EMAIL_DELIVERY` picks the sender: `log` writes messages to the log
for development, `resend` sends them through Resend's HTTP API."""

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import get_settings
from app.schemas.user import Email

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_TIMEOUT_SECONDS = 10


@dataclass(frozen=True)
class EmailMessage:
    to: Email
    subject: str
    # Plain text.
    body: str


class EmailSender(Protocol):
    def send(self, message: EmailMessage) -> None:
        """Send the message, or raise if it can't be handed over."""


class LoggingEmailSender:
    """Writes messages to the log instead of sending them, for development. Logged as
    warnings, so they show with uvicorn's default log level."""

    def send(self, message: EmailMessage) -> None:
        logger.warning(
            "EMAIL_DELIVERY=log, so this email was not sent.\n"
            "To: %s\nSubject: %s\n\n%s",
            message.to,
            message.subject,
            message.body,
        )


class ResendEmail(BaseModel):
    """The body of Resend's send-email request."""

    model_config = ConfigDict(validate_by_name=True, serialize_by_alias=True)

    # `from` is a Python keyword, so the field has another name here.
    sender: str = Field(alias="from")
    to: list[Email]
    subject: str
    text: str


class ResendEmailSender:
    def __init__(self, api_key: str, sender: str, http_client: httpx.Client) -> None:
        self.api_key = api_key
        self.sender = sender
        self.http_client = http_client

    def send(self, message: EmailMessage) -> None:
        resend_email = ResendEmail(
            sender=self.sender,
            to=[message.to],
            subject=message.subject,
            text=message.body,
        )
        response = self.http_client.post(
            RESEND_API_URL,
            content=resend_email.model_dump_json(),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=RESEND_TIMEOUT_SECONDS,
        )
        response.raise_for_status()


def get_email_sender() -> EmailSender:
    """FastAPI dependency: the sender `EMAIL_DELIVERY` asks for."""
    settings = get_settings()
    if settings.email_delivery == "log":
        return LoggingEmailSender()
    # Settings refuse `resend` without both, so these always hold.
    assert settings.email_api_key is not None and settings.email_from is not None
    return ResendEmailSender(
        api_key=settings.email_api_key.get_secret_value(),
        sender=settings.email_from,
        http_client=_resend_http_client(),
    )


@lru_cache
def _resend_http_client() -> httpx.Client:
    """One client for the process, so connections to Resend are reused."""
    return httpx.Client()
