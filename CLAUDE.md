# CLAUDE.md

## Project Overview

Cloudflare Workers上で動作するフルスタックアプリケーションのテンプレート。

- **Frontend**: React + TailwindCSS + Shadcn/ui + TanStack Router
- **Backend**: Hono (OpenAPI対応) on Cloudflare Workers
- **Build**: Vite + @cloudflare/vite-plugin

## Commands

- `bun run dev` — 開発サーバー起動
- `bun run build` — ビルド (`CLOUDFLARE_ENV` でモード指定、デフォルト staging)
- `bun run deploy` — Cloudflare Workers へデプロイ

## Lint / Type Check

大きな変更を入れた際は、以下のチェックを必ず通すこと。

```sh
bunx tsc -b --noEmit        # 型チェック
bunx biome check src/        # lint + format チェック
```

## Runtime

- パッケージマネージャおよびランタイムは **Bun** を使用する
- `npx` / `npm` / `yarn` は使わず、`bunx` / `bun` を使うこと

## Validation / API

- バリデーションには **Zod** を使用する
- API通信には **Zodios** を使用する
- Zodスキーマは `schemas/*.dto.ts` にパスカルケースで定義する

### Backend ルート (Hono)

- バックエンドのルートは **Zod Hono OpenAPI** (`OpenAPIHono` + `createRoute`) で定義する
- リクエストの body / query / params は `createRoute({ request: { body, query, params } })` で **Zod スキーマを宣言** し、ハンドラ内では `c.req.valid('json' | 'query' | 'param')` で受け取る
  - `await c.req.json()` を直接呼んで `XxxSchema.safeParse(...)` する書き方は禁止 (型推論が効かず OpenAPI ドキュメントにも出ない)
  - 素の `app.post(...)` ではなく `app.openapi(createRoute({...}), handler)` を使う

## Frontend Routing

- ルーティングは **TanStack Router** のファイルベースルーティングを使用する
- ルートは **必ずディレクトリで分けて `index.tsx`** を配置する（フラットなファイル名は使わない）
  - 例: `src/app/routes/recordings/index.tsx` → `/recordings`
  - 動的ルート: `src/app/routes/anime/$id/index.tsx` → `/anime/:id`

## Database

- データベースは **Cloudflare D1** を使用する
- ORM は **Prisma** を使用する（`@prisma/client` + `@prisma/adapter-d1`）
- Prisma の使い方・マイグレーション手順は `.claude/skills/prisma-d1.md` を参照すること

## 環境変数 / 認証情報

- ローカルで CLI 操作（wrangler / terraform / aws / 各種スクリプト）をする前に **必ず `source .env`** すること。`.env` の値は更新されやすい。
- **認証情報は用途ごとに別物**。特に **R2 のキーを `AWS_*` という名前で持たない**（後述の理由で事故る）。

| 用途 | 置き場所 | 変数名 / 取得元 | 消費者 |
|---|---|---|---|
| Cloudflare API | `.env` | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | wrangler, CF API |
| Terraform state (R2 / S3 互換バックエンド) | `.env` | `R2_STATE_ACCESS_KEY_ID` / `R2_STATE_SECRET_ACCESS_KEY` | `terraform init -backend-config` |
| AWS プロバイダ (Lambda / IAM 管理) | `~/.aws/credentials [default]` | IAM ユーザー (例: `Terraform`) | terraform AWS provider, `aws` CLI |
| Lambda 画像アップロード用 R2 (nagisa-images) | terraform 変数 | `TF_VAR_r2_image_access_key_id` / `..._secret_access_key` / `TF_VAR_r2_account_id` | `terraform apply`（Lambda env の `R2_*` に入る） |
| Worker → Lambda Function URL 署名 | `.dev.vars` / wrangler secret | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`（**本物の AWS** = lambda_invoker） | Worker の aws4fetch |

- **禁止**: R2 のキーを `.env` に `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` という名前で置くこと。理由:
  - terraform の AWS provider / `aws` CLI が R2 キーを AWS 認証として誤用し失敗する（AWS の認証チェーンが `AWS_*` env を最優先するため）。
  - `scripts/cloudflare/set-secrets.sh` は `.env` の全キーを `wrangler secret put` するので、`AWS_*` が R2 キーだと **Worker の Lambda 呼び出し (aws4fetch、本物の AWS キーが必要) が壊れる**。

### Lambda デプロイ (terraform)

- 正式手順は `bun run deploy:lambda`（`lambda/fetch/build.ts` でバンドル → `terraform -chdir=infra apply`）。state は R2 バックエンド。
- バックエンド認証は **`AWS_*` env で渡さず** `-backend-config` で R2 state キーを渡す（AWS provider 側が `~/.aws` を使えるよう、認証を分離する）:

  ```sh
  terraform -chdir=infra init -reconfigure \
    -backend-config="access_key=$R2_STATE_ACCESS_KEY_ID" \
    -backend-config="secret_key=$R2_STATE_SECRET_ACCESS_KEY"
  ```

## Project Documentation

- プロジェクト概要・機能・ディレクトリ構造 → `docs/PROJECT.md`
- ロードマップ（Phase 0〜4） → `docs/ROADMAP.md`
- 機能別の計画書 → `docs/features/`
