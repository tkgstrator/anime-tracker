#!/usr/bin/env bash
set -euo pipefail

# リモートD1をローカルD1にリストアする
# Usage: scripts/d1/remote-to-local.sh

cd "$(dirname "$0")/../.."
source .env
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

DB_NAME="anime-tracker-staging"
DUMP_FILE=".cache/d1-remote-dump.sql"

echo "=== Remote D1 → Local D1 ==="

echo "[1/4] Exporting remote D1..."
mkdir -p .cache
bunx wrangler d1 export "$DB_NAME" --remote --output "$DUMP_FILE"

echo "[2/4] Patching dump (reorder tables by dependency)..."
python3 "$(dirname "$0")/reorder-dump.py" "$DUMP_FILE"

echo "[3/4] Importing to local D1..."
bunx wrangler d1 execute "$DB_NAME" --local --file "$DUMP_FILE" -y

echo "[4/4] Cleanup..."
rm -f "$DUMP_FILE"

echo "Done! Remote D1 has been restored to local."
