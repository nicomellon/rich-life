import datetime as dt
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.models.spending_plan import Bucket
from app.schemas.entry import EntryCreate
from app.schemas.month import MonthRead
from app.schemas.spending_plan import SpendingPlanPercentages
from app.schemas.summary import BucketStatus, BucketSummary, MonthSummary
from app.services.summary import summarize_month
from tests.entries import create_entry
from tests.months import OCTOBER, SEPTEMBER, SEPTEMBER_PATH, create_month, send_json
from tests.spending_plans import DEFAULT_PLAN, NEW_PLAN

SEPTEMBER_SUMMARY_PATH = f"{SEPTEMBER_PATH}/summary"
# The example from docs/mvp-plan.md: an income of 3000 with the default 50/10/20/20
# plan and these actual amounts.
EXAMPLE_INCOME = SEPTEMBER.income
EXAMPLE_ACTUAL_AMOUNTS = {
    Bucket.FIXED_COSTS: Decimal(1200),
    Bucket.INVESTMENTS: Decimal(300),
    Bucket.SAVINGS: Decimal(600),
    Bucket.GUILT_FREE: Decimal(400),
}
EXAMPLE_SUMMARY = MonthSummary(
    income=Decimal("3000.00"),
    buckets=[
        BucketSummary(
            bucket=Bucket.FIXED_COSTS,
            target_pct=Decimal("50.00"),
            target_amount=Decimal("1500.00"),
            actual_amount=Decimal("1200.00"),
            actual_pct=Decimal("40.00"),
            remaining=Decimal("300.00"),
            status=BucketStatus.UNDER,
        ),
        BucketSummary(
            bucket=Bucket.INVESTMENTS,
            target_pct=Decimal("10.00"),
            target_amount=Decimal("300.00"),
            actual_amount=Decimal("300.00"),
            actual_pct=Decimal("10.00"),
            remaining=Decimal("0.00"),
            status=BucketStatus.ON_TRACK,
        ),
        BucketSummary(
            bucket=Bucket.SAVINGS,
            target_pct=Decimal("20.00"),
            target_amount=Decimal("600.00"),
            actual_amount=Decimal("600.00"),
            actual_pct=Decimal("20.00"),
            remaining=Decimal("0.00"),
            status=BucketStatus.ON_TRACK,
        ),
        BucketSummary(
            bucket=Bucket.GUILT_FREE,
            target_pct=Decimal("20.00"),
            target_amount=Decimal("600.00"),
            actual_amount=Decimal("400.00"),
            actual_pct=Decimal("13.33"),
            remaining=Decimal("200.00"),
            status=BucketStatus.UNDER,
        ),
    ],
    total_actual=Decimal("2500.00"),
    unallocated=Decimal("500.00"),
)

# Targets that leave nothing for guilt-free spending.
NO_GUILT_FREE_TARGETS = SpendingPlanPercentages(
    fixed_costs_pct=Decimal("33.33"),
    investments_pct=Decimal("33.33"),
    savings_pct=Decimal("33.34"),
    guilt_free_pct=Decimal(0),
)


def bucket_summary_of(
    month_summary: MonthSummary, bucket: Bucket = Bucket.FIXED_COSTS
) -> BucketSummary:
    """The part of `month_summary` about `bucket`."""
    return next(
        bucket_summary
        for bucket_summary in month_summary.buckets
        if bucket_summary.bucket == bucket
    )


def summarize_fixed_costs(
    income: Decimal, fixed_costs_amount: Decimal = Decimal(0)
) -> BucketSummary:
    """The fixed costs of a month on the default plan (50% fixed costs) whose only
    entries are `fixed_costs_amount` in fixed costs."""
    month_summary = summarize_month(
        income, DEFAULT_PLAN, {Bucket.FIXED_COSTS: fixed_costs_amount}
    )
    return bucket_summary_of(month_summary)


# The math


def test_summarize_month_returns_the_targets_and_actuals_of_every_bucket() -> None:
    month_summary = summarize_month(
        EXAMPLE_INCOME, DEFAULT_PLAN, EXAMPLE_ACTUAL_AMOUNTS
    )

    assert month_summary == EXAMPLE_SUMMARY


def test_summarize_month_lists_the_buckets_in_the_order_of_the_enum() -> None:
    month_summary = summarize_month(EXAMPLE_INCOME, DEFAULT_PLAN, {})

    assert [bucket_summary.bucket for bucket_summary in month_summary.buckets] == list(
        Bucket
    )


