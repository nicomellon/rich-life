"""Rolling-window rate limits kept in Redis. Each limited key is a sorted set of the
times its requests arrived; a request is let through while fewer than the limit
arrived within the window before it."""

import hashlib
import math
import secrets
from dataclasses import dataclass
from datetime import timedelta

from pydantic import TypeAdapter
from redis import Redis

# A sorted set's members with their scores: each request's id and arrival time.
TimedRequests = TypeAdapter(list[tuple[bytes, float]])
# What count_request's pipeline returns: requests removed for leaving the window,
# requests added, requests now in the window, and whether the expiry was set.
CountingResults = TypeAdapter(tuple[int, int, int, bool])


@dataclass(frozen=True)
class RateLimit:
    """At most `limit` requests per key in any `window`, e.g. 3 sign-in links per
    email address in 15 minutes."""

    name: str
    limit: int
    window: timedelta


class RateLimitExceededError(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(f"Rate limit exceeded; retry in {retry_after_seconds}s")
        self.retry_after_seconds = retry_after_seconds


def count_request(redis: Redis, rate_limit: RateLimit, key: str, now: float) -> str:
    """Count a request for `key` at `now` (Unix time in seconds) and return its id,
    or raise `RateLimitExceededError` if the key has used up its limit. Refused
    requests aren't counted."""
    redis_key = _redis_key(rate_limit, key)
    window_seconds = rate_limit.window.total_seconds()
    # Unique, so requests arriving at the same instant are counted separately.
    request_id = f"{now}:{secrets.token_hex(8)}"
    # One transaction, so concurrent requests can't both take the last place.
    pipeline = redis.pipeline()
    pipeline.zremrangebyscore(redis_key, "-inf", now - window_seconds)
    pipeline.zadd(redis_key, {request_id: now})
    pipeline.zcard(redis_key)
    pipeline.expire(redis_key, math.ceil(window_seconds))
    _, _, request_count, _ = CountingResults.validate_python(pipeline.execute())
    if request_count <= rate_limit.limit:
        return request_id

    redis.zrem(redis_key, request_id)
    oldest_requests = TimedRequests.validate_python(
        redis.zrange(redis_key, 0, 0, withscores=True)
    )
    oldest_request_time = oldest_requests[0][1] if oldest_requests else now
    retry_after_seconds = oldest_request_time + window_seconds - now
    raise RateLimitExceededError(max(1, math.ceil(retry_after_seconds)))


def uncount_request(
    redis: Redis, rate_limit: RateLimit, key: str, request_id: str
) -> None:
    """Take back a request `count_request` counted, e.g. when a later check refuses
    it, so refused requests never use up a limit."""
    redis.zrem(_redis_key(rate_limit, key), request_id)


def _redis_key(rate_limit: RateLimit, key: str) -> str:
    # Hashed, so personal data such as email addresses never lands in Redis.
    hashed_key = hashlib.sha256(key.encode()).hexdigest()
    return f"rate-limit:{rate_limit.name}:{hashed_key}"
