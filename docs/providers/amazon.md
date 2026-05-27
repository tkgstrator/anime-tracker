# Amazon Prime Video

## 概要

Amazon Prime Video のアニメタイトル・エピソード情報を取得するプロバイダの詳細仕様。

- 認証: Cookie 必要 (`/gp/video/` から取得)
- リージョン: JP Lambda 経由（日本 IP 必須）
- API: paginateCollection (ブラウズ) + getDetailWidgets (エピソード詳細)

## エンドポイント

| 用途 | URL | 形式 |
|---|---|---|
| アニメ一覧 | `https://www.amazon.co.jp/gp/video/browse/...?serviceToken=...` | HTML (JSON埋め込み) |
| ページネーション | `https://www.amazon.co.jp/gp/video/api/paginateCollection?...` | JSON |
| タイトル詳細 | `https://www.amazon.co.jp/gp/video/detail/{titleID}` | HTML (JSON埋め込み) |
| エピソード一覧 | `https://www.amazon.co.jp/gp/video/api/getDetailWidgets?titleID=...&widgets=...` | JSON |

## ブラウズ API

### serviceToken の構造

`v0_` プレフィックス + Base64url エンコードされた Protocol Buffers。

```
message ServiceToken {
  string type     = 2;  // "query" (初回) / "hpage" (ページング) / "filter" (expiring)
  uint32 flag     = 3;  // 1 (初回) / 0 (ページング)
  string page_id  = 4;  // "browse" (ページング時のみ)
  string variant  = 5;  // "default"
  string position = 6;  // "center"
  string widget   = 7;  // "search"
  string reserved = 15; // "" (空)
  bytes  nested   = 16; // ネストメッセージ (下記参照)
}

message Nested {
  string search_params = 3;  // URL クエリパラメータ (下記参照)
  string keyword       = 4;  // 検索キーワード (デフォルト: "")
  uint32 flag1         = 6;  // 0
  string cursor        = 7;  // ページネーションカーソル JSON (ページング時のみ)
  uint32 page_size     = 10; // 1ページあたりの件数 (デフォルト: 20)
  uint32 flag2         = 14; // 0
}
```

エンコードフロー:
```
検索パラメータ → protobuf エンコード → Uint8Array → btoa → URL-safe Base64 → "v0_" プレフィックス
```

ページネーションカーソル (nested.cursor):
```json
{"sbsin": 0, "cursize": 0, "presize": 0}
```

実装: `src/lib/providers/amazon/protobuf.ts`, `src/lib/providers/amazon/browse.ts`

### serviceToken の更新ルール

初回リクエスト時の serviceToken は `query` タイプ。レスポンスで返される serviceToken は `hpage` タイプに変わり `cursize`（総件数）情報を含む。

**serviceToken を更新せずに同じトークンを使い回すと、2 ページ目以降で空レスポンスが返る。**

### 取得フロー

1. `GET /gp/video/browse?serviceToken={initialToken}` (Cookie 不要)
   - HTML から `paginationTargetId` を正規表現で抽出
   - HTML 内の `paginationServiceToken` を抽出（ページネーション用の新トークン）
   - `Set-Cookie` ヘッダーから `session-id` 等を取得し以降のリクエストに使用
2. `paginateCollection` を繰り返し呼ぶ — `startIndex` を `pageSize`（デフォルト 20）ずつ増加
   - **重要**: レスポンスの `pagination.queryParameters.serviceToken` を次のリクエストに使う（毎回変わる）
   - `hasMoreItems` が false または新規アイテムが 0 件になったら終了

### paginateCollection API

```
GET https://www.amazon.co.jp/gp/video/api/paginateCollection
```

JSON レスポンスを得るには以下のリクエストヘッダーが必須:

| ヘッダー | 値 |
|---|---|
| `Accept` | `application/json` |
| `X-Requested-With` | `XMLHttpRequest` |
| `Cookie` | 初回ブラウズページの `Set-Cookie` から取得 |

主要クエリパラメータ:

