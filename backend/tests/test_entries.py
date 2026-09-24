import datetime as dt
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.spending_plan import Bucket
from app.models.user import User
from app.schemas.entry import EntryCreate, EntryRead, EntryUpdate
from app.schemas.month import MonthRead
from tests.accounts import EMAIL
from tests.months import OCTOBER, SEPTEMBER_PATH, create_month, send_json

SEPTEMBER_ENTRIES_PATH = f"{SEPTEMBER_PATH}/entries"
# The first day after September, which entries in September can't have.
OCTOBER_FIRST = dt.date(2026, 10, 1)
RENT = EntryCreate(
    bucket=Bucket.FIXED_COSTS,
    amount=Decimal(1200),
    date=dt.date(2026, 9, 1),
    description="Rent",
)
ETF = EntryCreate(
    bucket=Bucket.INVESTMENTS,
    amount=Decimal(300),
    date=dt.date(2026, 9, 5),
    description="ETF",
)
DINNER = EntryCreate(
    bucket=Bucket.GUILT_FREE,
    amount=Decimal("45.50"),
    date=dt.date(2026, 9, 12),
    description="Dinner out",
)


class ValidationErrorDetail(BaseModel):
    type: str
    loc: list[str]


class ValidationErrorBody(BaseModel):
    detail: list[ValidationErrorDetail]


def entry_path(entry: EntryRead) -> str:
    return f"/api/v1/entries/{entry.id}"


def post_entry(
    client: TestClient,
    headers: dict[str, str],
    new_entry: EntryCreate,
    path: str = SEPTEMBER_ENTRIES_PATH,
) -> Response:
    return send_json(client, "POST", path, headers, new_entry)


def create_entry(
    client: TestClient,
    headers: dict[str, str],
    new_entry: EntryCreate = RENT,
    path: str = SEPTEMBER_ENTRIES_PATH,
) -> EntryRead:
    """Add the entry to the month at `path` (September by default), failing the test
    unless the API accepts it."""
    response = post_entry(client, headers, new_entry, path)
    assert response.status_code == 201, response.text
    return EntryRead.model_validate(response.json())


def patch_entry(
    client: TestClient,
    headers: dict[str, str],
    entry: EntryRead,
    entry_update: EntryUpdate,
) -> Response:
    """Send only the fields `entry_update` sets, so the others keep their value."""
    return client.patch(
        entry_path(entry),
        content=entry_update.model_dump_json(exclude_unset=True),
        headers={**headers, "Content-Type": "application/json"},
    )


def list_entries(
    client: TestClient, headers: dict[str, str], query: str = ""
) -> list[EntryRead]:
    response = client.get(f"{SEPTEMBER_ENTRIES_PATH}{query}", headers=headers)
    assert response.status_code == 200, response.text
    return [EntryRead.model_validate(entry) for entry in response.json()]


def descriptions(listed_entries: list[EntryRead]) -> list[str]:
    return [entry.description for entry in listed_entries]


@pytest.fixture
def september(client: TestClient, signed_in_headers: dict[str, str]) -> MonthRead:
    """September 2026, created by the signed-in user."""
    return create_month(client, signed_in_headers)


@pytest.fixture
def rent(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> EntryRead:
    """The signed-in user's rent, an entry in September's fixed costs."""
    return create_entry(client, signed_in_headers, RENT)


# Authentication


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", SEPTEMBER_ENTRIES_PATH),
        ("POST", SEPTEMBER_ENTRIES_PATH),
        ("PATCH", "/api/v1/entries/1"),
        ("DELETE", "/api/v1/entries/1"),
    ],
    ids=["list", "create", "update", "delete"],
)
def test_entries_without_a_token_returns_401(
    client: TestClient, method: str, path: str
) -> None:
    response = client.request(method, path)

    assert response.status_code == 401


# Adding an entry


