import enum
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field

from app.models.spending_plan import Bucket
from app.schemas.month import Income
from app.schemas.spending_plan import Percentage

# An amount in the user's currency that can be negative, e.g. the -50.00 remaining in a
# bucket 50.00 over its target. Like the income, JSON output carries it as a string.
SignedAmount = Annotated[Decimal, Field(decimal_places=2)]
# A sum of entries' amounts, e.g. 1200.00. Unlike a single amount it has no upper
# limit.
AmountSum = Annotated[Decimal, Field(ge=0, decimal_places=2)]
# A share of the month's income that can exceed 100, e.g. 110.00 when a bucket's
# entries add up to more than the income.
ShareOfIncome = Annotated[Decimal, Field(ge=0, decimal_places=2)]


class BucketStatus(enum.StrEnum):
    """How a bucket's actual amount compares with its target amount: `on_track`
    within 5% of the target either way, `under` below that and `over` above it."""

    UNDER = "under"
    ON_TRACK = "on_track"
    OVER = "over"


class BucketSummary(BaseModel):
    """One bucket's target next to what its entries add up to."""

    bucket: Bucket
    target_pct: Percentage
    target_amount: Income
    actual_amount: AmountSum
    actual_pct: ShareOfIncome
    # Negative when the entries add up to more than the target.
    remaining: SignedAmount
    status: BucketStatus


class MonthSummary(BaseModel):
    """A month's targets and actuals, per bucket in the order of `Bucket`, and in
    total. Amounts and percentages are rounded to 2 decimal places."""

    income: Income
    buckets: list[BucketSummary]
    total_actual: AmountSum
    # Negative when the entries add up to more than the income.
    unallocated: SignedAmount
