# Hulu Japan

## 概要

Hulu Japan のアニメタイトル・エピソード情報を取得するプロバイダの詳細仕様。

- 認証: 不要（未ログインでもアクセス可能）
- API: Palette API (ブラウズ) + Filtered API (フィルタリング) + RSC エピソード詳細

## API 構造

Hulu は 2 種類の API を使用する:

| API | 用途 |
|---|---|
| **Palette API** | エディトリアルキュレーション（新着、今期別スラッグ） |
| **Filtered API** | 条件指定フィルタリング（年代別、配信終了順） |

どちらも認証不要、50 件ずつのページネーション。

## エンドポイント

| 用途 | URL | 形式 |
|---|---|---|
| 今期アニメ / 新着 | `https://www.hulu.jp/api/v2/palettes/{slug}/vod/objects?from={n}&to={n}` | JSON |
| フィルタリング | `https://www.hulu.jp/api/v2/filtered?...` | JSON |
| エピソード詳細 | `https://www.hulu.jp/{slug}/assets?ht=episode` | HTML (RSCペイロード) |

## Filtered API 仕様

```
GET https://www.hulu.jp/api/v2/filtered
```

### 固定パラメータ（TVアニメ一覧）

| パラメータ | 値 | 説明 |
|---|---|---|
| `id` | `mt:tv` | メディアタイプ: TV |
| `id` | `gft:and` | ジャンルフィルタモード: AND |
| `id` | `g:8` | ジャンル: アニメ |
| `id` | `edg:tv_animation` | エディトリアルカテゴリ: TVアニメ |
| `service` | `hulu` | サービス指定（全件は `mixed`） |

### ページネーション

| パラメータ | 説明 |
|---|---|
| `from` | 開始インデックス（0始まり） |
| `to` | 終了インデックス（`from + 49` で50件ずつ） |

### ソートオプション

| `sort` 値 | 説明 |
|---|---|
| `[{"values.premiere_year":"desc"}]` | 新着順（初回放送年の降順） |
| `[{"publish_start_at":"desc"}]` | 配信開始日の降順 |
| `[{"values.latest_asset_publish_start_at":"desc"}]` | 最新エピソード配信日の降順 |
| `[{"values.weekly_uu":"desc"}]` | 人気順（週間UU、デフォルト） |
| `[{"publish_end_at":"asc"}]` | 配信終了日の昇順（expiring 取得用） |

### レスポンス

```jsonc
{
  "total_count": 1933,
  "data": [
    {
      "id": 1117799,
      "title": "最推しの義兄を愛でるため、長生きします!",
      "slug": "ill-live-a-long-life-to-dote-on-my-favorite-stepbrother",
      "imageUrl": "https://images.prod.hjholdings.tv/.../image.png",
      "startAt": "2025/12/12 00:00:00",
      "endAt": "2027/03/31 23:59:59",
      "schema_key": "series",
      "features": ["2026年 冬アニメ"]
    }
  ]
}
```

主要フィールド:

| フィールド | 型 | 説明 |
|---|---|---|
| `total_count` | number | 条件一致の総件数（2026-03-25 時点: 1,933件） |
| `data[].slug` | string | URLスラッグ（contentId として使用） |
| `data[].imageUrl` | string | サムネイル画像URL |
| `data[].startAt` | string | 配信開始日時 |
| `data[].endAt` | string | 配信終了日時 |
| `data[].schema_key` | string | スキーマ種別（`"series"` のみ使用） |
| `data[].features` | string[] | 特集タグ（「2026年 冬アニメ」など） |

## Palette API — シーズン別スラッグ

slug の命名規則: `{season-prefix}{年の下2桁}`

| 時期 | prefix |
|---|---|
| 冬 (1〜3月) | `january-march-quarter-anime` |
| 春 (4〜6月) | `april-june-quarter-anime` |
| 夏 (7〜9月) | `july-september-quarter-anime` |
| 秋 (10〜12月) | `october-december-quarter-anime` |

