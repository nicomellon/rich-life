# Backend

The Rich Life API: FastAPI and Pydantic, with SQLAlchemy and Alembic on PostgreSQL (the database layer arrives in #3). Dependencies are managed with [uv](https://docs.astral.sh/uv/).

## Running

From the repository root, `make setup` installs the dependencies and creates `.env`, then `make backend` starts the API. To do it by hand:

```sh
cd backend
uv sync
uv run --env-file ../.env uvicorn app.main:app --reload
```

- Health check: http://localhost:8000/health
- Interactive API docs: http://localhost:8000/docs

## Configuration

Following the [twelve-factor](https://12factor.net/config) approach, `app/core/config.py` reads settings **only from environment variables**; the app never opens a `.env` file itself. For local development, `make backend` loads the root `.env` (the same one docker compose uses) into the environment with `uv run --env-file`. You can use any other tool for that instead, such as direnv or `UV_ENV_FILE=../.env`. In production, set real environment variables. See `.env.example` for the defaults.

| Variable | Required | Default |
|---|---|---|
| `APP_VERSION` | no | `dev` (set by the build or deploy pipeline, e.g. to a git tag or commit SHA) |
| `DATABASE_URL` | no | `postgresql+psycopg://richlife:richlife@localhost:5432/richlife` |
| `JWT_SECRET` | yes | none |
| `CORS_ORIGINS` | no | `http://localhost:5173` (comma-separated list) |

## Layout

| Path | Contents |
|---|---|
| `app/main.py` | App factory: middleware, `/health` and the `/api/v1` router |
| `app/core/` | Settings and, later, security helpers |
| `app/api/v1/` | Versioned API router; feature routers go in `routers/` |
| `app/db/` | Engine, sessions and declarative base (#3) |
| `app/models/` | SQLAlchemy models |
| `app/schemas/` | Pydantic request and response models |
| `app/services/` | Business logic, kept free of HTTP concerns |
| `tests/` | pytest suite |

## Checks

```sh
uv run pytest                  # tests
uv run ruff check .            # lint
uv run ruff format .           # format
uv run mypy                    # type check (strict)
```

`make test` and `make lint` from the repository root run these along with the rest of the repository's checks.
