from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.user import Email
from app.schemas.webauthn import Base64URLBytes


class RegistrationChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Email


class MagicLinkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Email


class MagicLinkVerification(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The token from the sign-in link's fragment, as it appears there.
    token: Base64URLBytes


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
