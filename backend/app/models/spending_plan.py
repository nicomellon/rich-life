import enum
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class Bucket(enum.StrEnum):
    """The four parts every month's income is split into. They are the same for every
    user, so they're columns of `SpendingPlan` rather than rows of their own."""

    FIXED_COSTS = "fixed_costs"
    INVESTMENTS = "investments"
    SAVINGS = "savings"
    GUILT_FREE = "guilt_free"


def _percentage_column(default_pct: int) -> Mapped[Decimal]:
    return mapped_column(
        Numeric(5, 2), default=Decimal(default_pct), server_default=str(default_pct)
    )


def percentage_check_constraints() -> tuple[CheckConstraint, ...]:
    """Check constraints for a table with a `<bucket>_pct` column per bucket: each is
    between 0 and 100, and together they add up to 100."""
    return (
        *(
            CheckConstraint(
                f"{bucket}_pct >= 0 AND {bucket}_pct <= 100", name=f"{bucket}_pct"
            )
            for bucket in Bucket
        ),
        CheckConstraint(
            "fixed_costs_pct + investments_pct + savings_pct + guilt_free_pct = 100",
            name="total_pct",
        ),
    )


class SpendingPlan(Base):
    """A user's default plan: the share of each month's income, in percent, that each
    bucket targets. Every user has one, created when they register."""

    __tablename__ = "spending_plans"
    __table_args__ = percentage_check_constraints()

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    fixed_costs_pct: Mapped[Decimal] = _percentage_column(50)
    investments_pct: Mapped[Decimal] = _percentage_column(10)
    savings_pct: Mapped[Decimal] = _percentage_column(20)
    guilt_free_pct: Mapped[Decimal] = _percentage_column(20)

    user: Mapped[User] = relationship()
