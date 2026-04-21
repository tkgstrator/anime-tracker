# fetch メッセージのカテゴリ分割

## 概要

現在 `fetch` メッセージは1種類で、新着エピソード取得と配信終了間近取得を同時に行っている。
これを `category` フィールドで分割し、それぞれ独立した頻度で実行できるようにする。

併せて、DB カラム `expiringAt` を `expiredAt` にリネームする。
格納しているのは「配信終了予定日時」であり、その日時を過ぎれば配信終了済みなので `expiredAt` の方が適切。

## 背景

- 新着エピソード (`new_episode`) は毎時チェックが必要
- 配信終了間近 (`expiring`) は日単位の変化なので1日1回で十分
- `expiring` は DB の `expiredAt` を更新するだけで、後続の `update`（詳細取得）は不要

## 現状

```
scheduled (毎時)
  → fetch { provider }
    → 新着一覧取得 + 配信終了間近一覧取得（マージ）
    → AniList 識別 + DB INSERT
    → expiringAt 更新 / リセット
    → nextEpisodeDate 更新 / リセット
    → return contentIds → update キュー投入
```

## 変更後

```
scheduled (毎時)
  → fetch { provider, category: 'new_episode' }
    → 新着一覧取得のみ
    → AniList 識別 + DB INSERT
    → nextEpisodeDate 更新 / リセット
    → return contentIds → update キュー投入

scheduled (1日1回)
  → fetch { provider, category: 'expiring' }
    → 配信終了間近一覧取得のみ
    → 既存タイトルの expiredAt / expiringSeason を更新
    → 配信終了一覧から消えたタイトルの expiredAt をリセット
    → update キューには投入しない
```

## 実装手順

### 0. DB カラムリネーム: `expiringAt` → `expiredAt`

`prisma/schema.prisma`:

```prisma
expiredAt      DateTime? @map("expired_at")      // 配信終了日時 (UTC)
expiringSeason Int?      @map("expiring_season")  // 対象シーズン番号 (null=作品全体)
```

マイグレーション SQL:

```sql
ALTER TABLE "anime" RENAME COLUMN "expiring_at" TO "expired_at";
```

関連ファイルの `expiringAt` → `expiredAt` リネーム:

- `src/schemas/anime.dto.ts`
- `src/schemas/providers/common.dto.ts` (TitleSchema 内は `expiring` のまま)
- `src/lib/sync.ts` (`computeExpiringFields` の戻り値)
- `src/routes/anime.ts` (フィルタ条件)
- `src/app/components/anime-carousel.tsx` (BadgeType: `expiringAt` → `expiredAt`)
- `src/app/routes/index.tsx` (ソート・データ取得)
- `src/app/lib/api.ts` (クエリパラメータ)

### 1. メッセージスキーマ変更

`src/schemas/message.dto.ts` の `FetchMessageBodySchema` に `category` を追加:

```ts
const FetchCategoryEnum = z.enum(['new_episode', 'expiring'])

const FetchMessageBodySchema = z.object({
  provider: ProviderTypeEnum,
  category: FetchCategoryEnum
})
```

### 2. Provider の `fetchTitleList` をカテゴリ対応

`src/lib/providers/base.ts` の `FetchTitleListOptions` を変更:

```ts
export interface FetchTitleListOptions {
  newEpisodesOnly?: boolean
  expiringOnly?: boolean
}
```

`AmazonProvider.fetchTitleList` を分離:
- `newEpisodesOnly` 時: 新着一覧のみ取得（配信終了間近は取得しない）
- `expiringOnly` 時: 配信終了間近一覧のみ取得
- どちらも未指定: 全タイトル取得（既存互換）

### 3. SyncService の `fetch` をカテゴリ別に分岐

`src/lib/sync.ts` の `fetch()` を category に応じて処理を分岐:

- `new_episode`: 現行の新着取得ロジック（expiring 関連を除去）
  - `fetchTitleList({ newEpisodesOnly: true })` で取得
  - AniList 識別 + DB INSERT
  - nextEpisodeDate 更新 / リセット
  - contentIds を返す → update キュー投入
- `expiring`: 配信終了間近専用ロジック
  - `fetchTitleList({ expiringOnly: true })` で取得
  - 既存タイトルの expiredAt / expiringSeason を更新
  - 配信終了一覧から消えたタイトルの expiredAt をリセット
  - contentIds を返す（キューハンドラ側で `category` を見て update 投入をスキップ）

### 4. キューハンドラの調整

`src/queue.ts`: `category` を見て `update` キュー投入の有無を判断する:

```ts
case 'fetch': {
  const contentIds = await service.fetch(message.body)
  const { provider, category } = message.body.message
  if (category !== 'expiring') {
    for (const contentId of contentIds) {
      await env.SYNC_QUEUE.send({ type: 'update', message: { provider, contentId } })
    }
  }
  break
}
```

### 5. スケジューラの変更

`src/scheduled.ts` で cron の時間に応じてカテゴリを振り分け:

```ts
export async function scheduled(event: ScheduledEvent, env: Env): Promise<void> {
  const providers = ['hulu', 'amazon'] as const
  const hour = new Date(event.scheduledTime).getUTCHours()

  for (const provider of providers) {
    // 毎時: 新着エピソード取得
    await env.SYNC_QUEUE.send({ type: 'fetch', message: { provider, category: 'new_episode' } })

    // 1日1回 (UTC 0時): 配信終了間近取得
    if (hour === 0) {
      await env.SYNC_QUEUE.send({ type: 'fetch', message: { provider, category: 'expiring' } })
    }
  }
}
```

### 6. デバッグエンドポイントの対応

`src/index.ts` の `/api/debug/sync` を `/api/queues` にリネーム。
キューハンドラと同じロジックで `category` に応じて update 実行を分岐する。

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `prisma/schema.prisma` | `expiringAt` → `expiredAt` リネーム |
| `prisma/migrations/` | RENAME COLUMN マイグレーション |
| `src/schemas/message.dto.ts` | `category` フィールド追加 |
| `src/schemas/anime.dto.ts` | `expiringAt` → `expiredAt` |
| `src/lib/providers/base.ts` | `FetchTitleListOptions` に `expiringOnly` 追加 |
| `src/lib/providers/amazon/index.ts` | `fetchTitleList` をカテゴリ別に分岐 |
| `src/lib/sync.ts` | `fetch()` をカテゴリ別に分岐、expiring ロジック分離、`expiringAt` → `expiredAt` |
| `src/routes/anime.ts` | フィルタ条件の `expiringAt` → `expiredAt` |
| `src/scheduled.ts` | cron 時間に応じてカテゴリ振り分け |
| `src/index.ts` | `/api/debug/sync` → `/api/queues` リネーム + category 分岐 |
| `src/app/components/anime-carousel.tsx` | BadgeType `expiringAt` → `expiredAt` |
| `src/app/routes/index.tsx` | データ取得・ソートの `expiringAt` → `expiredAt` |
| `src/app/lib/api.ts` | クエリパラメータの `expiringAt` → `expiredAt` |

## 注意事項

- Hulu は現時点で `expiring` カテゴリ未対応。`expiringOnly` 指定時は空配列を返す
- cron 式は既存の `0 */1 * * *` (毎時) のまま。時間判定はハンドラ内で行う
- 既存の `__tests__/amazon.fetch.test.ts` は `fetchTitleList()` (引数なし) をテストしているため影響なし
