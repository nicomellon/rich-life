from collections.abc import Mapping
from decimal import ROUND_HALF_UP, Decimal

from app.models.spending_plan import Bucket
from app.schemas.spending_plan import SpendingPlanPercentages
from app.schemas.summary import BucketStatus, BucketSummary, MonthSummary

CENT = Decimal("0.01")
# How far, as a share of the target amount, the actual amount can be from it either
# way and still count as on track.
ON_TRACK_TOLERANCE = Decimal("0.05")


def _round(unrounded: Decimal) -> Decimal:
    """Round to 2 decimal places, halves away from zero, e.g. 50.025 to 50.03."""
    return unrounded.quantize(CENT, rounding=ROUND_HALF_UP)


def _share_of_income(amount: Decimal, income: Decimal) -> Decimal:
    """`amount` as a percentage of `income`, or 0 when the income is 0."""
    if income == 0:
        return _round(Decimal(0))
    return _round(amount / income * 100)


def _bucket_status(target_amount: Decimal, actual_amount: Decimal) -> BucketStatus:
    """Compare the actual amount with the target amount, within the tolerance band
    (boundaries included). With a target of 0, any spending is over."""
    tolerance = target_amount * ON_TRACK_TOLERANCE
    if actual_amount > target_amount + tolerance:
        return BucketStatus.OVER
    if actual_amount < target_amount - tolerance:
        return BucketStatus.UNDER
    return BucketStatus.ON_TRACK


def summarize_month(
    income: Decimal,
    targets: SpendingPlanPercentages,
    actual_amounts: Mapping[Bucket, Decimal],
) -> MonthSummary:
    """Compare each bucket's target with what its entries add up to.

    `actual_amounts` holds the sum of each bucket's entries; a bucket left out has
    none. A bucket's target amount is its share of the income, and its remaining
    amount is the target amount minus the actual amount. Its status is on track when
    the actual amount is within 5% of the target amount. The unallocated amount is
    the income minus every bucket's actual amount. Both go negative when more is
    spent than planned."""
    rounded_income = _round(income)
    bucket_summaries = []
    for bucket in Bucket:
        target_pct = _round(targets.target_pct(bucket))
        target_amount = _round(rounded_income * target_pct / 100)
        actual_amount = _round(actual_amounts.get(bucket, Decimal(0)))
        bucket_summaries.append(
            BucketSummary(
                bucket=bucket,
                target_pct=target_pct,
                target_amount=target_amount,
                actual_amount=actual_amount,
                actual_pct=_share_of_income(actual_amount, rounded_income),
                remaining=target_amount - actual_amount,
                status=_bucket_status(target_amount, actual_amount),
            )
        )
    total_actual = sum(
        (bucket_summary.actual_amount for bucket_summary in bucket_summaries),
        start=_round(Decimal(0)),
    )
    return MonthSummary(
        income=rounded_income,
        buckets=bucket_summaries,
        total_actual=total_actual,
        unallocated=rounded_income - total_actual,
    )
