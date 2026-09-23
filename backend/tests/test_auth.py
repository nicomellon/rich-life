from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url

from app.core.config import get_settings
from app.core.security import JWT_ALGORITHM, create_access_token, decode_access_token
from app.models.passkey import Passkey, WebAuthnChallenge
from app.models.user import User
from tests.authenticator import SoftwareAuthenticator

EMAIL = "ada@example.com"


def register_challenge(client: TestClient, email: str = EMAIL) -> dict[str, Any]:
    response = client.post("/api/v1/auth/register-challenge", json={"email": email})
    assert response.status_code == 200, response.text
    options: dict[str, Any] = response.json()
    return options


def login_challenge(client: TestClient) -> dict[str, Any]:
    response = client.post("/api/v1/auth/login-challenge")
    assert response.status_code == 200, response.text
    options: dict[str, Any] = response.json()
    return options


def sign_up(client: TestClient, authenticator: SoftwareAuthenticator, email: str = EMAIL) -> str:
    """Register a new account with `authenticator` and return its access token."""
    credential = authenticator.create(register_challenge(client, email))
    response = client.post("/api/v1/auth/verify-registration", json=credential)
    assert response.status_code == 201, response.text
    token: str = response.json()["access_token"]
    return token


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def assert_verification_failed(response: Any) -> None:
    assert response.status_code == 401
    assert response.json() == {"detail": "Passkey verification failed"}


# Registration


def test_register_challenge_asks_for_a_discoverable_verified_passkey(client: TestClient) -> None:
    options = register_challenge(client, "Ada@Example.COM")

    assert options["rp"] == {"id": "localhost", "name": "Rich Life"}
    assert options["user"]["name"] == EMAIL
    assert options["authenticatorSelection"]["residentKey"] == "required"
    assert options["authenticatorSelection"]["userVerification"] == "required"
    # The WebAuthn user id is random, not the email.
    assert EMAIL.encode() not in base64url_to_bytes(options["user"]["id"])


def test_registration_creates_user_and_passkey_and_signs_in(client: TestClient, db: Session) -> None:
    authenticator = SoftwareAuthenticator()

    token = sign_up(client, authenticator)

    user = db.scalars(select(User).where(User.email == EMAIL)).one()
    assert decode_access_token(token) == str(user.id)
    assert user.currency == "EUR"
    assert user.webauthn_user_handle == authenticator.user_handle
    passkey = db.scalars(select(Passkey).where(Passkey.user_id == user.id)).one()
    assert passkey.credential_id == authenticator.credential_id
    assert passkey.transports == ["internal"]
    assert db.scalars(select(WebAuthnChallenge)).all() == []


@pytest.mark.parametrize("email", [EMAIL, "ADA@example.com"])
def test_register_challenge_for_existing_email_returns_409(client: TestClient, email: str) -> None:
    sign_up(client, SoftwareAuthenticator())

    response = client.post("/api/v1/auth/register-challenge", json={"email": email})

    assert response.status_code == 409
    assert response.json() == {"detail": "Email already registered"}


def test_two_sign_ups_racing_for_one_email_create_one_account(client: TestClient) -> None:
    first, second = SoftwareAuthenticator(), SoftwareAuthenticator()
    first_credential = first.create(register_challenge(client))
    second_credential = second.create(register_challenge(client))

    assert client.post("/api/v1/auth/verify-registration", json=first_credential).status_code == 201
    response = client.post("/api/v1/auth/verify-registration", json=second_credential)

    assert response.status_code == 409


@pytest.mark.parametrize("payload", [{"email": "not-an-email"}, {}, {"email": EMAIL, "currency": "USD"}])
def test_register_challenge_rejects_invalid_payload(client: TestClient, payload: dict[str, str]) -> None:
    assert client.post("/api/v1/auth/register-challenge", json=payload).status_code == 422


def test_verify_registration_rejects_a_challenge_the_server_did_not_issue(client: TestClient) -> None:
    options = register_challenge(client)
    options["challenge"] = bytes_to_base64url(b"x" * 32)

    response = client.post("/api/v1/auth/verify-registration", json=SoftwareAuthenticator().create(options))

    assert_verification_failed(response)


