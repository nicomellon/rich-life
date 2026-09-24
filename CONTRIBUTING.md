# Contributing

Every change is tracked by a GitHub issue, made on its own branch, and merged into `main` through a pull request. These rules are checked locally by pre-commit hooks and in CI by the **Commit conventions** check. The **Backend** and **Frontend** checks run the same linters, type checks and tests as `make lint` and `make test`. `main` requires all three.

## Setup

Install the git hooks once per clone:

```sh
uv tool install pre-commit   # or: pipx install pre-commit
pre-commit install
```

## Workflow

1. Make sure there is an issue for the work. If there isn't, create one first.
2. Create a branch from the latest `main`, named after the issue:
   ```sh
   gh issue develop 6 --name 6-user-auth --checkout
   ```
3. Commit following the convention below. The hooks add `Refs #6` for you, based on the branch name.
4. Keep the branch up to date with `git fetch && git rebase origin/main`. Force-pushing your own branch is fine.
5. Open a pull request. Its title and description become the single squash commit on `main`, so write them with the same care as a commit message. The description must end with `Closes #6`.
6. Merge with **Squash and merge** once CI is green. The branch is deleted automatically.

## Code style

Code follows [`docs/code-style.md`](docs/code-style.md): strict types (never `dict[str, Any]`), descriptive names, and one scenario per test, with layout left to the formatters. ruff and mypy enforce the typing rules; the rest are checked in review. Claude Code loads the guide automatically through `CLAUDE.md`, and its `code-style-reviewer` agent checks a diff against it.

## Branches

- Name: `<issue-number>-<short-slug>`, for example `6-user-auth` or `21-commit-conventions`.
- Lowercase letters, digits and hyphens only; keep the slug to about five words. No `feat/` style prefix: the commit type goes in the PR title.
- One issue, one branch, one pull request. `main` is the only long-lived branch.
- Bot branches such as `dependabot/*` are exempt from these checks.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/) with a required body and issue reference:

```
feat(backend): add user model and auth endpoints

Hash passwords with argon2 and issue JWT access tokens. Duplicate
emails return 409 so the frontend can show a clear message.

Closes #6
```

- **Subject:** `type(scope): summary`, 72 characters or fewer, in the imperative ("add", not "added"), with no trailing period.
  - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`, `perf`, `revert`. Add `!` after the type or scope for a breaking change, e.g. `refactor(backend)!: ...`.
  - Scopes (optional): `backend`, `frontend`, `infra`, `docs`.
- **Body:** after a blank line, explain what changed and why. Required.
- **Issue reference:** on its own line, `Closes #N` (or `Fixes` / `Resolves`) when the change completes the issue, `Refs #N` when it's part of it.
- `fixup!`, `squash!` and `amend!` commits are allowed on branches, since they are squashed away.

The pull request title follows the same subject rules, and the description follows the body rules and must contain `Closes #N` for the issue in the branch name.

## Repository settings

`scripts/configure_repo.sh` applies the GitHub settings these rules rely on: squash merge only (using the PR title and description as the commit message), branches deleted after merge, and `main` protected so it only accepts pull requests that pass the **Commit conventions**, **Backend** and **Frontend** checks, with linear history and no direct or force pushes, for admins too.
