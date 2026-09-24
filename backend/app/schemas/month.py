from datetime import MAXYEAR, MINYEAR, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.spending_plan import SpendingPlanPercentages

# A calendar year and month, e.g. 2026 and 9 for September 2026. The year is limited to
# the range Python dates support, since entries are dated within their month.
Year = Annotated[int, Field(ge=MINYEAR, le=MAXYEAR)]
MonthNumber = Annotated[int, Field(ge=1, le=12)]
# An amount in the user's currency, e.g. 3000.00. Like percentages, JSON output carries
# it as a string so no precision is lost.
Income = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]


class MonthCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    year: Year
    month: MonthNumber
    income: Income


class MonthUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    income: Income


class MonthRead(SpendingPlanPercentages):
    """A budgeted month: its income and the share of it each bucket targets."""

    year: Year
    month: MonthNumber
    income: Income
    created_at: datetime
