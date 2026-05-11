---
name: prisma-migrate
description: Prisma + Cloudflare D1 migration workflow — schema changes, diff, local/remote apply
user-invocable: true
---

# /prisma-migrate — Prisma + Cloudflare D1

## Critical Rules

- All schema changes MUST go through migrations
  - Never run DDL directly (`ALTER TABLE`, `DROP COLUMN`, `ADD COLUMN`, etc.) outside a migration file
  - Direct DML (`UPDATE` / `DELETE` / `INSERT`) is fine
- `wrangler d1 migrations apply` does NOT recognize Prisma's directory layout (`<ts>_<name>/migration.sql`). Use `scripts/db/migrate.ts` instead.

## Migration Workflow

### 1. Edit the schema

Modify `prisma/schema.prisma`.

### 2. Generate the migration SQL

```sh
# 1) Diff: 既存 migration の積み上げ状態と新 schema を比較して SQL を取得
TS=$(date -u +%Y%m%d%H%M%S)
NAME=<short_name>          # e.g. add_episode_index
DIR="prisma/migrations/${TS}_${NAME}"

bunx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema prisma/schema.prisma \
  --script > /tmp/diff.sql

# 2) ディレクトリを作って配置 (空ディレクトリだけ先に作ると prisma が混乱するので注意)
mkdir -p "$DIR"
mv /tmp/diff.sql "$DIR/migration.sql"
```

Required tweaks:
- Backfill required for nullable → NOT NULL: prepend `UPDATE ... WHERE col IS NULL` to fill values before the RedefineTables block.
- D1 (SQLite) は `ALTER TABLE DROP COLUMN` を持つが Prisma は **RedefineTables** パターン（新テーブル作成 → データコピー → 旧テーブル削除 → リネーム）で生成する。

### 3. Apply locally

```sh
source .env
bun scripts/db/migrate.ts local
```

`d1_migrations` テーブルから未適用分だけ抽出して `wrangler d1 execute --file=` で当てて、適用後に `d1_migrations` に記録する。

### 4. Regenerate Prisma Client

```sh
bunx prisma generate
```

### 5. Apply to remote

```sh
source .env

bun scripts/db/migrate.ts staging     # --remote --env=staging
bun scripts/db/migrate.ts production  # --remote --env=production
```

## First-time bootstrap

新規環境で `d1_migrations` テーブルが空かつ既存スキーマがすでに最新の場合は、SQL を流さずに履歴だけ整える `init` モードを使う:

```sh
bun scripts/db/migrate.ts local init
bun scripts/db/migrate.ts staging init
```

新規 D1 (空 DB) なら `init` 不要。普通に `bun scripts/db/migrate.ts <target>` で全 migration が流れる。

## Notes

- Migration files live under `prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql`
- `migration_lock.toml` は Prisma 標準
- staging / production 反映前に `source .env` で `CLOUDFLARE_API_TOKEN` を読み込む（さもないと 10000 エラー）
- ローカル D1 をリセットしたいとき: `bash scripts/db/reset.sh` (state 削除 → `migrate.ts local` で再構築)
