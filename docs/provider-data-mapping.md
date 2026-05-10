# プロバイダ API データマッピング

各動画配信プロバイダから取得可能なデータと、DB 保存時に利用するフィールドの対応表。
いずれも認証不要（非ログイン状態）で取得可能。

---

## 共通スキーマ: TitleDetail

全プロバイダが最終的に返す統一スキーマ（`src/schemas/providers/common.dto.ts`）。

| フィールド | 型 | 説明 |
|---|---|---|
| **TitleDetail** | | |
| title | string | 作品タイトル |
| entityType | string | "TV Show" / "Movie" |
| maturityRating | number \| null | レーティング年齢 |
| imageUrl | string \| null | 作品画像 URL（最初のシーズンの最初のエピソードから導出） |
| seasons | Season[] | シーズン一覧 |
| **Season** | | |
| seasonId | string | プロバイダ固有のシーズンID |
| displayName | string | 表示名（例: "シーズン1"） |
| sequenceNumber | number | シーズン順序 |
| imageUrl | string \| null | シーズン画像 URL（最初のエピソードから導出） |
| episodes | Episode[] | エピソード一覧 |
| **Episode** | | |
| episodeNumber | number | 話数 |
| episodeId | string | プロバイダ固有のエピソードID |
| title | string | エピソードタイトル |
| description | string | あらすじ |
| releaseDate | string | 配信日（ISO 8601） |
| duration | number | 再生時間（秒） |
| maturityRating | number \| null | レーティング年齢 |
| imageUrl | string | カバー画像 URL |
| hasSubtitles | boolean | 字幕の有無 |
| hasDub | boolean | 吹替の有無 |

---

## Amazon Prime Video

### エンドポイント

| 用途 | URL | 形式 |
|---|---|---|
| アニメ一覧 | `https://www.amazon.co.jp/gp/video/browse/ref=atv_dp_pd_gen?serviceToken=...` | HTML (JSON埋め込み) |
| アニメ一覧ページネーション | `https://www.amazon.co.jp/gp/video/api/paginateCollection?...` | JSON |
| タイトル詳細 | `https://www.amazon.co.jp/gp/video/detail/{titleID}` | HTML (JSON埋め込み) |
| エピソード一覧 | `https://www.amazon.co.jp/gp/video/api/getDetailWidgets?titleID=...&widgets=...` | JSON |

### アニメ一覧取得

serviceToken は protobuf エンコードされたクエリパラメータ。`buildServiceToken(query, options?)` で生成可能。

#### serviceToken の構造 (protobuf)

`v0_` プレフィックス + base64url エンコードされた Protocol Buffers。

```
field  2 (string): "query"
field  3 (varint): 1
field  5 (string): "default"
field  6 (string): "center"
field  7 (string): "search"
field 15 (string): ""
field 16 (bytes) : nested {
  field  3 (string): URL query params — 検索パラメータ（下記参照）
  field  4 (string): keyword          — ""（デフォルト空文字）
  field  6 (varint): 0
  field 10 (varint): 0
  field 14 (varint): 0
}
```

#### BuildOptions

`buildServiceToken(query, options?)` の `options` で検索条件を制御する。

```typescript
interface BuildOptions {
  sort?: boolean          // デフォルト: true（新着順ソート）
  offer?: OfferType       // デフォルト: 'svod'
  excludeKids?: boolean   // デフォルト: true（全オファータイプで kids 除外）
}
type OfferType = 'svod' | 'tvod' | 'subscription'
```

#### オファータイプ別パラメータ

3種類のオファータイプで異なるアニメカタログを取得できる。結果セットはほぼ重複しない。

| パラメータ | SVOD (`svod`) | TVOD (`tvod`) | Subscription (`subscription`) |
|---|---|---|---|
| `qs-offer_type` | `1` | `2` | `3` |
| `field-ways_to_watch` | `3746330051` | `3746332051` | `2` |
| `pv_browse_internal_offer` | `svod` | `tvod` | `subscription` |
| `bq` kids 除外 | あり | あり | あり |

`field-genre-bin` と `sort` の有無で結果セットが変わるため、各オファータイプで複数パスの取得が必要:

