"""Signing in with an emailed link, for users without a passkey on their device. The
link carries a random token; Redis holds only the token's hash, for 15 minutes, and
redeeming the link deletes it, so each link signs in once."""

import hashlib
import secrets
from datetime import timedelta

from redis import Redis
from sqlalchemy import select
from sqlalchemy.orm import Session
from webauthn.helpers import bytes_to_base64url

from app.core.config import get_settings
from app.models.user import User
from app.schemas.user import Email
from app.services.email import EmailMessage

MAGIC_LINK_TTL = timedelta(minutes=15)
TOKEN_BYTES = 32
# The web app's route that redeems the token. The token goes in the fragment, which
# browsers never send to a server, so it stays out of access logs and Referer headers.
SIGN_IN_LINK_PATH = "/sign-in/link"
SIGN_IN_EMAIL_SUBJECT = "Your Rich Life sign-in link"


class InvalidMagicLinkError(Exception):
    """The token is unknown, expired or already used, or its account is gone."""


def find_account_id(db: Session, email: Email) -> int | None:
    """The id of the account with this email, or None if there isn't one."""
    return db.scalar(select(User.id).where(User.email == email))


def create_sign_in_email(redis: Redis, user_id: int, email: Email) -> EmailMessage:
    """Issue a sign-in link for the account and return the email that carries it.
    Earlier links stay valid."""
    token = secrets.token_bytes(TOKEN_BYTES)
    redis.set(_redis_key(token), user_id, ex=MAGIC_LINK_TTL)
    sign_in_link = (
        f"{get_settings().webauthn_origin}{SIGN_IN_LINK_PATH}"
        f"#token={bytes_to_base64url(token)}"
    )
    return EmailMessage(
        to=email,
        subject=SIGN_IN_EMAIL_SUBJECT,
        body=(
            "Use this link to sign in to Rich Life. It works once and expires in 15 "
            f"minutes:\n\n{sign_in_link}\n\n"
            "If you didn't ask for it, you can ignore this email.\n"
        ),
    )


def redeem_magic_link(db: Session, redis: Redis, token: bytes) -> User:
    """Use up the link's token and return its user."""
    # GETDEL reads and deletes in one step, so of two requests racing with the same
    # token only one gets the user.
    stored_user_id = redis.getdel(_redis_key(token))
    if stored_user_id is None:
        raise InvalidMagicLinkError
    user = db.get(User, int(stored_user_id))
    if user is None:
        raise InvalidMagicLinkError
    return user


def _redis_key(token: bytes) -> str:
    return f"magic-link:{hashlib.sha256(token).hexdigest()}"
