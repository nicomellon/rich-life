from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import RegistrationChallengeRequest, Token
from app.schemas.user import UserRead, UserUpdate
from app.schemas.webauthn import (
    AuthenticationOptions,
    AuthenticationResponse,
    RegistrationOptions,
    RegistrationResponse,
)
from app.services import passkeys

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_TAKEN = HTTPException(status.HTTP_409_CONFLICT, detail="Email already registered")
VERIFICATION_FAILED = HTTPException(
    status.HTTP_401_UNAUTHORIZED,
    detail="Passkey verification failed",
    headers={"WWW-Authenticate": "Bearer"},
)


def _token_for(user: User) -> Token:
    return Token(access_token=create_access_token(user.id))


@router.post(
    "/register-challenge",
    summary="Start registering a passkey for a new account",
    responses={status.HTTP_409_CONFLICT: {"description": "Email already registered"}},
)
def register_challenge(
    payload: RegistrationChallengeRequest, db: DbSession
) -> RegistrationOptions:
    """Returns the options to pass to `navigator.credentials.create()`."""
    try:
        return passkeys.start_registration(db, email=payload.email)
    except passkeys.EmailAlreadyRegisteredError:
        raise EMAIL_TAKEN from None


@router.post(
    "/verify-registration",
    status_code=status.HTTP_201_CREATED,
    summary="Create the account from its new passkey",
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Passkey verification failed"},
        status.HTTP_409_CONFLICT: {"description": "Email already registered"},
    },
)
def verify_registration(registration: RegistrationResponse, db: DbSession) -> Token:
    """Takes the credential `navigator.credentials.create()` returned and signs the
    new user in."""
    try:
        user = passkeys.finish_registration(db, registration)
    except passkeys.PasskeyVerificationError:
        raise VERIFICATION_FAILED from None
    except passkeys.EmailAlreadyRegisteredError:
        raise EMAIL_TAKEN from None
    return _token_for(user)


@router.post("/login-challenge", summary="Start signing in with a passkey")
def login_challenge(db: DbSession) -> AuthenticationOptions:
    """Returns the options to pass to `navigator.credentials.get()`."""
    return passkeys.start_authentication(db)


@router.post(
    "/verify-login",
    summary="Sign in with a passkey",
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Passkey verification failed"}
    },
)
def verify_login(authentication: AuthenticationResponse, db: DbSession) -> Token:
    """Takes the assertion `navigator.credentials.get()` returned."""
    try:
        user = passkeys.finish_authentication(db, authentication)
    except passkeys.PasskeyVerificationError:
        raise VERIFICATION_FAILED from None
    return _token_for(user)


@router.get("/me")
def read_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me")
def update_me(payload: UserUpdate, user: CurrentUser, db: DbSession) -> UserRead:
    if payload.currency is not None:
        user.currency = payload.currency
    if db.is_modified(user):
        db.commit()
    return UserRead.model_validate(user)
