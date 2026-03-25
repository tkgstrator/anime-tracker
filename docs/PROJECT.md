# AnimeTracker — 録画管理アプリ

Prime Video / Hulu / Netflix の今期アニメを管理し、録画状況を追跡するアプリ。

## 機能概要

1. **アニメ一覧** — 各プロバイダ (amazon, hulu, netflix) のアニメをブラウザで一覧表示
2. **録画チェック** — 一覧からアニメを選択し録画済みチェックマークを付ける
3. **話数管理** — 何話まで録画済みかを D1 で管理
4. **録画リスト API** — `GET /api/recordings` でプロバイダ名・コンテンツ ID 付きの録画一覧を返す

## 現状（実装済み）

- [x] D1 スキーマ (`migrations/0001_init.sql`) — `anime`, `recordings` テーブル
- [x] Backend API (`src/routes/anime.ts`, `src/routes/recordings.ts`) — CRUD + webhook
- [x] Zod スキーマ (`src/schemas/*.dto.ts`) — バリデーション定義
- [x] OpenAPI ドキュメント (`/docs`, `/openapi.json`)
- [x] Vite + Cloudflare Workers ビルド設定

## ディレクトリ構造

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