def test_summarize_month_gives_an_empty_bucket_an_actual_amount_of_0() -> None:
    month_summary = summarize_month(EXAMPLE_INCOME, DEFAULT_PLAN, {})

    assert bucket_summary_of(month_summary, Bucket.SAVINGS).actual_amount == Decimal(
        "0.00"
    )


def test_summarize_month_uses_the_months_own_targets() -> None:
    month_summary = summarize_month(Decimal(900), NO_GUILT_FREE_TARGETS, {})

    assert [
        bucket_summary.target_amount for bucket_summary in month_summary.buckets
    ] == [Decimal("299.97"), Decimal("299.97"), Decimal("300.06"), Decimal("0.00")]


@pytest.mark.parametrize(
    ("income", "target_amount"),
    [(Decimal("100.05"), Decimal("50.03")), (Decimal("100.03"), Decimal("50.02"))],
    ids=["half-rounds-up", "below-half-rounds-down"],
)
def test_summarize_month_rounds_the_target_amount_to_2_decimal_places(
    income: Decimal, target_amount: Decimal
) -> None:
    fixed_costs = summarize_fixed_costs(income)

    assert fixed_costs.target_amount == target_amount


@pytest.mark.parametrize(
    ("income", "actual_pct"),
    [(Decimal(800), Decimal("0.13")), (Decimal(300), Decimal("0.33"))],
    ids=["half-rounds-up", "below-half-rounds-down"],
)
def test_summarize_month_rounds_the_actual_pct_to_2_decimal_places(
    income: Decimal, actual_pct: Decimal
) -> None:
    fixed_costs = summarize_fixed_costs(income, Decimal(1))

    assert fixed_costs.actual_pct == actual_pct


def test_summarize_month_gives_whole_amounts_2_decimal_places() -> None:
    fixed_costs = summarize_fixed_costs(Decimal(1000))

    assert '"target_amount":"500.00"' in fixed_costs.model_dump_json()


def test_summarize_month_gives_an_actual_pct_over_100_above_the_income() -> None:
    fixed_costs = summarize_fixed_costs(Decimal(1000), Decimal(1100))

    assert fixed_costs.actual_pct == Decimal("110.00")


def test_summarize_month_gives_a_negative_remaining_amount_over_the_target() -> None:
    fixed_costs = summarize_fixed_costs(Decimal(1000), Decimal(550))

    assert fixed_costs.remaining == Decimal("-50.00")


def test_summarize_month_gives_a_negative_unallocated_amount_over_the_income() -> None:
    month_summary = summarize_month(
        Decimal(1000), DEFAULT_PLAN, {Bucket.FIXED_COSTS: Decimal("1000.01")}
    )

    assert month_summary.unallocated == Decimal("-0.01")


# Status. On the default plan, an income of 1000 gives fixed costs a target of 500,
# so the 5% band runs from 475 to 525.


@pytest.mark.parametrize(
    "fixed_costs_amount",
    [Decimal(500), Decimal(525), Decimal(475)],
    ids=["at-the-target", "5-percent-over", "5-percent-under"],
)
def test_summarize_month_within_5_percent_of_the_target_is_on_track(
    fixed_costs_amount: Decimal,
) -> None:
    fixed_costs = summarize_fixed_costs(Decimal(1000), fixed_costs_amount)

    assert fixed_costs.status == BucketStatus.ON_TRACK


@pytest.mark.parametrize(
    "fixed_costs_amount",
    [Decimal("525.01"), Decimal(700)],
    ids=["just-above-the-band", "far-above-the-band"],
)
def test_summarize_month_above_5_percent_over_the_target_is_over(
    fixed_costs_amount: Decimal,
) -> None:
    fixed_costs = summarize_fixed_costs(Decimal(1000), fixed_costs_amount)

    assert fixed_costs.status == BucketStatus.OVER


@pytest.mark.parametrize(
    "fixed_costs_amount",
    [Decimal("474.99"), Decimal(300)],
    ids=["just-below-the-band", "far-below-the-band"],
)
def test_summarize_month_below_5_percent_under_the_target_is_under(
    fixed_costs_amount: Decimal,
) -> None:
    fixed_costs = summarize_fixed_costs(Decimal(1000), fixed_costs_amount)

    assert fixed_costs.status == BucketStatus.UNDER