例: 2026年冬 → `january-march-quarter-anime26`

## 取得モード

### 新着アニメ (`newEpisodesOnly`)

2 ソースを並列取得して統合:

#### (1) 最近追加 — Palette API

```
GET https://www.hulu.jp/api/v2/palettes/recentlyadded-anime/vod/objects?from=0&to=49
```

`total_count` に達するまで 50 件ずつ再帰取得。

#### (2) 今期アニメ — Palette API（シーズン別スラッグ）

```
GET https://www.hulu.jp/api/v2/palettes/{season-slug}/vod/objects?from=0&to=49
```

四半期の最終月（3月, 6月, 9月, 12月）は来期スラッグも追加取得。

統合処理: `slug` ベースで重複排除し `schema_key === 'series'` のみ残す。

### 配信終了間近 (`expiring`) — API確認済み・未実装

```
GET https://www.hulu.jp/api/v2/filtered?id=mt:tv&id=gft:and&id=g:8&id=edg:tv_animation
  &sort=[{"publish_end_at":"asc"}]&service=hulu&from=0&to=49
```

レスポンスの `endAt` フィールドに配信終了日時が含まれる。月末（3/31, 6/30等）に集中する傾向がある。

### 全タイトル (`all`) — Filtered API（年代別）

```
GET https://www.hulu.jp/api/v2/filtered
  ?id=ag:{agKey}&id=gft:and&id=edg:tv_animation
  &sort=[{"values.weekly_uu":"desc"}]&service=mixed&from=0&to=49
```

| 年代 | agKey |
|---|---|
| 2000年代 | `twenty_hundreds` |
| 2010年代 | `twenty_tens` |
| 2020年代 | `twenty_twenties` |

3 年代を取得し `slug` で重複排除。約 2,581 件、約 30 秒。

## タイトル詳細 → TitleDetail マッピング

### Palette API（一覧）→ TitleSchema

| 元フィールド | マッピング先 | 備考 |
|---|---|---|
| `slug` | **contentId** | エピソード詳細ページのURLに利用 |
| `additionalInfo.card_info.episode_count` | 参考値のみ | DB保存なし |
| `additionalInfo.card_info.season_count` | 参考値のみ | DB保存なし |

### エピソード詳細ページ（RSCペイロード）→ Episode

RSCペイロードは `self.__next_f.push([1,"..."])` パターンから JSON を再構築して抽出。

| 元フィールド | マッピング先 | 変換 |
|---|---|---|
| `additionalInfo.card_info.episode_number_title` | **episodeNumber** | "第1話" → 1、0ならスキップ |
| `id_in_schema` | **episodeId** | 数値 → 文字列 |
| `additionalInfo.short_name / title` | **title** | short_name 優先 |
| `description` | **description** | |
| `startAt` | **releaseDate** | 元々 ISO 8601 |
| `additionalInfo.episode_runtime` | **duration** | ミリ秒 → 秒（Math.round） |
| `imageUrl` | **imageUrl** | |
| `additionalInfo.card_info.has_ja_caption` | **hasSubtitles** | 未定義は false |
| _(なし)_ | **hasDub** | 固定値 false（Hulu API に吹替情報なし） |
| _(なし)_ | **maturityRating** | 固定値 null（Hulu API にレーティング情報なし） |

シーズン構築: `card_info.season_number_title` でグループ化（未定義なら "シーズン1"）。`seasonId` は `hulu-{slug}-s{N}` で自動構築。タイトルは最初のエピソードから推定（シーズン/話数表記を除去）。

## 実装

- スキーマ: `src/schemas/providers/hulu.dto.ts`
- プロバイダ: `src/lib/providers/hulu/` (`index.ts` + `browse.ts` + `detail.ts`)
- 公開関数: `fetchHuluTitleDetail(slug)`, `fetchHuluAnime(season, year)`