def test_verify_registration_rejects_an_expired_challenge(client: TestClient, db: Session) -> None:
    credential = SoftwareAuthenticator().create(register_challenge(client))
    db.execute(update(WebAuthnChallenge).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))

    assert_verification_failed(client.post("/api/v1/auth/verify-registration", json=credential))


def test_verify_registration_rejects_a_reused_challenge(client: TestClient, db: Session) -> None:
    credential = SoftwareAuthenticator().create(register_challenge(client))
    assert client.post("/api/v1/auth/verify-registration", json=credential).status_code == 201
    # Remove the account so only the spent challenge stands in the way.
    db.query(User).delete()

    assert_verification_failed(client.post("/api/v1/auth/verify-registration", json=credential))


def test_verify_registration_rejects_another_origin(client: TestClient) -> None:
    credential = SoftwareAuthenticator(origin="https://evil.example.com").create(register_challenge(client))

    assert_verification_failed(client.post("/api/v1/auth/verify-registration", json=credential))


def test_a_failed_verification_still_uses_up_the_challenge(client: TestClient) -> None:
    authenticator = SoftwareAuthenticator()
    credential = authenticator.create(register_challenge(client))
    tampered = {**credential, "response": {**credential["response"], "attestationObject": "AAAA"}}

    assert_verification_failed(client.post("/api/v1/auth/verify-registration", json=tampered))
    assert_verification_failed(client.post("/api/v1/auth/verify-registration", json=credential))


@pytest.mark.parametrize("payload", [{}, {"id": "abc"}, {"response": "nope"}])
def test_verify_registration_rejects_malformed_credentials(client: TestClient, payload: dict[str, Any]) -> None:
    assert_verification_failed(client.post("/api/v1/auth/verify-registration", json=payload))


# Sign-in


def test_login_challenge_lets_the_browser_offer_any_passkey(client: TestClient) -> None:
    options = login_challenge(client)

    assert options["rpId"] == "localhost"
    assert options["allowCredentials"] == []
    assert options["userVerification"] == "required"


def test_login_signs_in_the_passkey_owner(client: TestClient, db: Session) -> None:
    authenticator = SoftwareAuthenticator()
    user_id = decode_access_token(sign_up(client, authenticator))
    sign_up(client, SoftwareAuthenticator(), "grace@example.com")

    response = client.post("/api/v1/auth/verify-login", json=authenticator.get(login_challenge(client)))

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert decode_access_token(response.json()["access_token"]) == user_id
    passkey = db.scalars(select(Passkey).where(Passkey.credential_id == authenticator.credential_id)).one()
    assert passkey.sign_count == 1
    assert passkey.last_used_at is not None


def test_login_with_an_unregistered_passkey_returns_401(client: TestClient) -> None:
    sign_up(client, SoftwareAuthenticator())
    stranger = SoftwareAuthenticator()
    stranger.user_handle = b"someone"

    assert_verification_failed(client.post("/api/v1/auth/verify-login", json=stranger.get(login_challenge(client))))


def test_login_with_a_bad_signature_returns_401(client: TestClient) -> None:
    authenticator = SoftwareAuthenticator()
    sign_up(client, authenticator)
    assertion = authenticator.get(login_challenge(client))
    other_signature = SoftwareAuthenticator().get(login_challenge(client))["response"]["signature"]
    assertion["response"]["signature"] = other_signature

    assert_verification_failed(client.post("/api/v1/auth/verify-login", json=assertion))


def test_login_with_a_user_handle_of_another_user_returns_401(client: TestClient) -> None:
    authenticator = SoftwareAuthenticator()
    sign_up(client, authenticator)
    other = SoftwareAuthenticator()
    sign_up(client, other, "grace@example.com")
    authenticator.user_handle = other.user_handle

    assert_verification_failed(
        client.post("/api/v1/auth/verify-login", json=authenticator.get(login_challenge(client)))
    )


def test_login_rejects_a_reused_challenge(client: TestClient) -> None:
    authenticator = SoftwareAuthenticator()
    sign_up(client, authenticator)
    assertion = authenticator.get(login_challenge(client))
    assert client.post("/api/v1/auth/verify-login", json=assertion).status_code == 200

    assert_verification_failed(client.post("/api/v1/auth/verify-login", json=assertion))


