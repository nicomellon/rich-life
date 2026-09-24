from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from pydantic import BaseModel, Field, ValidationError

from app.core.config import get_settings

JWT_ALGORITHM = "HS256"


class AccessTokenClaims(BaseModel):
    """The claims of an access token. JWT subjects are strings, so the user id travels as its
    decimal string."""

    sub: Annotated[str, Field(pattern=r"^[0-9]+$")]
    iat: datetime
    exp: datetime

    @property
    def user_id(self) -> int:
        return int(self.sub)


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    issued_at = datetime.now(UTC)
    claims = AccessTokenClaims(
        sub=str(user_id),
        iat=issued_at,
        exp=issued_at + timedelta(minutes=settings.access_token_expire_minutes),
    )
    return jwt.encode(
        claims.model_dump(),
        settings.jwt_secret.get_secret_value(),
        algorithm=JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> AccessTokenClaims | None:
    """Return the token's claims, or None if the token is malformed, tampered with or expired."""
    try:
        return AccessTokenClaims.model_validate(
            jwt.decode(
                token,
                get_settings().jwt_secret.get_secret_value(),
                algorithms=[JWT_ALGORITHM],
                options={"require": ["sub", "iat", "exp"]},
            )
        )
    except (jwt.InvalidTokenError, ValidationError):
        return None
