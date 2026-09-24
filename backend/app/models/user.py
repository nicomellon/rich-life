from datetime import datetime

from sqlalchemy import LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

DEFAULT_CURRENCY = "EUR"


class User(Base):
    """An account. There is no password: users sign in with a passkey (see `Passkey`)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Stored lowercased (see app.schemas.user), so the unique index also rejects case variants.
    email: Mapped[str] = mapped_column(String(320), unique=True)
    # Random, opaque id given to authenticators as the WebAuthn user.id, so they never see the email
    # or row id. Passkeys return it on sign-in as the userHandle.
    webauthn_user_handle: Mapped[bytes] = mapped_column(LargeBinary(64), unique=True)
    # ISO 4217 code; every amount the user enters is in this currency.
    currency: Mapped[str] = mapped_column(
        String(3), default=DEFAULT_CURRENCY, server_default=DEFAULT_CURRENCY
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
