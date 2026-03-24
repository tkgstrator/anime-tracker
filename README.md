# AnimeTracker — 録画管理アプリ

Prime Video / Hulu / Netflix の今期アニメを管理し、録画状況を追跡するアプリ。

## 技術スタック

- [Vite](https://vite.dev/) - ビルドツール
- [React](https://react.dev/) - UI ライブラリ
- [TanStack Router](https://tanstack.com/router) - 型安全なファイルベースルーター
- [Tailwind CSS](https://tailwindcss.com/) - スタイリング
- [shadcn/ui](https://ui.shadcn.com/) - UI コンポーネント
- [Hono](https://hono.dev/) + [Zod OpenAPI](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) - API フレームワーク
- [Cloudflare Workers](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/) - エッジランタイム & データベース
- [Prisma](https://www.prisma.io/) + [@prisma/adapter-d1](https://www.prisma.io/docs/orm/overview/databases/cloudflare-d1) - ORM
- [Zodios](https://www.zodios.org/) - 型安全な API クライアント
- [Zod](https://zod.dev/) - バリデーション
- [Bun](https://bun.sh/) - ランタイム / パッケージマネージャー
- [TypeScript](https://www.typescriptlang.org/)
- [Biome](https://biomejs.dev/) - Linter / Formatter

## セットアップ

```bash
bun install
```

## 開発

```bash
bun run dev
```

## ビルド

```bash
bun run build
```

## デプロイ

```bash
bun run deploy
```

`CLOUDFLARE_ENV` 環境変数でデプロイ先を指定できます（デフォルト: `staging`）。

## Lint / 型チェック

```bash
bunx tsc -b --noEmit        # 型チェック
bunx biome check src/        # lint + format チェック
```

## プロジェクト構成

```
prisma/
└── schema.prisma               # Prisma スキーマ定義
migrations/                     # D1 マイグレーション SQL
src/
├── index.ts                    # Hono エントリーポイント
├── lib/                        # 共有ユーティリティ
│   └── db.ts                   # PrismaClient + D1 Adapter 初期化
├── routes/                     # Backend API ルート
│   ├── anime.ts
│   └── recordings.ts
├── schemas/                    # Zod スキーマ (*.dto.ts)
│   ├── anime.dto.ts
│   └── recording.dto.ts
└── app/                        # Frontend (React)
    ├── main.tsx                # React エントリーポイント
    ├── index.css               # Tailwind CSS
    ├── lib/                    # フロントエンド用ユーティリティ (Zodios client 等)
    ├── components/             # 共有コンポーネント (shadcn/ui)
    │   └── ui/                 # shadcn/ui primitives
    └── routes/                 # TanStack Router ページ（ディレクトリ分離）
        ├── __root.tsx          # ルートレイアウト
        ├── index.tsx           # / アニメ一覧
        └── recordings/
            └── index.tsx       # /recordings 録画一覧
```
