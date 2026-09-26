from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.spending_plan import SpendingPlan
from app.models.user import User


def get_or_create_plan(db: Session, user: User, *, commit: bool = True) -> SpendingPlan:
    """The user's plan. Registration creates it, but if the row is missing anyway (e.g.
    deleted by hand), create the default plan rather than fail. With `commit=False` a
    created plan is left in the open transaction, for the caller to commit."""
    saved_plan = db.get(SpendingPlan, user.id)
    if saved_plan is not None:
        return saved_plan
    # The column defaults fill in the percentages. DO NOTHING lets two requests race
    # to create the plan without either failing.
    db.execute(insert(SpendingPlan).values(user_id=user.id).on_conflict_do_nothing())
    if commit:
        db.commit()
    return db.get_one(SpendingPlan, user.id)
