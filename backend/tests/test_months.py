from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.month import Month
from app.models.user import User
from app.schemas.month import MonthCreate, MonthRead, MonthUpdate
from app.schemas.spending_plan import SpendingPlanPercentages
from tests.accounts import EMAIL
from tests.months import (
    OCTOBER,
    SEPTEMBER,
    SEPTEMBER_PATH,
    create_month,
    send_json,
)
from tests.spending_plans import (
    DEFAULT_PLAN,
    NEW_PLAN,
    plan_body,
    read_plan,
    replace_plan,
)

NEW_TARGETS = SpendingPlanPercentages(
    fixed_costs_pct=Decimal(60),
    investments_pct=Decimal(5),
    savings_pct=Decimal("12.5"),
    guilt_free_pct=Decimal("22.5"),
)


def read_month(
    client: TestClient, headers: dict[str, str], path: str = SEPTEMBER_PATH
) -> MonthRead:
    response = client.get(path, headers=headers)
    assert response.status_code == 200, response.text
    return MonthRead.model_validate(response.json())


def list_months(client: TestClient, headers: dict[str, str]) -> list[MonthRead]:
    response = client.get("/api/v1/months", headers=headers)
    assert response.status_code == 200, response.text
    return [MonthRead.model_validate(month) for month in response.json()]


def replace_september_targets(
    client: TestClient, headers: dict[str, str], new_targets: SpendingPlanPercentages
) -> MonthRead:
    """Replace September's targets, failing the test unless the API accepts them."""
    response = send_json(
        client, "PUT", f"{SEPTEMBER_PATH}/targets", headers, new_targets
    )
    assert response.status_code == 200, response.text
    return MonthRead.model_validate(response.json())


def targets_of(month: MonthRead) -> SpendingPlanPercentages:
    return SpendingPlanPercentages(
        fixed_costs_pct=month.fixed_costs_pct,
        investments_pct=month.investments_pct,
        savings_pct=month.savings_pct,
        guilt_free_pct=month.guilt_free_pct,
    )


def calendar_months(months: list[MonthRead]) -> list[tuple[int, int]]:
    return [(month.year, month.month) for month in months]


@pytest.fixture
def september(client: TestClient, signed_in_headers: dict[str, str]) -> MonthRead:
    """September 2026, created by the signed-in user with the default plan."""
    return create_month(client, signed_in_headers)


# Authentication


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/v1/months"),
        ("POST", "/api/v1/months"),
        ("GET", SEPTEMBER_PATH),
        ("PATCH", SEPTEMBER_PATH),
        ("PUT", f"{SEPTEMBER_PATH}/targets"),
        ("DELETE", SEPTEMBER_PATH),
        ("GET", f"{SEPTEMBER_PATH}/summary"),
    ],
    ids=[
        "list",
        "create",
        "get",
        "update-income",
        "update-targets",
        "delete",
        "summary",
    ],
)
def test_months_without_a_token_returns_401(
    client: TestClient, method: str, path: str
) -> None:
    response = client.request(method, path)

    assert response.status_code == 401


# Creating a month


