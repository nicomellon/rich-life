from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.spending_plan import SpendingPlan
from app.models.user import User
from app.schemas.spending_plan import SpendingPlanPercentages
from tests.accounts import EMAIL, OTHER_EMAIL, auth_header, register
from tests.authenticator import SoftwareAuthenticator

DEFAULT_PLAN = SpendingPlanPercentages(
    fixed_costs_pct=Decimal(50),
    investments_pct=Decimal(10),
    savings_pct=Decimal(20),
    guilt_free_pct=Decimal(20),
)
NEW_PLAN = SpendingPlanPercentages(
    fixed_costs_pct=Decimal(45),
    investments_pct=Decimal("12.5"),
    savings_pct=Decimal("22.5"),
    guilt_free_pct=Decimal(20),
)


def read_plan(client: TestClient, headers: dict[str, str]) -> SpendingPlanPercentages:
    response = client.get("/api/v1/spending-plan", headers=headers)
    assert response.status_code == 200, response.text
    return SpendingPlanPercentages.model_validate(response.json())


def put_plan(
    client: TestClient, headers: dict[str, str], new_plan: SpendingPlanPercentages
) -> Response:
    return client.put(
        "/api/v1/spending-plan",
        content=new_plan.model_dump_json(),
        headers={**headers, "Content-Type": "application/json"},
    )


def plan_body(
    fixed_costs_pct: str, investments_pct: str, savings_pct: str, guilt_free_pct: str
) -> dict[str, str]:
    return {
        "fixed_costs_pct": fixed_costs_pct,
        "investments_pct": investments_pct,
        "savings_pct": savings_pct,
        "guilt_free_pct": guilt_free_pct,
    }


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

    put_plan(client, signed_in_headers, NEW_PLAN)

    assert read_plan(client, other_user_headers) == DEFAULT_PLAN


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
