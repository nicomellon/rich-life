#!/usr/bin/env bash
# Apply the GitHub repository settings described in CONTRIBUTING.md.
# Requires the GitHub CLI (gh) logged in as a repository admin. Safe to re-run.
set -euo pipefail

REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
# Job names in .github/workflows/conventions.yml and .github/workflows/ci.yml
CHECKS='"Commit conventions", "Backend", "Frontend"'

echo "Configuring merge settings for $REPO"
gh api --method PATCH "repos/$REPO" --silent \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY \
  -F delete_branch_on_merge=true

echo "Protecting main"
gh api --method PUT "repos/$REPO/branches/main/protection" --silent --input - <<JSON
{
  "required_status_checks": { "strict": true, "contexts": [$CHECKS] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo "Done."