def test_create_month_returns_201(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    response = send_json(client, "POST", "/api/v1/months", signed_in_headers, SEPTEMBER)

    assert response.status_code == 201


def test_create_month_returns_its_year_month_and_income(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    created_month = create_month(client, signed_in_headers)

    assert (created_month.year, created_month.month, created_month.income) == (
        2026,
        9,
        Decimal(3000),
    )


def test_create_month_copies_the_spending_plans_targets(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    replace_plan(client, signed_in_headers, NEW_PLAN)

    created_month = create_month(client, signed_in_headers)

    assert targets_of(created_month) == NEW_PLAN


def test_create_month_returns_the_income_as_a_decimal_string(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    response = send_json(client, "POST", "/api/v1/months", signed_in_headers, SEPTEMBER)

    assert '"income":"3000.00"' in response.text


def test_create_a_duplicate_month_returns_409(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    response = send_json(client, "POST", "/api/v1/months", signed_in_headers, SEPTEMBER)

    assert (response.status_code, response.json()) == (
        409,
        {"detail": "Month already exists"},
    )


def test_create_a_month_another_user_already_has_returns_201(
    client: TestClient,
    september: MonthRead,
    other_user_headers: dict[str, str],
) -> None:
    response = send_json(
        client, "POST", "/api/v1/months", other_user_headers, SEPTEMBER
    )

    assert response.status_code == 201


def month_body(year: int, month: int, income: str) -> dict[str, int | str]:
    return {"year": year, "month": month, "income": income}


@pytest.mark.parametrize(
    "invalid_month_body",
    [
        month_body(2026, 0, "3000"),
        month_body(2026, 13, "3000"),
        month_body(0, 9, "3000"),
        month_body(10000, 9, "3000"),
        month_body(2026, 9, "-1"),
        month_body(2026, 9, "3000.005"),
        month_body(2026, 9, "10000000000"),
        {"year": 2026, "month": 9},
        {**month_body(2026, 9, "3000"), "savings_pct": "20"},
    ],
    ids=[
        "month-0",
        "month-13",
        "year-0",
        "year-10000",
        "negative-income",
        "income-3-decimals",
        "income-too-large",
        "missing-income",
        "unknown-field",
    ],
)
def test_create_month_with_an_invalid_body_returns_422(
    client: TestClient,
    signed_in_headers: dict[str, str],
    invalid_month_body: dict[str, int | str],
) -> None:
    response = client.post(
        "/api/v1/months", json=invalid_month_body, headers=signed_in_headers
    )

    assert response.status_code == 422


def test_changing_the_spending_plan_leaves_an_existing_months_targets_unchanged(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    replace_plan(client, signed_in_headers, NEW_PLAN)

    assert targets_of(read_month(client, signed_in_headers)) == DEFAULT_PLAN


# Listing months


def test_list_months_without_months_returns_an_empty_list(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    listed_months = list_months(client, signed_in_headers)

    assert listed_months == []


def test_list_months_returns_the_months_newest_first(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    for new_month in [
        SEPTEMBER,
        MonthCreate(year=2025, month=12, income=Decimal(2800)),
        OCTOBER,
    ]:
        create_month(client, signed_in_headers, new_month)

    listed_months = list_months(client, signed_in_headers)

    assert calendar_months(listed_months) == [(2026, 10), (2026, 9), (2025, 12)]


def test_list_months_leaves_out_other_users_months(
    client: TestClient,
    signed_in_headers: dict[str, str],
    other_user_headers: dict[str, str],
) -> None:
    create_month(client, other_user_headers, OCTOBER)
    create_month(client, signed_in_headers, SEPTEMBER)

    listed_months = list_months(client, signed_in_headers)

    assert calendar_months(listed_months) == [(2026, 9)]


# Getting a month


def test_get_month_returns_the_month(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    requested_month = read_month(client, signed_in_headers)

    assert requested_month == september


@pytest.mark.parametrize(
    ("method", "path", "request_body"),
    [
        ("GET", SEPTEMBER_PATH, None),
        ("PATCH", SEPTEMBER_PATH, MonthUpdate(income=Decimal(1))),
        ("PUT", f"{SEPTEMBER_PATH}/targets", NEW_TARGETS),
        ("DELETE", SEPTEMBER_PATH, None),
        ("GET", f"{SEPTEMBER_PATH}/summary", None),
    ],
    ids=["get", "update-income", "update-targets", "delete", "summary"],
)
def test_month_that_does_not_exist_returns_404(
    client: TestClient,
    signed_in_headers: dict[str, str],
    method: str,
    path: str,
    request_body: BaseModel | None,
) -> None:
    response = client.request(
        method,
        path,
        content=None if request_body is None else request_body.model_dump_json(),
        headers={**signed_in_headers, "Content-Type": "application/json"},
    )

    assert (response.status_code, response.json()) == (
        404,
        {"detail": "Month not found"},
    )


def test_get_another_users_month_returns_404(
    client: TestClient, september: MonthRead, other_user_headers: dict[str, str]
) -> None:
    response = client.get(SEPTEMBER_PATH, headers=other_user_headers)

    assert response.status_code == 404


@pytest.mark.parametrize(
    "invalid_path",
    [
        "/api/v1/months/2026/0",
        "/api/v1/months/2026/13",
        "/api/v1/months/0/9",
        "/api/v1/months/10000/9",
    ],
    ids=["month-0", "month-13", "year-0", "year-10000"],
)
def test_get_month_with_an_invalid_path_returns_422(
    client: TestClient, signed_in_headers: dict[str, str], invalid_path: str
) -> None:
    response = client.get(invalid_path, headers=signed_in_headers)

    assert response.status_code == 422


# Changing a month's income


def test_patch_month_returns_the_new_income(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    response = send_json(
        client,
        "PATCH",
        SEPTEMBER_PATH,
        signed_in_headers,
        MonthUpdate(income=Decimal("3100.50")),
    )

    assert MonthRead.model_validate(response.json()).income == Decimal("3100.50")


def test_patch_month_saves_the_new_income(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    send_json(
        client,
        "PATCH",
        SEPTEMBER_PATH,
        signed_in_headers,
        MonthUpdate(income=Decimal("3100.50")),
    )

    assert read_month(client, signed_in_headers).income == Decimal("3100.50")


def test_patch_another_users_month_leaves_it_unchanged(
    client: TestClient,
    signed_in_headers: dict[str, str],
    september: MonthRead,
    other_user_headers: dict[str, str],
) -> None:
    send_json(
        client,
        "PATCH",
        SEPTEMBER_PATH,
        other_user_headers,
        MonthUpdate(income=Decimal(1)),
    )

    assert read_month(client, signed_in_headers).income == Decimal(3000)


@pytest.mark.parametrize(
    "invalid_update_body",
    [{"income": "-1"}, {"income": "3000.005"}, {}, {"income": "1", "year": 2027}],
    ids=["negative-income", "income-3-decimals", "missing-income", "unknown-field"],
)
def test_patch_month_with_an_invalid_body_returns_422(
    client: TestClient,
    signed_in_headers: dict[str, str],
    september: MonthRead,
    invalid_update_body: dict[str, int | str],
) -> None:
    response = client.patch(
        SEPTEMBER_PATH, json=invalid_update_body, headers=signed_in_headers
    )

    assert response.status_code == 422


# Changing a month's targets


def test_put_month_targets_returns_the_new_targets(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    response = send_json(
        client, "PUT", f"{SEPTEMBER_PATH}/targets", signed_in_headers, NEW_TARGETS
    )

    assert targets_of(MonthRead.model_validate(response.json())) == NEW_TARGETS


def test_put_month_targets_saves_the_new_targets(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    replace_september_targets(client, signed_in_headers, NEW_TARGETS)

    assert targets_of(read_month(client, signed_in_headers)) == NEW_TARGETS


def test_put_month_targets_leaves_the_spending_plan_unchanged(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    replace_september_targets(client, signed_in_headers, NEW_TARGETS)

    assert read_plan(client, signed_in_headers) == DEFAULT_PLAN


def test_put_month_targets_leaves_other_months_unchanged(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    create_month(client, signed_in_headers, OCTOBER)

    replace_september_targets(client, signed_in_headers, NEW_TARGETS)

    october = read_month(client, signed_in_headers, "/api/v1/months/2026/10")
    assert targets_of(october) == DEFAULT_PLAN


def test_put_another_users_month_targets_leaves_them_unchanged(
    client: TestClient,
    signed_in_headers: dict[str, str],
    september: MonthRead,
    other_user_headers: dict[str, str],
) -> None:
    send_json(
        client, "PUT", f"{SEPTEMBER_PATH}/targets", other_user_headers, NEW_TARGETS
    )

    assert targets_of(read_month(client, signed_in_headers)) == DEFAULT_PLAN


@pytest.mark.parametrize(
    "target_pcts",
    [
        ("50", "10", "20", "19.99"),
        ("50", "10", "20", "20.01"),
        ("-10", "30", "40", "40"),
    ],
    ids=["under-100", "over-100", "negative"],
)
def test_put_month_targets_with_invalid_targets_returns_422(
    client: TestClient,
    signed_in_headers: dict[str, str],
    september: MonthRead,
    target_pcts: tuple[str, str, str, str],
) -> None:
    response = client.put(
        f"{SEPTEMBER_PATH}/targets",
        json=plan_body(*target_pcts),
        headers=signed_in_headers,
    )

    assert response.status_code == 422


# Deleting a month


def test_delete_month_returns_204(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    response = client.delete(SEPTEMBER_PATH, headers=signed_in_headers)

    assert response.status_code == 204


def test_delete_month_removes_the_month(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    client.delete(SEPTEMBER_PATH, headers=signed_in_headers)

    response = client.get(SEPTEMBER_PATH, headers=signed_in_headers)
    assert response.status_code == 404


def test_delete_month_leaves_another_users_same_month(
    client: TestClient,
    signed_in_headers: dict[str, str],
    september: MonthRead,
    other_user_headers: dict[str, str],
) -> None:
    create_month(client, other_user_headers, SEPTEMBER)

    client.delete(SEPTEMBER_PATH, headers=other_user_headers)

    assert read_month(client, signed_in_headers) == september


def test_delete_another_users_month_leaves_it_unchanged(
    client: TestClient,
    signed_in_headers: dict[str, str],
    september: MonthRead,
    other_user_headers: dict[str, str],
) -> None:
    client.delete(SEPTEMBER_PATH, headers=other_user_headers)

    assert read_month(client, signed_in_headers) == september


def test_delete_month_lets_the_month_be_created_again(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    client.delete(SEPTEMBER_PATH, headers=signed_in_headers)

    response = send_json(client, "POST", "/api/v1/months", signed_in_headers, SEPTEMBER)

    assert response.status_code == 201


# Database constraints


def test_database_rejects_month_targets_whose_total_is_not_100(
    db: Session, september: MonthRead
) -> None:
    saved_month = db.scalars(select(Month)).one()
    saved_month.savings_pct = Decimal(25)

    with pytest.raises(IntegrityError, match="ck_months_total_pct"):
        db.flush()


def test_database_rejects_a_duplicate_month(db: Session, september: MonthRead) -> None:
    saved_month = db.scalars(select(Month)).one()
    db.add(
        Month(
            user_id=saved_month.user_id,
            year=2026,
            month=9,
            income=Decimal(0),
            **targets_of(september).model_dump(),
        )
    )

    with pytest.raises(IntegrityError, match="uq_months_user_id_year_month"):
        db.flush()


def test_deleting_a_user_deletes_their_months(
    db: Session, september: MonthRead
) -> None:
    user = db.scalars(select(User).where(User.email == EMAIL)).one()

    db.delete(user)
    db.flush()

    assert db.scalars(select(Month)).all() == []
