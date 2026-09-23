from typing import Any

from pydantic import BaseModel, ConfigDict

from app.schemas.user import Email

# WebAuthn options and credentials are passed through as JSON objects in the shapes the browser API uses
# (PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON and so on), which @simplewebauthn/browser
# produces and consumes. py_webauthn validates the credentials, so they aren't modelled field by field here.
WebAuthnJSON = dict[str, Any]


class RegistrationChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Email


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
