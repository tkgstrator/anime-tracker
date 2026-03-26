# 配信終了間近タイトルの取得・表示

## 概要

Prime Video の「もうすぐ配信終了」ブラウズページから、配信終了間近のタイトル情報を取得し、
DB に保存・フロントエンドで表示する機能。

## データソース

Prime Video ブラウズページの `entitlementCues.highValueMessage.message` に含まれる文字列:

```
シーズン1のPrimeでの配信は6日以内に終了
Primeでの配信は34時間以内に終了
```

`parseExpiringMessage()` で `{ season, remainingHours }` にパースし、
`now + remainingHours` から推定終了日時を算出する。

## 完了済み

- [x] `parseExpiringMessage()` の実装 (`src/lib/providers/amazon/expiring.ts`)
- [x] テスト (`__tests__/amazon-expiring.test.ts`)
- [x] `TitleSchema` に `expiring` フィールド追加 (`common.dto.ts`)

## 実装手順

### 1. DB スキーマ変更

`prisma/schema.prisma` の `Anime` モデルにカラム追加:

```prisma
expiringAt     DateTime? @map("expiring_at")     // 配信終了推定日時 (UTC)
expiringSeason Int?      @map("expiring_season")  // 対象シーズン番号 (null=作品全体)
```

マイグレーション実行:

```sh
bunx prisma migrate diff --from-local-d1 --to-schema-datamodel prisma/schema.prisma --script --output prisma/migrations/XXXX_add_expiring/migration.sql
bunx wrangler d1 migrations apply anime-tracker --local
bunx prisma generate
```

### 2. Amazon ブラウズ URL 生成

`src/lib/providers/amazon/browse.ts` に「もうすぐ配信終了」用の `BuildOptions` を追加。

共有された URL の serviceToken をデコードすると:

```
node=4217520051
is_movie_collection=0,0
p_n_ways_to_watch=3746330051
p_n_theme_browse-bin=4435524051  ← 「もうすぐ配信終了」フィルタ
```

`buildAmazonBrowseUrl({}, { expiring: true })` のようなオプションで生成できるようにする。

### 3. BrowseEntitySchema の拡張

`src/schemas/providers/amazon.dto.ts` の `BrowseEntitySchema` で `highValueMessage` もパースし、
`parseExpiringMessage()` の結果を `Title.expiring` にマッピングする。

```ts
entitlementCues: z.object({
  titleMetadataBadge: z.object({ message: z.string().nonempty().optional() }),
  highValueMessage: z.object({ message: z.string().optional() }).optional()
})
```

transform 内で:

```ts
const hvm = v.entitlementCues.highValueMessage?.message
const expiring = hvm ? parseExpiringMessage(hvm) : undefined
```

### 4. AmazonProvider の `fetchTitleList` を拡張

`src/lib/providers/amazon/index.ts` の `fetchTitleList` 内で、
既存の新着一覧に加えて配信終了間近一覧も取得し、マージして返す。

```ts
async fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]> {
  // 1. 既存: 新着タイトル一覧を取得
  const newTitles = await this.fetchBrowse(buildAmazonBrowseUrl({}, { newAnime: true }))

  // 2. 追加: 配信終了間近一覧を取得
  const expiringTitles = await this.fetchBrowse(buildAmazonBrowseUrl({}, { expiring: true }))

  // 3. contentId で重複排除してマージ (新着側を優先、expiring 情報は保持)
  return mergeTitles(newTitles, expiringTitles)
}
```

新しい専用メソッドや別メッセージタイプは不要。
既存の `fetch` → `update` フローにそのまま乗る。

### 5. SyncService に配信終了同期ロジック追加

`src/lib/sync.ts` の `fetch()` 内で、`Title.expiring` を DB に書き込む:

1. 新規タイトル: `anime.create()` 時に `expiringAt` / `expiringSeason` をセット
2. 既存タイトル: `expiring` がある場合は `expiringAt` / `expiringSeason` を UPDATE
3. 配信終了一覧から消えたタイトルの `expiringAt` をリセット (`nextEpisodeDate` のリセットと同様のパターン)

`remainingHours` → `expiringAt` の変換:

```ts
const expiringAt = dayjs().add(expiring.remainingHours, 'hour').toDate()
```

### 6. API エンドポイント追加

`src/routes/anime.ts` に配信終了間近タイトルのフィルタを追加:

```ts
// ?expiring=true → expiringAt が NOT NULL のタイトルを返す
```

### 7. フロントエンド表示

トップページに「もうすぐ配信終了」セクションを追加:

- `AnimeCarousel` を流用し、`badgeType='expiringAt'` で残り日数を表示
- バッジ表示例: 「残り3日」「残り12時間」「明日終了」

## 注意事項

- `remainingHours` はブラウズページ取得時点の相対値なので、
  DB には絶対日時 (`expiringAt`) に変換して保存する
- 時間単位（残り34時間等）と日単位（残り6日等）が混在するが、
  `parseExpiringMessage` が全て `remainingHours` に統一済み
- 配信終了カテゴリに出てくるのは Amazon (Prime) のみ。
  Hulu は将来的に対応する可能性あり
