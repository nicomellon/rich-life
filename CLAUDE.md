# Rich Life

Monthly spending app: a FastAPI backend (`backend/`) and a Vite + React frontend (`frontend/`). The plan and its GitHub issues are in `docs/mvp-plan.md`. Branch, commit and pull request conventions are in `CONTRIBUTING.md`, and pre-commit hooks check them.

## Code style

Follow these rules in every change. Reviewers reject code that breaks them.

@docs/code-style.md

## Before finishing a change

1. Run `make lint` and `make test` (the backend tests need `make db`).
2. Have the `code-style-reviewer` agent review the diff, and fix what it reports. It covers the rules no linter can check: names, one scenario per test, and domain types.
