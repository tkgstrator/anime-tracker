#!/usr/bin/env bash
set -euo pipefail

# ローカルD1をリモートD1にリストアする
# Usage: .vscode/scripts/d1-local-to-remote.sh

source .env
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

DB_NAME="anime-tracker-staging"
DUMP_FILE=".cache/d1-local-dump.sql"

echo "=== Local D1 → Remote D1 ==="

echo "[1/4] Exporting local D1..."
mkdir -p .cache
bunx wrangler d1 export "$DB_NAME" --local --output "$DUMP_FILE"

echo "[2/4] Patching dump (disable FK + DROP TABLE before CREATE)..."
sed -i '1s/^/PRAGMA foreign_keys=OFF;\n/' "$DUMP_FILE"
sed -i 's/^CREATE TABLE IF NOT EXISTS "\([^"]*\)"/DROP TABLE IF EXISTS "\1";\nCREATE TABLE IF NOT EXISTS "\1"/' "$DUMP_FILE"

echo "[3/4] Importing to remote D1..."
bunx wrangler d1 execute "$DB_NAME" --remote --file "$DUMP_FILE" -y

echo "[4/4] Cleanup..."
rm -f "$DUMP_FILE"

echo "Done! Local D1 has been restored to remote."
