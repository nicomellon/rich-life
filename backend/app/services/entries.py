import datetime as dt
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.month import Month
from app.models.spending_plan import Bucket
from app.models.user import User
from app.schemas.entry import EntryCreate, EntryUpdate


class DateOutsideMonthError(Exception):
    """An entry's date doesn't fall within its month."""

    def __init__(self, entry_date: dt.date) -> None:
        super().__init__(entry_date)
        self.entry_date = entry_date


def _check_date_is_within(month: Month, entry_date: dt.date) -> None:
    if (entry_date.year, entry_date.month) != (month.year, month.month):
        raise DateOutsideMonthError(entry_date)


def list_entries(
    db: Session, user: User, month: Month, bucket: Bucket | None = None
) -> Sequence[Entry]:
    """The month's entries, newest first (by date, then the most recently added), only
    those in `bucket` if one is given."""
    query = select(Entry).where(Entry.user_id == user.id, Entry.month_id == month.id)
    if bucket is not None:
        query = query.where(Entry.bucket == bucket)
    return db.scalars(query.order_by(Entry.date.desc(), Entry.id.desc())).all()


def find_entry(db: Session, user: User, entry_id: int) -> Entry | None:
    return db.scalars(
        select(Entry).where(Entry.id == entry_id, Entry.user_id == user.id)
    ).one_or_none()


def create_entry(
    db: Session, user: User, month: Month, new_entry: EntryCreate
) -> Entry:
    """Add the entry to the month. Raises `DateOutsideMonthError` if its date falls
    outside the month."""
    _check_date_is_within(month, new_entry.date)
    created_entry = Entry(user_id=user.id, month_id=month.id, **new_entry.model_dump())
    db.add(created_entry)
    db.commit()
    # Read the saved row back, so the amount has the database's two decimal places.
    db.refresh(created_entry)
    return created_entry


def update_entry(db: Session, entry: Entry, entry_update: EntryUpdate) -> Entry:
    """Change the fields the update sets. Raises `DateOutsideMonthError` if the new
    date falls outside the entry's month."""
    if entry_update.date is not None:
        _check_date_is_within(entry.month, entry_update.date)
        entry.date = entry_update.date
    if entry_update.bucket is not None:
        entry.bucket = entry_update.bucket
    if entry_update.amount is not None:
        entry.amount = entry_update.amount
    if entry_update.description is not None:
        entry.description = entry_update.description
    db.commit()
    db.refresh(entry)
    return entry
