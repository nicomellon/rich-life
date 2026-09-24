# Rich Life — MVP Implementation Plan (Monthly Spending Management)

## Context
`rich-life` is an empty repo (only `README.md`). The goal is an MVP personal-finance web app focused solely on **monthly spending management** with manual data entry, built on the **conscious-spending-plan** idea: each month's income is split into four buckets, **Fixed Costs, Investments, Savings, Guilt-Free Spending**, according to target percentages the user sets (e.g. 50/10/20/20). Each month the user enters their income and actual expenses and compares them to the plan.

Decisions made:
- Monorepo with `frontend/` (Vite + React + TypeScript + React Router + TanStack Query) and `backend/` (FastAPI + Pydantic v2 + SQLAlchemy 2.0 + Alembic + PostgreSQL).
- Multiple users who sign in with **passkeys** (WebAuthn), not passwords, so there is no password to leak, reuse or phish and signing in is one biometric or PIN prompt. After a successful passkey ceremony the backend issues a JWT access token. All data belongs to one user.
- Users who can't use a passkey will get a **magic link** fallback (an emailed, short-lived sign-in link). It comes after the MVP, in Milestone 5; until then a passkey is the only way in.
- One currency, set per user. Amounts are stored as `NUMERIC(12,2)` and handled as `Decimal`, never float.

The plan below is split into GitHub issues, grouped by milestone. Each issue lists its dependencies and acceptance criteria (AC). Issue numbers match the GitHub issues in this repository.

---

## Domain model

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, email (unique), webauthn_user_handle (random bytes, unique), currency (ISO 4217, default `EUR`), created_at | No password. The email identifies the account and will receive magic links (Milestone 5). The WebAuthn user handle is sent to authenticators instead of the email or id. |
| `passkeys` | id, user_id, credential_id (bytes, unique), public_key (bytes), sign_count, transports, created_at, last_used_at | One row per registered passkey; a user can have several. |
| `webauthn_challenges` | id, challenge (bytes, unique), kind (`registration` / `authentication`), email and user handle (registration only), expires_at | Issued by the `*-challenge` endpoints and deleted when used, so each challenge works once. Expires after 5 minutes. |
| `spending_plans` | user_id (primary key), fixed_costs_pct, investments_pct, savings_pct, guilt_free_pct, each `NUMERIC(5,2)` | The user's **default plan**, created at signup with 50/10/20/20. The four buckets are the same for everyone, so they're columns rather than rows; in code they're the `Bucket` enum (`fixed_costs`, `investments`, `savings`, `guilt_free`). Percentages must add up to 100. |
| `months` | id, user_id, year, month, income `NUMERIC(12,2)`, fixed_costs_pct, investments_pct, savings_pct, guilt_free_pct, created_at; unique(user_id, year, month) | One row per budgeted month. The percentages are **copied** from the spending plan when the month is created, so changing the default plan later does not rewrite past months. The user can edit them per month. |
| `entries` | id, user_id, month_id, bucket (the `Bucket` enum), amount (>0), date, description, created_at | Actual expenses or allocations (an investment transfer counts as an entry in the Investments bucket too). `date` must fall inside the month. |

Derived per month (computed on the fly, not stored): for each bucket, `target_amount = income × target_pct / 100`, `actual = sum(entries)`, `remaining = target − actual`, `actual_pct = actual / income`. Totals: planned, actual, unallocated.

