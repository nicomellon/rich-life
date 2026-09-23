from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field
from pydantic_extra_types.currency_code import ISO4217


def _lowercase(value: str) -> str:
    return value.lower()


# Emails are compared case-insensitively: always store and look them up lowercased.
Email = Annotated[EmailStr, AfterValidator(_lowercase)]
# ISO 4217 alphabetic code, e.g. EUR or USD, checked against pycountry's list. Lowercase input is uppercased.
CurrencyCode = ISO4217
# Argon2 handles any length; the upper bound only stops absurdly large request bodies from being hashed.
Password = Annotated[str, Field(min_length=8, max_length=128)]


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Email
    password: Password


class UserLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Email
    # No length rules here: a wrong password is a 401, not a validation error.
    password: str


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    currency: CurrencyCode | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    currency: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
