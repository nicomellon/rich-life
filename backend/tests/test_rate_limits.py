from datetime import timedelta

import pytest
from redis import Redis

from app.services.rate_limits import (
    RateLimit,
    RateLimitExceededError,
    count_request,
    uncount_request,
)

TWO_PER_15_MINUTES = RateLimit("test", limit=2, window=timedelta(minutes=15))
WINDOW_SECONDS = 15 * 60
CLIENT_IP = "203.0.113.7"
OTHER_CLIENT_IP = "198.51.100.1"


def count_requests_at(redis_client: Redis, *request_times: float) -> None:
    for request_time in request_times:
        count_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=request_time)


def test_count_request_lets_requests_through_up_to_the_limit(
    redis_client: Redis,
) -> None:
    count_requests_at(redis_client, 0)

    count_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=10)


def test_count_request_refuses_a_request_over_the_limit(redis_client: Redis) -> None:
    count_requests_at(redis_client, 0, 10)

    with pytest.raises(RateLimitExceededError):
        count_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=20)


def test_count_request_says_to_retry_when_the_oldest_request_leaves_the_window(
    redis_client: Redis,
) -> None:
    count_requests_at(redis_client, 0, 10)

    with pytest.raises(RateLimitExceededError) as refusal:
        count_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=100)

    assert refusal.value.retry_after_seconds == WINDOW_SECONDS - 100


def test_count_request_lets_a_request_through_once_the_oldest_leaves_the_window(
    redis_client: Redis,
) -> None:
    count_requests_at(redis_client, 0, 600)

    count_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=WINDOW_SECONDS + 1)


def test_count_request_window_rolls_with_each_request(redis_client: Redis) -> None:
    count_requests_at(redis_client, 0, 600, WINDOW_SECONDS + 1)

    with pytest.raises(RateLimitExceededError):
        count_request(
            redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=WINDOW_SECONDS + 2
        )


def test_count_request_does_not_count_refused_requests(redis_client: Redis) -> None:
    count_requests_at(redis_client, 0, 10)
    with pytest.raises(RateLimitExceededError):
        count_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=20)

    count_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=WINDOW_SECONDS + 5)


def test_count_request_counts_each_key_separately(redis_client: Redis) -> None:
    count_requests_at(redis_client, 0, 10)

    count_request(redis_client, TWO_PER_15_MINUTES, OTHER_CLIENT_IP, now=20)


def test_count_request_keeps_no_plain_key_in_redis(redis_client: Redis) -> None:
    count_request(redis_client, TWO_PER_15_MINUTES, "ada@example.com", now=0)

    assert [
        redis_key
        for redis_key in redis_client.scan_iter("rate-limit:*")
        if b"ada@example.com" in redis_key
    ] == []


def test_count_request_lets_its_counts_expire_after_the_window(
    redis_client: Redis,
) -> None:
    count_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=0)

    [rate_limit_key] = redis_client.scan_iter("rate-limit:*")
    assert redis_client.ttl(rate_limit_key) == WINDOW_SECONDS


def test_uncount_request_frees_the_requests_place(redis_client: Redis) -> None:
    count_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=0)
    request_id = count_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=10)

    uncount_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, request_id)

    count_request(redis_client, TWO_PER_15_MINUTES, CLIENT_IP, now=20)
