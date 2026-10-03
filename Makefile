# Developer commands for the whole monorepo. Run `make help` to list them.

.DEFAULT_GOAL := help
COMPOSE := docker compose
BACKEND := cd backend &&
FRONTEND := cd frontend &&

.PHONY: help
help: ## List available commands
	@grep -hE '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.PHONY: setup
setup: .env ## Install git hooks and dependencies, and create .env from .env.example
	pre-commit install
	$(BACKEND) uv sync
	$(FRONTEND) npm ci
	$(FRONTEND) npx playwright install chromium

.env:
	cp .env.example .env

.PHONY: dev
dev: db migrate ## Start the database, then run the API and the web app together
	$(MAKE) -j2 backend frontend

.PHONY: backend
backend: .env ## Run the API with auto-reload on http://localhost:8000
	$(BACKEND) uv run --env-file ../.env uvicorn app.main:app --reload

.PHONY: frontend
frontend: .env ## Run the web app with hot reload on http://localhost:5173
	$(FRONTEND) node --env-file=../.env node_modules/vite/bin/vite.js

.PHONY: migrate
migrate: .env ## Apply database migrations (alembic upgrade head)
	$(BACKEND) uv run --env-file ../.env alembic upgrade head

.PHONY: migration
migration: .env ## Autogenerate a migration from model changes, e.g. make migration m="add users table"
	@test -n "$(m)" || { echo 'Usage: make migration m="describe the change"'; exit 1; }
	$(BACKEND) uv run --env-file ../.env alembic revision --autogenerate -m "$(m)"

.PHONY: seed
seed: .env ## Add 3 months of example data to an account, e.g. make seed email=you@example.com
	@test -n "$(email)" || { echo 'Usage: make seed email=you@example.com'; exit 1; }
	$(BACKEND) uv run --env-file ../.env python -m app.scripts.seed --email "$(email)"

.PHONY: db
db: ## Start Postgres and Redis in the background and wait until they're ready
	$(COMPOSE) up -d --wait db redis

.PHONY: db-stop
db-stop: ## Stop all services, keeping the data
	$(COMPOSE) --profile tools stop

.PHONY: db-reset
db-reset: ## Delete the database data and start Postgres and Redis again
	$(COMPOSE) --profile tools down --volumes
	$(COMPOSE) up -d --wait db redis

.PHONY: db-shell
db-shell: ## Open psql in the database container
	$(COMPOSE) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

.PHONY: pgadmin
pgadmin: ## Start pgAdmin on http://localhost:5050 (with the database)
	$(COMPOSE) --profile tools up -d --wait

.PHONY: prod-smoke
prod-smoke: ## Build the production stack, check it answers on http://localhost:8080, remove it
	sh scripts/smoke_test_production.sh

.PHONY: test
test: ## Run all tests
	python3 -m unittest discover -s scripts/tests
	$(BACKEND) uv run pytest
	$(FRONTEND) npm test

.PHONY: e2e
e2e: db migrate ## Run the end-to-end tests in Chromium, starting the API and web app if needed
	$(FRONTEND) node --env-file=../.env node_modules/@playwright/test/cli.js test

.PHONY: lint
lint: ## Run all linters, formatting and type checks
	pre-commit run --all-files
	$(BACKEND) uv run mypy
	$(FRONTEND) npm run lint
	$(FRONTEND) npm run format:check
	$(FRONTEND) npm run typecheck
