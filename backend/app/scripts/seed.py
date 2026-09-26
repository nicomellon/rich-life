"""Add three months of example data to an existing account, so there is something to
look at in the app:

    python -m app.scripts.seed --email you@example.com

Accounts sign in with passkeys, so there is no demo account to share: register one in
the app first, then seed it. The months are the current month and the two before it,
created with the account's current spending plan. Months the account already has are
left untouched, so running the script again adds nothing twice.
"""

import argparse
import calendar
import datetime as dt
import sys
from collections.abc import Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Self

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_sessionmaker
from app.models.spending_plan import Bucket
from app.models.user import User
from app.schemas.entry import EntryCreate
from app.schemas.month import MonthCreate
from app.schemas.user import Email
from app.services.entries import create_entry
from app.services.months import MonthAlreadyExistsError, create_month


@dataclass(frozen=True)
class CalendarMonth:
    year: int
    month: int

    @classmethod
    def containing(cls, day: dt.date) -> Self:
        return cls(day.year, day.month)

    def previous(self) -> Self:
        if self.month == 1:
            return type(self)(self.year - 1, 12)
        return type(self)(self.year, self.month - 1)

    def __str__(self) -> str:
        return f"{calendar.month_name[self.month]} {self.year}"


@dataclass(frozen=True)
class ExampleEntry:
    """An entry without a month: `day` is its day of the month, at most 28 so that it
    exists in every month."""

    bucket: Bucket
    amount: Decimal
    day: int
    description: str

    def in_month(self, calendar_month: CalendarMonth) -> EntryCreate:
        return EntryCreate(
            bucket=self.bucket,
            amount=self.amount,
            date=dt.date(calendar_month.year, calendar_month.month, self.day),
            description=self.description,
        )


@dataclass(frozen=True)
class ExampleMonth:
    income: Decimal
    # Entries that only this month has, on top of `RECURRING_ENTRIES`.
    extra_entries: tuple[ExampleEntry, ...]

    @property
    def entries(self) -> tuple[ExampleEntry, ...]:
        return RECURRING_ENTRIES + self.extra_entries

    def entries_until(
        self, calendar_month: CalendarMonth, today: dt.date
    ) -> list[EntryCreate]:
        """The entries placed in `calendar_month`, leaving out those dated after
        `today`, which the current month can't have had yet."""
        new_entries = (entry.in_month(calendar_month) for entry in self.entries)
        return [new_entry for new_entry in new_entries if new_entry.date <= today]


# Entries every example month has: the bills, and the transfers to investments and
# savings.
RECURRING_ENTRIES = (
    ExampleEntry(Bucket.FIXED_COSTS, Decimal(1100), 1, "Rent"),
    ExampleEntry(Bucket.FIXED_COSTS, Decimal(40), 2, "Transport pass"),
    ExampleEntry(Bucket.FIXED_COSTS, Decimal(85), 5, "Electricity and water"),
    ExampleEntry(Bucket.FIXED_COSTS, Decimal(45), 8, "Phone and internet"),
    ExampleEntry(Bucket.INVESTMENTS, Decimal(300), 3, "Index fund"),
    ExampleEntry(Bucket.SAVINGS, Decimal(400), 3, "Emergency fund"),
    ExampleEntry(Bucket.SAVINGS, Decimal(150), 15, "Holiday fund"),
)

# Oldest first: the month two before the current one, the one before, and the current
# one.
EXAMPLE_MONTHS = (
    ExampleMonth(
        income=Decimal(3000),
        extra_entries=(
            ExampleEntry(Bucket.FIXED_COSTS, Decimal("128.40"), 7, "Groceries"),
            ExampleEntry(Bucket.FIXED_COSTS, Decimal("142.15"), 21, "Groceries"),
            ExampleEntry(Bucket.GUILT_FREE, Decimal("68.50"), 12, "Dinner out"),
            ExampleEntry(Bucket.GUILT_FREE, Decimal(90), 18, "Concert tickets"),
        ),
    ),
    ExampleMonth(
        income=Decimal(3000),
        extra_entries=(
            ExampleEntry(Bucket.FIXED_COSTS, Decimal("119.80"), 6, "Groceries"),
            ExampleEntry(Bucket.FIXED_COSTS, Decimal("136.25"), 20, "Groceries"),
            ExampleEntry(Bucket.GUILT_FREE, Decimal(120), 9, "Running shoes"),
            ExampleEntry(Bucket.GUILT_FREE, Decimal("42.90"), 16, "Books"),
            ExampleEntry(Bucket.GUILT_FREE, Decimal(310), 24, "Weekend away"),
        ),
    ),
    ExampleMonth(
        income=Decimal(3200),
        extra_entries=(
            ExampleEntry(Bucket.FIXED_COSTS, Decimal("131.60"), 4, "Groceries"),
            ExampleEntry(Bucket.GUILT_FREE, Decimal("54.20"), 10, "Dinner out"),
            ExampleEntry(Bucket.GUILT_FREE, Decimal("12.99"), 11, "Film streaming"),
        ),
    ),
)


