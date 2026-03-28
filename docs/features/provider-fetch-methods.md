# プロバイダ別 タイトル取得方法まとめ

Amazon Prime Video と Hulu Japan で、新着タイトルと配信終了間近タイトルをどのように取得しているかの技術的な詳細。

---

## 1. Amazon Prime Video

### 共通アーキテクチャ

全モードで同じフローを使用する:

1. `https://www.amazon.co.jp/gp/video/` に GET → `Set-Cookie` ヘッダから Cookie を取得
2. `buildPaginationToken(options)` で protobuf エンコードした serviceToken を自前生成
3. `paginateCollection` API を順次呼び出し（startIndex をインクリメント）
4. `hasMoreItems: false` またはモード固有の打ち切り条件で停止

**paginateCollection API**

```
GET https://www.amazon.co.jp/gp/video/api/paginateCollection
  ?paginationTargetId=default
  &serviceToken={protobuf token}
  &startIndex={0, 16, 32, ...}
  &pageType=browse
  &pageId=default
  &collectionType=Container
  &decorationScheme=web-liveFDP-decoration-asins-v2
  &featureScheme=web-search-v4
  &widgetScheme=web-explore-v33
  &variant=desktopOSX
  &dynamicFeatures=integration,CLIENT_DECORATION_ENABLE_DAAPI,...
```

レスポンス: `{ entities: [...], hasMoreItems: boolean }`

**serviceToken の構造**

protobuf → Base64 → URL-safe 変換。内部に検索パラメータ文字列を埋め込む:

```
field 2 (string): "hpage"
field 3 (varint): 0
field 4 (string): "browse"
field 5 (string): "default"
field 6 (string): "center"
field 7 (string): "search"
field 15 (string): ""
field 16 (bytes): nested message {
  field 3 (string): searchParams  ← モード別パラメータ
  field 4 (string): ""
  field 6 (varint): 0
  field 7 (string): cursor JSON
  field 10 (varint): 20
  field 14 (varint): 0
}
```

---

### 1-A. 新着アニメ (`newAnime` モード)

**searchParams に埋め込むパラメータ:**

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `p_n_theme_browse-bin` | `4435524051` | テーマフィルタ (アニメ) |
| `sort` | `-prime_video_start_date` | 配信開始日の降順 |
| `field-ways_to_watch` | `3746330051` | SVOD (見放題) |
| `search-alias` | `instant-video` | 検索対象 |
| `bq` | 下記参照 | CloudSearch boolean query |
| `p_n_ways_to_watch` | `3746328051` | 視聴方法フィルタ |

**bq フィルタ:**

```
(and (and (and (and (and
  (or genre:'av_genre_anime' genre:'av_subgenre_anime*')
  (not genre:'kids'))
  (not entity_type:'Promotion|Trailer|Bonus Content'))
  (not entity_type:'Promotion|Trailer|Bonus Content'))
  (not entity_type:'Promotion|Trailer|Bonus Content'))
  (not entity_type:'Promotion|Trailer|Bonus Content'))
```

- アニメジャンル + サブジャンル (Movie も含む)
- キッズ除外
- プロモーション/トレーラー/ボーナスコンテンツ除外
- `is_movie_collection` と `p_n_entity_type` は **使用しない** (Movie や subscription 作品を含めるため)

**早期打ち切りロジック:**

新着系バッジ (`新エピソード` / `新着` / `新作`) が **2ページ連続で出現しない** 場合に取得を打ち切る。

```typescript
const NEW_BADGES = new Set(['新エピソード', '新着', '新作'])
// 各ページで titleMetadataBadge.message をチェック
// バッジなしページが2連続 → break
```

**取得後フィルタ:**

`hasNewContent: true` (= `titleMetadataBadge.message` が存在) のタイトルのみ返す。
バッジ種別: `セール` / `新エピソード` / `新着` / `新作` / `人気上昇中`

**パフォーマンス:** 約4ページ (160エンティティ) → フィルタ後 約50件、約2秒

---

### 1-B. 配信終了間近 (`expiring` モード)

**searchParams に埋め込むパラメータ:**

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `node` | `4217520051` | もうすぐ配信終了ノード |
| `is_movie_collection` | `0,0` | コレクション除外 |
| `p_n_ways_to_watch` | `3746330051` | SVOD |
| `search-alias` | `instant-video` | 検索対象 |
| `bq` | 下記参照 | CloudSearch boolean query |
| `bbn` | `4217520051` | ブラウズノード (ナビゲーション用) |
| `p_n_theme_browse-bin` | `4435524051` | テーマフィルタ (アニメ) |

**bq フィルタ:**

```
(and (not entity_type:'Promotion|Trailer|Bonus Content')
     (not entity_type:'Promotion|Trailer|Bonus Content'))
```

**serviceToken 生成の違い:**

- `field 2`: `"filter"` (newAnime/all は `"query"` を使用)
- `field 5` (`"default"`): 省略される

**打ち切り:** 早期打ち切りなし。全ページを順次取得。

**配信終了情報の取得:**

`highValueMessage.message` に終了までの残り時間が含まれる:
- `{サービス名}での配信はN日以内に終了`
- `シーズンNの{サービス名}での配信はN時間以内に終了`

`parseExpiringMessage()` でパースし、`expiring.remainingHours` と `expiring.season` を抽出。

**パフォーマンス:** 約50件、約1秒

---

### 1-C. 全タイトル (`all` モード)

