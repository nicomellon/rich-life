import datetime as dt
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.entry import DESCRIPTION_MAX_LENGTH
from app.models.spending_plan import Bucket

# An expense or allocation in the user's currency, e.g. 1200.00. Like the income, JSON
# output carries it as a string so no precision is lost.
Amount = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
Description = Annotated[str, Field(max_length=DESCRIPTION_MAX_LENGTH)]


class EntryCreate(BaseModel):
    """A new entry. Its date must fall within the month it's added to."""

    model_config = ConfigDict(extra="forbid")

    bucket: Bucket
    amount: Amount
    date: dt.date
    description: Description = ""


class EntryUpdate(BaseModel):
    """The fields to change; the ones left out keep their value. A new date must
    still fall within the entry's month."""

    model_config = ConfigDict(extra="forbid")

    bucket: Bucket | None = None
    amount: Amount | None = None
    date: dt.date | None = None
    description: Description | None = None

    @field_validator("*")
    @classmethod
    def reject_null(cls, sent_field: object) -> object:
        """Leaving a field out keeps its value; none of them can be set to null."""
        if sent_field is None:
            raise ValueError("Leave the field out to keep its value")
        return sent_field


class EntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bucket: Bucket
    amount: Amount
    date: dt.date
    description: Description
    created_at: dt.datetime