def test_summarize_month_with_a_target_of_0_and_no_spending_is_on_track() -> None:
    month_summary = summarize_month(Decimal(1000), NO_GUILT_FREE_TARGETS, {})

    assert (
        bucket_summary_of(month_summary, Bucket.GUILT_FREE).status
        == BucketStatus.ON_TRACK
    )


def test_summarize_month_with_a_target_of_0_and_any_spending_is_over() -> None:
    month_summary = summarize_month(
        Decimal(1000), NO_GUILT_FREE_TARGETS, {Bucket.GUILT_FREE: Decimal("0.01")}
    )

    assert (
        bucket_summary_of(month_summary, Bucket.GUILT_FREE).status == BucketStatus.OVER
    )


# Zero income


def test_summarize_month_with_zero_income_gives_target_amounts_of_0() -> None:
    fixed_costs = summarize_fixed_costs(Decimal(0))

    assert fixed_costs.target_amount == Decimal("0.00")


def test_summarize_month_with_zero_income_gives_an_actual_pct_of_0() -> None:
    fixed_costs = summarize_fixed_costs(Decimal(0), Decimal(250))

    assert fixed_costs.actual_pct == Decimal("0.00")


def test_summarize_month_with_zero_income_gives_a_negative_remaining_amount() -> None:
    fixed_costs = summarize_fixed_costs(Decimal(0), Decimal(250))

    assert fixed_costs.remaining == Decimal("-250.00")


# The endpoint


def read_september_summary(client: TestClient, headers: dict[str, str]) -> MonthSummary:
    response = client.get(SEPTEMBER_SUMMARY_PATH, headers=headers)
    assert response.status_code == 200, response.text
    return MonthSummary.model_validate(response.json())


def september_entry(bucket: Bucket, amount: Decimal) -> EntryCreate:
    return EntryCreate(bucket=bucket, amount=amount, date=dt.date(2026, 9, 15))


@pytest.fixture
def september(client: TestClient, signed_in_headers: dict[str, str]) -> MonthRead:
    """September 2026 with an income of 3000, created by the signed-in user with the
    default plan."""
    return create_month(client, signed_in_headers, SEPTEMBER)


def test_month_summary_returns_the_targets_and_actuals_of_the_months_entries(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    for bucket, amount in EXAMPLE_ACTUAL_AMOUNTS.items():
        create_entry(client, signed_in_headers, september_entry(bucket, amount))

    month_summary = read_september_summary(client, signed_in_headers)

    assert month_summary == EXAMPLE_SUMMARY


def test_month_summary_adds_up_a_buckets_entries(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    for amount in [Decimal("10.25"), Decimal("20.50")]:
        create_entry(
            client, signed_in_headers, september_entry(Bucket.GUILT_FREE, amount)
        )

    month_summary = read_september_summary(client, signed_in_headers)

    assert bucket_summary_of(month_summary, Bucket.GUILT_FREE).actual_amount == Decimal(
        "30.75"
    )


def test_month_summary_uses_the_months_targets(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    response = send_json(
        client, "PUT", f"{SEPTEMBER_PATH}/targets", signed_in_headers, NEW_PLAN
    )
    assert response.status_code == 200, response.text

    month_summary = read_september_summary(client, signed_in_headers)

    assert [bucket_summary.target_pct for bucket_summary in month_summary.buckets] == [
        NEW_PLAN.target_pct(bucket) for bucket in Bucket
    ]


def test_month_summary_leaves_out_other_months_entries(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    create_month(client, signed_in_headers, OCTOBER)
    create_entry(
        client,
        signed_in_headers,
        EntryCreate(
            bucket=Bucket.FIXED_COSTS, amount=Decimal(1200), date=dt.date(2026, 10, 1)
        ),
        "/api/v1/months/2026/10/entries",
    )

    month_summary = read_september_summary(client, signed_in_headers)

    assert month_summary.total_actual == Decimal("0.00")


def test_month_summary_returns_amounts_as_decimal_strings(
    client: TestClient, signed_in_headers: dict[str, str], september: MonthRead
) -> None:
    response = client.get(SEPTEMBER_SUMMARY_PATH, headers=signed_in_headers)

    assert '"unallocated":"3000.00"' in response.text


def test_another_users_month_summary_returns_404(
    client: TestClient, september: MonthRead, other_user_headers: dict[str, str]
) -> None:
    response = client.get(SEPTEMBER_SUMMARY_PATH, headers=other_user_headers)

    assert response.status_code == 404