| # | label | offer | sort | genreBin | 備考 |
|---|---|---|---|---|---|
| 1 | svod sort あり | svod | true | false | |
| 2 | svod sort なし | svod | false | false | sort で結果セットが変わる |
| 3 | svod genre-bin sort あり | svod | true | true | genre-bin で結果セットが変わる |
| 4 | svod genre-bin sort なし | svod | false | true | |
| 5 | tvod | tvod | false | false | |
| 6 | tvod genre-bin | tvod | false | true | genre-bin で結果セットが変わる |
| 7 | subscription | subscription | false | false | |
| 8 | subscription genre-bin | subscription | false | true | genre-bin で結果セットが変わる |
| 9 | danime | benefit | - | - | bq は除外のみ |
| 10 | animetimesjp | benefit | - | - | bq は除外のみ |

`--offer all` で全10パスを実行し、titleID で重複削除してマージする。

#### 使用例

```typescript
import { buildServiceToken } from '../src/lib/providers/amazon'
import { BrowseQuerySchema } from '../src/schemas/providers/amazon.dto'

const query = BrowseQuerySchema.parse({})

// SVOD（デフォルト） — sort あり
const svodSorted = `v0_${buildServiceToken(query)}`

// SVOD — sort なし（2パス目）
const svodUnsorted = `v0_${buildServiceToken(query, { sort: false })}`

// TVOD
const tvod = `v0_${buildServiceToken(query, { offer: 'tvod', sort: false })}`

// Subscription（全チャンネル）
const sub = `v0_${buildServiceToken(query, { offer: 'subscription', sort: false })}`

// dアニメストア限定
const danime = `v0_${buildServiceToken(query, {
  offer: 'subscription', sort: false,
  subscriptionId: 'danime', benefit: 'danime',
})}`
```

#### チャンネル別サブスクリプション (benefit)

`subscription` オファータイプはさらにチャンネル単位で絞り込める。
`subscriptionId` と `benefit` を指定すると `field-subscription_id` と `pv_browse_internal_benefit` が追加され、
`field-genre-bin` と `p_n_entity_type` は除外される。

| パラメータ | Subscription (全体) | dアニメストア |
|---|---|---|
| `field-subscription_id` | _(なし)_ | `danime` |
| `pv_browse_internal_benefit` | _(なし)_ | `danime` |
| `field-genre-bin` | `av_genre_anime` | _(なし)_ |
| `p_n_entity_type` | `4174099051` | _(なし)_ |
| `bq` | アニメジャンルフィルタ | 除外のみ（`(not entity_type:'Promotion\|Trailer\|Bonus Content')`） |

dアニメストアのブラウズページではジャンル別（SF/ファンタジー等）や OVA/劇場版カテゴリが `hidden-keywords` や `bq` で絞り込まれているが、
全件取得では `hidden-keywords` なし・`bq` は除外のみで1パス取得できる。

既知のチャンネル:

| benefit | チャンネル名 | node |
|---|---|---|
| `danime` | dアニメストア | _(なし)_ |
| `animetimesjp` | アニメタイムズ | `2351649051` |

スクリプト使用例:
```sh
bun scripts/fetch/amazon/browse.ts --benefit danime
bun scripts/fetch/amazon/browse.ts --benefit animetimesjp
```

#### 共通の検索パラメータ

全オファータイプで共通のパラメータ:

| パラメータ | 値 | 説明 |
|---|---|---|
| `qs-country-code` | `JP` | 日本向け |
| `p_n_entity_type` | `4174099051` | エンティティタイプフィルタ |
| `adult-product` | `0` | アダルト除外 |
| `search-alias` | `instant-video` | 検索対象サービス |
| `bq` (ジャンル部) | `(or genre:'av_genre_anime' genre:'av_subgenre_anime*' genre:'av_genre_animation_adult_interest')` | アニメジャンルフィルタ |
| `pv_browse_internal_language` | `all` | 全言語 |

#### paginateCollection API

ブラウズページ（HTML）は初回20件のみ含む。全件取得には `paginateCollection` API をページングする。

##### 取得フロー

