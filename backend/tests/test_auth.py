from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import JWT_ALGORITHM, create_access_token, decode_access_token
from app.models.user import User

EMAIL = "ada@example.com"
PASSWORD = "correct horse battery"


def register(client: TestClient, email: str = EMAIL, password: str = PASSWORD) -> dict[str, object]:
    response = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    body: dict[str, object] = response.json()
    return body


def login(client: TestClient, email: str = EMAIL, password: str = PASSWORD) -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    token: str = response.json()["access_token"]
    return token


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_register_creates_user_with_default_currency(client: TestClient, db: Session) -> None:
    body = register(client)

    assert body["email"] == EMAIL
    assert body["currency"] == "EUR"
    assert set(body) == {"id", "email", "currency", "created_at"}
    user = db.scalars(select(User).where(User.email == EMAIL)).one()
    assert user.password_hash != PASSWORD
    assert user.password_hash.startswith("$argon2id$")


def test_register_stores_email_lowercased(client: TestClient) -> None:
    body = register(client, email="Ada@Example.COM")

    assert body["email"] == EMAIL


@pytest.mark.parametrize("email", [EMAIL, "ADA@example.com"])
def test_register_duplicate_email_returns_409(client: TestClient, email: str) -> None:
    register(client)

    response = client.post("/api/v1/auth/register", json={"email": email, "password": "another password"})

    assert response.status_code == 409
    assert response.json() == {"detail": "Email already registered"}


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "password": PASSWORD},
        {"email": EMAIL, "password": "short"},
        {"email": EMAIL},
        {"email": EMAIL, "password": PASSWORD, "currency": "USD"},
    ],
)
def test_register_rejects_invalid_payload(client: TestClient, payload: dict[str, str]) -> None:
    response = client.post("/api/v1/auth/register", json=payload)

    assert response.status_code == 422


def test_login_returns_bearer_token_for_the_user(client: TestClient) -> None:
    user_id = register(client)["id"]

    response = client.post("/api/v1/auth/login", json={"email": "ADA@example.com", "password": PASSWORD})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert decode_access_token(body["access_token"]) == str(user_id)


@pytest.mark.parametrize(
    ("email", "password"),
    [(EMAIL, "wrong password"), ("nobody@example.com", PASSWORD)],
    ids=["wrong-password", "unknown-email"],
)
def test_login_bad_credentials_return_401(client: TestClient, email: str, password: str) -> None:
    register(client)

    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid email or password"}
    assert response.headers["www-authenticate"] == "Bearer"


def test_me_returns_current_user(client: TestClient) -> None:
    registered = register(client)

    response = client.get("/api/v1/auth/me", headers=auth_header(login(client)))

    assert response.status_code == 200
    assert response.json() == registered


def expired_token(subject: str) -> str:
    past = datetime.now(UTC) - timedelta(hours=1)
    secret = get_settings().jwt_secret.get_secret_value()
    return jwt.encode({"sub": subject, "exp": past}, secret, algorithm=JWT_ALGORITHM)


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer not-a-jwt"},
        {"Authorization": "Basic YWRhOnB3"},
        auth_header(jwt.encode({"sub": "1"}, "some-other-secret-" + "x" * 32, algorithm=JWT_ALGORITHM)),
        auth_header(expired_token("1")),
        auth_header(create_access_token("999999999")),
        auth_header(create_access_token("not-an-id")),
    ],
    ids=["missing", "malformed", "wrong-scheme", "wrong-secret", "expired", "unknown-user", "bad-subject"],
)
def test_me_without_valid_token_returns_401(client: TestClient, headers: dict[str, str]) -> None:
    response = client.get("/api/v1/auth/me", headers=headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_patch_me_updates_currency(client: TestClient) -> None:
    register(client)
    headers = auth_header(login(client))

    response = client.patch("/api/v1/auth/me", json={"currency": "usd"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["currency"] == "USD"
    assert client.get("/api/v1/auth/me", headers=headers).json()["currency"] == "USD"


@pytest.mark.parametrize(
    "payload",
    [{"currency": "EURO"}, {"currency": "E1"}, {"currency": "ABC"}, {"email": "new@example.com"}],
    ids=["too-long", "not-letters", "not-iso-4217", "unknown-field"],
)
def test_patch_me_rejects_invalid_payload(client: TestClient, payload: dict[str, str]) -> None:
    register(client)

    response = client.patch("/api/v1/auth/me", json=payload, headers=auth_header(login(client)))

    assert response.status_code == 422


@pytest.mark.parametrize("payload", [{}, {"currency": "EUR"}], ids=["empty", "same-currency"])
def test_patch_me_without_changes_does_not_commit(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch, payload: dict[str, str]
) -> None:
    register(client)
    headers = auth_header(login(client))
    commits: list[None] = []
    monkeypatch.setattr(db, "commit", lambda: commits.append(None))

    response = client.patch("/api/v1/auth/me", json=payload, headers=headers)

    assert response.status_code == 200
    assert response.json()["currency"] == "EUR"
    assert commits == []


def test_patch_me_requires_authentication(client: TestClient) -> None:
    response = client.patch("/api/v1/auth/me", json={"currency": "USD"})

    assert response.status_code == 401
