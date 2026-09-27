"""The errors the API responds with, and the handlers that turn every error into an
`ErrorResponse` body."""

import logging
from collections import defaultdict
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from typing import Annotated

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.error import ErrorCode, ErrorResponse, FieldError

logger = logging.getLogger(__name__)

BEARER_CHALLENGE = {"WWW-Authenticate": "Bearer"}


@dataclass(frozen=True)
class ErrorKind:
    """One kind of error the API responds with: its status, code and message."""

    status_code: int
    code: ErrorCode
    detail: str
    headers: Mapping[str, str] | None = None


NOT_AUTHENTICATED = ErrorKind(
    status.HTTP_401_UNAUTHORIZED,
    ErrorCode.NOT_AUTHENTICATED,
    "Not authenticated",
    BEARER_CHALLENGE,
)
PASSKEY_VERIFICATION_FAILED = ErrorKind(
    status.HTTP_401_UNAUTHORIZED,
    ErrorCode.PASSKEY_VERIFICATION_FAILED,
    "Passkey verification failed",
    BEARER_CHALLENGE,
)
EMAIL_ALREADY_REGISTERED = ErrorKind(
    status.HTTP_409_CONFLICT,
    ErrorCode.EMAIL_ALREADY_REGISTERED,
    "Email already registered",
)
MONTH_NOT_FOUND = ErrorKind(
    status.HTTP_404_NOT_FOUND, ErrorCode.MONTH_NOT_FOUND, "Month not found"
)
ENTRY_NOT_FOUND = ErrorKind(
    status.HTTP_404_NOT_FOUND, ErrorCode.ENTRY_NOT_FOUND, "Entry not found"
)
MONTH_ALREADY_EXISTS = ErrorKind(
    status.HTTP_409_CONFLICT, ErrorCode.MONTH_ALREADY_EXISTS, "Month already exists"
)
VALIDATION_FAILED = ErrorKind(
    status.HTTP_422_UNPROCESSABLE_CONTENT,
    ErrorCode.VALIDATION_FAILED,
    "Some fields are invalid.",
)
INTERNAL_ERROR = ErrorKind(
    status.HTTP_500_INTERNAL_SERVER_ERROR,
    ErrorCode.INTERNAL_ERROR,
    "Something went wrong. Please try again.",
)

# The codes of the errors Starlette raises itself when routing a request. Its other
# client errors, such as FastAPI's 400 for a body it can't decode, are `bad_request`.
ROUTING_ERROR_CODES = {
    status.HTTP_404_NOT_FOUND: ErrorCode.NOT_FOUND,
    status.HTTP_405_METHOD_NOT_ALLOWED: ErrorCode.METHOD_NOT_ALLOWED,
}

# How Pydantic starts the message of a ValueError raised by a validator.
VALUE_ERROR_PREFIX = "Value error, "


class ApiError(HTTPException):
    """An error of one of the kinds above, e.g. `raise ApiError(MONTH_NOT_FOUND)`."""

    def __init__(self, kind: ErrorKind) -> None:
        super().__init__(kind.status_code, kind.detail, kind.headers)
        self.code = kind.code


@dataclass(frozen=True)
class DocumentedError:
    """The OpenAPI documentation of one error status of a route."""

    model: type[ErrorResponse]
    description: str


def error_responses(*kinds: ErrorKind) -> dict[int | str, dict[str, object]]:
    """The OpenAPI documentation of the errors a route responds with, for its
    `responses`. Kinds that share a status are described together."""
    details_by_status: defaultdict[int, list[str]] = defaultdict(list)
    for kind in kinds:
        details_by_status[kind.status_code].append(kind.detail)
    return {
        status_code: asdict(DocumentedError(ErrorResponse, " or ".join(details)))
        for status_code, details in details_by_status.items()
    }


class FastAPIValidationError(BaseModel):
    """The part of one of FastAPI's validation errors that `FieldError` needs."""

    type: str
    # Where the invalid value is, starting with the part of the request that holds
    # it, e.g. ("body", "targets", "needs").
    loc: Annotated[tuple[str | int, ...], Field(min_length=1)]
    msg: str


def field_error(validation_error: FastAPIValidationError) -> FieldError:
    request_part, *field_location = validation_error.loc
    # Malformed JSON's location is the position of the syntax error in the body.
    if validation_error.type == "json_invalid" or not field_location:
        field = str(request_part)
    else:
        field = ".".join(str(location_part) for location_part in field_location)
    return FieldError(
        field=field, message=validation_error.msg.removeprefix(VALUE_ERROR_PREFIX)
    )


def error_json(
    status_code: int,
    error_body: ErrorResponse,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    # Leaving out `None` drops `fields` from every body but a 422's.
    return JSONResponse(
        error_body.model_dump(mode="json", exclude_none=True),
        status_code=status_code,
        headers=headers,
    )


async def handle_api_error(request: Request, error: ApiError) -> JSONResponse:
    return error_json(
        error.status_code,
        ErrorResponse(detail=error.detail, code=error.code),
        error.headers,
    )


async def handle_http_exception(
    request: Request, error: StarletteHTTPException
) -> JSONResponse:
    """Starlette's and FastAPI's own errors, such as unknown routes (404) and wrong
    methods (405). A server error among them is handled as an unexpected error."""
    if error.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        return await handle_unexpected_error(request, error)
    code = ROUTING_ERROR_CODES.get(error.status_code, ErrorCode.BAD_REQUEST)
    return error_json(
        error.status_code, ErrorResponse(detail=error.detail, code=code), error.headers
    )


async def handle_validation_error(
    request: Request, error: RequestValidationError
) -> JSONResponse:
    field_errors = [
        field_error(FastAPIValidationError.model_validate(validation_error))
        for validation_error in error.errors()
    ]
    return error_json(
        VALIDATION_FAILED.status_code,
        ErrorResponse(
            detail=VALIDATION_FAILED.detail,
            code=VALIDATION_FAILED.code,
            fields=field_errors,
        ),
    )


async def handle_unexpected_error(request: Request, error: Exception) -> JSONResponse:
    """Logs the error with its traceback and responds without any of its details."""
    logger.error(
        "Unhandled error in %s %s", request.method, request.url.path, exc_info=error
    )
    return error_json(
        INTERNAL_ERROR.status_code,
        ErrorResponse(detail=INTERNAL_ERROR.detail, code=INTERNAL_ERROR.code),
    )
