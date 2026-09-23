# rich-life

A personal finance app for planning and tracking monthly spending. Each month's income is split into four buckets (Fixed Costs, Investments, Savings and Guilt-Free Spending) according to target percentages you choose, and you compare what you actually spent against that plan.

- Plan: [docs/mvp-plan.md](docs/mvp-plan.md)
- How to contribute (branches, commits, pull requests): [CONTRIBUTING.md](CONTRIBUTING.md)

## Repository layout

| Path | Contents |
|---|---|
| `backend/` | API: Python, FastAPI, Pydantic, SQLAlchemy, Alembic |
| `frontend/` | Web app: React, TypeScript, Vite |
| `docker-compose.yml` | Local PostgreSQL database and optional pgAdmin |
| `scripts/` | Repository tooling, such as the commit convention checker |
| `docs/` | Plans and design notes |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose (Docker Desktop, OrbStack or Colima all work)
- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- Node.js 22+ and npm
- [pre-commit](https://pre-commit.com/): `uv tool install pre-commit`
- GNU Make (preinstalled on macOS and most Linux distributions)

## Getting started

```sh
make setup   # install the git hooks and backend dependencies, and create .env from .env.example
make db      # start PostgreSQL and wait until it's ready
make migrate # apply the database migrations
make backend # run the API on http://localhost:8000
```

Run `make help` to see every command.

### Database

PostgreSQL 18 runs in Docker, with its data kept in a named volume so it survives restarts. The defaults in `.env.example` give this connection URL:

```
postgresql://richlife:richlife@localhost:5432/richlife
```

| Command | What it does |
|---|---|
| `make db` | Start Postgres (same as `docker compose up -d db`) |
| `make migrate` | Apply the migrations (`alembic upgrade head`) |
| `make migration m="..."` | Autogenerate a migration from model changes |
| `make db-shell` | Open `psql` in the database |
| `make db-stop` | Stop the containers, keeping the data |
| `make db-reset` | Delete all data and start a fresh database |
| `make pgadmin` | Start pgAdmin on http://localhost:5050 (log in with `admin@example.com` / `admin`; the local server is preconfigured) |

To change the port or credentials, edit `.env`. If you change the user or database name, also update `docker/pgadmin/servers.json`.

### Backend

`make backend` runs the API with auto-reload on http://localhost:8000. The health check is at `/health` and the interactive API docs are at `/docs`. See [backend/README.md](backend/README.md) for configuration, layout and checks.

### Frontend

Not scaffolded yet; see #4. It will run on http://localhost:5173.

## Common commands

| Command | What it does |
|---|---|
| `make dev` | Start the database, apply the migrations and run the API |
| `make test` | Run all tests |
| `make lint` | Run all linters and formatting checks |
