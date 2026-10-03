# rich-life

A personal finance app for planning and tracking monthly spending. Each month's income is split into four buckets (Fixed Costs, Investments, Savings and Guilt-Free Spending) according to target percentages you choose, and you compare what you actually spent against that plan.

- Plan: [docs/mvp-plan.md](docs/mvp-plan.md)
- How to contribute (branches, commits, pull requests): [CONTRIBUTING.md](CONTRIBUTING.md)
- How to deploy: [docs/deployment.md](docs/deployment.md)

## Repository layout

| Path | Contents |
|---|---|
| `backend/` | API: Python, FastAPI, Pydantic, SQLAlchemy, Alembic |
| `frontend/` | Web app: React, TypeScript, Vite |
| `docker-compose.yml` | Local PostgreSQL database, Redis and optional pgAdmin |
| `docker-compose.prod.yml` | Production stack: database, API and web app behind Caddy (see [docs/deployment.md](docs/deployment.md)) |
| `scripts/` | Repository tooling, such as the commit convention checker |
| `docs/` | Plans, design notes and the deployment guide |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose (Docker Desktop, OrbStack or Colima all work)
- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- Node.js 22+ and npm
- [pre-commit](https://pre-commit.com/): `uv tool install pre-commit`
- GNU Make (preinstalled on macOS and most Linux distributions)

## Getting started

```sh
make setup   # install the git hooks and dependencies, and create .env from .env.example
make db      # start PostgreSQL and Redis and wait until they're ready
make migrate # apply the database migrations
make dev     # run the API on http://localhost:8000 and the web app on http://localhost:5173
```

`make backend` and `make frontend` run either one on its own.

Run `make help` to see every command.

### Database

PostgreSQL 18 runs in Docker, with its data kept in a named volume so it survives restarts. The defaults in `.env.example` give this connection URL:

```
postgresql://richlife:richlife@localhost:5432/richlife
```

| Command | What it does |
|---|---|
| `make db` | Start Postgres and Redis (same as `docker compose up -d db redis`) |
| `make migrate` | Apply the migrations (`alembic upgrade head`) |
| `make migration m="..."` | Autogenerate a migration from model changes |
| `make seed email=...` | Add 3 months of example data to an account you registered in the app |
| `make db-shell` | Open `psql` in the database |
| `make db-stop` | Stop the containers, keeping the data |
| `make db-reset` | Delete all data and start a fresh database |
| `make pgadmin` | Start pgAdmin on http://localhost:5050 (log in with `admin@example.com` / `admin`; the local server is preconfigured) |

Redis runs alongside it, at `redis://localhost:6379/0`, and holds the magic-link tokens and rate-limit counts. It keeps nothing on disk.

To change the ports or credentials, edit `.env`. If you change the user or database name, also update `docker/pgadmin/servers.json`.

### Backend

`make backend` runs the API with auto-reload on http://localhost:8000. The health check is at `/health` and the interactive API docs are at `/docs`. See [backend/README.md](backend/README.md) for configuration, layout and checks.

### Frontend

`make frontend` runs the web app with hot reload on http://localhost:5173. It calls the API on its own origin under `/api`, which the dev server passes through to the backend. See [frontend/README.md](frontend/README.md) for configuration, layout and checks.

## Common commands

| Command | What it does |
|---|---|
| `make dev` | Start the database, apply the migrations, and run the API and the web app |
| `make test` | Run all tests |
| `make e2e` | Run the end-to-end tests in Chromium (starts the database, the API and the web app if they aren't running) |
| `make lint` | Run all linters and formatting checks |
| `make prod-smoke` | Build the production images and check the stack answers (see [docs/deployment.md](docs/deployment.md#try-it-locally)) |

## Deployment

The backend and the web app each have a Dockerfile, and `docker-compose.prod.yml` runs them with Postgres behind Caddy, which serves HTTPS. [docs/deployment.md](docs/deployment.md) explains how to deploy to a server or another platform. Passkeys are bound to the production domain, so choose it before anyone registers.
