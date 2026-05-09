#!/usr/bin/env bash
set -euo pipefail

# AWS Lambda を直接実行して結果を表示する
# Usage: scripts/lambda/invoke.sh <endpoint> <provider> [category]
#   endpoint: title_list | expiring
#   provider: amazon | hulu | crunchyroll
#   category: new_episode | coming_soon (title_list のみ必須)

ENDPOINT="${1:?Usage: invoke.sh <endpoint> <provider> [category]}"
PROVIDER="${2:?Usage: invoke.sh <endpoint> <provider> [category]}"
CATEGORY="${3:-}"

# プロバイダーに応じて関数名・リージョンを決定
case "$PROVIDER" in
  amazon|hulu|abema)
    FUNCTION_NAME="anime-tracker-fetch"
    REGION="ap-northeast-1"
    ;;
  crunchyroll)
    FUNCTION_NAME="anime-tracker-fetch-us"
    REGION="us-east-1"
    ;;
  *)
    echo "Error: Unknown provider '$PROVIDER' (amazon|hulu|crunchyroll|abema)"
    exit 1
    ;;
esac

# ペイロード構築
case "$ENDPOINT" in
  title_list)
    if [ -z "$CATEGORY" ]; then
      echo "Error: category is required for title_list (new_episode|coming_soon)"
      exit 1
    fi
    BODY=$(jq -nc --arg p "$PROVIDER" --arg c "$CATEGORY" '{provider:$p, category:$c}')
    ;;
  expiring)
    BODY=$(jq -nc --arg p "$PROVIDER" '{provider:$p}')
    ;;
  *)
    echo "Error: Unknown endpoint '$ENDPOINT' (title_list|expiring)"
    exit 1
    ;;
esac

PAYLOAD=$(jq -nc --arg path "/$ENDPOINT" --arg body "$BODY" '{rawPath:$path, body:$body}')

echo "Function: $FUNCTION_NAME ($REGION)"
echo "Endpoint: /$ENDPOINT"
echo "Payload: $PAYLOAD"
echo "---"

OUTFILE=$(mktemp)
trap 'rm -f "$OUTFILE"' EXIT

aws lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --cli-binary-format raw-in-base64-out \
  --payload "$PAYLOAD" \
  --output json \
  "$OUTFILE" > /dev/null

# Lambda のレスポンスボディを整形表示
cat "$OUTFILE" | jq .
