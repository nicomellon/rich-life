import ipaddress
import logging
import time
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Body, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.models import MediaType, RequestBody, Schema
from pydantic import JsonValue, ValidationError
from redis import Redis

from app.api.deps import (
    ConfiguredEmailSender,
    CurrentUser,
    DbSession,
    OptionalUser,
    RedisClient,
)
from app.api.errors import (
    EMAIL_ALREADY_REGISTERED,
    MAGIC_LINK_INVALID,
    NOT_AUTHENTICATED,
    PASSKEY_ADDITION_FAILED,
    PASSKEY_VERIFICATION_FAILED,
    RATE_LIMITED,
    VALIDATION_FAILED,
    ApiError,
    error_responses,
)
from app.core.config import get_settings
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import (
    MagicLinkRequest,
    MagicLinkVerification,
    RegistrationChallengeRequest,
    Token,
)
from app.schemas.user import Email, UserRead, UserUpdate
from app.schemas.webauthn import (
    AuthenticationOptions,
    AuthenticationResponse,
    RegistrationOptions,
    RegistrationResponse,
)
from app.services import magic_links, passkeys
from app.services.email import EmailSender
from app.services.rate_limits import (
    RateLimit,
    RateLimitExceededError,
    count_request,
    uncount_request,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

RATE_LIMIT_WINDOW = timedelta(minutes=15)


REGISTRATION_CHALLENGE_BODY = RequestBody(
    content={
        "application/json": MediaType(
            schema=Schema.model_validate(
                RegistrationChallengeRequest.model_json_schema()
            )
        )
    }
)


def _token_for(user: User) -> Token:
    return Token(access_token=create_access_token(user.id))


@router.post(
    "/register-challenge",
    summary="Start registering a passkey for a new account, or adding one",
    responses=error_responses(
        NOT_AUTHENTICATED, EMAIL_ALREADY_REGISTERED, VALIDATION_FAILED
    ),
    # The body is validated in the handler, so document its schema here.
    openapi_extra={
        "requestBody": REGISTRATION_CHALLENGE_BODY.model_dump(
            by_alias=True, exclude_none=True
        )
    },
)
def register_challenge(
    db: DbSession,
    signed_in_user: OptionalUser,
    request_body: Annotated[JsonValue, Body()] = None,
) -> RegistrationOptions:
    """Returns the options to pass to `navigator.credentials.create()`.

    Without a bearer token the options create a new account for `email`. With one,
    they add a passkey to the signed-in account, and the body is ignored."""
    if signed_in_user is not None:
        return passkeys.start_passkey_addition(db, signed_in_user)
    # Validated here rather than by FastAPI, which would also reject a signed-in
    # user's body.
    try:
        payload = RegistrationChallengeRequest.model_validate(
            {} if request_body is None else request_body
        )
    except ValidationError as exc:
        field_errors = exc.errors(include_url=False)
        for field_error in field_errors:
            field_error["loc"] = ("body", *field_error["loc"])
        raise RequestValidationError(field_errors) from None
    try:
        return passkeys.start_registration(db, email=payload.email)
    except passkeys.EmailAlreadyRegisteredError:
        raise ApiError(EMAIL_ALREADY_REGISTERED) from None


@router.post(
    "/verify-registration",
    status_code=status.HTTP_201_CREATED,
    summary="Create the account from its new passkey, or add the passkey",
    responses=error_responses(
        PASSKEY_ADDITION_FAILED,
        PASSKEY_VERIFICATION_FAILED,
        NOT_AUTHENTICATED,
        EMAIL_ALREADY_REGISTERED,
        VALIDATION_FAILED,
    ),
)
def verify_registration(
    registration: RegistrationResponse, db: DbSession, signed_in_user: OptionalUser
) -> Token:
    """Takes the credential `navigator.credentials.create()` returned. Without a
    bearer token it creates the account and signs the new user in; with one it adds
    the passkey to the signed-in account and returns a fresh token. A passkey that
    fails verification is a 401 when signing up, but a 400 when adding one, so the
    signed-in user isn't signed out."""
    try:
        user = passkeys.finish_registration(db, registration, signed_in_user)
    except passkeys.PasskeyVerificationError:
        if signed_in_user is not None:
            raise ApiError(PASSKEY_ADDITION_FAILED) from None
        raise ApiError(PASSKEY_VERIFICATION_FAILED) from None
    except passkeys.EmailAlreadyRegisteredError:
        raise ApiError(EMAIL_ALREADY_REGISTERED) from None
    return _token_for(user)


@router.post("/login-challenge", summary="Start signing in with a passkey")
def login_challenge(db: DbSession) -> AuthenticationOptions:
    """Returns the options to pass to `navigator.credentials.get()`."""
    return passkeys.start_authentication(db)


@router.post(
    "/verify-login",
    summary="Sign in with a passkey",
    responses=error_responses(PASSKEY_VERIFICATION_FAILED, VALIDATION_FAILED),
)
def verify_login(authentication: AuthenticationResponse, db: DbSession) -> Token:
    """Takes the assertion `navigator.credentials.get()` returned."""
    try:
        user = passkeys.finish_authentication(db, authentication)
    except passkeys.PasskeyVerificationError:
        raise ApiError(PASSKEY_VERIFICATION_FAILED) from None
    return _token_for(user)


@router.post(
    "/magic-link",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    summary="Email a sign-in link",
    responses=error_responses(RATE_LIMITED, VALIDATION_FAILED),
)
def request_magic_link(
    payload: MagicLinkRequest,
    request: Request,
    db: DbSession,
    redis: RedisClient,
    email_sender: ConfiguredEmailSender,
    background_tasks: BackgroundTasks,
) -> Response:
    """Emails a link that signs in once within 15 minutes, if an account has this
    email. Responds 202 either way, so it doesn't reveal which emails have accounts.
    """
    settings = get_settings()
    ip_rate_limit = RateLimit(
        "magic-link-ip", settings.magic_link_ip_limit, RATE_LIMIT_WINDOW
    )
    client_ip = _client_ip(request)
    ip_request_id = _count_request(redis, ip_rate_limit, client_ip)
    try:
        _count_request(
            redis,
            RateLimit(
                "magic-link-email", settings.magic_link_email_limit, RATE_LIMIT_WINDOW
            ),
            payload.email,
        )
    except ApiError:
        # Refused requests don't count, so clicking on after reaching the email's
        # limit doesn't use up the IP's, which other people may share.
        uncount_request(redis, ip_rate_limit, client_ip, ip_request_id)
        raise
    # Both cases run the same lookup; the link is issued and sent after responding, so
    # a known email takes no longer to answer than an unknown one.
    account_id = magic_links.find_account_id(db, payload.email)
    if account_id is not None:
        background_tasks.add_task(
            _send_sign_in_link, redis, email_sender, account_id, payload.email
        )
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/magic-link/verify",
    summary="Sign in with an emailed link",
    responses=error_responses(MAGIC_LINK_INVALID, RATE_LIMITED, VALIDATION_FAILED),
)
def verify_magic_link(
    verification: MagicLinkVerification,
    request: Request,
    db: DbSession,
    redis: RedisClient,
) -> Token:
    """Takes the token from the link and uses it up, so the link signs in once."""
    _count_request(
        redis,
        RateLimit(
            "magic-link-verify-ip",
            get_settings().magic_link_ip_limit,
            RATE_LIMIT_WINDOW,
        ),
        _client_ip(request),
    )
    try:
        user = magic_links.redeem_magic_link(db, redis, verification.token)
    except magic_links.InvalidMagicLinkError:
        raise ApiError(MAGIC_LINK_INVALID) from None
    return _token_for(user)


