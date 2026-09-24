from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr
from pydantic_extra_types.currency_code import ISO4217


def _lowercase(value: str) -> str:
    return value.lower()


# Emails are compared case-insensitively: always store and look them up lowercased.
Email = Annotated[EmailStr, AfterValidator(_lowercase)]
# ISO 4217 alphabetic code, e.g. EUR or USD, checked against pycountry's list. Lowercase input is
# uppercased.
CurrencyCode = ISO4217


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    currency: CurrencyCode | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: Email
    currency: CurrencyCode
    created_at: datetime
