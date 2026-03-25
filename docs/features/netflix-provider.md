# Netflix プロバイダ対応

## 概要

Netflix Japan のアニメ一覧・エピソード情報を取得し、既存の Amazon / Hulu と同様に管理できるようにする。

---

## 背景・モチベーション

- Netflix Japan は国内最大級のアニメライブラリを持ち、独占配信・シーズン一括配信も多い
- 現在 Amazon / Hulu の 2 プロバイダのみ対応しており、Netflix を追加することでカバー範囲を大幅に拡大できる
- フロントエンド側は `providerLabel` / `providerColor` に Netflix が既に定義済み（`constants.ts`）

---

## Netflix API の現状分析

### 公式 API

Netflix の公式 API は **2014 年に廃止**されており、パブリックな REST / GraphQL API は存在しない。

### Netflix のウェブサイト構造

| 項目 | 詳細 |
|------|------|
| カタログページ | `https://www.netflix.com/browse/genre/7424`（アニメカテゴリ） |
| 認証要否 | **ログイン必須** — 未ログイン時はサインイン画面にリダイレクト |
| レンダリング | SPA (React) — サーバーサイドで HTML が返らず、JS 実行が必要 |
| API 通信 | 内部 Shakti API (`/api/shakti/...`) — 認証 Cookie + CSRF トークン必須 |

→ Hulu / Amazon のように**公開 API やパブリック HTML をスクレイピングするアプローチは使えない**。

### 利用可能な外部データソース

| ソース | 概要 | 料金 | タイトル一覧 | Netflix ID | エピソード情報 |
|--------|------|------|:---:|:---:|:---:|
| **JustWatch GraphQL API** | ストリーミング検索サイト。プロバイダ別カタログを公開 GraphQL API で提供 | 無料（公開 API） | **○** | **○** `standardWebURL` に含まれる | × |
| **TMDB API** | 映画・TV のメタデータ DB | 無料（API キー必要、既にプロジェクトで利用中） | △（間接） | △（`watch/providers` で確認可能だが URL なし） | **○** |
| **uNoGS API** | 非公式 Netflix グローバル検索 | RapidAPI 有料 | ○ | ○ | × |
| **AniList API** | アニメ特化メタデータ | 無料（既にプロジェクトで利用中） | × | × | × |

---

## 推奨アプローチ: JustWatch + TMDB ハイブリッド

### 調査結果: JustWatch GraphQL API

JustWatch（`https://www.justwatch.com/jp?genres=ani&providers=nfx`）の内部 GraphQL API を調査した結果、
**認証不要で Netflix JP のアニメ一覧と Netflix タイトル ID を取得できる**ことを確認した。

#### 検証済みクエリ

```graphql
query GetPopularTitles(
  $country: Country!
  $sortBy: PopularTitlesSorting!
  $first: Int!
  $offset: Int
  $filter: TitleFilter
) {
  popularTitles(
    country: $country
    sortBy: $sortBy
    first: $first
    offset: $offset
    filter: $filter
  ) {
    totalCount
    edges {
      node {
        id            # JustWatch ID (例: "ts472882")
        objectId      # JustWatch 数値 ID (例: 472882)
        objectType    # "SHOW" | "MOVIE"
        content(country: $country, language: "ja") {
          title               # 日本語タイトル
          originalReleaseYear # 放送開始年
          shortDescription    # あらすじ
          posterUrl           # ポスター画像
          fullPath            # JustWatch 詳細ページパス
          externalIds {
            imdbId            # IMDb ID
            tmdbId            # TMDB ID ★
          }
        }
        offers(country: $country, platform: WEB) {
          standardWebURL      # ★ Netflix URL (例: "https://www.netflix.com/title/82656195")
          monetizationType    # "FLATRATE"
          presentationType    # "SD" | "HD" | "4K"
          package {
            packageId         # 8 = Netflix, 1796 = Netflix with Ads
            clearName         # "Netflix"
            technicalName     # "netflix"
          }
        }
      }
    }
  }
}
```

#### 検証済み変数

```json
{
  "country": "JP",
  "sortBy": "POPULAR",
  "first": 40,
  "offset": 0,
  "filter": {
    "genres": ["ani"],
    "objectTypes": ["SHOW"],
    "packages": ["nfx"]
  }
}
```

#### 検証結果

- **エンドポイント**: `https://apis.justwatch.com/graphql` （POST、認証不要）
- **totalCount**: 754 件（2026-03-25 時点、Netflix JP のアニメ TV シリーズ）
- `offers[].standardWebURL` に **Netflix タイトル URL** が含まれる（例: `https://www.netflix.com/title/82656195`）
- `content.externalIds.tmdbId` で **TMDB ID** も取得可能
- Netflix 以外のプロバイダの offers も返る（Amazon, Hulu, Disney+ 等）→ Netflix の offer だけフィルタして使用

#### Netflix タイトル ID の抽出

