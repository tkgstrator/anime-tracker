#!/usr/bin/env bash
#
# fixtures の画像を ダウンロード → webp 変換 → R2 アップロード するスクリプト。
#
# フロー:
#   1. fixtures から画像 URL リストを生成
#   2. curl ダウンロード → cwebp q=90 変換 → ローカルに保存（並列）
#   3. aws s3 sync で一括アップロード
#
# 前提:
#   - cwebp (apt-get install webp)
#   - aws cli
#   - 環境変数: R2_IMAGE_ACCESS_KEY_ID, R2_IMAGE_SECRET_ACCESS_KEY, R2_ACCOUNT_ID
#
# 使い方:
#   source .env && R2_ACCOUNT_ID=... bash scripts/upload-images.sh
#
set -euo pipefail

# .env を読み込み（export なしの変数も利用可能にする）
set -a
source "$(dirname "$0")/../.env"
set +a

BUCKET="nagisa-images"
WEBP_DIR="scripts/.webp-images"
LIST_FILE="scripts/image-list.tsv"
DONE_FILE="scripts/image-download-done.txt"
CONCURRENCY=${1:-50}

: "${R2_IMAGE_ACCESS_KEY_ID:?Missing R2_IMAGE_ACCESS_KEY_ID}"
: "${R2_IMAGE_SECRET_ACCESS_KEY:?Missing R2_IMAGE_SECRET_ACCESS_KEY}"
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-2488ea57494b2dacae95a6e363e7dcb2}"

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

mkdir -p "$WEBP_DIR"
touch "$DONE_FILE"

# ---- Step 1: TSV リスト生成 ----
echo "=== Step 1: Generating image list..."
bun run scripts/list-image-urls.ts > "$LIST_FILE"
total=$(wc -l < "$LIST_FILE")
echo "Total: $total images"

# ---- Step 2: ダウンロード + webp 変換 ----
echo ""
echo "=== Step 2: Download + convert to webp..."

pending_file=$(mktemp)
grep -vFf "$DONE_FILE" "$LIST_FILE" > "$pending_file" || true
pending=$(wc -l < "$pending_file")
echo "Pending: $pending"

if [ "$pending" -gt 0 ]; then
  # worker スクリプト: 1行（url\tkey）を処理
  worker=$(mktemp)
  cat > "$worker" << 'WORKER'
#!/usr/bin/env bash
set -eu
line="$1"
url=$(printf '%s' "$line" | cut -f1)
key=$(printf '%s' "$line" | cut -f2)
webp_dir="$2"
done_file="$3"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

curl -sS -f -o "$tmp" "$url" 2>/dev/null || exit 1
cwebp -q 90 "$tmp" -o "$webp_dir/$key" >/dev/null 2>&1 || exit 1
echo "$key" >> "$done_file"
WORKER
  chmod +x "$worker"

  # 進捗監視（バックグラウンド）
  monitor_pid=""
  (
    while true; do
      sleep 0.5
      done_now=$(wc -l < "$DONE_FILE" 2>/dev/null || echo 0)
      printf "\r\033[K  Progress: %d / %d (%d%%)" "$done_now" "$total" "$((done_now * 100 / total))" >&2
    done
  ) &
  monitor_pid=$!

  # xargs で並列処理
  cat "$pending_file" | xargs -P "$CONCURRENCY" -I {} bash "$worker" {} "$WEBP_DIR" "$DONE_FILE" 2>/dev/null || true

  # 進捗監視を停止
  kill "$monitor_pid" 2>/dev/null || true
  wait "$monitor_pid" 2>/dev/null || true

  rm -f "$worker" "$pending_file"

  done_count=$(wc -l < "$DONE_FILE")
  printf "\r\033[K  Complete: %d images converted\n" "$done_count"
fi

# ---- Step 3: aws s3 sync で一括アップロード ----
file_count=$(find "$WEBP_DIR" -type f | wc -l)
echo ""
echo "=== Step 3: Uploading $file_count files to R2..."

AWS_ACCESS_KEY_ID="$R2_IMAGE_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_IMAGE_SECRET_ACCESS_KEY" \
AWS_DEFAULT_REGION="auto" \
aws s3 sync "$WEBP_DIR" "s3://$BUCKET" \
  --endpoint-url "$R2_ENDPOINT" \
  --content-type "image/webp"

echo ""
echo "Done!"
