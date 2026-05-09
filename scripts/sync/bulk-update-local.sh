#!/usr/bin/env bash
set -euo pipefail

# Lambda を経由せずプロバイダ API を直接叩いてエピソード詳細を同期する
# Usage: scripts/sync/bulk-update-local.sh <provider> [contentId1,contentId2,...]
#   provider: abema | hulu
#   contentIds を省略した場合、ローカル DB の全 contentId を対象にする

PROVIDER="${1:?Usage: bulk-update-local.sh <provider> [contentIds]}"
CONTENT_IDS="${2:-}"
PORT="${3:-25173}"
BASE="http://localhost:${PORT}"

if [ -z "$CONTENT_IDS" ]; then
  echo "Fetching all contentIds for provider=${PROVIDER}..."
  CONTENT_IDS=$(curl -s "${BASE}/api/anime?provider=${PROVIDER}&limit=2000" \
    | jq -r '[.data[].contentId] | join(",")')
  COUNT=$(echo "$CONTENT_IDS" | tr ',' '\n' | wc -l | tr -d ' ')
  echo "Found ${COUNT} titles"
fi

IFS=',' read -ra IDS <<< "$CONTENT_IDS"

BATCH_SIZE=20
TOTAL=${#IDS[@]}
echo "Syncing ${TOTAL} titles for provider=${PROVIDER} (batch size: ${BATCH_SIZE})"

OK=0
FAIL=0

for ((i=0; i<TOTAL; i+=BATCH_SIZE)); do
  BATCH=("${IDS[@]:i:BATCH_SIZE}")
  JSON_ARRAY=$(printf '%s\n' "${BATCH[@]}" | jq -R . | jq -s .)

  MESSAGE=$(jq -n --arg provider "$PROVIDER" --argjson contentIds "$JSON_ARRAY" \
    '{provider: $provider, contentIds: $contentIds}')

  echo "[$(( i / BATCH_SIZE + 1 ))/$(( (TOTAL + BATCH_SIZE - 1) / BATCH_SIZE ))] Processing ${#BATCH[@]} titles..."

  RESULT=$(curl -s -X POST "${BASE}/api/sync/local" \
    -H "Content-Type: application/json" \
    -d "$MESSAGE" --max-time 300)

  BATCH_OK=$(echo "$RESULT" | jq '[.results[] | select(.status == "ok")] | length')
  BATCH_FAIL=$(echo "$RESULT" | jq '[.results[] | select(.status == "error")] | length')
  OK=$((OK + BATCH_OK))
  FAIL=$((FAIL + BATCH_FAIL))

  if [ "$BATCH_FAIL" -gt 0 ]; then
    echo "$RESULT" | jq -r '.results[] | select(.status == "error") | "  ERROR: \(.contentId) - \(.error)"'
  fi
done

echo ""
echo "Done: ${OK} succeeded, ${FAIL} failed (total: ${TOTAL})"
