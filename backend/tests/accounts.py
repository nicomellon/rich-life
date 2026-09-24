"""Helpers that create accounts through the passkey endpoints, for tests that need a
registered or signed-in user."""

from fastapi.testclient import TestClient
from httpx2 import Response
from pydantic import BaseModel

from app.schemas.auth import RegistrationChallengeRequest, Token
from app.schemas.user import Email
from app.schemas.webauthn import RegistrationOptions
from tests.authenticator import SoftwareAuthenticator

EMAIL = "ada@example.com"
OTHER_EMAIL = "grace@example.com"


def post_model(client: TestClient, path: str, model: BaseModel) -> Response:
    return client.post(
        path,
        content=model.model_dump_json(),
        headers={"Content-Type": "application/json"},
    )


def request_registration_options(
    client: TestClient, email: Email = EMAIL
) -> RegistrationOptions:
    response = post_model(
        client,
        "/api/v1/auth/register-challenge",
        RegistrationChallengeRequest(email=email),
    )
    assert response.status_code == 200, response.text
    return RegistrationOptions.model_validate(response.json())


def register(
    client: TestClient,
    authenticator: SoftwareAuthenticator,
    email: Email = EMAIL,
) -> Token:
    """Create an account whose passkey lives on `authenticator`."""
    registration = authenticator.create(request_registration_options(client, email))
    response = post_model(client, "/api/v1/auth/verify-registration", registration)
    assert response.status_code == 201, response.text
    return Token.model_validate(response.json())


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
