from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import JWT_ALGORITHM, create_access_token, decode_access_token
from app.models.passkey import Passkey, WebAuthnChallenge
from app.models.user import User
from app.schemas.auth import Token
from app.schemas.user import UserRead
from app.schemas.webauthn import AuthenticationOptions
from tests.accounts import (
    EMAIL,
    OTHER_EMAIL,
    auth_header,
    post_model,
    register,
    request_registration_options,
)
from tests.authenticator import SoftwareAuthenticator


def request_authentication_options(client: TestClient) -> AuthenticationOptions:
    response = client.post("/api/v1/auth/login-challenge")
    assert response.status_code == 200, response.text
    return AuthenticationOptions.model_validate(response.json())


def verify_registration(
    client: TestClient, authenticator: SoftwareAuthenticator
) -> Response:
    registration = authenticator.create(request_registration_options(client))
    return post_model(client, "/api/v1/auth/verify-registration", registration)


def verify_login(client: TestClient, authenticator: SoftwareAuthenticator) -> Response:
    authentication = authenticator.get(request_authentication_options(client))
    return post_model(client, "/api/v1/auth/verify-login", authentication)


def expire_all_challenges(db: Session) -> None:
    db.execute(
        update(WebAuthnChallenge).values(
            expires_at=datetime.now(UTC) - timedelta(seconds=1)
        )
    )


def assert_verification_failed(response: Response) -> None:
    assert (response.status_code, response.json()) == (
        401,
        {"detail": "Passkey verification failed"},
    )


@pytest.fixture
def registered_authenticator(
    client: TestClient,
    authenticator: SoftwareAuthenticator,
) -> SoftwareAuthenticator:
    """An authenticator holding the passkey of a registered account."""
    register(client, authenticator)
    return authenticator


@pytest.fixture
def registered_user(
    db: Session,
    registered_authenticator: SoftwareAuthenticator,
) -> User:
    return db.scalars(select(User).where(User.email == EMAIL)).one()


# Registration options


def test_register_challenge_names_the_relying_party(client: TestClient) -> None:
    options = request_registration_options(client)

    assert (options.rp.id, options.rp.name) == ("localhost", "Rich Life")


def test_register_challenge_names_the_user_by_their_lowercased_email(
    client: TestClient,
) -> None:
    options = request_registration_options(client, "Ada@Example.COM")

    assert options.user.name == EMAIL


def test_register_challenge_hides_the_email_from_the_user_handle(
    client: TestClient,
) -> None:
    options = request_registration_options(client)

    assert EMAIL.encode() not in options.user.id


def test_register_challenge_requires_a_discoverable_credential(
    client: TestClient,
) -> None:
    options = request_registration_options(client)

    assert options.authenticator_selection.resident_key == "required"


def test_register_challenge_requires_user_verification(client: TestClient) -> None:
    options = request_registration_options(client)

    assert options.authenticator_selection.user_verification == "required"


def test_register_challenge_leaves_out_the_unset_authenticator_attachment(
    client: TestClient,
) -> None:
    options = request_registration_options(client)

    assert (
        "authenticator_attachment"
        not in options.authenticator_selection.model_fields_set
    )


@pytest.mark.parametrize(
    "email", [EMAIL, "ADA@example.com"], ids=["same-case", "other-case"]
)
def test_register_challenge_for_a_registered_email_returns_409(
    client: TestClient,
    registered_authenticator: SoftwareAuthenticator,
    email: str,
) -> None:
    response = client.post("/api/v1/auth/register-challenge", json={"email": email})

    assert (response.status_code, response.json()) == (
        409,
        {"detail": "Email already registered"},
    )


@pytest.mark.parametrize(
    "payload",
    [{"email": "not-an-email"}, {}, {"email": EMAIL, "currency": "USD"}],
    ids=["invalid-email", "missing-email", "unknown-field"],
)
def test_register_challenge_rejects_an_invalid_payload(
    client: TestClient,
    payload: dict[str, str],
) -> None:
    response = client.post("/api/v1/auth/register-challenge", json=payload)

    assert response.status_code == 422