1. **ブラウズページにアクセス** — `GET /gp/video/browse?serviceToken={initialToken}`（Cookie 不要）
   - HTML から `paginationTargetId` を正規表現で抽出
   - HTML 内の `paginationServiceToken` を抽出（ページネーション用の新しいトークン）
   - `Set-Cookie` ヘッダーから `session-id` 等を取得し、以降のリクエストに使用
2. **paginateCollection を繰り返し呼ぶ** — `startIndex` を `pageSize` (デフォルト20) ずつ増加
   - **重要**: レスポンスの `pagination.queryParameters.serviceToken` を次のリクエストに使う（毎回変わる）
   - `titleID` で重複排除
   - `hasMoreItems` が false または新規アイテムが 0 件になったら終了

##### リクエストヘッダー

JSON レスポンスを得るには以下のヘッダーが必須:

| ヘッダー | 値 | 備考 |
|---|---|---|
| `Accept` | `application/json` | これがないと HTML が返る |
| `X-Requested-With` | `XMLHttpRequest` | AJAX リクエストとして識別 |
| `Cookie` | 初回ブラウズページの `Set-Cookie` から取得 | `session-id` 等 |

##### リクエストパラメータ

| パラメータ | 値 | 説明 |
|---|---|---|
| `jic` | `8\|EgRzdm9k` | 固定値 |
| `pageType` | `browse` | 固定値 |
| `pageId` | `default` | 固定値 |
| `collectionType` | `Container` | 固定値 |
| `paginationTargetId` | ブラウズページHTMLから抽出 | コレクション識別子（不変） |
| `serviceToken` | **毎回更新** | 初回はHTMLの `paginationServiceToken` から、以降はレスポンスから取得 |
| `startIndex` | `0`, `20`, `40`... | ページオフセット |
| `actionScheme` | `default` | 固定値 |
| `payloadScheme` | `default` | 固定値 |
| `decorationScheme` | `web-liveFDP-decoration-asins-v2` | 固定値 |
| `featureScheme` | `web-search-v4` | 固定値 |
| `dynamicFeatures` | 複数値（下記参照） | 機能フラグ群 |
| `widgetScheme` | `web-explore-v33` | 固定値 |
| `variant` | `desktopOSX` | 固定値 |
| `journeyIngressContext` | (空) | 固定値 |

dynamicFeatures: `integration`, `CLIENT_DECORATION_ENABLE_DAAPI`, `ENABLE_DRAPER_CONTENT`, `HorizontalPagination`, `CleanSlate`, `EpgContainerPagination`, `ENABLE_GPCI`, `SupportsImageTextLinkTextInStandardHero`, `Remaster`, `SupportsChannelWidget`, `PromotionalBannerSupported`, `RemoveFromContinueWatching`, `SearchChannelBundles`, `SupportChannelItemDecoration`, `TvodMovieBundles`

##### レスポンス構造

```
{
  "__type": "atv.wps#PaginateCollectionOutput",
  "entities": [ ... ],           // アイテム配列
  "hasMoreItems": true/false,    // まだページがあるか
  "pagination": {
    "queryParameters": {
      "serviceToken": "v0_..."   // 次リクエスト用トークン（重要）
    }
  }
}
```

各 entity の主要フィールド:

| フィールド | 型 | 説明 |
|---|---|---|
| `titleID` | string | ASIN形式の作品ID (例: `B0DRSVYW35`) |
| `displayTitle` | string | 作品名 |
| `entityType` | string | `"TV Show"` / `"Movie"` |
| `entitlementCues.entitlementType` | string | `"Entitled"` (プライム会員特典) / `"Unentitled"` |
| `entitlementCues.focusMessage.message` | string | 視聴権の説明テキスト |
| `customerReviews.value` | number | 星評価 |
| `customerReviews.count` | number | レビュー数 |
| `maturityRatingBadge.displayText` | string | 年齢制限 (`"16+"` 等) |
| `images.cover.url` | string | カバー画像URL |
| `link.url` | string | 詳細ページへの相対URL |

##### serviceToken の更新ルール

初回リクエスト時の serviceToken（HTMLから取得）は `query` タイプ。
レスポンスで返される serviceToken は `hpage` タイプに変わり、`cursize`（総件数）情報を含む。

```
初回（HTMLから）: field 2 = "query", field 3 = 1
以降（APIから）: field 2 = "hpage", field 3 = 0, field 8 に cursize JSON
```

