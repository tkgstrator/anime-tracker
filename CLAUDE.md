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

## Frontend Routing

- ルーティングは **TanStack Router** のファイルベースルーティングを使用する
- ルートは **必ずディレクトリで分けて `index.tsx`** を配置する（フラットなファイル名は使わない）
  - 例: `src/app/routes/recordings/index.tsx` → `/recordings`
  - 動的ルート: `src/app/routes/anime/$id/index.tsx` → `/anime/:id`

## Database

- データベースは **Cloudflare D1** を使用する
- ORM は **Prisma** を使用する（`@prisma/client` + `@prisma/adapter-d1`）
- Prisma の使い方・マイグレーション手順は `.claude/skills/prisma-d1.md` を参照すること

## Project: AnimeTracker — 録画管理アプリ

Prime Video / Hulu / Netflix の今期アニメを管理し、録画状況を追跡するアプリ。

### 機能概要

1. **アニメ一覧** — 各プロバイダ (amazon, hulu, netflix) のアニメをブラウザで一覧表示
2. **録画チェック** — 一覧からアニメを選択し録画済みチェックマークを付ける
3. **話数管理** — 何話まで録画済みかを D1 で管理
4. **録画リスト API** — `GET /api/recordings` でプロバイダ名・コンテンツ ID 付きの録画一覧を返す

### 現状（実装済み）

- [x] D1 スキーマ (`migrations/0001_init.sql`) — `anime`, `recordings` テーブル
- [x] Backend API (`src/routes/anime.ts`, `src/routes/recordings.ts`) — CRUD + webhook
- [x] Zod スキーマ (`src/schemas/*.dto.ts`) — バリデーション定義
- [x] OpenAPI ドキュメント (`/docs`, `/openapi.json`)
- [x] Vite + Cloudflare Workers ビルド設定

### 今後の作業ワークフロー

#### Phase 0: Prisma + D1 Adapter 導入

1. **Prisma セットアップ** — `bun add @prisma/client @prisma/adapter-d1` + `bun add -d prisma`。`bunx prisma init --datasource-provider sqlite`
2. **Prisma スキーマ定義** — `prisma/schema.prisma` に `anime`, `recordings` モデルを定義。`provider = "sqlite"` + `previewFeatures = ["driverAdapters"]`
3. **D1 Adapter 接続ヘルパー** — `src/lib/db.ts` に PrismaClient + PrismaD1 アダプター初期化関数を作成
4. **API ルートを Prisma に移行** — `src/routes/anime.ts`, `src/routes/recordings.ts` の生 SQL を `prisma.anime.findMany()` 等に置換
5. **マイグレーション移行** — 既存の `migrations/0001_init.sql` を Prisma マイグレーションに変換

#### Phase 1: フロントエンド基盤

6. **Zodios クライアント作成** — `src/app/lib/api.ts` に Zodios インスタンスを定義し、バックエンド API の型安全な呼び出しを実現
7. **共通レイアウト** — `__root.tsx` にナビゲーション・ヘッダーを追加
8. **Shadcn/ui コンポーネント導入** — Button, Card, Checkbox, Badge, Table 等の必要なコンポーネントを追加

#### Phase 2: アニメ一覧・登録画面

9. **アニメ一覧ページ** — `src/app/routes/index.tsx` をアニメ一覧に変更。プロバイダごとにフィルタ・バッジ表示
10. **アニメ登録フォーム** — ダイアログまたは専用ページでアニメを追加。Zod でバリデーション
11. **アニメ削除** — 一覧から削除ボタンで削除

#### Phase 3: 録画管理 UI

12. **録画チェック機能** — アニメ一覧の各行にチェックボックスを配置。チェック → `POST /api/recordings`
13. **話数管理** — 録画済みの話数を表示・更新できる UI。episode_number の入力・更新
14. **録画状態バッジ** — pending / recorded をバッジで色分け表示
15. **録画一覧ページ** — `src/app/routes/recordings.tsx` で録画リスト専用ビュー

#### Phase 4: 改善・拡張

16. **検索・フィルタ** — タイトル検索、プロバイダフィルタ、ステータスフィルタ
17. **シーズン・年でのグルーピング** — year, season でアニメを分類
18. **一括操作** — 複数アニメの一括録画登録・取り消し
19. **レスポンシブ対応** — モバイルでの操作性向上

### ディレクトリ構造

```
prisma/
└── schema.prisma               # Prisma スキーマ定義
migrations/                     # D1 マイグレーション SQL
src/
├── index.ts                    # Hono エントリポイント
├── lib/                        # 共有ユーティリティ
│   └── db.ts                   # PrismaClient + D1 Adapter 初期化
├── routes/                     # Backend API ルート
│   ├── anime.ts
│   └── recordings.ts
├── schemas/                    # Zod スキーマ (*.dto.ts)
│   ├── anime.dto.ts
│   └── recording.dto.ts
└── app/                        # Frontend (React)
    ├── main.tsx                # React エントリ
    ├── index.css               # Tailwind CSS
    ├── lib/                    # フロントエンド用ユーティリティ (Zodios client 等)
    ├── components/             # 共有コンポーネント (Shadcn/ui)
    │   └── ui/                 # Shadcn/ui primitives
    └── routes/                 # TanStack Router ページ（ディレクトリ分離）
        ├── __root.tsx          # ルートレイアウト
        ├── _index/
        │   └── index.tsx       # / アニメ一覧
        └── recordings/
            └── index.tsx       # /recordings 録画一覧
```
