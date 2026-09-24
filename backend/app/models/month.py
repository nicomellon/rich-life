from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.spending_plan import percentage_check_constraints
from app.models.user import User


class Month(Base):
    """A month the user budgets: its income and the share of it, in percent, that
    each bucket targets. The percentages are copied from the spending plan when the
    month is created, so later changes to the plan leave the month unchanged."""

    __tablename__ = "months"
    __table_args__ = (
        UniqueConstraint("user_id", "year", "month"),
        CheckConstraint("month >= 1 AND month <= 12", name="month"),
        CheckConstraint("income >= 0", name="income"),
        *percentage_check_constraints(),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # No index of its own: the unique constraint on (user_id, year, month) covers
    # lookups by user.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    year: Mapped[int]
    month: Mapped[int]
    income: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    fixed_costs_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    investments_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    savings_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    guilt_free_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped[User] = relationship()
