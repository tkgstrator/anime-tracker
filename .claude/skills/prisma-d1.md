# Prisma + Cloudflare D1 スキル

## 重要なルール

- **スキーマ変更は必ずマイグレーション経由で行うこと**
  - `ALTER TABLE`, `DROP COLUMN`, `ADD COLUMN` などの DDL を直接 SQL で実行してはいけない
  - データの `UPDATE` / `DELETE` / `INSERT` は直接 SQL で OK

## マイグレーション手順

### 1. スキーマを変更する

`prisma/schema.prisma` を編集する。

### 2. マイグレーションを作成する

```sh
bunx prisma migrate diff \
  --from-local-d1 \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  --output prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql
```

### 3. ローカルに適用する

```sh
bunx wrangler d1 migrations apply anime-tracker-staging --local
```

### 4. Prisma Client を再生成する

```sh
bunx prisma generate
```

### 5. リモートに適用する

```sh
bunx wrangler d1 migrations apply anime-tracker-staging --remote
```

## 注意事項

- D1 の SQLite は `ALTER TABLE DROP COLUMN` をサポートしているが、Prisma のマイグレーションでは `RedefineTables` パターン（新テーブル作成 → データ移行 → 旧テーブル削除 → リネーム）を使う
- マイグレーションファイルは `prisma/migrations/` 以下にタイムスタンプ付きディレクトリで管理される