**serviceToken を更新せずに同じトークンを使い回すと、2ページ目以降で空レスポンスが返る。**

##### 実装

- スクリプト: `scripts/fetch/amazon/browse.ts`
- 使い方: `bun scripts/fetch/amazon/browse.ts --token 'v0_...' [--cookie '...'] [--out <file>] [--page-size <n>] [--delay <ms>]`

### タイトル詳細 → TitleDetail マッピング

#### タイトル詳細ページ（HTML）

| 元フィールド | 取得方法 | マッピング先 | 備考 |
|---|---|---|---|
| `<title>` タグ | 正規表現で抽出 | **title** | `Amazon.co.jp:` プレフィックス等を除去 |
| `"entityType":"..."` | 正規表現で抽出 | **entityType** | |
| `"displayText":"..."` | 正規表現で抽出 | **maturityRating** | "13才以上" → 13 |
| `"seasonId"`, `"displayName"`, `"sequenceNumber"` | 正規表現で抽出 | **seasons** | |
| `"episodePages":[...]` | JSONパース | ページネーション用 | DB保存なし |

#### getDetailWidgets API（JSON）→ Episode

| 元フィールド | 変換 | マッピング先 | 備考 |
|---|---|---|---|
| detail.episodeNumber | そのまま | **episodeNumber** | 0 または未定義ならスキップ |
| titleID | そのまま | **episodeId** | エピソード単位のID |
| detail.title | そのまま | **title** | |
| detail.synopsis | HTMLアンエスケープ | **description** | `&#34;` → `"` 等 |
| detail.releaseDate | `parseJapaneseDate()` | **releaseDate** | "2024年1月1日" → ISO 8601 |
| detail.duration | そのまま（秒） | **duration** | |
| metadata.maturityRating.displayText | `parseMaturityRating()` | **maturityRating** | エピソード単位優先、フォールバックあり |
| detail.images.covershot / titleshot | 優先順位で選択 | **imageUrl** | covershot 優先 |
| detail.subtitles[] | 配列長 > 0 | **hasSubtitles** | |
| detail.audioTracks[] | 配列長 > 1 | **hasDub** | 2つ以上の音声トラックで true |

#### 取得可能だが未使用のフィールド

| フィールド | 理由 |
|---|---|
| isPrime | 利用可否のフラグで録画管理に不要 |
| episodeCount | DB上はエピソード数から導出可能 |
| comingSoon | 一時的なステータス |
| contributors (cast/crew) | 現状不要 |
| catalogId | 内部ID、使用用途なし |

### 実装

- スキーマ: `src/schemas/providers/amazon.dto.ts`
- プロバイダ: `src/lib/providers/amazon/` (`index.ts` + `browse.ts` + `channel.ts` + `detail.ts` + `protobuf.ts`)
- 公開関数: `fetchAmazonTitleDetail(titleID)`, `buildAmazonBrowseUrl(params?)`

---

## Hulu

### エンドポイント

| 用途 | URL | 形式 |
|---|---|---|
| シーズン一覧 | `https://www.hulu.jp/api/v2/palettes/{slug}/vod/objects?from={n}&to={n}` | JSON |
| エピソード詳細 | `https://www.hulu.jp/{slug}/assets?ht=episode` | HTML (RSCペイロード) |

### シーズン一覧取得

slug の命名規則: `{season-prefix}{年の下2桁}`

| シーズン | prefix |
|---|---|
| 冬 (1〜3月) | `january-march-quarter-anime` |
| 春 (4〜6月) | `april-june-quarter-anime` |
| 夏 (7〜9月) | `july-september-quarter-anime` |
| 秋 (10〜12月) | `october-december-quarter-anime` |

例: 2026年冬 → `january-march-quarter-anime26`

パラメータ: `from` (開始インデックス), `to` (終了インデックス、inclusive)。1回50件でページング。

### タイトル詳細 → TitleDetail マッピング

#### Palette API（一覧）から取得するデータ

