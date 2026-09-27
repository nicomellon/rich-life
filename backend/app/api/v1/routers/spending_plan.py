from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.api.errors import NOT_AUTHENTICATED, VALIDATION_FAILED, error_responses
from app.schemas.spending_plan import SpendingPlanPercentages
from app.services.spending_plans import get_or_create_plan

router = APIRouter(
    prefix="/spending-plan",
    tags=["spending plan"],
    responses=error_responses(NOT_AUTHENTICATED),
)


@router.get("", summary="Get the spending plan")
def read_spending_plan(user: CurrentUser, db: DbSession) -> SpendingPlanPercentages:
    return SpendingPlanPercentages.model_validate(get_or_create_plan(db, user))


@router.put(
    "",
    summary="Replace the spending plan",
    responses=error_responses(VALIDATION_FAILED),
)
def update_spending_plan(
    new_plan: SpendingPlanPercentages, user: CurrentUser, db: DbSession
) -> SpendingPlanPercentages:
    """Takes a percentage for every bucket; they must add up to 100."""
    saved_plan = get_or_create_plan(db, user)
    saved_plan.fixed_costs_pct = new_plan.fixed_costs_pct
    saved_plan.investments_pct = new_plan.investments_pct
    saved_plan.savings_pct = new_plan.savings_pct
    saved_plan.guilt_free_pct = new_plan.guilt_free_pct
    db.commit()
    return SpendingPlanPercentages.model_validate(saved_plan)
