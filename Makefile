# Developer commands for the whole monorepo. Run `make help` to list them.
# The backend (#2) and frontend (#4) add their own dev, test and lint steps here.

.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help
help: ## List available commands
	@grep -hE '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.PHONY: setup
setup: ## Install git hooks and create .env from .env.example
	pre-commit install
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example")

.PHONY: dev
dev: db ## Start everything needed for local development

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

.PHONY: lint
lint: ## Run all linters and formatting checks
	pre-commit run --all-files