| パラメータ | 値 |
|---|---|
| `paginationTargetId` | ブラウズページ HTML から抽出（コレクション識別子、不変） |
| `serviceToken` | 毎回更新（レスポンスの `pagination.queryParameters.serviceToken` を使用） |
| `startIndex` | `0`, `20`, `40`... |
| `pageType` | `browse` |
| `pageId` | `default` |
| `collectionType` | `Container` |
| `decorationScheme` | `web-liveFDP-decoration-asins-v2` |
| `featureScheme` | `web-search-v4` |
| `widgetScheme` | `web-explore-v33` |
| `variant` | `desktopOSX` |
| `dynamicFeatures` | `integration`, `CLIENT_DECORATION_ENABLE_DAAPI`, `CleanSlate`, ... |

レスポンス:
```json
{
  "entities": [...],
  "hasMoreItems": true,
  "pagination": {
    "queryParameters": {
      "serviceToken": "v0_..."
    }
  }
}
```

各 entity の主要フィールド:

| フィールド | 型 | 説明 |
|---|---|---|
| `titleID` | string | ASIN形式の作品ID |
| `displayTitle` | string | 作品名 |
| `entityType` | string | `"TV Show"` / `"Movie"` |
| `entitlementCues.entitlementType` | string | `"Entitled"` (プライム会員特典) |
| `maturityRatingBadge.displayText` | string | 年齢制限 (`"16+"` 等) |
| `images.cover.url` | string | カバー画像URL |

## 検索パラメータ

全モード共通:

| パラメータ | 値 |
|---|---|
| `search-alias` | `instant-video` |
| `qs-country-code` | `JP` |
| `adult-product` | `0` |
| `pv_browse_internal_language` | `all` |
| `bq` (ジャンル) | `(or genre:'av_genre_anime' genre:'av_subgenre_anime*' genre:'av_genre_animation_adult_interest')` |

オファータイプ別パラメータ:

| パラメータ | SVOD | TVOD | Subscription |
|---|---|---|---|
| `qs-offer_type` | `1` | `2` | `3` |
| `field-ways_to_watch` | `3746330051` | `3746332051` | `2` |
| `pv_browse_internal_offer` | `svod` | `tvod` | `subscription` |

## 取得モード

### 新着アニメ (`newAnime`)

| パラメータ | 値 |
|---|---|
| `sort` | `-prime_video_start_date` |
| `p_n_theme_browse-bin` | `4435524051` |
| `field-ways_to_watch` | `3746330051` |

bq フィルタ:
```
(and (or genre:'av_genre_anime' genre:'av_subgenre_anime*')
     (not genre:'kids')
     (not entity_type:'Promotion|Trailer|Bonus Content'))
```

- **早期打ち切り**: `新エピソード` / `新着` / `新作` バッジが 2 ページ連続で出現しない場合に停止
- **取得後フィルタ**: `titleMetadataBadge.message` が存在するタイトルのみ返す
- **パフォーマンス**: 約 4 ページ (160 エンティティ) → フィルタ後 約 50 件、約 2 秒

### 配信終了間近 (`expiring`)

| パラメータ | 値 |
|---|---|
| `node` | `4217520051` |
| `is_movie_collection` | `0,0` |
| `p_n_ways_to_watch` | `3746330051` |
| `bbn` | `4217520051` |
| `p_n_theme_browse-bin` | `4435524051` |
| serviceToken `type` (field 2) | `"filter"` ← 他モードと異なる |

配信終了情報: `highValueMessage.message` の残り時間テキストを `parseExpiringMessage()` でパース → `expiring.remainingHours` と `expiring.season` を抽出。

**パフォーマンス:** 約 50 件、約 1 秒

### 全タイトル (`all`)

| パラメータ | 値 |
|---|---|
| `sort` | `pv-public-release-date-desc-rank` |
| `qs-offer_type` | `1` |
| `p_n_entity_type` | `4174099051` |

### カタログ全件取得（64 パス）

`buildServiceToken` の `BuildOptions`:

```typescript
interface BuildOptions {
  sort?: boolean        // デフォルト: true（新着順ソート）
  offer?: OfferType     // デフォルト: 'svod'
  excludeKids?: boolean // デフォルト: true
}
type OfferType = 'svod' | 'tvod' | 'subscription'
```

