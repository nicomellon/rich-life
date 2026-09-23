from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.user import User

# Verified against when the email is unknown, so a login takes as long whether or not the account exists.
_DUMMY_HASH = hash_password("not-a-real-password")


class EmailAlreadyRegisteredError(Exception):
    pass


def create_user(db: Session, *, email: str, password: str) -> User:
    user = User(email=email, password_hash=hash_password(password))
    db.add(user)
    try:
        # The unique index on email is the source of truth, so two concurrent sign-ups can't both succeed.
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise EmailAlreadyRegisteredError(email) from exc
    return user


def authenticate(db: Session, *, email: str, password: str) -> User | None:
    """Return the user with these credentials, or None if the email is unknown or the password is wrong."""
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        verify_password(password, _DUMMY_HASH)
        return None

    valid, updated_hash = verify_password(password, user.password_hash)
    if not valid:
        return None
    if updated_hash is not None:
        user.password_hash = updated_hash
        db.commit()
    return user
