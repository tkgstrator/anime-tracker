#!/usr/bin/env bash
set -euo pipefail

# ローカルD1をリモートD1にリストアする
# Usage: scripts/d1/local-to-remote.sh

cd "$(dirname "$0")/../.."
source .env
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

DB_NAME="anime-tracker-staging"
TIMESTAMP=$(date +%s)
SCHEMA_FILE=".cache/d1-schema-${TIMESTAMP}.sql"
DATA_FILE=".cache/d1-data-${TIMESTAMP}.sql"

echo "=== Local D1 → Remote D1 ==="

echo "[1/5] Exporting local schema..."
mkdir -p .cache
bunx wrangler d1 export "$DB_NAME" --local --no-data --output "$SCHEMA_FILE"

echo "[2/5] Exporting local data..."
bunx wrangler d1 export "$DB_NAME" --local --no-schema --output "$DATA_FILE"

echo "[3/5] Importing schema to remote (DROP + CREATE)..."
# 各 CREATE TABLE の前に DROP TABLE を挿入
sed -i 's/^CREATE TABLE\( IF NOT EXISTS\)\? "\([^"]*\)"/DROP TABLE IF EXISTS "\2";\nCREATE TABLE IF NOT EXISTS "\2"/' "$SCHEMA_FILE"
sed -i 's/^CREATE TABLE \([a-z0-9_]*\)(/DROP TABLE IF EXISTS "\1";\nCREATE TABLE IF NOT EXISTS "\1"(/' "$SCHEMA_FILE"
bunx wrangler d1 execute "$DB_NAME" --remote --file "$SCHEMA_FILE" -y

echo "[4/5] Importing data to remote..."
sed -i '1s/^/PRAGMA foreign_keys=OFF;\n/' "$DATA_FILE"
bunx wrangler d1 execute "$DB_NAME" --remote --file "$DATA_FILE" -y

echo "[5/5] Cleanup..."
rm -f "$SCHEMA_FILE" "$DATA_FILE"

echo "Done! Local D1 has been restored to remote."
