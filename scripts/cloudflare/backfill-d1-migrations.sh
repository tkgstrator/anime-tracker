#!/usr/bin/env bash
# Backfill wrangler's d1_migrations tracking table with every migration
# already applied out-of-band (via prisma db push / manual d1 execute /
# etc). Safe to re-run: uses INSERT OR IGNORE keyed on the migration name.
#
# Run this ONCE per environment before enabling
# migrations_pattern = "prisma/migrations/*/migration.sql" in wrangler.toml,
# otherwise the first `wrangler d1 migrations apply` will try to re-run
# every existing migration from scratch and CREATE TABLE will collide.
#
# Usage:
#   scripts/cloudflare/backfill-d1-migrations.sh <env>
# e.g.
#   scripts/cloudflare/backfill-d1-migrations.sh staging
#   scripts/cloudflare/backfill-d1-migrations.sh production

set -euo pipefail

env="${1:-}"
if [[ -z "$env" ]]; then
  echo "usage: $0 <staging|production>" >&2
  exit 2
fi

case "$env" in
  staging)    db="anime-tracker-staging" ;;
  production) db="anime-tracker-production" ;;
  *)          echo "unknown env: $env" >&2; exit 2 ;;
esac

migrations_dir="prisma/migrations"

# Collect every migration.sql that lives under a timestamped subdir.
# The name stored in d1_migrations must match what wrangler emits when
# migrations_pattern = "prisma/migrations/*/migration.sql" is set, i.e.
# "<timestamp_name>/migration.sql".
names=()
for dir in "$migrations_dir"/*/; do
  names+=("$(basename "$dir")/migration.sql")
done

if [[ ${#names[@]} -eq 0 ]]; then
  echo "no migrations found under $migrations_dir" >&2
  exit 1
fi

# Build a single SQL blob: create table + insert every migration name.
{
  printf 'CREATE TABLE IF NOT EXISTS d1_migrations (\n'
  printf '  id INTEGER PRIMARY KEY AUTOINCREMENT,\n'
  printf '  name TEXT UNIQUE,\n'
  printf '  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n'
  printf ');\n'
  printf 'INSERT OR IGNORE INTO d1_migrations (name) VALUES\n'
  sep=''
  for name in "${names[@]}"; do
    printf "%s  ('%s')" "$sep" "$name"
    sep=$',\n'
  done
  printf ';\n'
} > /tmp/backfill-d1-migrations.sql

echo "backfilling ${#names[@]} migrations into $db (env=$env)"
bunx wrangler d1 execute "$db" --env "$env" --remote --file /tmp/backfill-d1-migrations.sql

echo
echo "verifying with 'd1 migrations list':"
bunx wrangler d1 migrations list "$db" --env "$env" --remote
