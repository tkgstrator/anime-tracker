#!/bin/bash
set -euo pipefail

echo "=== Reset local D1 database ==="

# 1. ローカルD1のデータを削除
echo "[1/3] Deleting local D1 data..."
rm -rf .wrangler/state/v3/d1
echo "  Done."

# 2. マイグレーションを全て適用
echo "[2/3] Applying migrations..."
for dir in $(ls -d prisma/migrations/*/ | sort); do
  echo "  Applying: $dir"
  bunx wrangler d1 execute anime-tracker-staging --local --file "${dir}migration.sql"
done
echo "  Done."

# 3. シードデータの投入
echo "[3/3] Seeding data..."
for f in $(ls scripts/seed/*.sql | sort); do
  echo "  Loading: $f"
  bunx wrangler d1 execute anime-tracker-staging --local --file "$f"
done
echo "  Done."

echo ""
echo "=== Reset complete ==="
