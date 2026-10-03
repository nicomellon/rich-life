import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from redis import Redis
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.api.v1.routers import auth as auth_router
from app.core.config import Settings
from app.core.security import decode_access_token
from app.main import app
from app.models.user import User
from app.schemas.auth import MagicLinkRequest, MagicLinkVerification, Token
from app.schemas.error import ErrorCode, ErrorResponse
from app.schemas.user import Email
from app.services.email import EmailMessage, get_email_sender
from tests.accounts import EMAIL, OTHER_EMAIL, post_model
from tests.emails import FakeEmailSender, sign_in_link, sign_in_token

UNKNOWN_EMAIL = "nobody@example.com"
UNKNOWN_TOKEN = bytes(32)
MAGIC_LINK_INVALID = ErrorResponse(
    detail="This sign-in link is invalid, expired or already used.",
    code=ErrorCode.MAGIC_LINK_INVALID,
)
RATE_LIMITED = ErrorResponse(
    detail="Too many requests. Please try again later.",
    code=ErrorCode.RATE_LIMITED,
)


def request_magic_link(client: TestClient, email: Email = EMAIL) -> Response:
    return post_model(client, "/api/v1/auth/magic-link", MagicLinkRequest(email=email))


def verify_magic_link(client: TestClient, token: bytes) -> Response:
    return post_model(
        client, "/api/v1/auth/magic-link/verify", MagicLinkVerification(token=token)
    )


def emailed_token(client: TestClient, email_sender: FakeEmailSender) -> bytes:
    """Ask for a sign-in link for `tests.accounts.EMAIL` and return its token."""
    request_magic_link(client)
    return sign_in_token(email_sender.sent_messages[-1])


def stored_magic_link_keys(redis_client: Redis) -> list[bytes]:
    return list(redis_client.scan_iter("magic-link:*"))


@pytest.fixture
def sign_in_email(
    client: TestClient, email_sender: FakeEmailSender, registered_user: User
) -> EmailMessage:
    """The email sent for one sign-in link request for the registered account."""
    request_magic_link(client)
    return email_sender.sent_messages[-1]


class FailingEmailSender:
    def send(self, message: EmailMessage) -> None:
        raise ConnectionError("The email provider is down")


# Requesting a link


def test_magic_link_for_a_registered_email_returns_202(
    client: TestClient, registered_user: User
) -> None:
    response = request_magic_link(client)

    assert (response.status_code, response.content) == (202, b"")


def test_magic_link_for_an_unknown_email_returns_the_same_202(
    client: TestClient, registered_user: User
) -> None:
    response = request_magic_link(client, UNKNOWN_EMAIL)

    assert (response.status_code, response.content) == (202, b"")


def test_magic_link_emails_the_account(sign_in_email: EmailMessage) -> None:
    assert sign_in_email.to == EMAIL


def test_magic_link_email_has_the_sign_in_subject(
    sign_in_email: EmailMessage,
) -> None:
    assert sign_in_email.subject == "Your Rich Life sign-in link"


def test_magic_link_points_to_the_web_apps_sign_in_link_route(
    sign_in_email: EmailMessage,
) -> None:
    assert sign_in_link(sign_in_email).startswith(
        "http://localhost:5173/sign-in/link#token="
    )


def test_magic_link_token_is_32_random_bytes(sign_in_email: EmailMessage) -> None:
    assert len(sign_in_token(sign_in_email)) == 32


def test_magic_link_for_an_unknown_email_sends_nothing(
    client: TestClient, email_sender: FakeEmailSender, registered_user: User
) -> None:
    request_magic_link(client, UNKNOWN_EMAIL)

    assert email_sender.sent_messages == []


def test_magic_link_finds_the_account_whatever_the_emails_case(
    client: TestClient, email_sender: FakeEmailSender, registered_user: User
) -> None:
    request_magic_link(client, "Ada@Example.COM")

    assert [message.to for message in email_sender.sent_messages] == [EMAIL]


def test_magic_link_stores_only_the_tokens_hash(
    redis_client: Redis, sign_in_email: EmailMessage
) -> None:
    token = sign_in_token(sign_in_email)

    assert stored_magic_link_keys(redis_client) == [
        f"magic-link:{hashlib.sha256(token).hexdigest()}".encode()
    ]


