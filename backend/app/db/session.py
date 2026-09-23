from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


@lru_cache
def get_engine() -> Engine:
    # pre_ping replaces connections the server has closed (e.g. after a database restart) instead of failing a request.
    return create_engine(get_settings().database_url, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    # Objects stay usable after commit, so routes can return what they just saved without reloading it.
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session]:
    """FastAPI dependency: one session per request, closed when the response is done. Callers commit explicitly;
    anything left uncommitted is rolled back on close."""
    with get_sessionmaker()() as session:
        yield session
