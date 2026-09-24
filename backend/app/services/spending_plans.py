from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.spending_plan import SpendingPlan
from app.models.user import User


def get_or_create_plan(db: Session, user: User) -> SpendingPlan:
    """The user's plan. Registration creates it, but if the row is missing anyway (e.g.
    deleted by hand), create the default plan rather than fail."""
    saved_plan = db.get(SpendingPlan, user.id)
    if saved_plan is not None:
        return saved_plan
    # The column defaults fill in the percentages. DO NOTHING lets two requests race
    # to create the plan without either failing.
    db.execute(insert(SpendingPlan).values(user_id=user.id).on_conflict_do_nothing())
    db.commit()
    return db.get_one(SpendingPlan, user.id)