def test_magic_link_expires_after_15_minutes(
    redis_client: Redis, sign_in_email: EmailMessage
) -> None:
    [magic_link_key] = stored_magic_link_keys(redis_client)

    assert 15 * 60 - 5 <= redis_client.ttl(magic_link_key) <= 15 * 60


def test_magic_link_still_returns_202_when_sending_fails(
    client: TestClient, registered_user: User
) -> None:
    app.dependency_overrides[get_email_sender] = FailingEmailSender

    response = request_magic_link(client)

    assert response.status_code == 202


@pytest.mark.parametrize(
    "payload",
    [{"email": "not-an-email"}, {}, {"email": EMAIL, "next": "/plan"}],
    ids=["invalid-email", "missing-email", "unknown-field"],
)
def test_magic_link_rejects_an_invalid_payload(
    client: TestClient, payload: dict[str, str]
) -> None:
    response = client.post("/api/v1/auth/magic-link", json=payload)

    assert response.status_code == 422


# Signing in with a link


def test_verify_magic_link_returns_an_access_token_for_the_links_user(
    client: TestClient,
    email_sender: FakeEmailSender,
    registered_user: User,
) -> None:
    token = emailed_token(client, email_sender)

    response = verify_magic_link(client, token)

    claims = decode_access_token(Token.model_validate(response.json()).access_token)
    assert claims is not None and claims.user_id == registered_user.id


def test_verify_magic_link_deletes_the_token(
    client: TestClient,
    redis_client: Redis,
    email_sender: FakeEmailSender,
    registered_user: User,
) -> None:
    token = emailed_token(client, email_sender)

    verify_magic_link(client, token)

    assert stored_magic_link_keys(redis_client) == []


def test_a_magic_link_signs_in_only_once(
    client: TestClient,
    email_sender: FakeEmailSender,
    registered_user: User,
) -> None:
    token = emailed_token(client, email_sender)
    verify_magic_link(client, token)

    response = verify_magic_link(client, token)

    assert (
        response.status_code,
        ErrorResponse.model_validate(response.json()),
    ) == (401, MAGIC_LINK_INVALID)


def test_verify_magic_link_with_an_expired_token_returns_401(
    client: TestClient,
    redis_client: Redis,
    email_sender: FakeEmailSender,
    registered_user: User,
) -> None:
    token = emailed_token(client, email_sender)
    [magic_link_key] = stored_magic_link_keys(redis_client)
    redis_client.expireat(magic_link_key, datetime.now(UTC) - timedelta(seconds=1))

    response = verify_magic_link(client, token)

    assert (
        response.status_code,
        ErrorResponse.model_validate(response.json()),
    ) == (401, MAGIC_LINK_INVALID)


def test_verify_magic_link_with_an_unknown_token_returns_401(
    client: TestClient,
) -> None:
    response = verify_magic_link(client, UNKNOWN_TOKEN)

    assert (
        response.status_code,
        ErrorResponse.model_validate(response.json()),
    ) == (401, MAGIC_LINK_INVALID)


def test_verify_magic_link_for_a_deleted_account_returns_401(
    client: TestClient,
    db: Session,
    email_sender: FakeEmailSender,
    registered_user: User,
) -> None:
    token = emailed_token(client, email_sender)
    db.execute(delete(User).where(User.id == registered_user.id))

    response = verify_magic_link(client, token)

    assert (
        response.status_code,
        ErrorResponse.model_validate(response.json()),
    ) == (401, MAGIC_LINK_INVALID)


def test_an_earlier_magic_link_still_works_after_a_new_one(
    client: TestClient,
    email_sender: FakeEmailSender,
    registered_user: User,
) -> None:
    earlier_token = emailed_token(client, email_sender)
    request_magic_link(client)

    response = verify_magic_link(client, earlier_token)

    assert response.status_code == 200


@pytest.mark.parametrize(
    "payload",
    [{"token": "!!!"}, {}, {"token": "A" * 43, "email": EMAIL}],
    ids=["not-base64url", "missing-token", "unknown-field"],
)
def test_verify_magic_link_rejects_an_invalid_payload(
    client: TestClient, payload: dict[str, str]
) -> None:
    response = client.post("/api/v1/auth/magic-link/verify", json=payload)

    assert response.status_code == 422


