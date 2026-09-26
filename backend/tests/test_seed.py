import datetime as dt

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.month import Month
from app.models.spending_plan import Bucket
from app.models.user import User
from app.schemas.entry import EntryCreate, EntryRead
from app.schemas.month import MonthRead
from app.scripts import seed
from app.scripts.seed import (
    EXAMPLE_MONTHS,
    AccountNotFoundError,
    CalendarMonth,
    SeedReport,
    example_calendar_months,
    parse_arguments,
    seed_account,
)
from app.services.entries import create_entry
from tests.accounts import EMAIL, OTHER_EMAIL
from tests.months import SEPTEMBER, SEPTEMBER_PATH, create_month

TODAY = dt.date(2026, 9, 26)
JULY = CalendarMonth(2026, 7)
AUGUST = CalendarMonth(2026, 8)
SEPTEMBER_2026 = CalendarMonth(2026, 9)


def list_months(client: TestClient, headers: dict[str, str]) -> list[MonthRead]:
    response = client.get("/api/v1/months", headers=headers)
    assert response.status_code == 200, response.text
    return [MonthRead.model_validate(month) for month in response.json()]


def list_entries(
    client: TestClient, headers: dict[str, str], calendar_month: CalendarMonth
) -> list[EntryRead]:
    response = client.get(
        f"/api/v1/months/{calendar_month.year}/{calendar_month.month}/entries",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return [EntryRead.model_validate(entry) for entry in response.json()]


def list_entry_descriptions(
    client: TestClient, headers: dict[str, str], calendar_month: CalendarMonth
) -> list[str]:
    """The descriptions of the month's entries, sorted."""
    return sorted(
        entry.description for entry in list_entries(client, headers, calendar_month)
    )


@pytest.fixture
def use_test_session(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    """Make `seed.main` use the test's `db` session instead of opening its own."""
    monkeypatch.setattr(seed, "get_sessionmaker", lambda: lambda: db)


class InterruptedSeedError(Exception):
    """Stands in for anything that stops the seed partway through a month."""


@pytest.fixture
def second_entry_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make the seed's second entry raise `InterruptedSeedError`, after the first one
    and its month were added."""
    added_entries: list[Entry] = []

    def create_entry_failing_the_second_time(
        db: Session,
        user: User,
        month: Month,
        new_entry: EntryCreate,
        *,
        commit: bool = True,
    ) -> Entry:
        if added_entries:
            raise InterruptedSeedError
        added_entry = create_entry(db, user, month, new_entry, commit=commit)
        added_entries.append(added_entry)
        return added_entry

    monkeypatch.setattr(seed, "create_entry", create_entry_failing_the_second_time)


def test_example_calendar_months_are_the_current_month_and_the_two_before_it() -> None:
    calendar_months = example_calendar_months(TODAY)

    assert calendar_months == [JULY, AUGUST, SEPTEMBER_2026]


def test_example_calendar_months_in_january_reach_back_into_the_previous_year() -> None:
    calendar_months = example_calendar_months(dt.date(2027, 1, 15))

    assert calendar_months == [
        CalendarMonth(2026, 11),
        CalendarMonth(2026, 12),
        CalendarMonth(2027, 1),
    ]


def test_seed_account_adds_the_example_months(
    client: TestClient, db: Session, signed_in_headers: dict[str, str]
) -> None:
    seed_account(db, EMAIL, TODAY)

    assert [
        (month.year, month.month) for month in list_months(client, signed_in_headers)
    ] == [(2026, 9), (2026, 8), (2026, 7)]


def test_seed_account_sets_each_months_example_income(
    client: TestClient, db: Session, signed_in_headers: dict[str, str]
) -> None:
    seed_account(db, EMAIL, TODAY)

    assert [month.income for month in list_months(client, signed_in_headers)] == [
        example_month.income for example_month in reversed(EXAMPLE_MONTHS)
    ]


def test_seed_account_adds_each_months_example_entries(
    client: TestClient, db: Session, signed_in_headers: dict[str, str]
) -> None:
    seed_account(db, EMAIL, TODAY)

    assert [
        list_entry_descriptions(client, signed_in_headers, calendar_month)
        for calendar_month in (JULY, AUGUST, SEPTEMBER_2026)
    ] == [
        sorted(example_entry.description for example_entry in example_month.entries)
        for example_month in EXAMPLE_MONTHS
    ]


def test_seed_account_adds_entries_in_every_bucket_to_each_month(
    client: TestClient, db: Session, signed_in_headers: dict[str, str]
) -> None:
    seed_account(db, EMAIL, TODAY)

    assert [
        {
            entry.bucket
            for entry in list_entries(client, signed_in_headers, calendar_month)
        }
        for calendar_month in (JULY, AUGUST, SEPTEMBER_2026)
    ] == [set(Bucket)] * 3


def test_seed_account_leaves_out_current_month_entries_dated_after_today(
    client: TestClient, db: Session, signed_in_headers: dict[str, str]
) -> None:
    seed_account(db, EMAIL, dt.date(2026, 9, 2))

    assert max(
        entry.date for entry in list_entries(client, signed_in_headers, SEPTEMBER_2026)
    ) == dt.date(2026, 9, 2)


def test_seed_account_early_in_the_month_adds_all_of_the_previous_months_entries(
    client: TestClient, db: Session, signed_in_headers: dict[str, str]
) -> None:
    seed_account(db, EMAIL, dt.date(2026, 9, 2))

    assert list_entry_descriptions(client, signed_in_headers, AUGUST) == sorted(
        example_entry.description for example_entry in EXAMPLE_MONTHS[1].entries
    )


def test_seed_account_reports_the_months_it_added(
    db: Session, signed_in_headers: dict[str, str]
) -> None:
    seed_report = seed_account(db, EMAIL, TODAY)

    assert seed_report == SeedReport(added_months=[JULY, AUGUST, SEPTEMBER_2026])


def test_seed_account_leaves_a_month_the_account_already_has_without_entries(
    client: TestClient, db: Session, signed_in_headers: dict[str, str]
) -> None:
    create_month(client, signed_in_headers, SEPTEMBER)

    seed_account(db, EMAIL, TODAY)

    assert list_entry_descriptions(client, signed_in_headers, SEPTEMBER_2026) == []


def test_seed_account_keeps_the_income_of_a_month_the_account_already_has(
    client: TestClient, db: Session, signed_in_headers: dict[str, str]
) -> None:
    create_month(client, signed_in_headers, SEPTEMBER)

    seed_account(db, EMAIL, TODAY)

    response = client.get(SEPTEMBER_PATH, headers=signed_in_headers)
    assert MonthRead.model_validate(response.json()).income == SEPTEMBER.income


def test_seed_account_reports_a_month_the_account_already_has_as_skipped(
    client: TestClient, db: Session, signed_in_headers: dict[str, str]
) -> None:
    create_month(client, signed_in_headers, SEPTEMBER)

    seed_report = seed_account(db, EMAIL, TODAY)

    assert seed_report == SeedReport(
        added_months=[JULY, AUGUST], skipped_months=[SEPTEMBER_2026]
    )


def test_seed_account_run_twice_skips_every_month_the_second_time(
    db: Session, signed_in_headers: dict[str, str]
) -> None:
    seed_account(db, EMAIL, TODAY)

    seed_report = seed_account(db, EMAIL, TODAY)

    assert seed_report == SeedReport(skipped_months=[JULY, AUGUST, SEPTEMBER_2026])


def test_seed_account_leaves_other_accounts_without_months(
    client: TestClient,
    db: Session,
    signed_in_headers: dict[str, str],
    other_user_headers: dict[str, str],
) -> None:
    seed_account(db, EMAIL, TODAY)

    assert list_months(client, other_user_headers) == []


def test_seed_account_interrupted_partway_through_a_month_leaves_the_month_out(
    client: TestClient,
    db: Session,
    signed_in_headers: dict[str, str],
    second_entry_fails: None,
) -> None:
    with pytest.raises(InterruptedSeedError):
        seed_account(db, EMAIL, TODAY)

    assert list_months(client, signed_in_headers) == []


def test_seed_account_for_an_unregistered_email_raises_account_not_found(
    db: Session, signed_in_headers: dict[str, str]
) -> None:
    with pytest.raises(AccountNotFoundError):
        seed_account(db, OTHER_EMAIL, TODAY)


def test_parse_arguments_lowercases_the_email() -> None:
    seed_arguments = parse_arguments(["--email", "Ada@Example.com"])

    assert seed_arguments.email == EMAIL


@pytest.mark.parametrize(
    "argv",
    [[], ["--email", "not-an-email"]],
    ids=["missing email", "invalid email"],
)
def test_parse_arguments_without_a_valid_email_exits_with_status_2(
    argv: list[str],
) -> None:
    with pytest.raises(SystemExit) as raised_exit:
        parse_arguments(argv)

    assert raised_exit.value.code == 2


def test_main_for_a_registered_email_exits_with_status_0(
    use_test_session: None, signed_in_headers: dict[str, str]
) -> None:
    exit_status = seed.main(["--email", EMAIL])

    assert exit_status == 0


def test_main_for_an_unregistered_email_exits_with_status_1(
    use_test_session: None, signed_in_headers: dict[str, str]
) -> None:
    exit_status = seed.main(["--email", OTHER_EMAIL])

    assert exit_status == 1
