from decimal import Decimal
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.spending_plan import Bucket

# A share of the month's income, e.g. 12.50 for 12.5%. JSON output carries it as a
# string ("12.50") so no precision is lost; input may be a number or a string.
Percentage = Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]


class SpendingPlanPercentages(BaseModel):
    """The share of each month's income that each bucket targets. The percentages
    add up to 100."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)

    fixed_costs_pct: Percentage
    investments_pct: Percentage
    savings_pct: Percentage
    guilt_free_pct: Percentage

    def target_pct(self, bucket: Bucket) -> Decimal:
        """The share of the income that `bucket` targets."""
        targets_by_bucket = {
            Bucket.FIXED_COSTS: self.fixed_costs_pct,
            Bucket.INVESTMENTS: self.investments_pct,
            Bucket.SAVINGS: self.savings_pct,
            Bucket.GUILT_FREE: self.guilt_free_pct,
        }
        return targets_by_bucket[bucket]

    @model_validator(mode="after")
    def check_the_total_is_100(self) -> Self:
        total_pct = (
            self.fixed_costs_pct
            + self.investments_pct
            + self.savings_pct
            + self.guilt_free_pct
        )
        if total_pct != 100:
            raise ValueError(f"The percentages add up to {total_pct}, not 100")
        return self
