#!/usr/bin/env bash
set -euo pipefail

# リモートD1をローカルD1にリストアする
# Usage: .vscode/scripts/d1-remote-to-local.sh

source .env
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

DB_NAME="anime-tracker-staging"
DUMP_FILE=".cache/d1-remote-dump.sql"

echo "=== Remote D1 → Local D1 ==="

echo "[1/4] Exporting remote D1..."
mkdir -p .cache
bunx wrangler d1 export "$DB_NAME" --remote --output "$DUMP_FILE"

echo "[2/4] Patching dump (disable FK + DROP TABLE before CREATE)..."
sed -i '1s/^/PRAGMA foreign_keys=OFF;\n/' "$DUMP_FILE"
sed -i 's/^CREATE TABLE IF NOT EXISTS "\([^"]*\)"/DROP TABLE IF EXISTS "\1";\nCREATE TABLE IF NOT EXISTS "\1"/' "$DUMP_FILE"

echo "[3/4] Importing to local D1..."
bunx wrangler d1 execute "$DB_NAME" --local --file "$DUMP_FILE" -y

echo "[4/4] Cleanup..."
rm -f "$DUMP_FILE"

echo "Done! Remote D1 has been restored to local."
