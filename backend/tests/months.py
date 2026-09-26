"""Months and helpers for tests that need a budgeted month."""

from decimal import Decimal

from fastapi.testclient import TestClient
from httpx2 import Response
from pydantic import BaseModel

from app.schemas.month import MonthCreate, MonthRead

SEPTEMBER = MonthCreate(year=2026, month=9, income=Decimal(3000))
OCTOBER = MonthCreate(year=2026, month=10, income=Decimal(3200))
SEPTEMBER_PATH = "/api/v1/months/2026/9"


def send_json(
    client: TestClient,
    method: str,
    path: str,
    headers: dict[str, str],
    request_body: BaseModel,
) -> Response:
    return client.request(
        method,
        path,
        content=request_body.model_dump_json(),
        headers={**headers, "Content-Type": "application/json"},
    )


def create_month(
    client: TestClient, headers: dict[str, str], new_month: MonthCreate = SEPTEMBER
) -> MonthRead:
    response = send_json(client, "POST", "/api/v1/months", headers, new_month)
    assert response.status_code == 201, response.text
    return MonthRead.model_validate(response.json())