class AccountNotFoundError(Exception):
    """No account has the email."""

    def __init__(self, email: Email) -> None:
        super().__init__(email)
        self.email = email


@dataclass
class SeedReport:
    """The months the seed added, and the ones it skipped because the account
    already had them."""

    added_months: list[CalendarMonth] = field(default_factory=list)
    skipped_months: list[CalendarMonth] = field(default_factory=list)


def example_calendar_months(today: dt.date) -> list[CalendarMonth]:
    """The month containing `today` and the ones before it, one per example month,
    oldest first."""
    calendar_months = [CalendarMonth.containing(today)]
    while len(calendar_months) < len(EXAMPLE_MONTHS):
        calendar_months.insert(0, calendar_months[0].previous())
    return calendar_months


def seed_account(db: Session, email: Email, today: dt.date) -> SeedReport:
    """Add the example months, with their entries, to the account with `email`,
    skipping those it already has. Each month is committed together with its entries.
    Raises `AccountNotFoundError` if there is no such account."""
    user = db.scalars(select(User).where(User.email == email)).one_or_none()
    if user is None:
        raise AccountNotFoundError(email)
    seed_report = SeedReport()
    for calendar_month, example_month in zip(
        example_calendar_months(today), EXAMPLE_MONTHS, strict=True
    ):
        new_month = MonthCreate(
            year=calendar_month.year,
            month=calendar_month.month,
            income=example_month.income,
        )
        # Each month and its entries are one transaction, so a run that fails partway
        # leaves no half-seeded month behind for later runs to skip.
        try:
            created_month = create_month(db, user, new_month, commit=False)
            for new_entry in example_month.entries_until(calendar_month, today):
                create_entry(db, user, created_month, new_entry, commit=False)
        except MonthAlreadyExistsError:
            db.rollback()
            seed_report.skipped_months.append(calendar_month)
            continue
        except Exception:
            db.rollback()
            raise
        db.commit()
        seed_report.added_months.append(calendar_month)
    return seed_report


class SeedArguments(argparse.Namespace):
    email: Email


def _parse_email(raw_email: str) -> Email:
    try:
        return TypeAdapter(Email).validate_python(raw_email)
    except ValidationError as exc:
        raise argparse.ArgumentTypeError(
            f"{raw_email!r} is not a valid email address"
        ) from exc


def parse_arguments(argv: Sequence[str] | None) -> SeedArguments:
    parser = argparse.ArgumentParser(
        prog="python -m app.scripts.seed",
        description="Add three months of example data to an existing account.",
    )
    parser.add_argument(
        "--email",
        required=True,
        type=_parse_email,
        help="the email of the account to seed; register it in the app first",
    )
    return parser.parse_args(argv, namespace=SeedArguments())


def main(argv: Sequence[str] | None = None) -> int:
    """Run the seed for the command line arguments, returning the exit status."""
    email = parse_arguments(argv).email
    with get_sessionmaker()() as db:
        try:
            seed_report = seed_account(db, email, dt.date.today())
        except AccountNotFoundError:
            print(
                f"No account has the email {email}. Register it in the app first.",
                file=sys.stderr,
            )
            return 1
    for added_month in seed_report.added_months:
        print(f"Added {added_month}.")
    for skipped_month in seed_report.skipped_months:
        print(f"Skipped {skipped_month}: the account already has it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
