from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession, RequestedMonth
from app.api.errors import (
    MONTH_ALREADY_EXISTS,
    MONTH_NOT_FOUND,
    NOT_AUTHENTICATED,
    VALIDATION_FAILED,
    ApiError,
    error_responses,
)
from app.schemas.month import MonthCreate, MonthRead, MonthUpdate
from app.schemas.spending_plan import SpendingPlanPercentages
from app.schemas.summary import MonthSummary
from app.services import entries, months, summary

router = APIRouter(
    prefix="/months",
    tags=["months"],
    responses=error_responses(NOT_AUTHENTICATED),
)


@router.get("", summary="List the months")
def list_months(user: CurrentUser, db: DbSession) -> list[MonthRead]:
    """The user's months, newest first."""
    return [MonthRead.model_validate(month) for month in months.list_months(db, user)]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Start a month",
    responses=error_responses(MONTH_ALREADY_EXISTS, VALIDATION_FAILED),
)
def create_month(new_month: MonthCreate, user: CurrentUser, db: DbSession) -> MonthRead:
    """Its targets are copied from the current spending plan, so later changes to the
    plan leave this month unchanged."""
    try:
        created_month = months.create_month(db, user, new_month)
    except months.MonthAlreadyExistsError:
        raise ApiError(MONTH_ALREADY_EXISTS) from None
    return MonthRead.model_validate(created_month)


@router.get(
    "/{year}/{month}",
    summary="Get a month",
    responses=error_responses(MONTH_NOT_FOUND, VALIDATION_FAILED),
)
def read_month(requested_month: RequestedMonth) -> MonthRead:
    return MonthRead.model_validate(requested_month)


@router.patch(
    "/{year}/{month}",
    summary="Change a month's income",
    responses=error_responses(MONTH_NOT_FOUND, VALIDATION_FAILED),
)
def update_month(
    month_update: MonthUpdate, requested_month: RequestedMonth, db: DbSession
) -> MonthRead:
    requested_month.income = month_update.income
    db.commit()
    return MonthRead.model_validate(requested_month)


@router.put(
    "/{year}/{month}/targets",
    summary="Replace a month's targets",
    responses=error_responses(MONTH_NOT_FOUND, VALIDATION_FAILED),
)
def update_month_targets(
    new_targets: SpendingPlanPercentages,
    requested_month: RequestedMonth,
    db: DbSession,
) -> MonthRead:
    """Takes a percentage for every bucket; they must add up to 100. Only this month
    changes: the spending plan and other months keep their targets."""
    requested_month.fixed_costs_pct = new_targets.fixed_costs_pct
    requested_month.investments_pct = new_targets.investments_pct
    requested_month.savings_pct = new_targets.savings_pct
    requested_month.guilt_free_pct = new_targets.guilt_free_pct
    db.commit()
    return MonthRead.model_validate(requested_month)


@router.get(
    "/{year}/{month}/summary",
    summary="Summarize a month",
    responses=error_responses(MONTH_NOT_FOUND, VALIDATION_FAILED),
)
def read_month_summary(
    requested_month: RequestedMonth, user: CurrentUser, db: DbSession
) -> MonthSummary:
    """Each bucket's target next to what its entries add up to, and the totals.
    Amounts and percentages are rounded to 2 decimal places; `actual_pct` is 0 when
    the income is 0."""
    return summary.summarize_month(
        requested_month.income,
        SpendingPlanPercentages.model_validate(requested_month),
        entries.sum_amounts_by_bucket(db, user, requested_month),
    )


@router.delete(
    "/{year}/{month}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a month",
    responses=error_responses(MONTH_NOT_FOUND, VALIDATION_FAILED),
)
def delete_month(requested_month: RequestedMonth, db: DbSession) -> Response:
    db.delete(requested_month)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