オファー × ソート × benefit の 64 パスを実行し、`titleID` で重複削除してマージ。約 7,500 件。

| # | ラベル | offer | sort | genreBin |
|---|---|---|---|---|
| 1 | svod sort あり | svod | true | false |
| 2 | svod sort なし | svod | false | false |
| 3 | svod genre-bin sort あり | svod | true | true |
| 4 | svod genre-bin sort なし | svod | false | true |
| 5 | tvod | tvod | false | false |
| 6 | tvod genre-bin | tvod | false | true |
| 7 | subscription | subscription | false | false |
| 8 | subscription genre-bin | subscription | false | true |
| 9 | danime | benefit | - | - |
| 10 | animetimesjp | benefit | - | - |

チャンネル別サブスクリプション (benefit):

| チャンネル | `subscriptionId` / `benefit` | 備考 |
|---|---|---|
| dアニメストア | `danime` | `field-subscription_id` + `pv_browse_internal_benefit` を追加 |
| アニメタイムズ | `animetimesjp` | node `2351649051` |

`--offer all` で全 10 パスを実行:
```sh
bun scripts/fetch/amazon/browse.ts --offer all
bun scripts/fetch/amazon/browse.ts --benefit danime
```

## タイトル詳細 → TitleDetail マッピング

### タイトル詳細ページ（HTML）

| 元フィールド | マッピング先 | 変換 |
|---|---|---|
| `<title>` タグ | **title** | `Amazon.co.jp:` プレフィックス等を除去 |
| `"entityType":"..."` | **entityType** | |
| `"displayText":"..."` | **maturityRating** | "13才以上" → 13 |
| `"seasonId"`, `"displayName"`, `"sequenceNumber"` | **seasons** | |
| `"episodePages":[...]` | ページネーション用 | DB保存なし |

### getDetailWidgets API（JSON）→ Episode

| 元フィールド | マッピング先 | 変換 |
|---|---|---|
| `detail.episodeNumber` | **episodeNumber** | 0 またはなしはスキップ |
| `titleID` | **episodeId** | |
| `detail.title` | **title** | |
| `detail.synopsis` | **description** | HTMLアンエスケープ (`&#34;` → `"`) |
| `detail.releaseDate` | **releaseDate** | "2024年1月1日" → ISO 8601 (JST → UTC) |
| `detail.duration` | **duration** | 秒 |
| `metadata.maturityRating.displayText` | **maturityRating** | `parseMaturityRating()` |
| `detail.images.covershot / titleshot` | **imageUrl** | covershot 優先 |
| `detail.subtitles[]` | **hasSubtitles** | 配列長 > 0 |
| `detail.audioTracks[]` | **hasDub** | 2 つ以上の音声トラックで true |

映画の場合: `headerDetail.duration` から取得（ウィジェット API はエピソードを返さないため）。

## エンティティフィールド

### titleMetadataBadge.message — タイトルカード左上のバッジ

| 値 | 意味 |
|---|---|
| `セール` | 期間限定セール |
| `新エピソード` | 新着エピソードあり |
| `新着` | 新規配信 |
| `新作` | 新作タイトル |
| `人気上昇中` | トレンド |

API パラメータでのフィルタは不可。取得後にクライアント側でフィルタリングする。

### highValueMessage.message — タイトルカードの補足情報

| パターン | 用途 |
|---|---|
| `{サービス名}での配信はN日以内に終了` | 配信終了間近 |
| `シーズンNの{サービス名}での配信はN時間以内に終了` | シーズン単位の終了 |
| `#N 日本` | 総合ランキング |
| `新しいエピソード{曜日}` | 新着通知 |

サービス名: `Prime` / `アニメタイムズ` / `dアニメストア for Prime Video` / `FODチャンネル for Prime Video`

## 実装

- スキーマ: `src/schemas/providers/amazon.dto.ts`
- プロバイダ: `src/lib/providers/amazon/` (`index.ts` + `browse.ts` + `channel.ts` + `detail.ts` + `protobuf.ts`)
- 公開関数: `fetchAmazonTitleDetail(titleID)`, `buildAmazonBrowseUrl(params?)`
- ブラウズスクリプト: `bun scripts/fetch/amazon/browse.ts`
