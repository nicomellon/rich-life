from datetime import datetime

from sqlalchemy import String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

DEFAULT_CURRENCY = "EUR"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Stored lowercased (see app.schemas.user), so the unique index also rejects case variants.
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # ISO 4217 code; every amount the user enters is in this currency.
    currency: Mapped[str] = mapped_column(String(3), default=DEFAULT_CURRENCY, server_default=DEFAULT_CURRENCY)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
