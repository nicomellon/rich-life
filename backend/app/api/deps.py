from datetime import MAXYEAR, MINYEAR
from typing import Annotated

from fastapi import Depends, HTTPException, Path, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.month import Month
from app.models.user import User
from app.services import months

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
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    claims = decode_access_token(credentials.credentials)
    if claims is None:
        raise unauthorized
    user = db.get(User, claims.user_id)
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_requested_month(
    year: Annotated[int, Path(ge=MINYEAR, le=MAXYEAR)],
    month: Annotated[int, Path(ge=1, le=12)],
    user: CurrentUser,
    db: DbSession,
) -> Month:
    """The signed-in user's month from the path. Responds 404 if they don't have it."""
    requested_month = months.find_month(db, user, year, month)
    if requested_month is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Month not found")
    return requested_month


RequestedMonth = Annotated[Month, Depends(get_requested_month)]
