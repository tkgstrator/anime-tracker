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

## Project Documentation

- プロジェクト概要・機能・ディレクトリ構造 → `docs/PROJECT.md`
- ロードマップ（Phase 0〜4） → `docs/ROADMAP.md`
- 機能別の計画書 → `docs/features/`
