# syntax=docker/dockerfile:1.7
#
# Multi-stage build for anime-tracker-fetch Lambda container image.
#
# Stage 1 も Stage 2 も oven/bun base を使う。Bun binary は base image に
# 同梱されているので、dnf/unzip/curl で手動 install する step は不要になる。
#
# Lambda 側では ENTRYPOINT (bootstrap) が Bun で runtime.mjs を実行し、
# Lambda Runtime API と通信 + handler を dynamic import する custom runtime 実装。
#
# Build:  docker buildx build --platform linux/arm64 -f lambda/fetch/Dockerfile -t anime-tracker-fetch .
# Deploy: ECR に push して aws_lambda_function.image_uri で参照する

# ---- Stage 1: build ----
FROM oven/bun:1.3.11 AS builder

WORKDIR /app

# 依存を先に (キャッシュ最適化)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ソース (lambda/fetch は src/ 配下の provider 群を import している)
COPY lambda/fetch/ ./lambda/fetch/
COPY src/ ./src/

# bun build → /app/lambda/fetch/dist/index.mjs
# lambda/fetch/build.ts は最後に zip コマンドで function.zip を作るが、container
# image では zip 化不要なので bun build を直接叩く。
RUN bun build lambda/fetch/index.ts \
    --outdir lambda/fetch/dist \
    --target node \
    --format esm \
    --minify \
    --entry-naming '[name].mjs'

# ---- Stage 2: runtime ----
FROM oven/bun:1.3.11

# Lambda custom runtime (Bun 実装の Lambda Runtime API adapter)
COPY lambda/fetch/runtime.mjs /var/runtime/runtime.mjs
COPY lambda/fetch/bootstrap   /var/runtime/bootstrap
RUN chmod +x /var/runtime/bootstrap

# アプリコード: bun build 済 index.mjs
WORKDIR /var/task
COPY --from=builder /app/lambda/fetch/dist/index.mjs ./index.mjs

# Lambda が起動する ENTRYPOINT (custom runtime を Bun で起動)。
# oven/bun base には default ENTRYPOINT が無いので bootstrap を明示。
ENTRYPOINT ["/var/runtime/bootstrap"]