**searchParams に埋め込むパラメータ:**

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `qs-country-code` | `JP` | 国 |
| `sort` | `pv-public-release-date-desc-rank` | リリース日降順 |
| `field-ways_to_watch` | `3746330051` | SVOD |
| `search-alias` | `instant-video` | 検索対象 |
| `bq` | `buildBqFilter(true)` | アニメ + kids除外 |
| `qs-offer_type` | `1` | SVOD |
| `p_n_entity_type` | `4174099051` | TV Show |
| `adult-product` | `0` | 成人向け除外 |
| `pv_browse_internal_offer` | `svod` | 内部オファータイプ |
| `pv_browse_internal_language` | `all` | 全言語 |

**打ち切り:** なし。全ページ取得。約900件。

---

## 2. Hulu Japan

### 共通アーキテクチャ

Hulu は 2 つの API を使用する:

1. **Palette API** — エディトリアルキュレーション (新着、シーズン別)
2. **Filtered API** — 条件指定によるフィルタリング (年代別、配信終了順)

どちらも認証不要、50件ずつのページネーション。

---

### 2-A. 新着アニメ (`newEpisodesOnly` モード)

**2つのソースを並列取得して統合:**

#### (1) 最近追加 — Palette API

```
GET https://www.hulu.jp/api/v2/palettes/recentlyadded-anime/vod/objects
  ?from=0&to=49
```

- スラッグ: `recentlyadded-anime` (固定)
- ページネーション: `from`/`to` で50件ずつ、`total_count` に達するまで再帰

#### (2) 今期アニメ — Palette API (シーズン別スラッグ)

```
GET https://www.hulu.jp/api/v2/palettes/{season-slug}/vod/objects
  ?from=0&to=49
```

| 時期 | スラッグパターン | 例 (2026年) |
|------|-----------------|-------------|
| 冬 (1-3月) | `january-march-quarter-anime{YY}` | `january-march-quarter-anime26` |
| 春 (4-6月) | `april-june-quarter-anime{YY}` | `april-june-quarter-anime26` |
| 夏 (7-9月) | `july-september-quarter-anime{YY}` | `july-september-quarter-anime26` |
| 秋 (10-12月) | `october-december-quarter-anime{YY}` | `october-december-quarter-anime26` |

- 四半期の最終月 (3月, 6月, 9月, 12月) は来期のスラッグも追加
- 例: 3月 → `january-march-quarter-anime26` + `april-june-quarter-anime26`

**統合処理:**

- (1) と (2) を `Promise.all` で並列取得
- `slug` ベースで重複排除
- `schema_key === 'series'` のみに絞り込み (エピソード単体は除外)

**レスポンス例:**

```jsonc
{
  "total_count": 120,
  "data": [
    {
      "id": 1117799,
      "title": "最推しの義兄を愛でるため、長生きします!",
      "slug": "ill-live-a-long-life-to-dote-on-my-favorite-stepbrother",
      "imageUrl": "https://images.prod.hjholdings.tv/.../image.png",
      "startAt": "2025/12/12 00:00:00",
      "endAt": "2027/03/31 23:59:59",
      "schema_key": "series",
      // ...
    }
  ]
}
```

---

### 2-B. 配信終了間近 — Filtered API (未実装、API 確認済み)

```
GET https://www.hulu.jp/api/v2/filtered
  ?id=mt:tv
  &id=gft:and
  &id=g:8
  &id=edg:tv_animation
  &sort=[{"publish_end_at":"asc"}]
  &service=hulu
  &from=0&to=49
```

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `id` | `mt:tv` | メディアタイプ: TV |
| `id` | `gft:and` | ジャンルフィルタモード: AND |
| `id` | `g:8` | ジャンル: アニメ |
| `id` | `edg:tv_animation` | カテゴリ: TVアニメ |
| `sort` | `[{"publish_end_at":"asc"}]` | 配信終了日の昇順 |
| `service` | `hulu` | サービス指定 |
| `from`/`to` | ページネーション | 50件ずつ |

**レスポンスの `endAt` フィールド** に配信終了日時が含まれる (例: `"2026/03/31 23:59:59"`)。

**打ち切り戦略 (実装予定):**

`endAt` が N日以上先になった時点で取得を打ち切る (Amazon の早期打ち切りと同様)。
`endAt` は月末 (3/31, 6/30 等) に集中する傾向がある。

---

### 2-C. 全タイトル — Filtered API (年代別)

```
GET https://www.hulu.jp/api/v2/filtered
  ?id=ag:{agKey}
  &id=gft:and
  &id=edg:tv_animation
  &sort=[{"values.weekly_uu":"desc"}]
  &service=mixed
  &from=0&to=49
```

| 年代 | agKey |
|------|-------|
| 2000年代 | `twenty_hundreds` |
| 2010年代 | `twenty_tens` |
| 2020年代 | `twenty_twenties` |

3つの年代を取得し、`slug` で重複排除。

---

## 比較表

| 項目 | Amazon Prime Video | Hulu Japan |
|------|-------------------|------------|
| **新着取得** | paginateCollection + newAnime token | Palette API (recentlyadded + seasonal slugs) |
| **新着ソート** | `-prime_video_start_date` (配信開始日降順) | エディトリアル順 (キュレーション) |
| **新着フィルタ** | バッジ (`hasNewContent`) でポストフィルタ | `schema_key === 'series'` |
| **新着の早期打ち切り** | 2ページ連続バッジなしで停止 | なし (パレット全件取得) |
| **配信終了取得** | paginateCollection + expiring token | Filtered API + `publish_end_at` 昇順ソート |
| **配信終了情報** | `highValueMessage.message` をパース → 残り時間 | `endAt` フィールド → 終了日時 |
| **認証** | Cookie 必要 (`/gp/video/` から取得) | 不要 |
| **ページサイズ** | 約16件/ページ | 50件/ページ |
| **トークン生成** | protobuf 自前エンコード | URL パラメータのみ |
