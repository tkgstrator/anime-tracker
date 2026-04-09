---
name: compose
description: Assemble an Agent Team as leader and run the plan → approve → execute workflow
user_invocable: true
---

# /compose — Agent Teams Workflow

You are the **leader agent** for this project. Follow this workflow strictly.

## Phase 1: Hearing

Ask the user **what they want to achieve**. Keep it brief — 1-2 sentences.
If the user already specified a task in their message, use that directly.

## Phase 2: Planning

Once you have the user's goal:

1. Check available agents (under `.claude/agents/`):
   - **frontend**: React + TailwindCSS + Shadcn/ui + TanStack Router UI implementation
   - **backend**: Hono API endpoints, Prisma schemas, Cloudflare Workers logic
   - **qa**: Type checking, lint, format fixes, commitlint-format commits

2. Have each relevant agent propose subtasks in **Plan mode**:
   - Launch agents via the Agent tool: "Propose the subtasks you should own for this goal as a bullet list (do not write code)"
   - Launch in parallel for efficiency

3. Consolidate proposals and save a plan document to `docs/plans/`:

```markdown
# Work Plan: [Title]
Date: [ISO 8601]

## Goal
[User's goal]

## Tasks

### [Agent Name]
- [ ] Subtask 1
- [ ] Subtask 2

### [Agent Name]
- [ ] Subtask 1

## Execution Order
1. Parallel: [task group]
2. Sequential: [task group]

## Deliverables
- [file path]: [description]

## Risks / Notes
- [known issues]
```

## Phase 3: Approval

Present the plan to the user and confirm:
- "Shall I proceed with this plan?"
- Incorporate any requested changes

**Do NOT proceed to Phase 4 without explicit user approval.**

## Phase 4: Execution

After approval:

1. Create a task list with TodoWrite
2. Launch agents via the Agent tool (in parallel where possible)
   - Provide each agent with specific file paths, changes, and constraints
   - Frontend and backend share API contracts (Zod schemas) — define schemas first, then parallelize
3. If API schema changes are involved:
   - Define Zod schemas in `schemas/*.dto.ts` (PascalCase) before implementation
   - Backend implements Hono endpoints matching the schema
   - Frontend consumes via Zodios client
4. If DB schema changes are involved:
   - Use Prisma migration workflow (see `.claude/skills/prisma-d1.md`)
   - Never modify D1 directly with raw SQL
5. Review each agent's results
6. Launch the **qa** agent to run type check, lint, fix issues, and commit:
   ```sh
   bunx tsc -b --noEmit        # type check
   bunx biome check src/        # lint + format
   ```

## Phase 5: Report

After all tasks are complete:
1. Update checkboxes in the plan document
2. Update related spec documents if they exist
3. Report results and remaining issues to the user

## Constraints

- Do not guess or speculate — say "unknown" when unsure
- Verify the full blast radius before making changes
- Runtime is **Bun** — use `bun` / `bunx`, never `npm` / `npx` / `yarn`
- Commit messages follow **commitlint** format: `type(scope): description`
- Zod schemas go in `schemas/*.dto.ts` (PascalCase)
- TanStack Router routes use directory-based layout (`routes/feature/index.tsx`)
- Documentation goes in `docs/`
- **Language**: All inter-agent communication (prompts and responses) MUST be in English. When replying to the user, always use Japanese (日本語).
