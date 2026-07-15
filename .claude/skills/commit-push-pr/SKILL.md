---
name: commit-push-pr
description: Commit the current working tree on a feature branch (cut from develop), push it, and open a pull request into develop. Use when the user says "ship this", "make a PR", "commit and push and open a PR", or wants to turn local changes into a reviewable PR. Handles branch-first safety, commitlint-format messages, and the GitHub PR.
---

# commit-push-pr — commit, push, open a PR into develop

Turn the current local changes into a pushed feature branch plus a GitHub PR whose base is **`develop`**.

**Hard rules:**

- NEVER commit or push directly onto a protected branch (`master`, `develop`, `main`). Work only lands there through a merged PR.
- Branch flow is `feature → develop → master`. This skill covers `feature → develop` only; merging into `develop` deploys to the **development** env.
- The `develop → master` promotion (production deploy + version tag) belongs to the separate **`release`** skill — never do it here.

## Repo coordinates

- **GitHub operations** (creating the PR) go through the **GitHub MCP** (`mcp__github__*`).
- **Resolve `<OWNER>` / `<REPO>` first** from `git remote get-url origin` (the URL ends in `…/<OWNER>/<REPO>.git`; this repo is `qtmleap/Hono-Vite-Workers`). Use the resolved values in every MCP call — never hard-code the repo, so the skill also works in template-derived repos.
- **Local git operations** (branch, commit, push, tag) use the `git` CLI — there is no MCP equivalent for pushing local commits.
- `gh` is only a fallback when the MCP is unavailable.

## Preconditions

- There are changes to ship: `git status --porcelain` is non-empty.
- If `git status` is clean, do not push or open a PR — tell the user there is nothing to ship.

## Steps

### 1. Branch first, off develop (hard rule)

Get the current branch with `git branch --show-current`.

- If it is `master`, `main`, `develop`, or detached HEAD → create a feature branch from the latest `develop` **before committing**:

  ```
  git fetch origin && git switch -c <type>/<short-kebab-desc> origin/develop
  ```

  `<type>` reflects the work (`feat`, `fix`, `chore`, `docs`, `refactor`…).
- If already on a feature branch → keep it.
- Never commit onto `master` / `main` / `develop`.

### 2. Version bump (semver — only if the change warrants a release)

Judge from the change whether `package.json`'s `version` should move, following semantic versioning:

- **major** — breaking change (`feat!`, removed/renamed public API, incompatible behavior)
- **minor** — `feat` (new backward-compatible capability)
- **patch** — `fix` / `perf` / `refactor` that ships user-visible behavior
- **no bump** — pure `docs` / `chore` / `ci` / `test` / `format` / internal-only

Pre-1.0 nuance (repo is currently `0.x`): keep breaking changes as a **minor** and features/fixes as a **patch** until the user opts into 1.0. When in doubt, prefer the smaller bump or ask.

If a bump is warranted:

- Edit the `version` field in `package.json` (and `bun.lock` if it pins it) **before** committing, so the new version flows into `develop` with this PR.
- Do NOT create the `vX.Y.Z` git tag here — `release` creates it later, when `develop` is promoted to `master`.

### 3. Commit (commitlint-conventional)

Stage with `git add -A`, then write the message yourself:

- Header format: `<type>(<optional-scope>): <subject>`
- `<type>` is EXACTLY one of: `build ui ci docs feat fix perf refactor revert format test chore` (the set is defined by the repo's `.commitlintrc.yaml` type-enum).
- Subject and body in **English**. Subject **starts lowercase**, no trailing period (avoids the commitlint subject-case failure).
- Header ≤ **96** chars (`header-max-length`).
- Commit with the repo's local git identity (already configured) and append the co-author trailer:

  ```
  git commit -m "<header>" -m "<optional body>" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

- If you bumped the version, mention it in the body (e.g. `bump version to 0.2.0`).
- Make a single commit, unless the user explicitly authorized a multi-commit split — then make several focused commits.

### 4. Push

- Confirm `git branch --show-current` is the feature branch before pushing.
- Push the **feature branch** only: `git push -u origin HEAD`
- Never push to `master` / `develop` / `main` (forbidden).
- Never use `--force` / `-f` (denied).

### 5. Open the PR via GitHub MCP

Base = `develop`. Never `master` — that is the `release` skill's job.

```
mcp__github__create_pull_request(
  owner: '<OWNER>', repo: '<REPO>',
  base: 'develop', head: '<feature-branch>',
  title: '<commitlint-style title>', body: '<body>')
```

- The head branch must already be pushed (step 4) — the MCP creates the PR from the remote branch.
- Title follows the same commitlint rules as the commit header.
- Body: short **What / Why**, a test-plan line, the new version (`vX.Y.Z`) if bumped, then the footer:

  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```

- Merging into `develop` deploys to the **development** env (`.github/workflows/deployment.yaml`, `base.ref != master → development`) — no production impact yet. Production happens later via `release`.
- Fallback only if the MCP is unavailable: `gh pr create --base develop --head <branch> --title … --body …`

### 6. Report

- Report the PR URL and the version (bumped or unchanged).
- Suggest `/watch` to follow the checks, then `/merge` once green (merges into `develop`).

## Notes

- Do not push or PR if `git status` is clean — tell the user there is nothing to ship.
- If pushing requires authentication the agent lacks, ask the user to run the push themselves with `! git push -u origin HEAD`.
