#!/usr/bin/env python3
"""Commit, branch and pull request conventions for this repository.

Used by the pre-commit hooks (``check-msg``, ``prepare-msg``) and by CI
(``check-pr``) so that local and remote checks apply exactly the same rules.
See CONTRIBUTING.md for the conventions themselves.

Standard library only, so it runs without installing anything.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys

TYPES = ("feat", "fix", "refactor", "test", "docs", "chore", "ci", "build", "perf", "revert")
SCOPES = ("backend", "frontend", "infra", "docs")
MAX_SUBJECT_LENGTH = 72

SUBJECT_RE = re.compile(
    rf"^(?P<type>{'|'.join(TYPES)})"
    rf"(?:\((?P<scope>[a-z-]+)\))?"
    r"(?P<breaking>!)?"
    r": (?P<summary>\S.*)$"
)
ISSUE_REF_RE = re.compile(r"^(?:closes|fixes|resolves|refs) #(\d+)\s*$", re.IGNORECASE | re.MULTILINE)
CLOSING_REF_RE = re.compile(r"^(?:closes|fixes|resolves) #(\d+)\s*$", re.IGNORECASE | re.MULTILINE)
BRANCH_RE = re.compile(r"^(?P<issue>[0-9]+)-[a-z0-9]+(?:-[a-z0-9]+)*$")
EXEMPT_BRANCH_PREFIXES = ("dependabot/",)
# Commits that git or `git commit --fixup` generate and that get squashed away.
AUTOSQUASH_PREFIXES = ("fixup! ", "squash! ", "amend! ")
SCISSORS = "# ------------------------ >8 ------------------------"
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)


def clean_message(message: str) -> str:
    """Return the message as git would store it: no comments or verbose diff."""
    message = message.split(SCISSORS, 1)[0]
    lines = [line.rstrip() for line in message.splitlines() if not line.startswith("#")]
    return "\n".join(lines).strip()


def check_subject(subject: str) -> list[str]:
    errors = []
    match = SUBJECT_RE.match(subject)
    if not match:
        errors.append(
            f"subject must look like 'type(scope): summary', got {subject!r}. "
            f"Types: {', '.join(TYPES)}. Scopes (optional): {', '.join(SCOPES)}."
        )
    else:
        scope = match.group("scope")
        if scope and scope not in SCOPES:
            errors.append(f"unknown scope {scope!r}; use one of: {', '.join(SCOPES)}.")
        if match.group("summary").endswith("."):
            errors.append("subject must not end with a period.")
    if len(subject) > MAX_SUBJECT_LENGTH:
        errors.append(f"subject is {len(subject)} characters; the limit is {MAX_SUBJECT_LENGTH}.")
    return errors


def check_body(body: str, *, what: str) -> list[str]:
    """Require a description and an issue reference in a message body."""
    errors = []
    description = ISSUE_REF_RE.sub("", body).strip()
    if not description:
        errors.append(f"{what} must describe what changed and why, not only reference an issue.")
    if not ISSUE_REF_RE.search(body):
        errors.append(f"{what} must reference its issue on its own line, e.g. 'Closes #6' or 'Refs #6'.")
    return errors


def check_message(message: str) -> list[str]:
    message = clean_message(message)
    if not message:
        return ["commit message is empty."]
    if message.startswith(AUTOSQUASH_PREFIXES):
        return []
    subject, _, rest = message.partition("\n")
    errors = check_subject(subject)
    if rest and not rest.startswith("\n"):
        errors.append("leave a blank line between the subject and the body.")
    return errors + check_body(rest, what="commit body")


def check_branch(branch: str) -> list[str]:
    if BRANCH_RE.match(branch):
        return []
    return [
        f"branch {branch!r} must be named '<issue-number>-<short-slug>', e.g. '6-user-auth' "
        "(lowercase letters, digits and hyphens)."
    ]


def branch_issue(branch: str) -> int | None:
    match = BRANCH_RE.match(branch)
    return int(match.group("issue")) if match else None


def prepare_message(message: str, branch: str | None) -> str:
    """Add 'Refs #N' from the branch name unless the message already has a reference."""
    issue = branch_issue(branch) if branch else None
    if issue is None or ISSUE_REF_RE.search(clean_message(message)):
        return message
    content, sep, verbose = message.partition(SCISSORS)
    lines = content.splitlines()
    # Insert above git's comment block so the reference survives comment stripping.
    split = next((i for i, line in enumerate(lines) if line.startswith("#")), len(lines))
    head = "\n".join(lines[:split]).rstrip()
    tail = "\n".join(lines[split:])
    new = f"{head}\n\nRefs #{issue}\n" if head else f"\n\nRefs #{issue}\n"
    if tail:
        new += f"\n{tail}\n"
    return new + sep + verbose


def check_pull_request(*, branch: str, title: str, body: str, messages: list[str]) -> list[str]:
    if branch.startswith(EXEMPT_BRANCH_PREFIXES):
        return []
    errors = [f"branch: {e}" for e in check_branch(branch)]
    errors += [f"PR title: {e}" for e in check_subject(title)]
    body = HTML_COMMENT_RE.sub("", body)
    errors += [f"PR description: {e}" for e in check_body(body, what="PR description")]
    closes = {int(n) for n in CLOSING_REF_RE.findall(body)}
    issue = branch_issue(branch)
    if issue is not None and issue not in closes:
        errors.append(f"PR description: must contain 'Closes #{issue}' to match the branch name.")
    for message in messages:
        subject = clean_message(message).partition("\n")[0]
        errors += [f"commit {subject!r}: {e}" for e in check_message(message)]
    return errors


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def current_branch() -> str | None:
    try:
        return git("symbolic-ref", "--quiet", "--short", "HEAD").strip()
    except subprocess.CalledProcessError:
        return None  # detached HEAD, e.g. during a rebase


def commit_messages(base: str, head: str) -> list[str]:
    """Messages of the non-merge commits in base..head."""
    out = git("log", "--no-merges", "--format=%B%x00", f"{base}..{head}")
    return [m.strip() for m in out.split("\x00") if m.strip()]


def report(errors: list[str], hint: str) -> int:
    if not errors:
        return 0
    print("Convention check failed:", file=sys.stderr)
    for error in errors:
        print(f"  - {error}", file=sys.stderr)
    print(f"\n{hint}", file=sys.stderr)
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    check_msg = sub.add_parser("check-msg", help="validate a commit message file (commit-msg hook)")
    check_msg.add_argument("file")
    prepare_msg = sub.add_parser("prepare-msg", help="add 'Refs #N' from the branch (prepare-commit-msg hook)")
    prepare_msg.add_argument("file")
    prepare_msg.add_argument("source", nargs="?")
    sub.add_parser("check-pr", help="validate a pull request; reads BASE_SHA, HEAD_SHA, HEAD_REF, PR_TITLE, PR_BODY")
    args = parser.parse_args(argv)

    if args.command == "check-msg":
        with open(args.file, encoding="utf-8") as f:
            errors = check_message(f.read())
        return report(errors, "See CONTRIBUTING.md. Your message was kept in .git/COMMIT_EDITMSG.")

    if args.command == "prepare-msg":
        # pre-commit passes the source in an env var; plain git passes it as an argument.
        source = args.source or os.environ.get("PRE_COMMIT_COMMIT_MSG_SOURCE")
        if source in ("merge", "squash", "commit"):  # merges, squashes and --amend/-c keep their message
            return 0
        with open(args.file, encoding="utf-8") as f:
            message = f.read()
        updated = prepare_message(message, current_branch())
        if updated != message:
            with open(args.file, "w", encoding="utf-8") as f:
                f.write(updated)
        return 0

    env = os.environ
    errors = check_pull_request(
        branch=env["HEAD_REF"],
        title=env["PR_TITLE"],
        body=env.get("PR_BODY", ""),
        messages=commit_messages(env["BASE_SHA"], env["HEAD_SHA"]),
    )
    return report(errors, "See CONTRIBUTING.md for the commit, branch and pull request conventions.")


if __name__ == "__main__":
    sys.exit(main())