def _count_request(redis: Redis, rate_limit: RateLimit, key: str) -> str:
    """Count the request and return its id, or respond 429 if the key has used up
    its limit."""
    try:
        return count_request(redis, rate_limit, key, now=time.time())
    except RateLimitExceededError as exc:
        raise ApiError(
            RATE_LIMITED, headers={"Retry-After": str(exc.retry_after_seconds)}
        ) from None


def _client_ip(request: Request) -> str:
    """The client's address, as the per-IP rate limits count it. An IPv6 address
    counts as its /64 prefix, since one customer usually holds the whole /64 and could
    otherwise switch addresses to get a fresh limit."""
    # In production this is the browser's address: Caddy resolves it, trusting only
    # the proxies in TRUSTED_PROXIES, and sends it as the only X-Forwarded-For entry,
    # which uvicorn reads (see frontend/Caddyfile and docker-entrypoint.sh).
    client_host = request.client.host if request.client else "unknown"
    try:
        client_address = ipaddress.ip_address(client_host)
    except ValueError:
        # Not an address, e.g. the test client's "testclient".
        return client_host
    if client_address.version == 6:
        return str(ipaddress.ip_network(f"{client_address}/64", strict=False))
    return str(client_address)


def _send_sign_in_link(
    redis: Redis, email_sender: EmailSender, account_id: int, email: Email
) -> None:
    try:
        email_sender.send(magic_links.create_sign_in_email(redis, account_id, email))
    except Exception:
        # The response has gone, so the user can only ask for another link.
        logger.exception("Couldn't send a sign-in link")


@router.get("/me", responses=error_responses(NOT_AUTHENTICATED))
def read_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me", responses=error_responses(NOT_AUTHENTICATED, VALIDATION_FAILED))
def update_me(payload: UserUpdate, user: CurrentUser, db: DbSession) -> UserRead:
    if payload.currency is not None:
        user.currency = payload.currency
    if db.is_modified(user):
        db.commit()
    return UserRead.model_validate(user)
