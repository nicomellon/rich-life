from functools import lru_cache

from redis import Redis

from app.core.config import get_settings


@lru_cache
def get_redis() -> Redis:
    """FastAPI dependency: the client for REDIS_URL. It keeps a connection pool, so
    every request shares one client."""
    return Redis.from_url(get_settings().redis_url)
