# ロードマップ

## Phase 0: Prisma + D1 Adapter 導入

1. **Prisma セットアップ** — `bun add @prisma/client @prisma/adapter-d1` + `bun add -d prisma`。`bunx prisma init --datasource-provider sqlite`
2. **Prisma スキーマ定義** — `prisma/schema.prisma` に `anime`, `recordings` モデルを定義。`provider = "sqlite"` + `previewFeatures = ["driverAdapters"]`
3. **D1 Adapter 接続ヘルパー** — `src/lib/db.ts` に PrismaClient + PrismaD1 アダプター初期化関数を作成
4. **API ルートを Prisma に移行** — `src/routes/anime.ts`, `src/routes/recordings.ts` の生 SQL を `prisma.anime.findMany()` 等に置換
5. **マイグレーション移行** — 既存の `migrations/0001_init.sql` を Prisma マイグレーションに変換

## Phase 1: フロントエンド基盤

6. **Zodios クライアント作成** — `src/app/lib/api.ts` に Zodios インスタンスを定義し、バックエンド API の型安全な呼び出しを実現
7. **共通レイアウト** — `__root.tsx` にナビゲーション・ヘッダーを追加
8. **Shadcn/ui コンポーネント導入** — Button, Card, Checkbox, Badge, Table 等の必要なコンポーネントを追加

## Phase 2: アニメ一覧・登録画面

9. **アニメ一覧ページ** — `src/app/routes/index.tsx` をアニメ一覧に変更。プロバイダごとにフィルタ・バッジ表示
10. **アニメ登録フォーム** — ダイアログまたは専用ページでアニメを追加。Zod でバリデーション
11. **アニメ削除** — 一覧から削除ボタンで削除

## Phase 3: 録画管理 UI

12. **録画チェック機能** — アニメ一覧の各行にチェックボックスを配置。チェック → `POST /api/recordings`
13. **話数管理** — 録画済みの話数を表示・更新できる UI。episode_number の入力・更新
14. **録画状態バッジ** — pending / recorded をバッジで色分け表示
15. **録画一覧ページ** — `src/app/routes/recordings.tsx` で録画リスト専用ビュー

## Phase 4: 改善・拡張

16. **検索・フィルタ** — タイトル検索、プロバイダフィルタ、ステータスフィルタ
17. **シーズン・年でのグルーピング** — year, season でアニメを分類
18. **一括操作** — 複数アニメの一括録画登録・取り消し
19. **レスポンシブ対応** — モバイルでの操作性向上