```
standardWebURL: "https://www.netflix.com/title/82656195"
                                              ^^^^^^^^
                                              Netflix タイトル ID
```

URL から `/title/` 以降を抽出するだけで Netflix ID が得られる。

### データ取得フロー

```
JustWatch GraphQL API (Netflix JP + anime フィルタ)
  │
  ├─ タイトル一覧 (タイトル名, Netflix ID, TMDB ID, 画像)
  │
  ▼
TMDB TV Detail API (TMDB ID でシーズン・エピソード取得)
  │
  ▼
AniList 照合 (aniListId, status, year, quarter)
  │
  ▼
DB 保存 (provider: "netflix", contentId: Netflix タイトル ID)
```

### Hulu / Amazon との比較

| 項目 | Hulu / Amazon | Netflix (JustWatch + TMDB) |
|------|--------------|---------------------------|
| タイトル一覧 | プロバイダ API 直接 | JustWatch GraphQL API |
| エピソード詳細 | プロバイダ API 直接 | TMDB TV Season API |
| contentId | プロバイダ固有 ID (slug / ASIN) | Netflix タイトル ID (例: `82656195`) |
| エピソード配信日 | プロバイダ API から取得 | TMDB `air_date`（地上波基準の場合あり） |
| 認証 | 不要（公開 API） | 不要（JustWatch 公開 API + TMDB API キー既存） |
| 更新頻度 | 毎時 Cron | 毎時 Cron（同じ） |
| 網羅性 | 高 | 高（JustWatch は 754 件をカバー） |

### 既知の制約・リスク

1. **JustWatch API の安定性**: 公式ドキュメントのないパブリック API のため、スキーマ変更の可能性がある
2. **配信日のずれ**: TMDB の `air_date` は地上波放送日ベースの場合があり、Netflix 配信日と異なる可能性がある
3. **JustWatch のレート制限**: 明示的な制限は確認されていないが、常識的な範囲でリクエスト間隔を設ける
4. **Netflix with Ads**: `packageId: 1796` (Netflix Standard with Ads) も別 offer として返るが、同じ Netflix タイトル ID を指すため重複排除が必要

---

## 実装ロードマップ

### Phase 1: JustWatch アダプター + Netflix タイトル一覧取得

#### 1-1. JustWatch GraphQL クライアント作成

- `src/lib/providers/netflix/justwatch.ts` — JustWatch GraphQL API クライアント
  - `fetchNetflixAnime(offset, first)`: Netflix JP のアニメ一覧取得
  - ページネーション対応（`offset` / `first`）
  - Netflix の offer から `standardWebURL` を抽出し Netflix タイトル ID を取得
  - `externalIds.tmdbId` も同時取得
- `src/schemas/providers/netflix.dto.ts` — JustWatch レスポンス用 Zod スキーマ

#### 1-2. Netflix プロバイダクラス作成

- `src/lib/providers/netflix/index.ts` — `Provider` 基底クラスを継承
- `fetchTitleList()`:
  - JustWatch GraphQL API → 全ページ走査
  - Netflix offer を持つタイトルだけ抽出
  - `contentId` = Netflix タイトル ID（`standardWebURL` から抽出）
  - `newEpisodesOnly=true` 時は `sortBy: "POPULAR"` + 直近追加分のみ返す
- `fetchTitleInfo(contentId)`:
  - JustWatch で取得した TMDB ID を使って TMDB TV Detail + Season API を呼び出す
  - シーズン・エピソード・配信日を取得して `TitleInfo` に変換

#### 1-3. プロバイダ登録

- `src/lib/sync.ts`: `providers` に `netflix: new NetflixProvider()` を追加
- `src/schemas/message.dto.ts`: `ProviderTypeEnum` に `'netflix'` を追加
- `src/scheduled.ts`: Cron で Netflix の fetch メッセージもエンキュー

### Phase 2: TMDB 連携によるエピソード詳細取得

#### 2-1. TMDB アダプター拡張

- `src/lib/metadata/tmdb.ts` にシーズン・エピソード取得メソッドを追加
  - `fetchTvDetail(tmdbId)`: TV 番組詳細（シーズン数、`next_episode_to_air` 等）
  - `fetchTvSeason(tmdbId, seasonNumber)`: シーズンごとのエピソード一覧
- JustWatch → TMDB ID マッピングをプロバイダ内で保持（メモリ or DB）

#### 2-2. nextEpisodeDate の対応

- TMDB の `next_episode_to_air` フィールドを活用
  - TV Detail API のレスポンスに `next_episode_to_air.air_date` が含まれる
  - これを `Title.nextEpisodeDate` にマッピング

#### 2-3. AniList 照合

- TMDB から取得したタイトルに対して AniList 照合を実施（既存ロジックを流用）
- JustWatch の `externalIds.imdbId` も補助的に活用可能

### Phase 3: レート制限・エラーハンドリング

#### 3-1. JustWatch レート制限対応

