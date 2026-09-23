# Developer commands for the whole monorepo. Run `make help` to list them.
# The frontend (#4) adds its own dev, test and lint steps here.

.DEFAULT_GOAL := help
COMPOSE := docker compose
BACKEND := cd backend &&

.PHONY: help
help: ## List available commands
	@grep -hE '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.PHONY: setup
setup: .env ## Install git hooks, backend dependencies and create .env from .env.example
	pre-commit install
	$(BACKEND) uv sync

.env:
	cp .env.example .env

.PHONY: dev
dev: db migrate backend ## Start everything needed for local development

.PHONY: backend
backend: .env ## Run the API with auto-reload on http://localhost:8000
	$(BACKEND) uv run --env-file ../.env uvicorn app.main:app --reload

.PHONY: migrate
migrate: .env ## Apply database migrations (alembic upgrade head)
	$(BACKEND) uv run --env-file ../.env alembic upgrade head

.PHONY: migration
migration: .env ## Autogenerate a migration from model changes, e.g. make migration m="add users table"
	@test -n "$(m)" || { echo 'Usage: make migration m="describe the change"'; exit 1; }
	$(BACKEND) uv run --env-file ../.env alembic revision --autogenerate -m "$(m)"

.PHONY: db
db: ## Start Postgres in the background and wait until it's ready
	$(COMPOSE) up -d --wait db

.PHONY: db-stop
db-stop: ## Stop all services, keeping the data
	$(COMPOSE) --profile tools stop

.PHONY: db-reset
db-reset: ## Delete the database data and start Postgres again
	$(COMPOSE) --profile tools down --volumes
	$(COMPOSE) up -d --wait db

.PHONY: db-shell
db-shell: ## Open psql in the database container
	$(COMPOSE) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

.PHONY: pgadmin
pgadmin: ## Start pgAdmin on http://localhost:5050 (with the database)
	$(COMPOSE) --profile tools up -d --wait

.PHONY: test
test: ## Run all tests
	python3 -m unittest discover -s scripts/tests
	$(BACKEND) uv run pytest

.PHONY: lint
lint: ## Run all linters, formatting and type checks
	pre-commit run --all-files
	$(BACKEND) uv run mypy
