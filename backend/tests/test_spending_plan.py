from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.spending_plan import SpendingPlan
from app.models.user import User
from app.schemas.spending_plan import SpendingPlanPercentages
from tests.accounts import EMAIL, OTHER_EMAIL, auth_header, register
from tests.authenticator import SoftwareAuthenticator
from tests.spending_plans import (
    DEFAULT_PLAN,
    NEW_PLAN,
    plan_body,
    put_plan,
    read_plan,
    replace_plan,
)

# Reading the plan


def test_new_user_has_the_default_spending_plan(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    plan = read_plan(client, signed_in_headers)

    assert plan == DEFAULT_PLAN


def test_get_spending_plan_sends_percentages_as_decimal_strings(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    response = client.get("/api/v1/spending-plan", headers=signed_in_headers)

    assert '"fixed_costs_pct":"50.00"' in response.text


@pytest.mark.parametrize("method", ["GET", "PUT"], ids=["get", "put"])
def test_spending_plan_without_a_token_returns_401(
    client: TestClient, method: str
) -> None:
    response = client.request(method, "/api/v1/spending-plan")

    assert response.status_code == 401


# Replacing the plan


def test_put_spending_plan_returns_the_new_plan(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    response = put_plan(client, signed_in_headers, NEW_PLAN)

    assert SpendingPlanPercentages.model_validate(response.json()) == NEW_PLAN


def test_put_spending_plan_saves_the_new_plan(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    put_plan(client, signed_in_headers, NEW_PLAN)

    assert read_plan(client, signed_in_headers) == NEW_PLAN


def test_put_spending_plan_leaves_other_users_plans_unchanged(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    other_user_headers = auth_header(
        register(client, SoftwareAuthenticator(), OTHER_EMAIL).access_token
    )

    replace_plan(client, signed_in_headers, NEW_PLAN)

    assert read_plan(client, other_user_headers) == DEFAULT_PLAN


@pytest.fixture
def headers_of_a_user_without_a_plan(
    db: Session, signed_in_headers: dict[str, str]
) -> dict[str, str]:
    """A signed-in user whose plan row is missing, e.g. deleted by hand."""
    db.execute(delete(SpendingPlan))
    return signed_in_headers


def test_get_spending_plan_without_a_saved_plan_returns_the_default_plan(
    client: TestClient, headers_of_a_user_without_a_plan: dict[str, str]
) -> None:
    plan = read_plan(client, headers_of_a_user_without_a_plan)

    assert plan == DEFAULT_PLAN


def test_put_spending_plan_without_a_saved_plan_saves_the_new_plan(
    client: TestClient, headers_of_a_user_without_a_plan: dict[str, str]
) -> None:
    put_plan(client, headers_of_a_user_without_a_plan, NEW_PLAN)

    assert read_plan(client, headers_of_a_user_without_a_plan) == NEW_PLAN


# Rejected plans


@pytest.mark.parametrize(
    "target_pcts",
    [
        ("50", "10", "20", "19.99"),
        ("50", "10", "20", "20.01"),
        ("0", "0", "0", "0"),
        ("100", "100", "100", "100"),
    ],
    ids=["under-100", "over-100", "all-zero", "all-100"],
)
def test_put_spending_plan_whose_total_is_not_100_returns_422(
    client: TestClient,
    signed_in_headers: dict[str, str],
    target_pcts: tuple[str, str, str, str],
) -> None:
    response = client.put(
        "/api/v1/spending-plan", json=plan_body(*target_pcts), headers=signed_in_headers
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "invalid_plan_body",
    [
        plan_body("-10", "10", "20", "80"),
        plan_body("49.995", "10", "20", "20.005"),
        {"fixed_costs_pct": "70", "investments_pct": "10", "savings_pct": "20"},
        {**plan_body("50", "10", "20", "20"), "holidays_pct": "0"},
    ],
    ids=["negative", "3-decimals", "missing-bucket", "unknown-bucket"],
)
def test_put_spending_plan_with_an_invalid_body_returns_422(
    client: TestClient,
    signed_in_headers: dict[str, str],
    invalid_plan_body: dict[str, str],
) -> None:
    response = client.put(
        "/api/v1/spending-plan", json=invalid_plan_body, headers=signed_in_headers
    )

    assert response.status_code == 422


def test_put_spending_plan_with_a_rejected_plan_leaves_the_plan_unchanged(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    rejected_plan_body = plan_body("50", "50", "50", "50")

    client.put(
        "/api/v1/spending-plan", json=rejected_plan_body, headers=signed_in_headers
    )

    assert read_plan(client, signed_in_headers) == DEFAULT_PLAN


# Database constraints


def test_database_rejects_a_plan_whose_total_is_not_100(
    db: Session, signed_in_headers: dict[str, str]
) -> None:
    user_id = db.scalars(select(User.id).where(User.email == EMAIL)).one()
    saved_plan = db.get_one(SpendingPlan, user_id)
    saved_plan.savings_pct = Decimal(25)

    with pytest.raises(IntegrityError, match="ck_spending_plans_total_pct"):
        db.flush()