- リクエスト間に適切な待機時間を設ける（1〜2 秒）
- 1 回のクエリで `first: 40` 件取得 → 754 件なら約 19 リクエストで完了
- エラー時のリトライ・バックオフ

#### 3-2. TMDB レート制限対応

- TMDB API のレート制限: 約 40 req/秒（十分余裕あり）
- エピソード詳細取得は update 時にタイトル単位で実行されるため問題なし

#### 3-3. データ欠損時のフォールバック

- JustWatch に TMDB ID がないタイトル → タイトル名で TMDB 検索にフォールバック
- TMDB に `air_date` がないエピソード → `releaseDate: null` として保存
- JustWatch API がダウン → 既存データを維持（次回同期で再取得）

### Phase 4: フロントエンド統合

#### 4-1. ブラウズページ

- `ProviderTypeEnum` の更新により、プロバイダフィルタに Netflix が自動追加される
- `providerLabel` / `providerColor` は既に定義済み → 追加作業なし

#### 4-2. ホーム画面

- プロバイダ別カルーセルに Netflix セクションが自動追加される（既存ロジックで対応）

#### 4-3. アニメ詳細ページ

- Netflix タイトルの外部リンク（`https://www.netflix.com/title/{contentId}`）を表示
  - contentId が Netflix タイトル ID そのものなので URL 構築は容易

---

## 実装順序とタスク一覧

| # | タスク | 依存 | 想定規模 |
|---|--------|------|---------|
| 1 | `src/schemas/providers/netflix.dto.ts` — JustWatch / TMDB レスポンス用 Zod スキーマ | なし | S |
| 2 | `src/lib/providers/netflix/justwatch.ts` — JustWatch GraphQL クライアント | #1 | M |
| 3 | `src/lib/metadata/tmdb.ts` — TV Detail / Season API メソッド追加 | なし | M |
| 4 | `src/lib/providers/netflix/index.ts` — Provider クラス実装 | #1, #2, #3 | L |
| 5 | `src/schemas/message.dto.ts` — `ProviderTypeEnum` に `netflix` 追加 | なし | S |
| 6 | `src/lib/sync.ts` — Netflix プロバイダ登録 | #4 | S |
| 7 | `src/scheduled.ts` — Cron に Netflix fetch 追加 | #5, #6 | S |
| 8 | JustWatch / TMDB レート制限・バッチ処理 | #4 | M |
| 9 | nextEpisodeDate の TMDB `next_episode_to_air` 対応 | #4 | S |
| 10 | 動作検証・データ品質確認 | #1〜#9 | M |
| 11 | Netflix 外部リンク表示（詳細ページ） | #10 | S |

---

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `src/lib/providers/base.ts` | Provider 基底クラス（`fetchTitleList`, `fetchTitleInfo`） |
| `src/lib/providers/amazon/` | Amazon プロバイダ実装（参考） |
| `src/lib/providers/hulu/` | Hulu プロバイダ実装（参考） |
| `src/lib/metadata/tmdb.ts` | TMDB API アダプター（拡張対象） |
| `src/lib/metadata/anilist.ts` | AniList API アダプター（既存流用） |
| `src/lib/sync.ts` | 同期サービス（プロバイダ登録） |
| `src/schemas/message.dto.ts` | キューメッセージスキーマ（`ProviderTypeEnum`） |
| `src/scheduled.ts` | Cron トリガー |
| `src/queue.ts` | キューコンシューマ |
| `src/app/lib/constants.ts` | プロバイダラベル・カラー（定義済み） |
| `prisma/schema.prisma` | DB スキーマ（変更不要） |

---

## 設計判断メモ

### なぜ JustWatch + TMDB ハイブリッドか

| 案 | タイトル一覧 | Netflix ID | エピソード | 認証 | コスト |
|----|:---:|:---:|:---:|:---:|:---:|
| **JustWatch + TMDB（推奨）** | ○ | ○ | ○ | 不要 | 無料 |
| TMDB 単体 | △ | △ | ○ | API キー | 無料 |
| uNoGS + TMDB | ○ | ○ | ○ | API キー | 有料 |
| Netflix 直接スクレイピング | ○ | ○ | ○ | **ログイン必須** | 無料だが困難 |
| Apify / ScrapingBee | ○ | ○ | ○ | 不要 | 高額 |

**JustWatch が最適な理由:**
- 認証不要の公開 GraphQL API でタイトル一覧 + Netflix ID + TMDB ID を一括取得できる
- TMDB 単体では Netflix JP のカタログを正確に絞り込むのが難しい（`watch/providers` の遅延・欠損）
- JustWatch は 754 件のアニメをカバーしており網羅性が高い
- TMDB は既にプロジェクトで利用中のため、エピソード詳細取得の追加コストが低い

### DB スキーマ変更は不要

- `Anime.provider` は `String` 型のため、`"netflix"` をそのまま保存可能
- `Anime.contentId` に Netflix タイトル ID（例: `"82656195"`）を保存
- `provider + contentId` のユニーク制約で一意性を担保
- Prisma マイグレーション不要
