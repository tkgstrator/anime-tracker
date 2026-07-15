---
name: merge
description: Merge a feature→develop pull request once CI is green. Use when the user says "merge the PR", "merge if green", "land this", or after watch reports success. Verifies all checks pass and the branch is mergeable before merging; refuses on pending/failed checks. For develop→master production releases use the `release` skill instead.
---

# merge — merge a feature PR when CI is green

Merge a PR (normally **feature → `develop`**) only after confirming CI passed and there are no conflicts.

## Setup

- Use the **GitHub MCP** tools (`mcp__github__*`).
- Resolve `<OWNER>` and `<REPO>` from `git remote get-url origin`. For this repo: `qtmleap/Hono-Vite-Workers`.

## Scope

- Merging into `develop` deploys to the **development** env — not production.
- A PR whose base is `master` is a **release**: stop and use the **`release`** skill instead. It adds the production confirmation and the version tag.

## Identify the target PR

- Default: find the current branch's open PR via
  `mcp__github__list_pull_requests(owner: '<OWNER>', repo: '<REPO>', state:'open', head:'<OWNER>:<current-branch>')`.
- If the user gives an explicit PR number or URL, use that instead.

## Gate checks — all must hold before merging

1. **CI is green.**
   - Check with `mcp__github__pull_request_read(method:'get_check_runs', …, pullNumber:<pr>)` and `method:'get_status'`.
   - Every required check must have `conclusion: success`.
   - If any check is `queued`/`in_progress`: DO NOT merge — wait (suggest `/watch`) and stop.
   - If any check is `failure`: DO NOT merge — stop and report. Never merge a red PR.

2. **Mergeable.**
   - Check with `mcp__github__pull_request_read(method:'get', …)`.
   - Require `mergeable: true` and `mergeable_state: clean` (not `dirty`/`blocked`/`behind`).
   - If the branch is behind base, update it first: `mcp__github__update_pull_request_branch(owner, repo, pullNumber:<pr>)`.

3. **Base must be `develop`** (or another feature/integration branch).
   - Confirm the PR's `base.ref`.
   - If the base is `master`, this is a production release: **stop and switch to the `release` skill** — do not merge it here.

## Merge

```
mcp__github__merge_pull_request(
  owner: '<OWNER>', repo: '<REPO>', pullNumber:<pr>,
  merge_method:'squash',
  commit_title:'<commitlint-style squash subject>')
```

- Default to **squash** merge.
- `commit_title` must satisfy commitlint: lowercase start, valid `type` (incl. `chore`), ≤ 96 chars.
- `merge_pull_request` has no delete-branch option. After a green merge, delete the source branch separately:
  `git push origin --delete <feature-branch>`.
  - Deleting a feature branch is fine; **never delete or force-push `master`/`develop`**.
- Fallback, only if the MCP is unavailable: `gh pr merge <pr> --squash --delete-branch`.

## After merge

- Confirm the merge and the merged commit.
- **No version tag** at this stage — tagging happens only on the `develop → master` release (`release` skill).
- Merging into `develop` runs `deployment.yaml` against the **development** env; offer to `/watch` it if the user wants to confirm the dev deploy.
- If the user will keep working, sync local develop: `git switch develop && git pull`.
- When `develop` has accumulated the changes meant for production, run **`release`** to promote it to `master`, deploy production, and tag `vX.Y.Z`.
