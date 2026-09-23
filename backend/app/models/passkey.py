import enum
from datetime import datetime

from sqlalchemy import BigInteger, Enum, ForeignKey, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class Passkey(Base):
    """A WebAuthn credential registered by a user. A user can have several, e.g. one per device or password manager."""

    __tablename__ = "passkeys"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Chosen by the authenticator; the browser sends it back on every sign-in.
    credential_id: Mapped[bytes] = mapped_column(LargeBinary(1023), unique=True)
    # COSE-encoded public key that verifies the credential's signatures.
    public_key: Mapped[bytes] = mapped_column(LargeBinary)
    # Unsigned 32-bit counter kept by the authenticator (0 for synced passkeys, which don't count).
    sign_count: Mapped[int] = mapped_column(BigInteger)
    # How the browser can reach the authenticator (e.g. internal, hybrid, usb), reported at registration.
    transports: Mapped[list[str]] = mapped_column(ARRAY(String(32)), default=list)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    last_used_at: Mapped[datetime | None]

    user: Mapped[User] = relationship()


class ChallengeKind(enum.StrEnum):
    REGISTRATION = "registration"
    AUTHENTICATION = "authentication"


class WebAuthnChallenge(Base):
    """A challenge issued by a `*-challenge` endpoint. The matching verify endpoint deletes it, so it works once."""

    __tablename__ = "webauthn_challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    challenge: Mapped[bytes] = mapped_column(LargeBinary(64), unique=True)
    # Stored as the enum's values in a VARCHAR; a native Postgres enum type would need its own migration steps.
    kind: Mapped[ChallengeKind] = mapped_column(
        Enum(ChallengeKind, native_enum=False, length=16, values_callable=lambda kinds: [k.value for k in kinds])
    )
    # Registration only: the account to create once the passkey is verified.
    email: Mapped[str | None] = mapped_column(String(320))
    user_handle: Mapped[bytes | None] = mapped_column(LargeBinary(64))
    expires_at: Mapped[datetime]
