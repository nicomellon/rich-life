import logging

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.services import email
from app.services.email import (
    EmailMessage,
    LoggingEmailSender,
    ResendEmail,
    ResendEmailSender,
    get_email_sender,
)

SIGN_IN_EMAIL = EmailMessage(
    to="ada@example.com",
    subject="Your Rich Life sign-in link",
    body="http://localhost:5173/sign-in/link#token=abc",
)
API_KEY = "re_test_key"
SENDER = "Rich Life <sign-in@example.com>"


class RecordingResendApi:
    """Answers with Resend's status, and keeps the requests it received."""

    def __init__(self, status_code: int = 200) -> None:
        self.status_code = status_code
        self.received_requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.received_requests.append(request)
        return httpx.Response(self.status_code)


def resend_sender(resend_api: RecordingResendApi) -> ResendEmailSender:
    return ResendEmailSender(
        api_key=API_KEY,
        sender=SENDER,
        http_client=httpx.Client(transport=httpx.MockTransport(resend_api)),
    )


def use_settings(monkeypatch: pytest.MonkeyPatch, settings: Settings) -> None:
    monkeypatch.setattr(email, "get_settings", lambda: settings)


def test_logging_sender_logs_the_message_body(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.WARNING, logger="app.services.email"):
        LoggingEmailSender().send(SIGN_IN_EMAIL)

    assert SIGN_IN_EMAIL.body in caplog.text


def test_resend_sender_posts_to_resends_emails_endpoint() -> None:
    resend_api = RecordingResendApi()

    resend_sender(resend_api).send(SIGN_IN_EMAIL)

    [sent_request] = resend_api.received_requests
    assert (sent_request.method, str(sent_request.url)) == (
        "POST",
        "https://api.resend.com/emails",
    )


def test_resend_sender_authenticates_with_the_api_key() -> None:
    resend_api = RecordingResendApi()

    resend_sender(resend_api).send(SIGN_IN_EMAIL)

    [sent_request] = resend_api.received_requests
    assert sent_request.headers["authorization"] == f"Bearer {API_KEY}"


def test_resend_sender_posts_the_message_as_a_resend_email() -> None:
    resend_api = RecordingResendApi()

    resend_sender(resend_api).send(SIGN_IN_EMAIL)

    [sent_request] = resend_api.received_requests
    assert ResendEmail.model_validate_json(sent_request.content) == ResendEmail(
        sender=SENDER,
        to=[SIGN_IN_EMAIL.to],
        subject=SIGN_IN_EMAIL.subject,
        text=SIGN_IN_EMAIL.body,
    )


def test_resend_sender_names_the_sender_from_in_the_request() -> None:
    resend_api = RecordingResendApi()

    resend_sender(resend_api).send(SIGN_IN_EMAIL)

    [sent_request] = resend_api.received_requests
    assert b'"from":' in sent_request.content


def test_resend_sender_raises_when_resend_refuses_the_message() -> None:
    sender = resend_sender(RecordingResendApi(status_code=422))

    with pytest.raises(httpx.HTTPStatusError):
        sender.send(SIGN_IN_EMAIL)


def test_get_email_sender_returns_the_logging_sender_for_log_delivery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    use_settings(monkeypatch, Settings(email_delivery="log"))

    assert isinstance(get_email_sender(), LoggingEmailSender)


def test_get_email_sender_returns_the_resend_sender_for_resend_delivery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    use_settings(
        monkeypatch,
        Settings(
            email_delivery="resend",
            email_api_key=SecretStr(API_KEY),
            email_from=SENDER,
        ),
    )

    assert isinstance(get_email_sender(), ResendEmailSender)
