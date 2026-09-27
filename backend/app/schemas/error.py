from enum import StrEnum

from pydantic import BaseModel


class ErrorCode(StrEnum):
    """What went wrong, for clients to branch on instead of parsing the message."""

    NOT_AUTHENTICATED = "not_authenticated"
    PASSKEY_VERIFICATION_FAILED = "passkey_verification_failed"
    EMAIL_ALREADY_REGISTERED = "email_already_registered"
    MONTH_NOT_FOUND = "month_not_found"
    ENTRY_NOT_FOUND = "entry_not_found"
    MONTH_ALREADY_EXISTS = "month_already_exists"
    VALIDATION_FAILED = "validation_failed"
    BAD_REQUEST = "bad_request"
    NOT_FOUND = "not_found"
    METHOD_NOT_ALLOWED = "method_not_allowed"
    INTERNAL_ERROR = "internal_error"


class FieldError(BaseModel):
    """One invalid value in a request."""

    # The value's dotted location without its `body`, `path` or `query` part, e.g.
    # `amount` or `targets.needs`. It is `body` for errors about the body as a whole,
    # such as malformed JSON.
    field: str
    message: str


class ErrorResponse(BaseModel):
    """The body of every error response."""

    # For people: safe to show as it is.
    detail: str
    code: ErrorCode
    # Only on 422 responses, and left out of every other body.
    fields: list[FieldError] | None = None