| 元フィールド | 利用 | 備考 |
|---|---|---|
| slug | **contentId** として使用 | エピソード詳細ページのURLに利用 |
| title | 一覧表示参考 | 詳細ページでは別途タイトル推定 |
| additionalInfo.card_info.episode_count | 参考値のみ | DB保存なし |
| additionalInfo.card_info.season_count | 参考値のみ | DB保存なし |
| additionalInfo.card_info.premiere_year | 参考値のみ | DB保存なし |

#### エピソード詳細ページ（RSCペイロード）→ Episode

RSCペイロードは `self.__next_f.push([1,"..."])` パターンから JSON を再構築して抽出。

| 元フィールド | 変換 | マッピング先 | 備考 |
|---|---|---|---|
| additionalInfo.card_info.episode_number_title | `parseEpisodeNumber()` | **episodeNumber** | "第1話" → 1、0ならスキップ |
| id_in_schema | `String()` | **episodeId** | 数値→文字列変換 |
| additionalInfo.short_name / title | 優先順位で選択 | **title** | short_name 優先 |
| description | そのまま | **description** | |
| startAt | そのまま | **releaseDate** | 元々ISO 8601形式 |
| additionalInfo.episode_runtime | `Math.round()` | **duration** | ミリ秒→秒に丸め |
| imageUrl | そのまま | **imageUrl** | |
| additionalInfo.card_info.has_ja_caption | そのまま | **hasSubtitles** | 未定義なら false |
| _(なし)_ | 固定値 `false` | **hasDub** | Hulu APIに吹替情報なし |
| _(なし)_ | 固定値 `null` | **maturityRating** | Hulu APIにレーティング情報なし |

**シーズンの構築**:
- `card_info.season_number_title` でグループ化（未定義なら "シーズン1"）
- seasonId は `hulu-{slug}-s{N}` で自動構築
- タイトルは最初のエピソードから推定（シーズン/話数表記を除去）

#### 取得可能だが未使用のフィールド

| フィールド | 理由 |
|---|---|
| endAt | 配信終了日、録画管理に不要 |
| rental | 課金形態、不要 |
| isLogin | ログイン要否、不要 |
| features[] | 機能タグ、不要 |
| has_closed_caption / has_en_caption | 日本語字幕のみ追跡 |
| copyright | 著作権表示、不要 |
| series_id | 親シリーズ参照、不要 |

### 実装

- スキーマ: `src/schemas/providers/hulu.dto.ts`
- プロバイダ: `src/lib/providers/hulu/` (`index.ts` + `browse.ts` + `detail.ts`)
- 公開関数: `fetchHuluTitleDetail(slug)`, `fetchHuluAnime(season, year)`

---

## 同期パイプライン (`src/lib/sync.ts`)

### 概要

`src/scheduled.ts` の cron ジョブ（6時間ごと）から呼び出される同期パイプライン。
以下の3段階で構成される:

1. **新着チェック** (`checkNewEpisodes`) — プロバイダから新着タイトルを取得し、DB追加/更新
2. **TMDB同期** (`syncEpisodesFromTmdb`) — TMDBからエピソード情報を補完
3. **AniList識別** (`identifyTitles` in scheduled.ts) — 未識別タイトルのメタデータ取得

### 関数一覧

| 関数 | 役割 | 呼び出し元 |
|---|---|---|
| `checkNewEpisodes` | プロバイダの新着チェック→識別→DB追加/更新 | scheduled.ts |
| `syncTitle` | TitleDetail を DB に upsert | checkNewEpisodes, API routes |
| `syncEpisodesFromTmdb` | TMDB からエピソード情報を取得・補完 | scheduled.ts |
| `syncEpisodeIds` | プロバイダの episodeId を DB に反映 | API routes |
| `fetchDetail` | プロバイダからタイトル詳細を取得 | syncEpisodeIds |
| `getProvider` | プロバイダ名からインスタンスを取得 | 各関数 |

---

### `checkNewEpisodes` — 新着エピソードチェック

プロバイダの「最近追加されたタイトル」一覧から、新規タイトルの追加と既存タイトルのエピソード更新を行う。

#### フロー