# Registration


def test_verify_registration_returns_an_access_token_for_the_new_user(
    client: TestClient,
    db: Session,
    authenticator: SoftwareAuthenticator,
) -> None:
    token = register(client, authenticator)

    user = db.scalars(select(User).where(User.email == EMAIL)).one()
    claims = decode_access_token(token.access_token)
    assert claims is not None and claims.user_id == user.id


def test_new_users_currency_defaults_to_eur(registered_user: User) -> None:
    assert registered_user.currency == "EUR"


def test_verify_registration_stores_the_user_handle_given_to_the_authenticator(
    registered_user: User,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    assert registered_user.webauthn_user_handle == registered_authenticator.user_handle


def test_verify_registration_stores_the_passkey(
    db: Session,
    registered_user: User,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    passkey = db.scalars(
        select(Passkey).where(Passkey.user_id == registered_user.id)
    ).one()

    assert passkey.credential_id == registered_authenticator.credential_id


def test_verify_registration_stores_the_passkeys_transports(
    db: Session,
    registered_user: User,
) -> None:
    passkey = db.scalars(
        select(Passkey).where(Passkey.user_id == registered_user.id)
    ).one()

    assert passkey.transports == ["internal"]


def test_verify_registration_deletes_the_challenge(
    db: Session,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    assert db.scalars(select(WebAuthnChallenge)).all() == []


def test_second_of_two_racing_sign_ups_for_one_email_returns_409(
    client: TestClient,
) -> None:
    first_registration = SoftwareAuthenticator().create(
        request_registration_options(client)
    )
    second_registration = SoftwareAuthenticator().create(
        request_registration_options(client)
    )
    post_model(client, "/api/v1/auth/verify-registration", first_registration)

    response = post_model(
        client, "/api/v1/auth/verify-registration", second_registration
    )

    assert response.status_code == 409


def test_verify_registration_rejects_a_challenge_the_server_did_not_issue(
    client: TestClient,
    authenticator: SoftwareAuthenticator,
) -> None:
    options = request_registration_options(client)
    options.challenge = b"x" * 32
    registration = authenticator.create(options)

    response = post_model(client, "/api/v1/auth/verify-registration", registration)

    assert_verification_failed(response)


def test_verify_registration_rejects_an_expired_challenge(
    client: TestClient,
    db: Session,
    authenticator: SoftwareAuthenticator,
) -> None:
    registration = authenticator.create(request_registration_options(client))
    expire_all_challenges(db)

    response = post_model(client, "/api/v1/auth/verify-registration", registration)

    assert_verification_failed(response)


def test_verify_registration_rejects_a_reused_challenge(
    client: TestClient,
    db: Session,
    authenticator: SoftwareAuthenticator,
) -> None:
    registration = authenticator.create(request_registration_options(client))
    post_model(client, "/api/v1/auth/verify-registration", registration)
    # Remove the account so only the spent challenge stands in the way.
    db.query(User).delete()

    response = post_model(client, "/api/v1/auth/verify-registration", registration)

    assert_verification_failed(response)


def test_verify_registration_rejects_another_origin(client: TestClient) -> None:
    response = verify_registration(
        client, SoftwareAuthenticator(origin="https://evil.example.com")
    )

    assert_verification_failed(response)


def test_a_failed_registration_uses_up_its_challenge(
    client: TestClient,
    authenticator: SoftwareAuthenticator,
) -> None:
    registration = authenticator.create(request_registration_options(client))
    tampered_registration = registration.model_copy(deep=True)
    tampered_registration.response.attestation_object = b"\x00"
    post_model(client, "/api/v1/auth/verify-registration", tampered_registration)

    response = post_model(client, "/api/v1/auth/verify-registration", registration)

    assert_verification_failed(response)


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"id": "abc", "rawId": "abc", "type": "public-key", "response": "nope"},
        {
            "id": "abc",
            "rawId": "!!!",
            "type": "public-key",
            "response": {"clientDataJSON": "AA", "attestationObject": "AA"},
        },
    ],
    ids=["empty", "response-not-an-object", "invalid-base64url"],
)
def test_verify_registration_rejects_a_malformed_credential(
    client: TestClient,
    payload: dict[str, str | dict[str, str]],
) -> None:
    response = client.post("/api/v1/auth/verify-registration", json=payload)

    assert response.status_code == 422


