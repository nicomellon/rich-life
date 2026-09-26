import datetime as dt
from typing import Annotated, TypedDict

from fastapi import APIRouter, Query, Response, status
from fastapi.exceptions import RequestValidationError

from app.api.deps import CurrentUser, DbSession, RequestedEntry, RequestedMonth
from app.models.spending_plan import Bucket
from app.schemas.entry import EntryCreate, EntryRead, EntryUpdate
from app.services import entries

router = APIRouter(tags=["entries"])


class ValidationErrorDetail(TypedDict):
    """One error in a 422 response, shaped like FastAPI's own validation errors."""

    type: str
    loc: tuple[str, ...]
    msg: str
    input: str


def date_outside_month_error(entry_date: dt.date) -> RequestValidationError:
    """A 422 in the same format as FastAPI's own validation errors, pointing at the
    body's date."""
    return RequestValidationError(
        [
            ValidationErrorDetail(
                type="date_outside_month",
                loc=("body", "date"),
                msg="The date must fall within the entry's month",
                input=entry_date.isoformat(),
            )
        ]
    )


@router.get(
    "/months/{year}/{month}/entries",
    summary="List a month's entries",
    responses={status.HTTP_404_NOT_FOUND: {"description": "Month not found"}},
)
def list_entries(
    requested_month: RequestedMonth,
    user: CurrentUser,
    db: DbSession,
    bucket: Annotated[Bucket | None, Query()] = None,
) -> list[EntryRead]:
    """Newest first. Pass `bucket` to list only that bucket's entries."""
    return [
        EntryRead.model_validate(entry)
        for entry in entries.list_entries(db, user, requested_month, bucket)
    ]


@router.post(
    "/months/{year}/{month}/entries",
    status_code=status.HTTP_201_CREATED,
    summary="Add an entry to a month",
    responses={status.HTTP_404_NOT_FOUND: {"description": "Month not found"}},
)
def create_entry(
    new_entry: EntryCreate,
    requested_month: RequestedMonth,
    user: CurrentUser,
    db: DbSession,
) -> EntryRead:
    """The entry's date must fall within the month."""
    try:
        created_entry = entries.create_entry(db, user, requested_month, new_entry)
    except entries.DateOutsideMonthError as error:
        raise date_outside_month_error(error.entry_date) from None
    return EntryRead.model_validate(created_entry)


@router.patch(
    "/entries/{entry_id}",
    summary="Change an entry",
    responses={status.HTTP_404_NOT_FOUND: {"description": "Entry not found"}},
)
def update_entry(
    entry_update: EntryUpdate, requested_entry: RequestedEntry, db: DbSession
) -> EntryRead:
    """Changes only the fields sent. A new date must still fall within the entry's
    month."""
    try:
        updated_entry = entries.update_entry(db, requested_entry, entry_update)
    except entries.DateOutsideMonthError as error:
        raise date_outside_month_error(error.entry_date) from None
    return EntryRead.model_validate(updated_entry)


@router.delete(
    "/entries/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an entry",
    responses={status.HTTP_404_NOT_FOUND: {"description": "Entry not found"}},
)
def delete_entry(requested_entry: RequestedEntry, db: DbSession) -> Response:
    db.delete(requested_entry)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