def test_login_rejects_a_registration_challenge(client: TestClient) -> None:
    authenticator = SoftwareAuthenticator()
    sign_up(client, authenticator)
    options = register_challenge(client, "grace@example.com")

    assert_verification_failed(client.post("/api/v1/auth/verify-login", json=authenticator.get(options)))


def test_login_rejects_an_expired_challenge(client: TestClient, db: Session) -> None:
    authenticator = SoftwareAuthenticator()
    sign_up(client, authenticator)
    assertion = authenticator.get(login_challenge(client))
    db.execute(update(WebAuthnChallenge).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))

    assert_verification_failed(client.post("/api/v1/auth/verify-login", json=assertion))


def test_issuing_a_challenge_clears_expired_ones(client: TestClient, db: Session) -> None:
    login_challenge(client)
    db.execute(update(WebAuthnChallenge).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))

    login_challenge(client)

    assert len(db.scalars(select(WebAuthnChallenge)).all()) == 1


# Current user


@pytest.fixture
def signed_in(client: TestClient) -> dict[str, str]:
    return auth_header(sign_up(client, SoftwareAuthenticator()))


def test_me_returns_current_user(client: TestClient, signed_in: dict[str, str]) -> None:
    response = client.get("/api/v1/auth/me", headers=signed_in)

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == EMAIL
    assert body["currency"] == "EUR"
    assert set(body) == {"id", "email", "currency", "created_at"}


def expired_token(subject: str) -> str:
    past = datetime.now(UTC) - timedelta(hours=1)
    secret = get_settings().jwt_secret.get_secret_value()
    return jwt.encode({"sub": subject, "exp": past}, secret, algorithm=JWT_ALGORITHM)


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer not-a-jwt"},
        {"Authorization": "Basic YWRhOnB3"},
        auth_header(jwt.encode({"sub": "1"}, "some-other-secret-" + "x" * 32, algorithm=JWT_ALGORITHM)),
        auth_header(expired_token("1")),
        auth_header(create_access_token("999999999")),
        auth_header(create_access_token("not-an-id")),
    ],
    ids=["missing", "malformed", "wrong-scheme", "wrong-secret", "expired", "unknown-user", "bad-subject"],
)
def test_me_without_valid_token_returns_401(client: TestClient, headers: dict[str, str]) -> None:
    response = client.get("/api/v1/auth/me", headers=headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_patch_me_updates_currency(client: TestClient, signed_in: dict[str, str]) -> None:
    response = client.patch("/api/v1/auth/me", json={"currency": "usd"}, headers=signed_in)

    assert response.status_code == 200
    assert response.json()["currency"] == "USD"
    assert client.get("/api/v1/auth/me", headers=signed_in).json()["currency"] == "USD"


@pytest.mark.parametrize(
    "payload",
    [{"currency": "EURO"}, {"currency": "E1"}, {"currency": "ABC"}, {"email": "new@example.com"}],
    ids=["too-long", "not-letters", "not-iso-4217", "unknown-field"],
)
def test_patch_me_rejects_invalid_payload(
    client: TestClient, signed_in: dict[str, str], payload: dict[str, str]
) -> None:
    assert client.patch("/api/v1/auth/me", json=payload, headers=signed_in).status_code == 422


@pytest.mark.parametrize("payload", [{}, {"currency": "EUR"}], ids=["empty", "same-currency"])
def test_patch_me_without_changes_does_not_commit(
    client: TestClient,
    db: Session,
    signed_in: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    payload: dict[str, str],
) -> None:
    commits: list[None] = []
    commit: Callable[[], None] = lambda: commits.append(None)  # noqa: E731
    monkeypatch.setattr(db, "commit", commit)

    response = client.patch("/api/v1/auth/me", json=payload, headers=signed_in)

    assert response.status_code == 200
    assert response.json()["currency"] == "EUR"
    assert commits == []


def test_patch_me_requires_authentication(client: TestClient) -> None:
    assert client.patch("/api/v1/auth/me", json={"currency": "USD"}).status_code == 401
