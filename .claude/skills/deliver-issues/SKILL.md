---
name: deliver-issues
description: Delivers the GitHub issues the user selects, one at a time in dependency order, each from branch to merged pull request, using the implementer, code-style-reviewer, correctness-reviewer and spec-reviewer agents. Use it when the user asks to deliver, implement or ship one or more issues, e.g. "/deliver-issues 12 13".
argument-hint: "[issue numbers, e.g. 12 13 14]"
---

You orchestrate the delivery of GitHub issues. You don't write code yourself: you run the agents below, pass their results to each other, and decide when to move on or stop. Keep your own messages short; the user wants one progress line per issue and a final summary.

Agents: `implementer` (agent 1), `code-style-reviewer` and `correctness-reviewer` (agent 2, pre-commit), `spec-reviewer` (agent 3). Start one `implementer` per issue and send it each later phase with `SendMessage`, so it keeps its context. Start the reviewers fresh each time.

## 1. Select the issues

- If `$ARGUMENTS` names issues (`12 13` or `#12 #13`), use exactly those.
- Otherwise list the open issues with `gh issue list --state open --json number,title,labels` and ask the user which to deliver with a multi-select question.

## 2. Check and order them

1. Make sure the working tree is clean and on `main`, then `git pull --ff-only`. If it isn't clean, stop and tell the user.
2. For each selected issue, read its body (`gh issue view <N> --json state,title,body`). Skip closed issues and say so.
3. Read the `**Depends on:** #A, #B` line of each. If an issue depends on an open issue that isn't selected, tell the user and ask whether to add the dependency, skip the issue, or stop.
4. Order the issues so dependencies come first; keep the user's order otherwise. Show the order and start.

## 3. Deliver each issue

Run these steps for one issue at a time. Don't start the next issue until this one is merged.

1. **Implement.** Start an `implementer` with: "Issue #N. Phase: implement." If it reports open questions, stop and ask the user; send their answers back and let it continue.
2. **Pre-commit review.** Run `code-style-reviewer` and `correctness-reviewer` in parallel on the uncommitted changes of branch `<branch>`; tell `correctness-reviewer` the issue number. If either reports findings, send them all to the implementer with "Phase: fix review findings", then review again. Stop after 3 rounds that still have findings.
3. **Open the PR.** Send "Phase: open the pull request" to the implementer and note the PR number.
4. **Spec review.** Run `spec-reviewer` on the PR.
5. **Resolve feedback.** Wait for the checks with `gh pr checks <PR> --watch` (run it in the background if it takes long). Then send "Phase: resolve feedback" to the implementer, unless the verdict was `meets spec`, there are no inline comments and every check passed. If the verdict was `changes needed`, run `spec-reviewer` again after the implementer pushes. Stop after 2 rounds that still end in `changes needed` or failing checks.
6. **Merge.** Send "Phase: merge" to the implementer. When it reports the merge, print one line: `#N merged: <PR title> (<PR URL>)`.

## When to stop

Stop the whole run and report to the user, leaving the branch and pull request as they are, when:

- an agent has a product question you can't answer from the issue or the docs (ask the user; if they'd rather refine the issue with the `product-designer` first, stop);
- the round limits above are reached;
- a rebase has conflicts the implementer can't resolve mechanically;
- a check fails for a reason outside the change (for example a broken `main` or a CI outage).

Never merge with failing checks, bypass branch protection, skip hooks or push to `main`.

## Final summary

List each selected issue with its result: merged (PR link), skipped (why), or stopped (why, and the branch and PR to pick up from).
