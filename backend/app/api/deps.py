from datetime import MAXYEAR, MINYEAR
from typing import Annotated

from fastapi import Depends, Path
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis import Redis
from sqlalchemy.orm import Session

from app.api.errors import ENTRY_NOT_FOUND, MONTH_NOT_FOUND, NOT_AUTHENTICATED, ApiError
from app.core.security import decode_access_token
from app.db.redis import get_redis
from app.db.session import get_db
from app.models.entry import Entry
from app.models.month import Month
from app.models.user import User
from app.services import entries, months
from app.services.email import EmailSender, get_email_sender

# Shared dependencies for route handlers, e.g. `def list_months(db: DbSession) -> ...`.
DbSession = Annotated[Session, Depends(get_db)]

# auto_error=False so a missing header gets the same 401 as a bad token (HTTPBearer's
# own error is a 403).
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    """The user the request's bearer token belongs to. Responds 401 if the token is
    missing, invalid or expired, or its user no longer exists."""
    if credentials is None:
        raise ApiError(NOT_AUTHENTICATED)
    return _user_for_token(db, credentials.credentials)


def get_optional_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User | None:
    """The signed-in user, or None for a request without a bearer token. A token that
    is sent but invalid or expired still responds 401, rather than being treated as
    signed out."""
    if credentials is None:
        return None
    return _user_for_token(db, credentials.credentials)


def _user_for_token(db: Session, access_token: str) -> User:
    claims = decode_access_token(access_token)
    if claims is None:
        raise ApiError(NOT_AUTHENTICATED)
    user = db.get(User, claims.user_id)
    if user is None:
        raise ApiError(NOT_AUTHENTICATED)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
RedisClient = Annotated[Redis, Depends(get_redis)]
ConfiguredEmailSender = Annotated[EmailSender, Depends(get_email_sender)]


def get_requested_month(
    year: Annotated[int, Path(ge=MINYEAR, le=MAXYEAR)],
    month: Annotated[int, Path(ge=1, le=12)],
    user: CurrentUser,
    db: DbSession,
) -> Month:
    """The signed-in user's month from the path. Responds 404 if they don't have it."""
    requested_month = months.find_month(db, user, year, month)
    if requested_month is None:
        raise ApiError(MONTH_NOT_FOUND)
    return requested_month


RequestedMonth = Annotated[Month, Depends(get_requested_month)]

# The largest id a Postgres INTEGER column holds: a larger one would fail the query
# instead of finding nothing.
MAX_ID = 2**31 - 1


def get_requested_entry(
    entry_id: Annotated[int, Path(ge=1, le=MAX_ID)], user: CurrentUser, db: DbSession
) -> Entry:
    """The signed-in user's entry from the path. Responds 404 if they don't have it,
    including when it belongs to another user."""
    requested_entry = entries.find_entry(db, user, entry_id)
    if requested_entry is None:
        raise ApiError(ENTRY_NOT_FOUND)
    return requested_entry


RequestedEntry = Annotated[Entry, Depends(get_requested_entry)]
