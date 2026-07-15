---
name: watch
description: Monitor GitHub Actions CI for the current PR/branch until it concludes, then report green/red with failure logs. Use when the user says "watch the CI", "is CI passing?", "monitor the checks", or after opening a PR and wanting to wait for checks. Pairs with commit-push-pr (before) and merge (after).
---

# watch — monitor CI to a conclusion

Follow the GitHub Actions checks for a PR until they finish, then summarize the result.

## Setup

- Use the **GitHub MCP** tools (`mcp__github__*`).
- Resolve `<OWNER>` and `<REPO>` from `git remote get-url origin`.
  - For this repo: `qtmleap/Hono-Vite-Workers`.

## Step 1: Identify the target PR

- If the user gives an explicit PR number or URL, use it.
- Otherwise, default to the PR for the current branch (`git branch --show-current`). Find it by head and take the PR number:

  ```
  mcp__github__list_pull_requests(owner: '<OWNER>', repo: '<REPO>',
    state:'open', head:'<OWNER>:<current-branch>')
  ```

## Step 2: Poll until conclusion

The MCP has no blocking `--watch`, so poll. On each tick, read the PR's checks:

```
mcp__github__pull_request_read(method:'get_check_runs', owner: '<OWNER>',
  repo: '<REPO>', pullNumber:<pr>)
```

- Also call `method:'get_status'` for the combined commit status.
- Aggregate the results:
  - Any check `in_progress` or `queued` → still **pending**.
  - All completed with `conclusion: success` → **green**.
  - Any `failure`, `cancelled`, or `timed_out` → **red**.
- Required checks in this repo (defined in `.github/workflows/integration.yaml`): **CommitLint** and **Code Check** (Biome + tsc + test). `code_review.yaml` (ChatGPT review) is advisory only.
- Pacing:
  - If invoked inside `/loop`: do **one** poll per tick and let the loop schedule the interval.
  - Otherwise: re-poll roughly every 30s until the checks conclude.

## Step 3: Report the conclusion

- **All green**: report success with the PR URL and suggest `/merge`.
- **Any failure**:
  1. Identify the failing check from `get_check_runs` (each run has a `name`, `conclusion`, and `details_url`).
  2. Read its log to find the root cause. Use `gh run view <run-id> --log-failed` — the simplest way to fetch Actions logs, since the MCP exposes check runs but not raw step logs.
  3. Surface the specific failing step (e.g. a commitlint subject-case violation, a Biome lint error, a tsc error, a failing test) and propose the fix.
  4. Do **not** merge.
- **Pending/stuck**: report which checks are still queued.

## Rules

- **DO NOT** push, merge, or re-run jobs unless the user asks — this skill is read-only.
- Common red in this repo: commitlint fails because the subject starts with a capitalized English word (subject-case), or the `type` is outside the `.commitlintrc.yaml` enum. Fix the commit message and re-push.
