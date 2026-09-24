import os
from collections.abc import Generator
from pathlib import Path

# The app reads settings from the environment only, so provide the required ones for tests.
os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 32)

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import get_db, get_engine
from app.main import app

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def migrated_database() -> None:
    """Bring the DATABASE_URL database up to the latest migration once per test run."""
    command.upgrade(Config(toml_file=str(BACKEND_DIR / "pyproject.toml")), "head")


@pytest.fixture
def db(migrated_database: None) -> Generator[Session]:
    """A session whose changes are all rolled back after the test, even the ones it commits:
    commits only release a savepoint inside an outer transaction that is never committed."""
    with get_engine().connect() as connection:
        transaction = connection.begin()
        with Session(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        ) as session:
            yield session
        transaction.rollback()


@pytest.fixture
def client(db: Session) -> Generator[TestClient]:
    """A client for the app whose requests all use the test's `db` session."""
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
