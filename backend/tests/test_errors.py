import logging
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.errors import FastAPIValidationError, field_error
from app.main import create_app
from app.schemas.error import ErrorResponse, FieldError
from tests.entries import SEPTEMBER_ENTRIES_PATH
from tests.months import create_month

UNEXPECTED_ERROR_PATH = "/unexpected-error"
SERVER_HTTP_ERROR_PATH = "/server-http-error"
INTERNAL_ERROR_BODY = {
    "detail": "Something went wrong. Please try again.",
    "code": "internal_error",
}


@pytest.fixture
def failing_client() -> Generator[TestClient]:
    """A client for an app with routes that fail in ways the real routes never
    should."""
    failing_app = create_app()

    @failing_app.get(UNEXPECTED_ERROR_PATH)
    def raise_unexpected_error() -> None:
        raise RuntimeError("Secret internal detail")

    @failing_app.get(SERVER_HTTP_ERROR_PATH)
    def raise_server_http_error() -> None:
        raise StarletteHTTPException(503)

    with TestClient(failing_app, raise_server_exceptions=False) as test_client:
        yield test_client


# Unexpected errors


def test_unexpected_error_returns_500_without_its_details(
    failing_client: TestClient,
) -> None:
    response = failing_client.get(UNEXPECTED_ERROR_PATH)

    assert (response.status_code, response.json()) == (500, INTERNAL_ERROR_BODY)


def test_unexpected_error_is_logged_with_its_traceback(
    failing_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="app.api.errors"):
        failing_client.get(UNEXPECTED_ERROR_PATH)

    assert [
        record.exc_info[0] if record.exc_info else None
        for record in caplog.records
        if record.name == "app.api.errors"
    ] == [RuntimeError]


def test_http_server_error_returns_500(failing_client: TestClient) -> None:
    response = failing_client.get(SERVER_HTTP_ERROR_PATH)

    assert (response.status_code, response.json()) == (500, INTERNAL_ERROR_BODY)


# Other client errors


def post_body_that_is_not_utf8(client: TestClient) -> Response:
    return client.post(
        "/api/v1/auth/register-challenge",
        content=b'{"email": "\xff"}',
        headers={"Content-Type": "application/json"},
    )


def test_body_that_is_not_utf8_returns_400(client: TestClient) -> None:
    response = post_body_that_is_not_utf8(client)

    assert (response.status_code, response.json()) == (
        400,
        {"detail": "There was an error parsing the body", "code": "bad_request"},
    )


def test_body_that_is_not_utf8_is_not_logged_as_an_error(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="app.api.errors"):
        post_body_that_is_not_utf8(client)

    assert [
        record for record in caplog.records if record.name == "app.api.errors"
    ] == []


# Routing errors


def test_unknown_route_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist")

    assert (response.status_code, response.json()) == (
        404,
        {"detail": "Not Found", "code": "not_found"},
    )


def test_wrong_method_returns_405(client: TestClient) -> None:
    response = client.get("/api/v1/auth/login-challenge")

    assert (response.status_code, response.json()) == (
        405,
        {"detail": "Method Not Allowed", "code": "method_not_allowed"},
    )


def test_wrong_method_lists_the_allowed_methods(client: TestClient) -> None:
    response = client.get("/api/v1/auth/login-challenge")

    assert response.headers["allow"] == "POST"


# Validation errors


def test_malformed_json_returns_422(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register-challenge",
        content='{"email": ',
        headers={"Content-Type": "application/json"},
    )

    assert (response.status_code, response.json()) == (
        422,
        {
            "detail": "Some fields are invalid.",
            "code": "validation_failed",
            "fields": [{"field": "body", "message": "JSON decode error"}],
        },
    )


def test_invalid_path_parameter_points_at_its_field(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    response = client.get("/api/v1/months/2026/13", headers=signed_in_headers)

    assert [
        error.field
        for error in ErrorResponse.model_validate(response.json()).fields or []
    ] == ["month"]


def test_invalid_query_parameter_points_at_its_field(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    create_month(client, signed_in_headers)

    response = client.get(
        f"{SEPTEMBER_ENTRIES_PATH}?bucket=groceries", headers=signed_in_headers
    )

    assert [
        error.field
        for error in ErrorResponse.model_validate(response.json()).fields or []
    ] == ["bucket"]


def test_error_about_the_whole_body_points_at_the_body(
    client: TestClient, signed_in_headers: dict[str, str]
) -> None:
    response = client.put(
        "/api/v1/spending-plan",
        json={
            "fixed_costs_pct": 50,
            "investments_pct": 10,
            "savings_pct": 10,
            "guilt_free_pct": 10,
        },
        headers=signed_in_headers,
    )

    assert ErrorResponse.model_validate(response.json()).fields == [
        FieldError(field="body", message="The percentages add up to 80, not 100")
    ]


@pytest.mark.parametrize(
    ("location", "expected_field"),
    [
        (("body", "amount"), "amount"),
        (("body", "targets", "needs"), "targets.needs"),
        (("body", "entries", 0, "amount"), "entries.0.amount"),
        (("path", "year"), "year"),
        (("query", "bucket"), "bucket"),
        (("body",), "body"),
    ],
    ids=["body", "nested", "list-item", "path", "query", "whole-body"],
)
def test_field_error_names_the_field_without_the_request_part(
    location: tuple[str | int, ...], expected_field: str
) -> None:
    validation_error = FastAPIValidationError(type="value_error", loc=location, msg="")

    assert field_error(validation_error).field == expected_field


def test_field_error_leaves_out_pydantics_value_error_prefix() -> None:
    validation_error = FastAPIValidationError(
        type="value_error",
        loc=("body",),
        msg="Value error, The percentages add up to 80, not 100",
    )

    assert field_error(validation_error).message == (
        "The percentages add up to 80, not 100"
    )