## API surface (`/api/v1`)
- Auth: `POST /auth/register-challenge` ({email}; returns WebAuthn creation options), `POST /auth/verify-registration` (the browser's credential; creates the user and passkey, returns a JWT access token), `POST /auth/login-challenge` (returns WebAuthn request options), `POST /auth/verify-login` (the browser's assertion; returns a JWT access token), `GET /auth/me`, `PATCH /auth/me` (currency)
- Auth, after the MVP (Milestone 5): `POST /auth/magic-link` ({email}; emails a sign-in link), `POST /auth/magic-link/verify` ({token}; returns a JWT access token)
- Plan: `GET /spending-plan`, `PUT /spending-plan` (update all four percentages at once; validates sum = 100)
- Months: `GET /months`, `POST /months` ({year, month, income}; copies targets), `GET /months/{y}/{m}`, `PATCH /months/{y}/{m}` (income), `PUT /months/{y}/{m}/targets` (this month's four percentages), `DELETE /months/{y}/{m}`
- Entries: `GET /months/{y}/{m}/entries?bucket=`, `POST /months/{y}/{m}/entries`, `PATCH /entries/{id}`, `DELETE /entries/{id}`
- Summary: `GET /months/{y}/{m}/summary` (target vs actual per bucket, plus totals)

---

## Milestone 0 — Foundations

**#21 Enforce commit message conventions** (done first)
- Commit, branch and pull request conventions checked by pre-commit hooks and a required CI check, with squash-only merges into a protected `main`. See `CONTRIBUTING.md`.
- AC: badly formed commits are rejected locally, badly formed PRs fail CI and can't be merged, and each merged PR becomes one conventional squash commit that closes its issue.

**#1 Monorepo scaffolding and dev environment**
- Create `backend/`, `frontend/`, root `docker-compose.yml` (Postgres 16 plus an optional pgAdmin), `.editorconfig`, `.gitignore`, and a README with setup steps. Add a root `Makefile` or `justfile` (`make dev`, `make test`, `make lint`).
- AC: `docker compose up db` starts Postgres, and the README explains how to run both apps.

**#2 Backend skeleton (FastAPI)** — depends on #1
- Use `uv` (or Poetry) with a `pyproject.toml`. Suggested layout: `backend/app/{main.py, core/config.py, core/security.py, db/session.py, db/base.py, models/, schemas/, api/v1/routers/, services/}`.
- Settings come from `pydantic-settings` (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`). Add `GET /health`, CORS, and ruff + mypy config.
- AC: `uvicorn app.main:app` serves `/health` and `/docs`.

**#3 Database setup: SQLAlchemy 2.0 + Alembic** — depends on #2
- Sync or async engine (sync with psycopg 3 is fine for the MVP), a `get_db` session dependency, and Alembic configured from the app settings and metadata.
- AC: `alembic upgrade head` runs against the Docker Postgres.

**#4 Frontend skeleton (Vite + React + TS)** — depends on #1
- Vite React TS, React Router, TanStack Query, a UI library (shadcn/ui + Tailwind recommended), ESLint + Prettier, and Vitest + React Testing Library. Add an API client module (a `fetch` wrapper that calls `/api/v1` on the app's own origin, proxied to the backend by the dev server, and attaches the auth token) and an app shell layout.
- AC: `npm run dev` shows the shell, and `npm test` and `npm run lint` pass.

**#5 CI (GitHub Actions)** — depends on #2, #4
- Backend job: ruff, mypy, pytest with a Postgres service container. Frontend job: lint, typecheck, test, build.
- AC: CI runs on PRs and is green.

## Milestone 1 — Authentication

**#6 User model and passkey auth endpoints** — depends on #3
- `users`, `passkeys` and `webauthn_challenges` models and migrations. WebAuthn ceremonies with [`webauthn`](https://github.com/duo-labs/py_webauthn) (py_webauthn), JWT issue/verify (`pyjwt`), and a `get_current_user` dependency. New settings: `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME` and `WEBAUTHN_ORIGIN` (the web app's origin, e.g. `http://localhost:5173`).
- The flow: the React app asks for a challenge, passes the options to the browser (`navigator.credentials.create()` / `.get()`), and sends the resulting credential back for verification.
  - `POST /auth/register-challenge` takes an email and returns creation options that require a discoverable credential (resident key) and user verification. `POST /auth/verify-registration` verifies the attestation, creates the user and their passkey, and returns an access token.
  - `POST /auth/login-challenge` returns request options with no `allowCredentials`, so the browser offers every passkey it has for the site and the user doesn't type an email. `POST /auth/verify-login` finds the passkey by credential id, verifies the signature, updates `sign_count` and `last_used_at`, and returns an access token.
  - Challenges are stored server-side, single use, and expire after 5 minutes.
- `GET /auth/me`, and `PATCH /auth/me` to change the currency.
- AC: registration and login work end to end; a duplicate email returns 409; an unknown, expired or reused challenge, an unknown credential, or a bad signature returns 401; `me` requires a valid token. pytest covers all of these, using a software authenticator in the tests to produce real attestations and assertions.

**#7 Frontend passkey auth flow** — depends on #4, #6
- Register and sign-in pages using [`@simplewebauthn/browser`](https://simplewebauthn.dev/) to run the ceremonies: register asks for an email and then creates a passkey; sign in is a single "Sign in with a passkey" button (optionally with passkey autofill on the email field). Show a clear message when the browser doesn't support passkeys or the user cancels the prompt.
- Token storage (localStorage is fine for the MVP), an `AuthContext`, protected routes, logout, and a redirect to sign in on 401.
- AC: a user can register with a passkey, sign in with it, reload and stay signed in, and log out.

## Milestone 2 — Spending plan (buckets and target percentages)

**#8 Spending plan model and API** — depends on #6
- `spending_plans` model and migration: one row per user with a percentage column per bucket. Create the default plan (50/10/20/20) when a user registers, and for existing users in the migration. `GET /spending-plan` and `PUT /spending-plan` validate that each percentage is between 0 and 100 with at most 2 decimals and that the total is exactly 100; a database check constraint enforces the total too. Bucket names are fixed labels in the frontend.
- AC: a new user has the default plan, a PUT whose total is not 100 returns 422, and the rule is covered by tests.

**#9 Spending plan settings page** — depends on #7, #8
- A form with one percentage input per bucket, a live total indicator (shows a warning when it isn't 100%), and an optional preview ("with income X, each bucket gets …"). Saves through the API.
- AC: the user can change the percentages, the form can't be submitted unless the total is 100, and the values persist.

## Milestone 3 — Monthly management

**#10 Months model and API (income + targets copy)** — depends on #8
- `months` model and migration, with the four percentage columns of `spending_plans`. Creating a month copies the current plan's percentages. Endpoints: list, get, update income, edit this month's targets (sum = 100), delete (cascades).
- AC: changing the default plan after a month exists leaves that month's targets unchanged, and creating a duplicate month returns 409.

**#11 Entries model and CRUD API** — depends on #10
- `entries` model and migration. The amount must be > 0 and the date must fall within the month. Every query is filtered by `user_id`, so one user can never read or change another user's entries. Each entry names its bucket with the `Bucket` enum, and entries can be filtered by bucket.
- AC: CRUD works, an entry dated outside its month returns 422, touching another user's entry returns 404, and all of this is tested.

**#12 Monthly summary endpoint** — depends on #11
- `GET /months/{y}/{m}/summary` returns per bucket: target_pct, target_amount, actual_amount, actual_pct, remaining, and status (`under` / `on_track` / `over`). It also returns totals: income, total actual, and the unallocated amount. The math lives in `services/summary.py` as a pure function.
- AC: unit tests cover the math, including zero income and rounding to 2 decimal places.

**#13 Month selector and month creation UI** — depends on #7, #10
- A month picker (previous/next arrows plus a dropdown of existing months). When a month doesn't exist yet, show an empty state with a "Start this month" form that takes the income. Include inline editing of the income.
- AC: the user can create the current month with an income and switch between months.

**#14 Entries UI (add, edit, delete)** — depends on #11, #13
- Show entries grouped by bucket or in a filterable table. A quick-add form (amount, bucket, date defaulting to today inside the month, description), plus inline edit and delete with a confirmation step. Use TanStack Query mutations with cache invalidation of the summary.
- AC: adding, editing, and deleting an entry updates both the list and the summary without a page reload.

**#15 Monthly dashboard: plan vs actual** — depends on #12, #14
- For each bucket, a card or progress bar showing target vs actual, remaining, and a colour for the status. Add a comparison chart (Recharts bar chart: target vs actual per bucket), plus totals for income, spent/allocated, and unallocated. Format all amounts with the user's currency (`Intl.NumberFormat`).
- AC: the dashboard reflects the entries correctly and flags over-budget buckets.

**#16 Per-month target override UI** — depends on #10, #15
- On the dashboard, an "Adjust this month's plan" action edits the month's percentages, using the same validation component as #9.
- AC: the override changes only that month's targets.

## Milestone 4 — Polish and release

**#17 Error handling and UX polish**
- One consistent API error format, toast notifications, loading skeletons, empty states, form validation with zod + react-hook-form, and a responsive layout.

**#18 Seed data for a user**
- `python -m app.scripts.seed --email you@example.com` adds 3 months of example data to an existing account. With passkeys there is no demo password to share, so register an account in the app first and seed it.

**#19 End-to-end tests (Playwright)** — depends on #15
- Happy path: register → set the plan → create a month → add entries → check the dashboard numbers.
- Passkeys run against Chromium's virtual authenticator (the `WebAuthn.addVirtualAuthenticator` DevTools Protocol command), so no real device or biometric prompt is needed.

**#20 Containerisation and deployment**
- Dockerfiles for the backend (running Alembic migrations on start) and the frontend (static build served by nginx or Caddy, which also proxies `/api` to the backend so the app stays same-origin), a production compose file, and deploy docs (e.g. Fly.io, Render, or a VPS).
- Passkeys need HTTPS in production, and `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` must match the production domain. Passkeys are bound to the RP ID, so changing the domain later invalidates every registered passkey.

## Milestone 5 — Magic-link fallback (after the MVP)

Until this milestone ships, a user who loses every device holding their passkey can't get back into their account. Passkeys synced by iCloud Keychain, Google Password Manager or a password manager make this rare, but it's the main gap this milestone closes.

**#29 Magic-link sign-in API** — depends on #6
- Add Redis to `docker-compose.yml` and CI, with a `REDIS_URL` setting. `POST /auth/magic-link` takes an email and, if an account exists, generates a random single-use token, stores only its hash in Redis with a 15-minute TTL, and emails a link to the web app containing the token. It always returns 202, so it doesn't reveal which emails have accounts. `POST /auth/magic-link/verify` takes the token, deletes it from Redis and returns an access token.
- Send email through a provider API such as Resend or SendGrid (`EMAIL_API_KEY`, `EMAIL_FROM`); in development, log the link instead of sending it. Rate-limit requests per email and per IP.
- A signed-in user can add another passkey: `register-challenge` and `verify-registration` called with a bearer token add a passkey to the current account instead of creating one.
- AC: a valid link signs the user in exactly once; expired, reused or unknown tokens return 401; unknown emails get the same 202 as known ones; the rate limit is enforced; and all of this is tested with a fake email sender.

**#30 Magic-link sign-in UI** — depends on #7, #29
- An "Email me a sign-in link" option on the sign-in page, a confirmation screen, and a landing route for the link that verifies the token and signs the user in. After signing in by link, offer to create a passkey on this device.
- AC: a user without a passkey on this device can request a link, follow it to get signed in, and add a passkey.

### Out of scope for the MVP (possible future issues)
Recurring expenses, sub-categories within buckets, several income line items, bank import or CSV, multiple currencies, trends across months, refresh tokens, and a page to rename or remove passkeys.

---

## Suggested order and parallel work
#21 → #1 → (#2 → #3 → #6 → #8 → #10 → #11 → #12) running alongside (#4 → #7). After that: #9, #13, #14, #15, #16, then Milestone 4. #5 (CI) should be done early, right after #2 and #4. Milestone 5 (#29 → #30) follows the MVP release.

## Verification (end-to-end, once implemented)
1. `docker compose up db`, then `cd backend && alembic upgrade head && uvicorn app.main:app --reload`
2. `cd frontend && npm run dev`, then open http://localhost:5173
3. Register with a passkey, set the plan to 50/10/20/20, create the current month with income 3000, and add entries: rent 1200 (Fixed), ETF 300 (Investments), 600 (Savings), 400 (Guilt-Free).
4. The dashboard should show targets of 1500/300/600/600, actuals of 1200/300/600/400, and 500 unallocated.
5. `pytest` (backend), `npm test` (frontend), and `npx playwright test` (e2e) all pass in CI.
