#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

ENV_FILE="${1:-.dev.vars}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found"
  exit 1
fi

source .env

while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  echo "Setting secret: $key"
  echo "$value" | bunx wrangler secret put "$key" --env staging 2>&1
done < "$ENV_FILE"

echo "All secrets have been set."
