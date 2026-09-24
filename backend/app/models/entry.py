import datetime as dt
from decimal import Decimal

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.month import Month
from app.models.spending_plan import Bucket
from app.models.user import User

DESCRIPTION_MAX_LENGTH = 255


class Entry(Base):
    """An expense or allocation in one of a month's buckets, e.g. the rent in Fixed
    costs or a transfer to an investment account in Investments. Its date falls
    within its month."""

    __tablename__ = "entries"
    __table_args__ = (CheckConstraint("amount > 0", name="amount"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    month_id: Mapped[int] = mapped_column(
        ForeignKey("months.id", ondelete="CASCADE"), index=True
    )
    # Stored as the enum's values in a VARCHAR; a native Postgres enum type would need
    # its own migration steps.
    bucket: Mapped[Bucket] = mapped_column(
        Enum(
            Bucket,
            native_enum=False,
            length=16,
            values_callable=lambda buckets: [bucket.value for bucket in buckets],
        )
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    date: Mapped[dt.date]
    description: Mapped[str] = mapped_column(
        String(DESCRIPTION_MAX_LENGTH), default="", server_default=""
    )
    created_at: Mapped[dt.datetime] = mapped_column(server_default=func.now())

    user: Mapped[User] = relationship()
    month: Mapped[Month] = relationship()
