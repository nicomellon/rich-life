"""Passkey (WebAuthn) registration and sign-in. Each ceremony has two steps: issue a challenge and the options the
browser needs, then verify the credential the browser returns for that challenge."""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

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
    options_to_json_dict,
    parse_authentication_credential_json,
    parse_client_data_json,
    parse_registration_credential_json,
)
from webauthn.helpers.exceptions import WebAuthnException
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.config import get_settings
from app.models.passkey import ChallengeKind, Passkey, WebAuthnChallenge
from app.models.user import User

CHALLENGE_TTL = timedelta(minutes=5)


class EmailAlreadyRegisteredError(Exception):
    pass


class PasskeyVerificationError(Exception):
    """The credential is malformed, answers an unknown, expired or used challenge, or fails verification."""


def start_registration(db: Session, *, email: str) -> dict[str, Any]:
    """Return creation options for a new account's first passkey."""
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise EmailAlreadyRegisteredError(email)

    settings = get_settings()
    user_handle = secrets.token_bytes(32)
    challenge = _issue_challenge(db, ChallengeKind.REGISTRATION, email=email, user_handle=user_handle)
    options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=user_handle,
        user_name=email,
        challenge=challenge,
        # A discoverable credential lets the user sign in later without typing their email.
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    return options_to_json_dict(options)


def finish_registration(db: Session, credential: dict[str, Any]) -> User:
    """Verify the new passkey and create its account."""
    settings = get_settings()
    try:
        parsed = parse_registration_credential_json(credential)
        pending = _consume_challenge(db, ChallengeKind.REGISTRATION, parsed.response.client_data_json)
        verified = verify_registration_response(
            credential=parsed,
            expected_challenge=pending.challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            require_user_verification=True,
        )
    except (WebAuthnException, ValueError) as exc:
        raise PasskeyVerificationError from exc
    email, user_handle = pending.email, pending.user_handle
    assert email is not None and user_handle is not None

    user = User(email=email, webauthn_user_handle=user_handle)
    db.add(user)
    db.add(
        Passkey(
            user=user,
            credential_id=verified.credential_id,
            public_key=verified.credential_public_key,
            sign_count=verified.sign_count,
            transports=[transport.value for transport in parsed.response.transports or []],
        )
    )
    try:
        # The unique index on email is the source of truth: of two sign-ups racing for one email, one gets here.
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise EmailAlreadyRegisteredError(email) from exc
    return user


def start_authentication(db: Session) -> dict[str, Any]:
    """Return request options for signing in. They name no credentials, so the browser offers every passkey it has
    for this site and the user doesn't type an email."""
    challenge = _issue_challenge(db, ChallengeKind.AUTHENTICATION)
    options = generate_authentication_options(
        rp_id=get_settings().webauthn_rp_id,
        challenge=challenge,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return options_to_json_dict(options)


def finish_authentication(db: Session, credential: dict[str, Any]) -> User:
    """Verify a sign-in assertion and return the passkey's user."""
    settings = get_settings()
    try:
        parsed = parse_authentication_credential_json(credential)
        pending = _consume_challenge(db, ChallengeKind.AUTHENTICATION, parsed.response.client_data_json)
        passkey = db.scalar(select(Passkey).where(Passkey.credential_id == parsed.raw_id))
        if passkey is None:
            raise PasskeyVerificationError("Unknown credential")
        # A discoverable credential reports the user it was created for; it must be this passkey's owner.
        if parsed.response.user_handle is not None and parsed.response.user_handle != passkey.user.webauthn_user_handle:
            raise PasskeyVerificationError("Credential belongs to another user")
        verified = verify_authentication_response(
            credential=parsed,
            expected_challenge=pending.challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=True,
        )
    except (WebAuthnException, ValueError) as exc:
        raise PasskeyVerificationError from exc

    passkey.sign_count = verified.new_sign_count
    passkey.last_used_at = datetime.now(UTC)
    db.commit()
    return passkey.user


def _issue_challenge(
    db: Session, kind: ChallengeKind, *, email: str | None = None, user_handle: bytes | None = None
) -> bytes:
    now = datetime.now(UTC)
    # Housekeeping: challenges that were never answered pile up otherwise.
    db.execute(delete(WebAuthnChallenge).where(WebAuthnChallenge.expires_at < now))
    challenge = secrets.token_bytes(32)
    db.add(
        WebAuthnChallenge(
            challenge=challenge, kind=kind, email=email, user_handle=user_handle, expires_at=now + CHALLENGE_TTL
        )
    )
    db.commit()
    return challenge


def _consume_challenge(db: Session, kind: ChallengeKind, client_data_json: bytes) -> WebAuthnChallenge:
    """Find and delete the challenge the credential answers. It's deleted even if verification then fails, so every
    challenge gets exactly one attempt."""
    challenge = parse_client_data_json(client_data_json).challenge
    pending = db.scalar(
        delete(WebAuthnChallenge)
        .where(WebAuthnChallenge.challenge == challenge, WebAuthnChallenge.kind == kind)
        .returning(WebAuthnChallenge)
    )
    db.commit()
    if pending is None or pending.expires_at <= datetime.now(UTC):
        raise PasskeyVerificationError("Unknown, expired or already used challenge")
    return pending
