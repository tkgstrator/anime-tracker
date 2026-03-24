# スキーマアーキテクチャ

プロバイダ固有のAPIレスポンスから共通型への変換、メタデータ付与、DB格納までのデータフローを示す。

## 全体図

```mermaid
graph TB
  subgraph "Amazon 固有スキーマ<br/>providers/amazon.dto.ts"
    ABH[BrowseHTMLSchema<br/>+ PaginateResponseSchema<br/><i>ブラウズ + ページネーション</i>]
    ADP[DetailPageJsonSchema<br/><i>詳細ページJSON</i>]
    APD[PageDataSchema<br/><i>extractPageData出力</i>]
    ADP -->|".pipe()"| APD
  end

  subgraph "Hulu 固有スキーマ<br/>providers/hulu.dto.ts"
    HPR[PaletteResponseSchema<br/><i>ブラウズAPI</i>]
    HES[EpisodesSchema<br/><i>RSCエピソード</i>]
  end

  subgraph "共通スキーマ<br/>providers/common.dto.ts"
    T[TitleSchema<br/><i>タイトル一覧の1件</i>]
    TI[TitleInfoSchema<br/><i>タイトル詳細</i>]
    S[SeasonSchema]
    E[EpisodeSchema]
    ET[EntityType]

    TI -->|".seasons"| S
    S -->|".episodes"| E
    T -.->|entityType| ET
    TI -.->|entityType| ET
  end

  subgraph "メタデータスキーマ<br/>providers/metadata.dto.ts"
    MR[MetadataResponseSchema<br/><i>AniList API応答</i>]
    TM[TitleMetadataSchema<br/><i>識別結果</i>]
    TDI[TitleDetailedInfoSchema<br/><i>メタデータ付き詳細</i>]

    MR -->|identify| TM
    TI -->|".extend()"| TDI
    TM -->|".metadata"| TDI
  end

  subgraph "DB / APIスキーマ<br/>anime.dto.ts"
    AS[AnimeSchema<br/><i>DBレコード</i>]
    AI[AnimeInfoSchema<br/><i>シーズン・エピソード含む</i>]
    PAS[PaginatedAnimeSchema<br/><i>ページネーション応答</i>]

    AS -->|".extend()"| AI
    AS -->|".data[]"| PAS
  end

  ABH -->|"fetchTitleList()"| T
  APD -->|"fetchEpisodeList()"| TI

  HPR -->|"fetchTitleList()"| T
  HES -->|"fetchEpisodeList()"| TI

  TDI -->|"sync → DB upsert"| AS

  style T fill:#4a9,color:#fff
  style TI fill:#4a9,color:#fff
  style S fill:#4a9,color:#fff
  style E fill:#4a9,color:#fff
  style TDI fill:#c84,color:#fff
  style AS fill:#58c,color:#fff
  style AI fill:#58c,color:#fff
  style PAS fill:#58c,color:#fff
```

## スキーマファイル構成

```
src/schemas/
├── anime.dto.ts                  # DB/APIレイヤーのスキーマ
├── recording.dto.ts              # 録画状態更新のスキーマ
├── message.dto.ts                # キューメッセージのスキーマ
└── providers/
    ├── common.dto.ts             # 全プロバイダ共通の型
    ├── metadata.dto.ts           # AniList/TMDB メタデータ
    ├── amazon.dto.ts             # Amazon Prime Video 固有
    └── hulu.dto.ts               # Hulu 固有
```

## レイヤー別の役割

### 1. プロバイダ固有スキーマ (`providers/amazon.dto.ts`, `providers/hulu.dto.ts`)

各プロバイダのAPI/HTMLレスポンスをパースするためのスキーマ。プロバイダごとにレスポンス構造が異なるため、個別に定義する。

| Amazon | 用途 |
|--------|------|
| `BrowseHTMLSchema` | ブラウズページ埋め込みJSONのパース → `Title[]` に transform |
| `DetailPageJsonSchema` | 詳細ページ埋め込みJSONのパース → `PageData` に pipe |
| `PageDataSchema` | `extractPageData()` の出力型 |
| `PaginateResponseSchema` | ページネーションAPIのレスポンス |
| `BrowseQuerySchema` | ブラウズ URL 生成時の検索クエリ |

| Hulu | 用途 |
|------|------|
| `PaletteResponseSchema` | Palette API (ブラウズ) のレスポンス |
| `EpisodesSchema` | RSCペイロードから抽出したエピソード配列 |
| `VodItemSchema` | ブラウズAPIの個別アイテム |

### 2. 共通スキーマ (`providers/common.dto.ts`)

全プロバイダが最終的に変換する統一型。`Provider` 基底クラスのインターフェースで使用される。

| スキーマ | 用途 |
|----------|------|
| `EntityType` | `'tv' \| 'movie'` の enum |
| `TitleSchema` | タイトル一覧の1件（`fetchTitleList()` の戻り値要素） |
| `EpisodeSchema` | エピソード1件 |
| `SeasonSchema` | シーズン（エピソード配列を含む） |
| `TitleInfoSchema` | タイトル詳細（シーズン配列を含む、`fetchEpisodeList()` の戻り値） |
| `TitleStatusTypeEnum` | 放送状態（`FINISHED`, `RELEASING` 等） |

### 3. メタデータスキーマ (`providers/metadata.dto.ts`)

AniList/TMDB APIから取得したメタデータと、共通スキーマを合成した詳細型。

| スキーマ | 用途 |
|----------|------|
| `MetadataResponseSchema` | AniList GraphQL API のレスポンス |
| `MetadataMediaSchema` | AniList の作品1件 |
| `TitleMetadataSchema` | 識別結果（aniListId, status, year, quarter） |
| `TitleDetailedInfoSchema` | `TitleInfoSchema` + imageUrl + metadata を合成した完全型 |

### 4. DB/APIスキーマ (`anime.dto.ts`)

Prisma経由でDBに格納された後、Hono APIのレスポンスとして返すスキーマ。

| スキーマ | 用途 |
|----------|------|
| `AnimeSchema` | `anime` テーブルのレコード |
| `AnimeInfoSchema` | AnimeSchema + seasons + episodes のネスト構造 |
| `AnimeListQuerySchema` | 一覧API のクエリパラメータ |
| `PaginatedAnimeSchema` | ページネーション付き一覧レスポンス |

## データフロー

```
[Amazon API/HTML] ──→ Amazon固有スキーマ ──→ Title / TitleInfo (共通)
[Hulu API/RSC]    ──→ Hulu固有スキーマ   ──→ Title / TitleInfo (共通)
                                                    │
                                                    ▼
                                    Provider.fetchTitle()
                                    TitleInfo + MetadataAdapter.identify()
                                                    │
                                                    ▼
                                          TitleDetailedInfo (メタデータ付き)
                                                    │
                                                    ▼
                                          SyncService → Prisma upsert
                                                    │
                                                    ▼
                                          AnimeSchema (DB/APIレスポンス)
```
