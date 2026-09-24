# Rich Life

Monthly spending app: a FastAPI backend (`backend/`) and a Vite + React frontend (`frontend/`). The plan and its GitHub issues are in `docs/mvp-plan.md`. Branch, commit and pull request conventions are in `CONTRIBUTING.md`, and pre-commit hooks check them.

## Code style

Follow these rules in every change. Reviewers reject code that breaks them.

@docs/code-style.md

## Before finishing a change

1. Run `make lint` and `make test` (the backend tests need `make db`).
2. Have the `code-style-reviewer` agent review the diff, and fix what it reports. It covers the rules no linter can check: names, one scenario per test, and domain types.

## Agent workflow

1. **Plan:** ask the `product-designer` agent to plan a feature. It asks about open product decisions and, once you confirm, writes the GitHub issues with tasks, acceptance criteria and dependencies.
2. **Deliver:** run `/deliver-issues 12 13` (or `/deliver-issues` to pick from the open issues). For each issue, in dependency order, the `implementer` builds it on its own branch, `code-style-reviewer` and `correctness-reviewer` review the diff before it's committed, the implementer opens the pull request, `spec-reviewer` checks it against the issue on GitHub, and the implementer resolves the feedback. Agents never merge: you review and merge each pull request yourself. Issues that depend on an unmerged one wait for the next run.
3. **Review:** leave comments on the pull request, then run `/deliver-issues <N>` again to have the implementer address them.
