# syntax=docker/dockerfile:1.7
#
# Multi-stage build for anime-tracker-fetch Lambda container image.
#
# Stage 1: bun build で lambda/fetch/index.ts を dist/index.mjs にバンドル
# Stage 2: Amazon Linux 2023 arm64 base に Bun binary + custom runtime を配置
#
# 従来の Bun ランタイム Layer (bootstrap + runtime.mjs + bin/bun) を image 内に
# 内包することで、Layer リソースを廃止し、ap/us で単一 image を共有できる。
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
RUN bun run lambda/fetch/build.ts

# ---- Stage 2: runtime ----
FROM public.ecr.aws/lambda/provided:al2023-arm64

# Bun binary (arm64) を /usr/local/bin/bun に配置
ARG BUN_VERSION=1.3.11
ADD https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-aarch64.zip /tmp/bun.zip
RUN dnf install -y unzip && \
    unzip -q /tmp/bun.zip -d /tmp && \
    mv /tmp/bun-linux-aarch64/bun /usr/local/bin/bun && \
    chmod +x /usr/local/bin/bun && \
    rm -rf /tmp/bun.zip /tmp/bun-linux-aarch64 && \
    dnf clean all

# Lambda custom runtime (Bun 実装の Lambda Runtime API adapter)
COPY lambda/fetch/runtime.mjs /var/runtime/runtime.mjs
COPY lambda/fetch/bootstrap   /var/runtime/bootstrap
RUN chmod +x /var/runtime/bootstrap

# アプリコード: bun build 済 index.mjs
WORKDIR /var/task
COPY --from=builder /app/lambda/fetch/dist/index.mjs ./index.mjs

# provided.al2023 の default handler ハンドリング。実際には bootstrap が
# runtime.mjs → import ./index.mjs → mod.handler を呼ぶ。
CMD ["index.handler"]