```
fetchTitleList({ newEpisodesOnly: true })
  │
  ├─ 各タイトルについて:
  │   │
  │   ├─ DB に contentId が存在する？
  │   │   │
  │   │   ├─ YES → fetchEpisodeList → syncTitle (エピソード upsert のみ)
  │   │   │        → updated++
  │   │   │
  │   │   └─ NO → TMDB + AniList を並列検索
  │   │           │
  │   │           ├─ どちらかヒット → fetchEpisodeList → syncTitle
  │   │           │   → 識別結果 (tmdbId, aniListId, status, year, quarter) を反映
  │   │           │   → added++
  │   │           │
  │   │           └─ 両方ミス → skipped++
  │   │
  │   └─ エラー発生 → skipped++ (他タイトルの処理は継続)
  │
  └─ return { added, updated, skipped }
```

#### 新規タイトル追加時の識別

TMDB と AniList を **並列** (`Promise.all`) で検索する。

| 検索先 | 取得する情報 | 用途 |
|---|---|---|
| TMDB | `tmdbId` | 以降の `syncEpisodesFromTmdb` で使用 |
| AniList | `aniListId`, `nativeTitle`, `status`, `year`, `quarter` | タイトル正規化・放送状態・クール判定 |

どちらか一方でもヒットすれば追加対象とする。両方ミスの場合のみスキップ。

#### upsert の挙動

`syncTitle` 内部の upsert で、以下のフィールドが更新対象:

| テーブル | upsert キー | create 時のみ | create / update 両方 |
|---|---|---|---|
| Anime | `[provider, contentId]` | title, provider, contentId, year, quarter | description, entityType, maturityRating, benefitId |
| Season | `[animeId, seasonId]` | animeId, seasonId | displayName, seasonNumber, imageUrl |
| Episode | `[seasonId, episodeNumber]` | seasonId, episodeNumber | episodeId, title, description, releaseDate, duration, maturityRating, imageUrl, hasSubtitles, hasDub, benefitId |

**`recorded` フラグはユーザー操作でのみ更新（sync では変更しない）。**

---

### `syncEpisodesFromTmdb` — TMDB エピソード同期

DB に登録済みのアニメについて、TMDB からエピソード情報（タイトル・あらすじ・放送日・尺）を補完する。

#### フロー

```
tmdbId が未設定？ → タイトル名で TMDB 検索 → tmdbId を DB に保存
  │
  └─ fetchTmdbEpisodes(tmdbId)
       │
       └─ 各シーズン・各エピソードについて:
            upsert (create: 基本情報, update: 非空フィールドのみ上書き)
```

#### update の条件付き上書き

TMDB からの update は **非空フィールドのみ** 上書きする:

```
if (ep.title)       → update title
if (ep.description) → update description
if (ep.releaseDate) → update releaseDate
if (ep.duration)    → update duration
```

プロバイダ側の情報（episodeId, hasSubtitles 等）を消さないための設計。

---

### `syncEpisodeIds` — episodeId 反映

TMDB 経由で作成されたエピソード（episodeId が空）に、プロバイダ固有の episodeId を後から埋める。

#### シーズン数マッチングのアルゴリズム

| 条件 | 方式 |
|---|---|
| プロバイダ側と DB 側のシーズン数が一致 | `seasonNumber` で直接マッチ |
| シーズン数が不一致 | プロバイダの全エピソードをフラットに展開し、DB 側シーズンの話数に合わせて累積オフセットで振り分け |

不一致の例: プロバイダが1シーズン24話、DB（TMDB由来）が2シーズン各12話の場合、
プロバイダの1〜12話をDBシーズン1に、13〜24話をDBシーズン2にマッピングする。

**既に episodeId が設定済みのエピソードはスキップする。**

---

## プロバイダ間の差異まとめ

| 項目 | Amazon | Hulu |
|---|---|---|
| maturityRating (タイトル) | あり | なし (null) |
| maturityRating (エピソード) | あり | なし (null) |
| hasSubtitles | subtitles[] の有無 | has_ja_caption |
| hasDub | audioTracks > 1 で判定 | 取得不可 (常に false) |
| releaseDate 形式 | 日本語 → ISO変換が必要 | 元々ISO 8601 |
| duration 単位 | 秒 | ミリ秒（要変換） |
| entityType | APIから取得 | 固定 "TV Show" |
| seasonId | プロバイダ提供 | 自動構築 |
| タイトル取得 | HTMLの`<title>`タグ | エピソードタイトルから推定 |
