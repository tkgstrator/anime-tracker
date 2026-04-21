---
name: prisma-migrate
description: Prisma + Cloudflare D1 migration workflow — schema changes, diff, local/remote apply
user-invocable: true
---

# /prisma-migrate — Prisma + Cloudflare D1

## Critical Rules

- **All schema changes MUST go through migrations**
  - Never run DDL directly (`ALTER TABLE`, `DROP COLUMN`, `ADD COLUMN`, etc.)
  - Direct DML (`UPDATE` / `DELETE` / `INSERT`) is fine

## Migration Workflow

### 1. Edit the schema

Modify `prisma/schema.prisma`.

### 2. Create a migration

```sh
bunx prisma migrate diff \
  --from-local-d1 \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  --output prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql
```

### 3. Apply locally

```sh
bunx wrangler d1 migrations apply anime-tracker-staging --local
```

### 4. Regenerate Prisma Client

```sh
bunx prisma generate
```

### 5. Apply to remote

```sh
bunx wrangler d1 migrations apply anime-tracker-staging --remote
```

## Notes

- D1 (SQLite) supports `ALTER TABLE DROP COLUMN`, but Prisma migrations use the **RedefineTables** pattern (create new table → migrate data → drop old table → rename)
- Migration files live under `prisma/migrations/` in timestamped directories