# Rate limits


def test_fourth_magic_link_request_for_one_email_in_15_minutes_returns_429(
    client: TestClient, registered_user: User
) -> None:
    for _ in range(3):
        request_magic_link(client)

    response = request_magic_link(client)

    assert (
        response.status_code,
        ErrorResponse.model_validate(response.json()),
    ) == (429, RATE_LIMITED)


def test_a_rate_limited_magic_link_request_says_when_to_retry(
    client: TestClient, registered_user: User
) -> None:
    for _ in range(3):
        request_magic_link(client)

    response = request_magic_link(client)

    assert 15 * 60 - 5 <= int(response.headers["retry-after"]) <= 15 * 60


def test_a_rate_limited_magic_link_request_sends_no_email(
    client: TestClient, email_sender: FakeEmailSender, registered_user: User
) -> None:
    for _ in range(3):
        request_magic_link(client)

    request_magic_link(client)

    assert len(email_sender.sent_messages) == 3


def test_the_magic_link_email_limit_applies_to_unknown_emails_too(
    client: TestClient,
) -> None:
    for _ in range(3):
        request_magic_link(client, UNKNOWN_EMAIL)

    response = request_magic_link(client, UNKNOWN_EMAIL)

    assert response.status_code == 429


def test_the_magic_link_email_limit_counts_each_email_separately(
    client: TestClient, registered_user: User
) -> None:
    for _ in range(3):
        request_magic_link(client, OTHER_EMAIL)

    response = request_magic_link(client)

    assert response.status_code == 202


def test_requests_refused_by_the_email_limit_do_not_use_up_the_ip_limit(
    client: TestClient,
) -> None:
    for _ in range(3 + 17):
        request_magic_link(client, UNKNOWN_EMAIL)

    response = request_magic_link(client)

    assert response.status_code == 202


def test_twenty_first_magic_link_request_from_one_ip_returns_429(
    client: TestClient,
) -> None:
    for request_number in range(20):
        request_magic_link(client, f"user{request_number}@example.com")

    response = request_magic_link(client)

    assert (
        response.status_code,
        ErrorResponse.model_validate(response.json()),
    ) == (429, RATE_LIMITED)


def test_twenty_first_magic_link_verification_from_one_ip_returns_429(
    client: TestClient,
) -> None:
    for _ in range(20):
        verify_magic_link(client, UNKNOWN_TOKEN)

    response = verify_magic_link(client, UNKNOWN_TOKEN)

    assert (
        response.status_code,
        ErrorResponse.model_validate(response.json()),
    ) == (429, RATE_LIMITED)


def test_magic_link_requests_from_another_ip_have_their_own_limit(
    client: TestClient,
) -> None:
    for request_number in range(20):
        request_magic_link(client, f"user{request_number}@example.com")
    other_ip_client = TestClient(app, client=("203.0.113.7", 50000))

    response = request_magic_link(other_ip_client)

    assert response.status_code == 202


def test_the_magic_link_email_limit_comes_from_the_settings(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        auth_router, "get_settings", lambda: Settings(magic_link_email_limit=1)
    )
    request_magic_link(client, UNKNOWN_EMAIL)

    response = request_magic_link(client, UNKNOWN_EMAIL)

    assert response.status_code == 429


def test_ipv6_magic_link_requests_from_one_64_prefix_share_a_limit(
    client: TestClient,
) -> None:
    first_ipv6_client = TestClient(app, client=("2001:db8:1:2::1", 50000))
    for request_number in range(20):
        request_magic_link(first_ipv6_client, f"user{request_number}@example.com")
    neighbour_ipv6_client = TestClient(app, client=("2001:db8:1:2:ffff::7", 50000))

    response = request_magic_link(neighbour_ipv6_client)

    assert response.status_code == 429


def test_ipv6_magic_link_requests_from_another_64_prefix_have_their_own_limit(
    client: TestClient,
) -> None:
    first_ipv6_client = TestClient(app, client=("2001:db8:1:2::1", 50000))
    for request_number in range(20):
        request_magic_link(first_ipv6_client, f"user{request_number}@example.com")
    other_prefix_client = TestClient(app, client=("2001:db8:1:3::1", 50000))

    response = request_magic_link(other_prefix_client)

    assert response.status_code == 202
