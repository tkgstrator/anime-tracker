---
name: release
description: Promote develop to master — open (or reuse) the develop→master PR, confirm CI is green, merge to master (which triggers the production Cloudflare deploy), then tag the release vX.Y.Z. Use when the user says "release", "cut a release", "promote develop to master", "ship to production". This is the ONLY path that touches master/production.
---

# release — promote develop to master (production)

This skill performs the `develop → master` step of the `feature → develop → master` flow.

- It is the **only** skill that merges into `master`, and merging triggers a **production** Cloudflare deploy.
- Use the **GitHub MCP** tools (`mcp__github__*`).
- Resolve `<OWNER>` and `<REPO>` from `git remote get-url origin`. For this repo: `qtmleap/Hono-Vite-Workers`.

## Preconditions

Check both before doing anything else:

1. **`develop` is ahead of `master`** — there must be something to release.
   - Check with `mcp__github__list_pull_requests(... base:'master', head:'<OWNER>:develop')` or by comparing the branches.
   - If `develop` is not ahead, there is nothing to release — **stop**.
2. **The release version is decided.** Read `version` from `package.json`.
   - It should already reflect the changes on `develop` (bumped by `commit-push-pr`).
   - If it does not: bump it on `develop` via a normal `commit-push-pr` PR **first**, then release.
   - Never push a version commit directly to `develop` or `master`.

## Steps

### 1. Open (or find) the release PR `develop → master`

- If a `develop → master` PR already exists, reuse it. Otherwise:

```
mcp__github__create_pull_request(
  owner: '<OWNER>', repo: '<REPO>',
  base:'master', head:'develop',
  title:'<type>: release vX.Y.Z', body:'<release notes + footer>')
```

- **Title**: must satisfy commitlint — lowercase start, valid `type` (including `chore`), ≤ 96 chars. Example: `chore: release v0.2.0`.
- **Body**: a summary of what is shipping, the version, and the footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

### 2. Gate on green CI

- Check with `mcp__github__pull_request_read(method:'get_check_runs' / 'get_status', …)`.
- Every required check must have `conclusion: success`.
- Also confirm `mergeable_state` is `clean`.
- If checks are **pending**: wait (use `/watch`).
- If any check **failed**: stop and report. Never release a red PR.

### 3. Confirm production with the user

- Merging this PR triggers a **production** Cloudflare Workers deploy (`.github/workflows/deployment.yaml`, `base.ref == master → production`). It is outward-facing and hard to reverse.
- **Get explicit confirmation that the user wants to deploy `vX.Y.Z` to production** before merging. A generic "yes" earlier in the conversation is not enough.

### 4. Merge into master

Use a **merge commit** — not squash — so `master` and `develop` stay in sync and do not diverge:

```
mcp__github__merge_pull_request(
  owner: '<OWNER>', repo: '<REPO>', pullNumber:<pr>,
  merge_method:'merge',
  commit_title:'<type>: release vX.Y.Z')
```

### 5. Tag `vX.Y.Z` on master

```
git fetch origin && git switch master && git pull
ver=$(jq -r .version package.json)
git tag -a "v$ver" -m "release v$ver" && git push origin "v$ver"
```

- Use an annotated tag. Pushing a **tag** is allowed — it is not a branch push to master/develop.
- If the tag already exists: do **not** force it — report the collision instead.
- Optionally publish release notes: `gh release create "v$ver" --generate-notes`. (`gh` is used here because no MCP create-release tool exists.)

### 6. Report

Report to the user:

- the merged release commit,
- the `vX.Y.Z` tag,
- that the production deploy is now running.

Offer to `/watch` the deploy.

## Rules

- **DO NOT** delete `develop` after release — it is a long-lived branch.
- **DO NOT** squash `develop → master`. Squashing makes the branches diverge and breaks the next release's "develop is ahead of master" check.
