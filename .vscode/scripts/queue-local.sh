#!/usr/bin/env bash
set -euo pipefail

# ローカル開発サーバーの /api/queues にメッセージを送信する
# Usage: .vscode/scripts/queue-local.sh <provider> <category>
#   provider: amazon | hulu
#   category: new_episode | coming_soon | expiring

PROVIDER="${1:?Usage: queue-local.sh <provider> <category>}"
CATEGORY="${2:?Usage: queue-local.sh <provider> <category>}"
PORT="${3:-25173}"

MESSAGE=$(jq -n --arg provider "$PROVIDER" --arg category "$CATEGORY" \
  '{type: "fetch", message: {provider: $provider, category: $category}}')

echo "Sending to localhost:${PORT}"
echo "Message: $MESSAGE"

curl -s -X POST "http://localhost:${PORT}/api/queues" \
  -H "Content-Type: application/json" \
  -d "$MESSAGE" | jq .
