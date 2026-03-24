# Sync Queue API

`POST /api/sync` にJSONを送ることで、バックグラウンドキューにタスクを投入できる。

## エンドポイント

```
POST /api/sync
Content-Type: application/json
```

## メッセージ形式

すべてのメッセージは `type` でタスク種別を指定し、パラメータがある場合は `message` に格納する。

## メッセージタイプ

### 1. `check-new-episodes` — プロバイダの新エピソードチェック

指定プロバイダから新しいアニメ・エピソード情報を取得し、DBを更新する。

```json
{
  "type": "check-new-episodes",
  "message": {
    "provider": "hulu"
  }
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `type` | `"check-new-episodes"` | 固定値 |
| `message.provider` | `"amazon" \| "hulu"` | プロバイダ名 |

### 2. `sync-tmdb` — 個別アニメのTMDBエピソード同期

指定アニメのエピソード情報をTMDBから取得・同期する。

```json
{
  "type": "sync-tmdb",
  "message": {
    "animeId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "ダンジョン飯",
    "tmdbId": 210757
  }
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `type` | `"sync-tmdb"` | 固定値 |
| `message.animeId` | `string` (UUID) | アニメのID |
| `message.title` | `string` | アニメタイトル（TMDB検索用） |
| `message.tmdbId` | `number \| null` | TMDB ID（既知の場合）。`null` ならタイトルで検索 |

### 3. `identify-anilist` — AniListによるアニメ情報識別

未識別のアニメをAniListで検索し、正式タイトル・放送ステータス・クール情報を更新する。

```json
{
  "type": "identify-anilist"
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `type` | `"identify-anilist"` | 固定値 |

## レスポンス

成功時:

```json
{
  "ok": true,
  "type": "check-new-episodes"
}
```

## cURL例

```bash
# 新エピソードチェック
curl -X POST https://your-worker.dev/api/sync \
  -H 'Content-Type: application/json' \
  -d '{"type":"check-new-episodes","message":{"provider":"hulu"}}'

# TMDB同期
curl -X POST https://your-worker.dev/api/sync \
  -H 'Content-Type: application/json' \
  -d '{"type":"sync-tmdb","message":{"animeId":"550e8400-e29b-41d4-a716-446655440000","title":"ダンジョン飯","tmdbId":210757}}'

# AniList識別
curl -X POST https://your-worker.dev/api/sync \
  -H 'Content-Type: application/json' \
  -d '{"type":"identify-anilist"}'
```
