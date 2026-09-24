import io
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.orm import Session

from app.db.session import get_db

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_get_db_yields_a_session_and_closes_it() -> None:
    dependency = get_db()
    session = next(dependency)
    closed: list[Session] = []
    session.close = lambda: closed.append(session)  # type: ignore[method-assign]

    assert isinstance(session, Session)
    dependency.close()

    assert closed == [session]


def test_alembic_is_configured_from_the_app() -> None:
    # Offline mode renders the migration SQL without a database, which exercises
    # migrations/env.py end to end.
    output = io.StringIO()
    config = Config(toml_file=str(BACKEND_DIR / "pyproject.toml"), stdout=output)
    config.output_buffer = output

    command.upgrade(config, "head", sql=True)

    assert "BEGIN;" in output.getvalue()
