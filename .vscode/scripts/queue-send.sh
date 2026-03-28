#!/usr/bin/env bash
set -euo pipefail

# Cloudflare Queues REST API 経由でメッセージを送信する
# Usage: .vscode/scripts/queue-send.sh <provider> <category>
#   provider: amazon | hulu
#   category: new_episode | coming_soon | expiring

source .env
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

PROVIDER="${1:?Usage: queue-send.sh <provider> <category>}"
CATEGORY="${2:?Usage: queue-send.sh <provider> <category>}"
QUEUE_NAME="anime-tracker-sync-staging"

# キュー名からキューIDを取得
QUEUE_ID=$(curl -s \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/queues" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  | jq -r --arg name "$QUEUE_NAME" '.result[] | select(.queue_name == $name) | .queue_id')

if [ -z "$QUEUE_ID" ]; then
  echo "Error: Queue '$QUEUE_NAME' not found"
  exit 1
fi

MESSAGE=$(jq -n --arg provider "$PROVIDER" --arg category "$CATEGORY" \
  '{type: "fetch", message: {provider: $provider, category: $category}}')

echo "Sending to queue: $QUEUE_NAME ($QUEUE_ID)"
echo "Message: $MESSAGE"

curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/queues/${QUEUE_ID}/messages" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"body\": $MESSAGE}" | jq .
