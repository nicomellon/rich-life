from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.core.security import create_access_token
from app.schemas.user import Token, UserCreate, UserLogin, UserRead, UserUpdate
from app.services import users

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_409_CONFLICT: {"description": "Email already registered"}},
)
def register(payload: UserCreate, db: DbSession) -> UserRead:
    try:
        user = users.create_user(db, email=payload.email, password=payload.password)
    except users.EmailAlreadyRegisteredError:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already registered") from None
    return UserRead.model_validate(user)


@router.post("/login", responses={status.HTTP_401_UNAUTHORIZED: {"description": "Invalid email or password"}})
def login(payload: UserLogin, db: DbSession) -> Token:
    user = users.authenticate(db, email=payload.email, password=payload.password)
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(str(user.id)))


@router.get("/me")
def read_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me")
def update_me(payload: UserUpdate, user: CurrentUser, db: DbSession) -> UserRead:
    if payload.currency is not None:
        user.currency = payload.currency
    db.commit()
    return UserRead.model_validate(user)
