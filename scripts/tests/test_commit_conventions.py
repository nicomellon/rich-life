import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from commit_conventions import (  # noqa: E402
    check_branch,
    check_message,
    check_pull_request,
    check_subject,
    prepare_message,
)

GOOD = """feat(backend): add user model and auth endpoints

Hash passwords with argon2 and issue JWT access tokens.

Closes #6
"""


class CheckSubjectTest(unittest.TestCase):
    def test_accepts_type_scope_and_summary(self):
        self.assertEqual(check_subject("feat(backend): add user model"), [])

    def test_scope_is_optional(self):
        self.assertEqual(check_subject("docs: explain the setup"), [])

    def test_accepts_breaking_marker(self):
        self.assertEqual(check_subject("refactor(backend)!: rename entries table"), [])

    def test_rejects_unknown_type(self):
        self.assertTrue(check_subject("feature(backend): add user model"))

    def test_rejects_unknown_scope(self):
        self.assertIn("unknown scope", check_subject("feat(api): add user model")[0])

    def test_rejects_missing_space_after_colon(self):
        self.assertTrue(check_subject("feat:add user model"))

    def test_rejects_trailing_period(self):
        self.assertIn("period", check_subject("fix: handle zero income.")[0])

    def test_rejects_long_subject(self):
        self.assertIn("limit", check_subject("feat: " + "x" * 80)[0])


class CheckMessageTest(unittest.TestCase):
    def test_accepts_good_message(self):
        self.assertEqual(check_message(GOOD), [])

    def test_accepts_refs_and_other_closing_keywords(self):
        for ref in ("Refs #6", "fixes #6", "Resolves #6"):
            with self.subTest(ref=ref):
                self.assertEqual(check_message(GOOD.replace("Closes #6", ref)), [])

    def test_rejects_subject_only(self):
        errors = check_message("feat(backend): add user model\n")
        self.assertEqual(len(errors), 2)  # no description, no issue reference

    def test_rejects_body_without_issue_reference(self):
        errors = check_message(GOOD.replace("Closes #6\n", ""))
        self.assertIn("reference its issue", errors[0])

    def test_rejects_body_that_is_only_a_reference(self):
        errors = check_message("feat(backend): add user model\n\nCloses #6\n")
        self.assertIn("describe what changed", errors[0])

    def test_rejects_missing_blank_line(self):
        message = GOOD.replace("endpoints\n\n", "endpoints\n")
        self.assertIn("blank line", check_message(message)[0])

    def test_ignores_git_comments_and_verbose_diff(self):
        message = GOOD + "# Please enter the commit message\n# ------------------------ >8 ------------------------\n+Closes #9"
        self.assertEqual(check_message(message), [])
        comment_only_ref = "feat: add thing\n\nSome description.\n# Refs #6\n"
        self.assertIn("reference its issue", check_message(comment_only_ref)[0])

    def test_allows_autosquash_commits(self):
        self.assertEqual(check_message("fixup! feat(backend): add user model"), [])

    def test_rejects_empty_message(self):
        self.assertEqual(check_message("# only a comment\n"), ["commit message is empty."])


class CheckBranchTest(unittest.TestCase):
    def test_accepts_issue_number_and_slug(self):
        for branch in ("6-user-auth", "21-commit-conventions", "12-summary"):
            with self.subTest(branch=branch):
                self.assertEqual(check_branch(branch), [])

    def test_rejects_other_names(self):
        for branch in ("main", "feat/6-user-auth", "user-auth-6", "6-User-Auth", "6_user_auth", "6-", "6-user--auth"):
            with self.subTest(branch=branch):
                self.assertTrue(check_branch(branch))


class PrepareMessageTest(unittest.TestCase):
    def test_adds_reference_above_git_comments(self):
        message = "\n# Please enter the commit message\n# On branch 6-user-auth\n"
        result = prepare_message(message, "6-user-auth")
        self.assertEqual(result, "\n\nRefs #6\n\n# Please enter the commit message\n# On branch 6-user-auth\n")

    def test_appends_reference_to_message_from_dash_m(self):
        self.assertEqual(prepare_message("feat: add thing\n", "6-user-auth"), "feat: add thing\n\nRefs #6\n")

    def test_keeps_existing_reference(self):
        self.assertEqual(prepare_message(GOOD, "6-user-auth"), GOOD)

    def test_ignores_branches_without_issue_number(self):
        self.assertEqual(prepare_message("feat: add thing\n", "main"), "feat: add thing\n")
        self.assertEqual(prepare_message("feat: add thing\n", None), "feat: add thing\n")

    def test_keeps_verbose_diff_after_scissors(self):
        scissors = "# ------------------------ >8 ------------------------\ndiff --git a/x b/x\n"
        result = prepare_message("\n# comment\n" + scissors, "6-user-auth")
        self.assertTrue(result.startswith("\n\nRefs #6\n"))
        self.assertTrue(result.endswith(scissors))


class CheckPullRequestTest(unittest.TestCase):
    def check(self, **overrides):
        pr = {
            "branch": "6-user-auth",
            "title": "feat(backend): add user model and auth endpoints",
            "body": "Adds registration and login.\n\n<!-- template hint -->\nCloses #6\n",
            "messages": [GOOD, "fixup! feat(backend): add user model and auth endpoints"],
        }
        return check_pull_request(**{**pr, **overrides})

    def test_accepts_good_pull_request(self):
        self.assertEqual(self.check(), [])

    def test_rejects_bad_branch_title_and_commit(self):
        errors = self.check(branch="user-auth", title="Add auth", messages=["wip"])
        self.assertTrue(any(e.startswith("branch:") for e in errors))
        self.assertTrue(any(e.startswith("PR title:") for e in errors))
        self.assertTrue(any(e.startswith("commit 'wip':") for e in errors))

    def test_requires_closing_reference_matching_branch(self):
        errors = self.check(body="Adds registration and login.\n\nCloses #7\n")
        self.assertIn("Closes #6", errors[0])
        errors = self.check(body="Adds registration and login.\n\nRefs #6\n")
        self.assertIn("Closes #6", errors[0])

    def test_requires_description_beyond_template_comments(self):
        errors = self.check(body="<!-- Describe the change -->\nCloses #6\n")
        self.assertIn("describe what changed", errors[0])

    def test_exempts_dependabot(self):
        self.assertEqual(self.check(branch="dependabot/pip/fastapi-1.0", title="Bump fastapi", body=""), [])


if __name__ == "__main__":
    unittest.main()