def test_create_entry_returns_201(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    response = post_entry(client, signed_in_headers, RENT)

    assert response.status_code == 201


def test_create_entry_returns_the_entry(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    created_entry = create_entry(client, signed_in_headers, RENT)

    assert (
        EntryCreate.model_validate(
            created_entry.model_dump(exclude={"id", "created_at"})
        )
        == RENT
    )


def test_create_entry_returns_the_amount_as_a_decimal_string(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    response = post_entry(client, signed_in_headers, RENT)

    assert '"amount":"1200.00"' in response.text


def test_create_entry_without_a_description_saves_an_empty_one(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    created_entry = create_entry(
        client,
        signed_in_headers,
        EntryCreate(
            bucket=Bucket.SAVINGS, amount=Decimal(600), date=dt.date(2026, 9, 30)
        ),
    )

    assert created_entry.description == ""


@pytest.mark.parametrize(
    "entry_date",
    [dt.date(2026, 8, 31), dt.date(2026, 10, 1), dt.date(2025, 9, 15)],
    ids=["day-before-the-month", "day-after-the-month", "same-month-another-year"],
)
def test_create_entry_dated_outside_its_month_returns_422(
    client: TestClient,
    signed_in_headers: dict[str, str],
    september: MonthRead,
    entry_date: dt.date,
) -> None:
    response = post_entry(
        client, signed_in_headers, RENT.model_copy(update={"date": entry_date})
    )

    assert response.status_code == 422


def test_create_entry_dated_outside_its_month_points_at_the_date(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    response = post_entry(
        client, signed_in_headers, RENT.model_copy(update={"date": OCTOBER_FIRST})
    )

    assert ValidationErrorBody.model_validate(response.json()) == ValidationErrorBody(
        detail=[ValidationErrorDetail(type="date_outside_month", loc=["body", "date"])]
    )


def entry_body(bucket: str, amount: str, date: str) -> dict[str, str]:
    return {"bucket": bucket, "amount": amount, "date": date}


@pytest.mark.parametrize(
    "invalid_entry_body",
    [
        entry_body("fixed_costs", "0", "2026-09-01"),
        entry_body("fixed_costs", "-1", "2026-09-01"),
        entry_body("fixed_costs", "1.005", "2026-09-01"),
        entry_body("fixed_costs", "10000000000", "2026-09-01"),
        entry_body("groceries", "1", "2026-09-01"),
        entry_body("fixed_costs", "1", "2026-09-31"),
        {"amount": "1", "date": "2026-09-01"},
        {**entry_body("fixed_costs", "1", "2026-09-01"), "description": "x" * 256},
        {**entry_body("fixed_costs", "1", "2026-09-01"), "month_id": 1},
    ],
    ids=[
        "zero-amount",
        "negative-amount",
        "amount-3-decimals",
        "amount-too-large",
        "unknown-bucket",
        "invalid-date",
        "missing-bucket",
        "description-too-long",
        "unknown-field",
    ],
)
def test_create_entry_with_an_invalid_body_returns_422(
    client: TestClient,
    signed_in_headers: dict[str, str],
    september: MonthRead,
    invalid_entry_body: dict[str, str | int],
) -> None:
    response = client.post(
        SEPTEMBER_ENTRIES_PATH, json=invalid_entry_body, headers=signed_in_headers
    )

    assert response.status_code == 422


@pytest.mark.parametrize("method", ["GET", "POST"], ids=["list", "create"])
def test_entries_of_a_month_that_does_not_exist_returns_404(
    client: TestClient, signed_in_headers: dict[str, str], method: str
) -> None:
    response = client.request(
        method,
        SEPTEMBER_ENTRIES_PATH,
        content=RENT.model_dump_json(),
        headers={**signed_in_headers, "Content-Type": "application/json"},
    )

    assert (response.status_code, response.json()) == (
        404,
        {"detail": "Month not found"},
    )


def test_create_entry_in_another_users_month_returns_404(
    client: TestClient, september: MonthRead, other_user_headers: dict[str, str]
) -> None:
    response = post_entry(client, other_user_headers, RENT)

    assert response.status_code == 404


# Listing a month's entries


def test_list_entries_without_entries_returns_an_empty_list(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    listed_entries = list_entries(client, signed_in_headers)

    assert listed_entries == []


def test_list_entries_returns_the_entries_newest_first(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    for new_entry in [ETF, DINNER, RENT]:
        create_entry(client, signed_in_headers, new_entry)

    listed_entries = list_entries(client, signed_in_headers)

    assert descriptions(listed_entries) == ["Dinner out", "ETF", "Rent"]


def test_list_entries_on_the_same_date_returns_the_most_recently_added_first(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    for description in ["Coffee", "Lunch"]:
        create_entry(
            client,
            signed_in_headers,
            DINNER.model_copy(update={"description": description}),
        )

    listed_entries = list_entries(client, signed_in_headers)

    assert descriptions(listed_entries) == ["Lunch", "Coffee"]


def test_list_entries_by_bucket_returns_only_that_buckets_entries(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    for new_entry in [RENT, ETF, DINNER]:
        create_entry(client, signed_in_headers, new_entry)

    listed_entries = list_entries(client, signed_in_headers, "?bucket=investments")

    assert descriptions(listed_entries) == ["ETF"]


def test_list_entries_by_an_unknown_bucket_returns_422(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    response = client.get(
        f"{SEPTEMBER_ENTRIES_PATH}?bucket=groceries", headers=signed_in_headers
    )

    assert response.status_code == 422


def test_list_entries_leaves_out_other_months_entries(
    client: TestClient, signed_in_headers: dict[str, str], rent: EntryRead
) -> None:
    create_month(client, signed_in_headers, OCTOBER)
    create_entry(
        client,
        signed_in_headers,
        RENT.model_copy(update={"date": OCTOBER_FIRST}),
        "/api/v1/months/2026/10/entries",
    )

    listed_entries = list_entries(client, signed_in_headers)

    assert listed_entries == [rent]


def test_list_entries_leaves_out_other_users_entries(
    client: TestClient,
    signed_in_headers: dict[str, str],
    rent: EntryRead,
    other_user_headers: dict[str, str],
) -> None:
    create_month(client, other_user_headers)
    create_entry(client, other_user_headers, ETF)

    listed_entries = list_entries(client, signed_in_headers)

    assert listed_entries == [rent]


def test_list_another_users_entries_returns_404(
    client: TestClient, rent: EntryRead, other_user_headers: dict[str, str]
) -> None:
    response = client.get(SEPTEMBER_ENTRIES_PATH, headers=other_user_headers)

    assert response.status_code == 404


# Changing an entry


def test_patch_entry_returns_the_changed_entry(
    client: TestClient, signed_in_headers: dict[str, str], rent: EntryRead
) -> None:
    response = patch_entry(
        client, signed_in_headers, rent, EntryUpdate(amount=Decimal("1250.50"))
    )

    assert EntryRead.model_validate(response.json()) == rent.model_copy(
        update={"amount": Decimal("1250.50")}
    )


def test_patch_entry_saves_every_field_sent(
    client: TestClient, signed_in_headers: dict[str, str], rent: EntryRead
) -> None:
    patch_entry(
        client,
        signed_in_headers,
        rent,
        EntryUpdate.model_validate(ETF.model_dump()),
    )

    assert list_entries(client, signed_in_headers) == [
        rent.model_copy(update=ETF.model_dump())
    ]


def test_patch_entry_leaves_the_fields_not_sent_unchanged(
    client: TestClient, signed_in_headers: dict[str, str], rent: EntryRead
) -> None:
    patch_entry(client, signed_in_headers, rent, EntryUpdate(description="Flat"))

    assert list_entries(client, signed_in_headers) == [
        rent.model_copy(update={"description": "Flat"})
    ]


def test_patch_entry_returns_the_amount_as_a_decimal_string(
    client: TestClient, signed_in_headers: dict[str, str], rent: EntryRead
) -> None:
    response = patch_entry(
        client, signed_in_headers, rent, EntryUpdate(amount=Decimal("1250.5"))
    )

    assert '"amount":"1250.50"' in response.text


@pytest.mark.parametrize(
    "entry_date",
    [dt.date(2026, 8, 31), dt.date(2026, 10, 1)],
    ids=["day-before-the-month", "day-after-the-month"],
)
def test_patch_entry_dated_outside_its_month_returns_422(
    client: TestClient,
    signed_in_headers: dict[str, str],
    rent: EntryRead,
    entry_date: dt.date,
) -> None:
    response = patch_entry(
        client, signed_in_headers, rent, EntryUpdate(date=entry_date)
    )

    assert response.status_code == 422


def test_patch_entry_dated_outside_its_month_leaves_it_unchanged(
    client: TestClient, signed_in_headers: dict[str, str], rent: EntryRead
) -> None:
    patch_entry(
        client,
        signed_in_headers,
        rent,
        EntryUpdate(amount=Decimal(1), date=OCTOBER_FIRST),
    )

    assert list_entries(client, signed_in_headers) == [rent]


@pytest.mark.parametrize(
    "invalid_update_body",
    [
        {"amount": "0"},
        {"amount": "1.005"},
        {"bucket": "groceries"},
        {"description": "x" * 256},
        {"amount": None},
        {"bucket": None},
        {"date": None},
        {"description": None},
        {"month_id": 2},
    ],
    ids=[
        "zero-amount",
        "amount-3-decimals",
        "unknown-bucket",
        "description-too-long",
        "null-amount",
        "null-bucket",
        "null-date",
        "null-description",
        "unknown-field",
    ],
)
def test_patch_entry_with_an_invalid_body_returns_422(
    client: TestClient,
    signed_in_headers: dict[str, str],
    rent: EntryRead,
    invalid_update_body: dict[str, str | int | None],
) -> None:
    response = client.patch(
        entry_path(rent), json=invalid_update_body, headers=signed_in_headers
    )

    assert response.status_code == 422


def test_patch_another_users_entry_returns_404(
    client: TestClient, rent: EntryRead, other_user_headers: dict[str, str]
) -> None:
    response = patch_entry(
        client, other_user_headers, rent, EntryUpdate(amount=Decimal(1))
    )

    assert (response.status_code, response.json()) == (
        404,
        {"detail": "Entry not found"},
    )


def test_patch_another_users_entry_leaves_it_unchanged(
    client: TestClient,
    signed_in_headers: dict[str, str],
    rent: EntryRead,
    other_user_headers: dict[str, str],
) -> None:
    patch_entry(client, other_user_headers, rent, EntryUpdate(amount=Decimal(1)))

    assert list_entries(client, signed_in_headers) == [rent]


# Deleting an entry


def test_delete_entry_returns_204(
    client: TestClient, signed_in_headers: dict[str, str], rent: EntryRead
) -> None:
    response = client.delete(entry_path(rent), headers=signed_in_headers)

    assert response.status_code == 204


def test_delete_entry_removes_the_entry(
    client: TestClient, signed_in_headers: dict[str, str], rent: EntryRead
) -> None:
    client.delete(entry_path(rent), headers=signed_in_headers)

    assert list_entries(client, signed_in_headers) == []


def test_delete_another_users_entry_returns_404(
    client: TestClient, rent: EntryRead, other_user_headers: dict[str, str]
) -> None:
    response = client.delete(entry_path(rent), headers=other_user_headers)

    assert (response.status_code, response.json()) == (
        404,
        {"detail": "Entry not found"},
    )


def test_delete_another_users_entry_leaves_it_unchanged(
    client: TestClient,
    signed_in_headers: dict[str, str],
    rent: EntryRead,
    other_user_headers: dict[str, str],
) -> None:
    client.delete(entry_path(rent), headers=other_user_headers)

    assert list_entries(client, signed_in_headers) == [rent]


# Entries that don't exist


@pytest.mark.parametrize("method", ["PATCH", "DELETE"], ids=["update", "delete"])
def test_entry_that_does_not_exist_returns_404(
    client: TestClient, signed_in_headers: dict[str, str], method: str
) -> None:
    response = client.request(
        method,
        "/api/v1/entries/1",
        content=EntryUpdate(amount=Decimal(1)).model_dump_json(exclude_unset=True),
        headers={**signed_in_headers, "Content-Type": "application/json"},
    )

    assert (response.status_code, response.json()) == (
        404,
        {"detail": "Entry not found"},
    )


@pytest.mark.parametrize(
    "invalid_entry_id", ["0", "2147483648", "rent"], ids=["zero", "too-large", "text"]
)
def test_entry_with_an_invalid_id_returns_422(
    client: TestClient, signed_in_headers: dict[str, str], invalid_entry_id: str
) -> None:
    response = client.delete(
        f"/api/v1/entries/{invalid_entry_id}", headers=signed_in_headers
    )

    assert response.status_code == 422


# Deleting a month or a user


def test_delete_month_deletes_its_entries(
    client: TestClient, db: Session, signed_in_headers: dict[str, str], rent: EntryRead
) -> None:
    client.delete(SEPTEMBER_PATH, headers=signed_in_headers)

    assert db.scalars(select(Entry)).all() == []


def test_deleting_a_user_deletes_their_entries(db: Session, rent: EntryRead) -> None:
    user = db.scalars(select(User).where(User.email == EMAIL)).one()

    db.delete(user)
    db.flush()

    assert db.scalars(select(Entry)).all() == []


# Database constraints


def test_database_rejects_an_amount_that_is_not_positive(
    db: Session, rent: EntryRead
) -> None:
    saved_entry = db.get_one(Entry, rent.id)
    saved_entry.amount = Decimal(0)

    with pytest.raises(IntegrityError, match="ck_entries_amount"):
        db.flush()
