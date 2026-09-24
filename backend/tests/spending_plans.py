"""Plans and helpers for tests that read or change a user's spending plan."""

from decimal import Decimal

from fastapi.testclient import TestClient
from httpx2 import Response

from app.schemas.spending_plan import SpendingPlanPercentages

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


def replace_plan(
    client: TestClient, headers: dict[str, str], new_plan: SpendingPlanPercentages
) -> SpendingPlanPercentages:
    """Replace the user's plan, failing the test unless the API accepts it."""
    response = put_plan(client, headers, new_plan)
    assert response.status_code == 200, response.text
    return SpendingPlanPercentages.model_validate(response.json())


def plan_body(
    fixed_costs_pct: str, investments_pct: str, savings_pct: str, guilt_free_pct: str
) -> dict[str, str]:
    return {
        "fixed_costs_pct": fixed_costs_pct,
        "investments_pct": investments_pct,
        "savings_pct": savings_pct,
        "guilt_free_pct": guilt_free_pct,
    }
