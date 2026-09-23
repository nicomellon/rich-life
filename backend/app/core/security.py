from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import get_settings

JWT_ALGORITHM = "HS256"


def create_access_token(subject: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    claims = {"sub": subject, "iat": now, "exp": now + timedelta(minutes=settings.access_token_expire_minutes)}
    return jwt.encode(claims, settings.jwt_secret.get_secret_value(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> str | None:
    """Return the token's subject, or None if the token is malformed, tampered with or expired."""
    try:
        claims = jwt.decode(
            token,
            get_settings().jwt_secret.get_secret_value(),
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp"]},
        )
    except jwt.InvalidTokenError:
        return None
    subject = claims["sub"]
    return subject if isinstance(subject, str) else None
