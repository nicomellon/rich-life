import os
from collections.abc import Generator
from pathlib import Path

# The app reads settings from the environment only, so provide the required ones for
# tests.
os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 32)
# The tests empty this Redis database, so by default they use their own, apart from
# the development server's database 0.
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from redis import Redis
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.redis import get_redis
from app.db.session import get_db, get_engine
from app.main import app
from app.models.user import User
from app.services.email import get_email_sender
from tests.accounts import EMAIL, OTHER_EMAIL, auth_header, register
from tests.authenticator import SoftwareAuthenticator
from tests.emails import FakeEmailSender

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def migrated_database() -> None:
    """Bring the DATABASE_URL database up to the latest migration once per test run."""
    command.upgrade(Config(toml_file=str(BACKEND_DIR / "pyproject.toml")), "head")


@pytest.fixture
def db(migrated_database: None) -> Generator[Session]:
    """A session whose changes are all rolled back after the test, even the ones it
    commits: commits only release a savepoint inside an outer transaction that is
    never committed."""
    with get_engine().connect() as connection:
        transaction = connection.begin()
        with Session(
            bind=connection,
            join_transaction_mode="create_savepoint",
            expire_on_commit=False,
        ) as session:
            yield session
        transaction.rollback()


@pytest.fixture
def redis_client() -> Generator[Redis]:
    """The REDIS_URL database, emptied before and after the test, so no magic link or
    rate-limit count carries over between tests."""
    redis_client = get_redis()
    redis_client.flushdb()
    yield redis_client
    redis_client.flushdb()


@pytest.fixture
def email_sender() -> FakeEmailSender:
    return FakeEmailSender()


@pytest.fixture
def client(
    db: Session, redis_client: Redis, email_sender: FakeEmailSender
) -> Generator[TestClient]:
    """A client for the app whose requests all use the test's `db` session and empty
    Redis, and whose emails go to `email_sender`."""
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_email_sender] = lambda: email_sender
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def authenticator() -> SoftwareAuthenticator:
    return SoftwareAuthenticator()


@pytest.fixture
def signed_in_headers(
    client: TestClient, authenticator: SoftwareAuthenticator
) -> dict[str, str]:
    """Authorization headers for a newly registered account (`tests.accounts.EMAIL`)."""
    return auth_header(register(client, authenticator).access_token)


@pytest.fixture
def other_user_headers(client: TestClient) -> dict[str, str]:
    """Authorization headers for a second account (`tests.accounts.OTHER_EMAIL`)."""
    return auth_header(
        register(client, SoftwareAuthenticator(), OTHER_EMAIL).access_token
    )


@pytest.fixture
def registered_authenticator(
    client: TestClient,
    authenticator: SoftwareAuthenticator,
) -> SoftwareAuthenticator:
    """An authenticator holding the passkey of a registered account."""
    register(client, authenticator)
    return authenticator


@pytest.fixture
def registered_user(
    db: Session,
    registered_authenticator: SoftwareAuthenticator,
) -> User:
    """The account `tests.accounts.EMAIL`, whose passkey is on
    `registered_authenticator`."""
    return db.scalars(select(User).where(User.email == EMAIL)).one()
