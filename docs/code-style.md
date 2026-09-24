# Code style

These rules apply to all code in this repository, tests included. Linters enforce some of them. The rest are checked in code review, where the `code-style-reviewer` agent (`.claude/agents/code-style-reviewer.md`) can help.

## Strict types

Structured data is always typed: a Pydantic model, a dataclass, or a TypedDict when a library requires a dict. That covers request and response bodies, token claims, WebAuthn options and credentials, and anything a test helper returns. **Never use `dict[str, Any]`**, in any file. In TypeScript, the same goes for `any` and for `Record<string, unknown>` used as a record.

- Validate a value into a model as soon as it crosses into our code. When a library returns a dict or JSON, call `Model.model_validate(...)` right there. In tests, read responses with `Model.model_validate(response.json())` rather than indexing into the JSON.
- A dict is fine for a real mapping, where every key has the same meaning and every value the same type: HTTP headers, lookup tables, the COSE key a test encodes. It's also fine for a request body a test sends to check that invalid input is rejected.
- Use the project's domain types in every schema that carries that value, read models included: `Email` and `CurrencyCode` from `app/schemas/user.py`, and `Base64URLBytes` from `app/schemas/webauthn.py`. Never use a bare `str` for them.

**Enforced by:** ruff bans importing `typing.Any` (`TID251`), and mypy runs with `disallow_any_explicit`. On the frontend, typescript-eslint's `no-explicit-any` does the same job.

## Names

Name a variable for what it holds. Words like `pending`, `data`, `result`, `obj`, `item`, `info`, `tmp` or `value` don't say what the thing is. Write `issued_challenge`, `registration_options` or `signed_in_headers` instead. The same applies to functions, fixtures and test helpers.

## Formatting

The formatters decide the layout, so don't add formatting rules of your own:

- **Python:** `ruff format`, at ruff's default line length of 88 characters.
- **TypeScript:** Prettier, at 100 characters (`frontend/.prettierrc.json`).

Wrap comments and docstrings at the same widths. ruff's `E501` enforces this for Python.

## Tests

- **One scenario per test.** A test sets up one situation, does one thing and checks one behaviour, and its name says which. If you want to check several outcomes, write several tests. For example, instead of one login test that checks the token, the sign count and `last_used_at`, write:
  - `test_login_returns_an_access_token`
  - `test_login_increases_the_passkeys_sign_count`
  - `test_login_sets_passkey_last_used_at`
- Several `assert`s are fine only when they check the same outcome. Prefer a single comparison, e.g. `assert (response.status_code, response.json()) == (409, {...})`.
- Name tests `test_<subject>_<expected behaviour>`, e.g. `test_register_challenge_for_a_registered_email_returns_409`.
- Separate arrange, act and assert with blank lines.
- Put shared setup in fixtures and helpers, and use `pytest.mark.parametrize` (with `ids`) for the same behaviour across different inputs.
