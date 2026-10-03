"""Passkey (WebAuthn) registration and sign-in. Each ceremony has two steps: issue a
challenge and the options the browser needs, then verify the credential the browser
returns for that challenge."""

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import (
    bytes_to_base64url,
    options_to_json_dict,
    parse_client_data_json,
)
from webauthn.helpers.exceptions import WebAuthnException
from webauthn.helpers.structs import (
    AuthenticationCredential,
    AuthenticatorAssertionResponse,
    AuthenticatorAttestationResponse,
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialDescriptor,
    RegistrationCredential,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.config import get_settings
from app.models.passkey import ChallengeKind, Passkey, WebAuthnChallenge
from app.models.spending_plan import SpendingPlan
from app.models.user import User
from app.schemas.user import Email
from app.schemas.webauthn import (
    AuthenticationOptions,
    AuthenticationResponse,
    RegistrationOptions,
    RegistrationResponse,
)

CHALLENGE_TTL = timedelta(minutes=5)
KNOWN_TRANSPORTS = {transport.value for transport in AuthenticatorTransport}


class EmailAlreadyRegisteredError(Exception):
    pass


class PasskeyVerificationError(Exception):
    """The credential answers an unknown, expired or used challenge, or fails
    verification."""


def start_registration(db: Session, *, email: Email) -> RegistrationOptions:
    """Return creation options for a new account's first passkey."""
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise EmailAlreadyRegisteredError(email)

    user_handle = secrets.token_bytes(32)
    challenge = _issue_challenge(
        db,
        ChallengeKind.REGISTRATION,
        email=email,
        user_handle=user_handle,
    )
    return _registration_options(challenge, user_handle=user_handle, user_name=email)


def start_passkey_addition(db: Session, user: User) -> RegistrationOptions:
    """Return creation options for another passkey on a signed-in user's account."""
    challenge = _issue_challenge(
        db,
        ChallengeKind.REGISTRATION,
        user_handle=user.webauthn_user_handle,
        user_id=user.id,
    )
    existing_passkeys = db.scalars(select(Passkey).where(Passkey.user_id == user.id))
    return _registration_options(
        challenge,
        user_handle=user.webauthn_user_handle,
        user_name=user.email,
        # The browser refuses an authenticator that already holds one of these, so a
        # device isn't registered twice.
        exclude_credentials=[
            PublicKeyCredentialDescriptor(
                id=passkey.credential_id,
                transports=_known_transports(passkey.transports),
            )
            for passkey in existing_passkeys
        ],
    )


def finish_registration(
    db: Session, registration: RegistrationResponse, signed_in_user: User | None
) -> User:
    """Verify the new passkey. Signed in, add it to the user's account; otherwise
    create its account, with the default spending plan. A challenge only works for
    the kind of registration it was issued for, and for the same user."""
    settings = get_settings()
    transports = _known_transports(registration.response.transports)
    try:
        issued_challenge = _consume_challenge(
            db,
            ChallengeKind.REGISTRATION,
            registration.response.client_data_json,
        )
        signed_in_user_id = signed_in_user.id if signed_in_user else None
        if issued_challenge.user_id != signed_in_user_id:
            raise PasskeyVerificationError("Challenge issued for another account")
        verified_registration = verify_registration_response(
            credential=RegistrationCredential(
                id=bytes_to_base64url(registration.id),
                raw_id=registration.raw_id,
                response=AuthenticatorAttestationResponse(
                    client_data_json=registration.response.client_data_json,
                    attestation_object=registration.response.attestation_object,
                    transports=transports,
                ),
                authenticator_attachment=registration.authenticator_attachment,
            ),
            expected_challenge=issued_challenge.challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            require_user_verification=True,
        )
    except (WebAuthnException, ValueError) as exc:
        raise PasskeyVerificationError from exc
    passkey = Passkey(
        credential_id=verified_registration.credential_id,
        public_key=verified_registration.credential_public_key,
        sign_count=verified_registration.sign_count,
        transports=[transport.value for transport in transports],
    )
    if signed_in_user is not None:
        return _add_passkey(db, signed_in_user, passkey)

    # Read before committing: a failed commit expires the challenge row, which no longer
    # exists.
    email = issued_challenge.email
    user_handle = issued_challenge.user_handle
    assert email is not None and user_handle is not None

    user = User(email=email, webauthn_user_handle=user_handle)
    db.add(user)
    passkey.user = user
    db.add(passkey)
    # The column defaults give every new user the 50/10/20/20 plan.
    db.add(SpendingPlan(user=user))
    try:
        # The unique index on email is the source of truth: of two sign-ups racing for
        # one email, one gets here.
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise EmailAlreadyRegisteredError(email) from exc
    return user


def start_authentication(db: Session) -> AuthenticationOptions:
    """Return request options for signing in. They name no credentials, so the
    browser offers every passkey it has for this site and the user doesn't type an
    email."""
    challenge = _issue_challenge(db, ChallengeKind.AUTHENTICATION)
    authentication_options = generate_authentication_options(
        rp_id=get_settings().webauthn_rp_id,
        challenge=challenge,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return AuthenticationOptions.model_validate(
        options_to_json_dict(authentication_options)
    )


def finish_authentication(db: Session, authentication: AuthenticationResponse) -> User:
    """Verify a sign-in assertion and return the passkey's user."""
    settings = get_settings()
    try:
        issued_challenge = _consume_challenge(
            db,
            ChallengeKind.AUTHENTICATION,
            authentication.response.client_data_json,
        )
        passkey = db.scalar(
            select(Passkey).where(Passkey.credential_id == authentication.raw_id)
        )
        if passkey is None:
            raise PasskeyVerificationError("Unknown credential")
        # A discoverable credential reports the user it was created for; it must be the
        # passkey's owner.
        user_handle = authentication.response.user_handle
        if user_handle is not None and user_handle != passkey.user.webauthn_user_handle:
            raise PasskeyVerificationError("Credential belongs to another user")
        verified_authentication = verify_authentication_response(
            credential=AuthenticationCredential(
                id=bytes_to_base64url(authentication.id),
                raw_id=authentication.raw_id,
                response=AuthenticatorAssertionResponse(
                    client_data_json=authentication.response.client_data_json,
                    authenticator_data=authentication.response.authenticator_data,
                    signature=authentication.response.signature,
                    user_handle=user_handle,
                ),
                authenticator_attachment=authentication.authenticator_attachment,
            ),
            expected_challenge=issued_challenge.challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=True,
        )
    except (WebAuthnException, ValueError) as exc:
        raise PasskeyVerificationError from exc

    passkey.sign_count = verified_authentication.new_sign_count
    passkey.last_used_at = datetime.now(UTC)
    db.commit()
    return passkey.user


def _add_passkey(db: Session, user: User, passkey: Passkey) -> User:
    passkey.user = user
    db.add(passkey)
    try:
        db.commit()
    except IntegrityError as exc:
        # The credential is already registered, to this account or another one.
        db.rollback()
        raise PasskeyVerificationError("Credential already registered") from exc
    return user


def _registration_options(
    challenge: bytes,
    *,
    user_handle: bytes,
    user_name: str,
    exclude_credentials: list[PublicKeyCredentialDescriptor] | None = None,
) -> RegistrationOptions:
    settings = get_settings()
    registration_options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=user_handle,
        user_name=user_name,
        challenge=challenge,
        exclude_credentials=exclude_credentials,
        # A discoverable credential lets the user sign in later without typing their
        # email.
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    return RegistrationOptions.model_validate(
        options_to_json_dict(registration_options)
    )


def _known_transports(transports: list[str]) -> list[AuthenticatorTransport]:
    """The transports py_webauthn knows, leaving out any newer ones a browser
    reports."""
    return [
        AuthenticatorTransport(transport)
        for transport in transports
        if transport in KNOWN_TRANSPORTS
    ]


def _issue_challenge(
    db: Session,
    kind: ChallengeKind,
    *,
    email: Email | None = None,
    user_handle: bytes | None = None,
    user_id: int | None = None,
) -> bytes:
    now = datetime.now(UTC)
    # Housekeeping: challenges that were never answered pile up otherwise.
    db.execute(delete(WebAuthnChallenge).where(WebAuthnChallenge.expires_at < now))
    challenge = secrets.token_bytes(32)
    db.add(
        WebAuthnChallenge(
            challenge=challenge,
            kind=kind,
            email=email,
            user_handle=user_handle,
            user_id=user_id,
            expires_at=now + CHALLENGE_TTL,
        )
    )
    db.commit()
    return challenge


def _consume_challenge(
    db: Session,
    kind: ChallengeKind,
    client_data_json: bytes,
) -> WebAuthnChallenge:
    """Find and delete the challenge the credential answers. It's deleted even if
    verification then fails, so every challenge gets exactly one attempt."""
    challenge = parse_client_data_json(client_data_json).challenge
    issued_challenge = db.scalar(
        delete(WebAuthnChallenge)
        .where(WebAuthnChallenge.challenge == challenge, WebAuthnChallenge.kind == kind)
        .returning(WebAuthnChallenge)
    )
    db.commit()
    if issued_challenge is None or issued_challenge.expires_at <= datetime.now(UTC):
        raise PasskeyVerificationError("Unknown, expired or already used challenge")
    return issued_challenge
