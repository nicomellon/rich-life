from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.month import Month
from app.models.user import User
from app.schemas.month import MonthCreate
from app.schemas.spending_plan import SpendingPlanPercentages
from app.services.spending_plans import get_or_create_plan


class MonthAlreadyExistsError(Exception):
    """The user already has a month for that year and month."""


def list_months(db: Session, user: User) -> Sequence[Month]:
    """The user's months, newest first."""
    return db.scalars(
        select(Month)
        .where(Month.user_id == user.id)
        .order_by(Month.year.desc(), Month.month.desc())
    ).all()


def find_month(db: Session, user: User, year: int, month: int) -> Month | None:
    return db.scalars(
        select(Month).where(
            Month.user_id == user.id, Month.year == year, Month.month == month
        )
    ).one_or_none()


def create_month(
    db: Session, user: User, new_month: MonthCreate, *, commit: bool = True
) -> Month:
    """Create the month with the targets of the user's current spending plan. Raises
    `MonthAlreadyExistsError` if the user already has it. With `commit=False` the
    month is left in the open transaction, for the caller to commit along with more
    changes."""
    plan_targets = SpendingPlanPercentages.model_validate(
        get_or_create_plan(db, user, commit=commit)
    )
    # DO NOTHING turns a duplicate, even one created by a concurrent request, into no
    # row returned instead of an error that would abort the transaction.
    created_month = db.scalars(
        insert(Month)
        .values(user_id=user.id, **new_month.model_dump(), **plan_targets.model_dump())
        .on_conflict_do_nothing(index_elements=["user_id", "year", "month"])
        .returning(Month)
    ).one_or_none()
    if created_month is None:
        raise MonthAlreadyExistsError
    if commit:
        db.commit()
    return created_month