# Sign-in options


def test_login_challenge_names_the_relying_party(client: TestClient) -> None:
    options = request_authentication_options(client)

    assert options.rp_id == "localhost"


def test_login_challenge_lets_the_browser_offer_any_passkey(client: TestClient) -> None:
    options = request_authentication_options(client)

    assert options.allow_credentials == []


def test_login_challenge_requires_user_verification(client: TestClient) -> None:
    options = request_authentication_options(client)

    assert options.user_verification == "required"


def test_issuing_a_challenge_clears_expired_ones(
    client: TestClient, db: Session
) -> None:
    request_authentication_options(client)
    expire_all_challenges(db)

    request_authentication_options(client)

    assert len(db.scalars(select(WebAuthnChallenge)).all()) == 1


# Sign-in


def test_login_returns_an_access_token(
    client: TestClient,
    registered_user: User,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    register(client, SoftwareAuthenticator(), OTHER_EMAIL)

    response = verify_login(client, registered_authenticator)

    claims = decode_access_token(Token.model_validate(response.json()).access_token)
    assert claims is not None and claims.user_id == registered_user.id


def test_login_increases_the_passkeys_sign_count(
    client: TestClient,
    db: Session,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    verify_login(client, registered_authenticator)

    passkey = db.scalars(
        select(Passkey).where(
            Passkey.credential_id == registered_authenticator.credential_id
        )
    ).one()
    assert passkey.sign_count == 1


def test_login_sets_passkey_last_used_at(
    client: TestClient,
    db: Session,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    verify_login(client, registered_authenticator)

    passkey = db.scalars(
        select(Passkey).where(
            Passkey.credential_id == registered_authenticator.credential_id
        )
    ).one()
    assert passkey.last_used_at is not None


def test_login_with_an_unregistered_passkey_returns_401(
    client: TestClient,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    stranger = SoftwareAuthenticator()
    stranger.user_handle = b"someone"

    response = verify_login(client, stranger)

    assert_verification_failed(response)


def test_login_with_a_bad_signature_returns_401(
    client: TestClient,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    authentication = registered_authenticator.get(
        request_authentication_options(client)
    )
    other_assertion = SoftwareAuthenticator().get(
        request_authentication_options(client)
    )
    authentication.response.signature = other_assertion.response.signature

    response = post_model(client, "/api/v1/auth/verify-login", authentication)

    assert_verification_failed(response)


def test_login_with_another_users_user_handle_returns_401(
    client: TestClient,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    other_authenticator = SoftwareAuthenticator()
    register(client, other_authenticator, OTHER_EMAIL)
    registered_authenticator.user_handle = other_authenticator.user_handle

    response = verify_login(client, registered_authenticator)

    assert_verification_failed(response)


def test_login_rejects_a_reused_challenge(
    client: TestClient,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    authentication = registered_authenticator.get(
        request_authentication_options(client)
    )
    post_model(client, "/api/v1/auth/verify-login", authentication)

    response = post_model(client, "/api/v1/auth/verify-login", authentication)

    assert_verification_failed(response)


def test_login_rejects_a_registration_challenge(
    client: TestClient,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    registration_options = request_registration_options(client, OTHER_EMAIL)
    authentication = registered_authenticator.get(registration_options)

    response = post_model(client, "/api/v1/auth/verify-login", authentication)

    assert_verification_failed(response)


def test_login_rejects_an_expired_challenge(
    client: TestClient,
    db: Session,
    registered_authenticator: SoftwareAuthenticator,
) -> None:
    authentication = registered_authenticator.get(
        request_authentication_options(client)
    )
    expire_all_challenges(db)

    response = post_model(client, "/api/v1/auth/verify-login", authentication)

    assert_verification_failed(response)


# Current user


def test_me_returns_the_current_user(
    client: TestClient,
    db: Session,
    signed_in_headers: dict[str, str],
) -> None:
    response = client.get("/api/v1/auth/me", headers=signed_in_headers)

    user = db.scalars(select(User).where(User.email == EMAIL)).one()
    assert UserRead.model_validate(response.json()) == UserRead.model_validate(user)


@dataclass
class UncheckedClaims:
    """Access token claims without AccessTokenClaims' validation, to forge invalid
    tokens."""

    sub: str
    exp: datetime
    iat: datetime = field(default_factory=lambda: datetime.now(UTC))


def signed_token(claims: UncheckedClaims, secret: str | None = None) -> str:
    key = secret or get_settings().jwt_secret.get_secret_value()
    return jwt.encode(asdict(claims), key, algorithm=JWT_ALGORITHM)


IN_AN_HOUR = datetime.now(UTC) + timedelta(hours=1)
AN_HOUR_AGO = datetime.now(UTC) - timedelta(hours=1)


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer not-a-jwt"},
        {"Authorization": "Basic YWRhOnB3"},
        auth_header(
            signed_token(
                UncheckedClaims(sub="1", exp=IN_AN_HOUR), secret="other-" + "x" * 32
            )
        ),
        auth_header(signed_token(UncheckedClaims(sub="1", exp=AN_HOUR_AGO))),
        auth_header(create_access_token(999_999_999)),
        auth_header(signed_token(UncheckedClaims(sub="not-an-id", exp=IN_AN_HOUR))),
    ],
    ids=[
        "missing",
        "malformed",
        "wrong-scheme",
        "wrong-secret",
        "expired",
        "unknown-user",
        "bad-subject",
    ],
)
def test_me_without_a_valid_token_returns_401(
    client: TestClient,
    headers: dict[str, str],
) -> None:
    response = client.get("/api/v1/auth/me", headers=headers)

    assert (response.status_code, response.headers["www-authenticate"]) == (
        401,
        "Bearer",
    )


def test_patch_me_returns_the_new_currency(
    client: TestClient,
    signed_in_headers: dict[str, str],
) -> None:
    response = client.patch(
        "/api/v1/auth/me", json={"currency": "usd"}, headers=signed_in_headers
    )

    assert UserRead.model_validate(response.json()).currency == "USD"


def test_patch_me_saves_the_new_currency(
    client: TestClient,
    signed_in_headers: dict[str, str],
) -> None:
    client.patch("/api/v1/auth/me", json={"currency": "USD"}, headers=signed_in_headers)

    response = client.get("/api/v1/auth/me", headers=signed_in_headers)

    assert UserRead.model_validate(response.json()).currency == "USD"


@pytest.mark.parametrize(
    "payload",
    [
        {"currency": "EURO"},
        {"currency": "E1"},
        {"currency": "ABC"},
        {"email": "new@example.com"},
    ],
    ids=["too-long", "not-letters", "not-iso-4217", "unknown-field"],
)
def test_patch_me_rejects_an_invalid_payload(
    client: TestClient,
    signed_in_headers: dict[str, str],
    payload: dict[str, str],
) -> None:
    response = client.patch("/api/v1/auth/me", json=payload, headers=signed_in_headers)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload", [{}, {"currency": "EUR"}], ids=["empty", "same-currency"]
)
def test_patch_me_without_changes_does_not_commit(
    client: TestClient,
    db: Session,
    signed_in_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    payload: dict[str, str],
) -> None:
    commits: list[None] = []

    def record_commit() -> None:
        commits.append(None)

    monkeypatch.setattr(db, "commit", record_commit)

    client.patch("/api/v1/auth/me", json=payload, headers=signed_in_headers)

    assert commits == []


def test_patch_me_requires_authentication(client: TestClient) -> None:
    response = client.patch("/api/v1/auth/me", json={"currency": "USD"})

    assert response.status_code == 401
