from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.user import Email


class RegistrationChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Email


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
