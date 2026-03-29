# サーバーモード (`serve`)

Flask API サーバーと BullMQ ワーカーを 2 プロセスで同時に起動します。
外部サービスや Web フロントエンドからリクエストを送ってダウンロードをキューイングできます。

```bash
# ローカルで起動
python main.py serve
python main.py serve --host 0.0.0.0 --port 5000
```

```
  nagisa serve
  Flask API:  http://0.0.0.0:5000
  Redis:      redis:6379
  Queue:      nagisa
```

## アーキテクチャ

```mermaid
flowchart LR
    Client["クライアント\n(curl / フロントエンド)"]
    API["Flask API\n:5000"]
    Redis["Redis"]
    Worker["BullMQ Worker"]
    DL["ダウンロード\nパイプライン"]

    Client -- "POST /api/queues" --> API
    API -- "enqueue" --> Redis
    Redis -- "dequeue" --> Worker
    Worker --> DL
```

| プロセス | 役割 |
|----------|------|
| **Flask API** | HTTP リクエストを受け付け、BullMQ にジョブを投入 |
| **BullMQ Worker** | キューからジョブを取得し、ダウンロードパイプラインを実行 |

## 環境変数

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_HOST` | Redis ホスト | `redis` |
| `REDIS_PORT` | Redis ポート | `6379` |
| `ENV` | `production` で gunicorn (4 workers) を使用 | — |

## API エンドポイント

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/queues` | POST | ダウンロードジョブをキューに投入 |
| `GET /api/status` | GET | サーバーバージョン・キュー状態・実行中ジョブ |
| `GET /health` | GET | ヘルスチェック (`{"status": "ok"}`) |
| `GET /docs` | GET | Scalar API リファレンス UI |
| `GET /openapi.json` | GET | OpenAPI 3.1 仕様 (JSON) |

---

## `POST /api/queues`

ダウンロードジョブをキューに投入します。`items` 配列でコンテンツを指定します（単体でも配列で渡します）。

preview（エピソード一覧）はプロバイダ API から取得して返します。複数件の場合は最大5件を並列で取得します。TMDb メタデータ（英語タイトル等）は Worker が後から解決するため、preview には含まれません。

### リクエストボディ

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | `string` | — | `"amazon"` または `"hulu"`（省略時は `"amazon"`） |
| `items` | `ContentItem[]` | Yes | コンテンツ ID の配列。単体でも配列で指定する |
| `language` | `string` | — | デフォルトの言語設定。各 ContentItem で上書き可能。Hulu: `"sub"` (字幕版) / `"dub"` (吹替版) |
| `marketplace` | `string` | — | デフォルトの Amazon マーケットプレイス (`co.jp`, `com` 等)。各 ContentItem で上書き可能。省略時は Cookie から自動検出 |

#### ContentItem

`items` 配列の各要素:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content_id` | `string` | Yes | コンテンツ ID (ASIN, slug 等) |
| `seasons` | `SeasonFilter[]` | — | ダウンロードするシーズン。省略時は全シーズン |
| `language` | `string` | — | この作品の言語設定。トップレベルの `language` を上書き |
| `marketplace` | `string` | — | この作品のマーケットプレイス。トップレベルの `marketplace` を上書き |

#### SeasonFilter

ContentItem の `seasons` 配列の各要素:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `season_number` | `integer` | Yes | シーズン番号 |
| `episodes` | `int[] \| null` | — | ダウンロードするエピソード番号。`null` または省略時は全エピソード |

### リクエスト例

#### Amazon — 単体

```bash
curl -X POST http://localhost:5000/api/queues \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "amazon",
    "items": [{"content_id": "B0DXV9MP4Y", "seasons": [{"season_number": 1, "episodes": [1]}]}]
  }'
```

#### Amazon — シーズン指定

```bash
curl -X POST http://localhost:5000/api/queues \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "amazon",
    "items": [{"content_id": "B0DXV9MP4Y", "seasons": [{"season_number": 1}]}]
  }'
```

#### Amazon — 複数作品

```bash
curl -X POST http://localhost:5000/api/queues \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "amazon",
    "items": [{"content_id": "B0DXV9MP4Y"}, {"content_id": "B0GCWZ6WWS"}]
  }'
```

#### Amazon — 作品ごとにマーケットプレイス指定

```bash
curl -X POST http://localhost:5000/api/queues \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "amazon",
    "items": [
      {"content_id": "B0DXV9MP4Y", "marketplace": "co.jp"},
      {"content_id": "B09ABCDEFG", "marketplace": "com"}
    ]
  }'
```

#### Hulu — 字幕版を全話ダウンロード

```bash
curl -X POST http://localhost:5000/api/queues \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "hulu",
    "items": [{"content_id": "the-mentalist"}],
    "language": "sub"
  }'
```

#### Hulu — 作品ごとに言語指定

```bash
curl -X POST http://localhost:5000/api/queues \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "hulu",
    "items": [
      {"content_id": "the-mentalist"},
      {"content_id": "friends", "language": "dub"}
    ],
    "language": "sub"
  }'
```

### レスポンス (202 Accepted)

レスポンスは常に `{"jobs": [...], "count": N}` 形式です。単体でも複数でも同じ形式で返されます。各ジョブに `preview` が付きます（最大5件を並列取得）。

#### 単体の場合

```json
{
  "count": 1,
  "jobs": [
    {
      "job_id": "19",
      "status": "queued",
      "name": "download",
      "data": {
        "provider": "amazon",
        "content_id": "B0DXV9MP4Y",
        "seasons": [{"season_number": 1, "episodes": [1]}],
        "marketplace": null
      },
      "timestamp": 1774567545049,
      "preview": {
        "content_type": "series",
        "title": "リコリス・リコイル",
        "total_episodes": 13,
        "selected_episodes": 1,
        "media_capabilities": null,
        "episodes": [
          {
            "number": 1,
            "title": "Easy does it",
            "content_id": "B0DYPFS8CT",
            "duration": 1442
          }
        ]
      }
    }
  ]
}
```

#### 複数の場合

```json
{
  "count": 2,
  "jobs": [
    {
      "job_id": "21",
      "status": "queued",
      "name": "download",
      "data": {
        "provider": "amazon",
        "content_id": "B0DXV9MP4Y",
        "seasons": null,
        "marketplace": null
      },
      "timestamp": 1774567547992,
      "preview": {
        "content_type": "series",
        "title": "リコリス・リコイル",
        "total_episodes": 13,
        "selected_episodes": 13,
        "media_capabilities": null,
        "episodes": [
          {"number": 1, "title": "Easy does it", "content_id": "B0DYPFS8CT", "duration": 1442},
          {"number": 2, "title": "The more the merrier", "content_id": "B0DPNQFHQD", "duration": 1442}
        ]
      }
    },
    {
      "job_id": "20",
      "status": "queued",
      "name": "download",
      "data": {
        "provider": "amazon",
        "content_id": "B0GCWZ6WWS",
        "seasons": null,
        "episode_ids": [],
        "marketplace": null
      },
      "timestamp": 1774567547847,
      "preview": {
        "content_type": "series",
        "title": "死亡遊戯で飯を食う。",
        "total_episodes": 11,
        "selected_episodes": 11,
        "media_capabilities": null,
        "episodes": [
          {"number": 1, "title": "#01 All You Need Is ----", "content_id": "B0GCWZ6WWS", "duration": 2859},
          {"number": 2, "title": "#02 Chains of ----", "content_id": "B0G9113GDX", "duration": 1429}
        ]
      }
    }
  ]
}
```

> 上記例の `episodes` は省略しています。実際には全エピソードが含まれます。

#### レスポンスフィールド

| Field | Type | Description |
|-------|------|-------------|
| `count` | `integer` | ジョブ数 |
| `jobs` | `Job[]` | ジョブの配列 |

各 `Job` のフィールド:

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | `string` | BullMQ ジョブ ID |
| `status` | `string` | 常に `"queued"` |
| `name` | `string` | ジョブ名 (常に `"download"`) |
| `data` | `object` | ジョブペイロード |
| `timestamp` | `integer` | ジョブ作成時刻 (Unix ms) |
| `preview` | `Preview \| undefined` | エピソードメタデータ。preview 取得に失敗した場合は含まれない |

#### Preview

| Field | Type | Description |
|-------|------|-------------|
| `content_type` | `string` | `"movie"` または `"series"` |
| `title` | `string` | タイトル（プロバイダから取得） |
| `total_episodes` | `integer` | 全エピソード数 |
| `selected_episodes` | `integer` | フィルタ後の選択エピソード数 |
| `media_capabilities` | `string[] \| null` | メディア品質バッジ (例: `["4K", "DV", "Atmos"]`) |
| `episodes` | `EpisodePreview[]` | エピソード一覧 |

#### EpisodePreview

| Field | Type | Description |
|-------|------|-------------|
| `number` | `integer` | エピソード番号 |
| `title` | `string` | エピソードタイトル（プロバイダから取得） |
| `content_id` | `string` | エピソード固有 ID (Amazon: ASIN, Hulu: asset ref_id) |
| `duration` | `integer \| null` | 再生時間 (秒) |

### エラーレスポンス (400)

```json
{"error": "items is required"}
{"error": "Amazon content_id (ASIN) must be a 10-character string (got 'BAD')"}
{"error": "Unknown provider: 'netflix'. Valid: amazon, hulu"}
{"error": "Invalid language 'jp'. Valid: dub, sub"}
```

---

## `GET /api/status`

サーバーバージョン、BullMQ キューの統計、実行中ジョブの詳細、Redis / システムリソース情報を返します。Nagisa WebUI のサーバーステータスダイアログで表示されます。

### リクエスト例

```bash
curl http://localhost:5000/api/status
```

### レスポンス (200)

```json
{
  "version": "1.0.0",
  "uptime": 86400,
  "queue": {
    "wait": 1,
    "active": 1,
    "completed": 19,
    "failed": 0,
    "delayed": 0
  },
  "active_jobs": [
    {
      "job_id": "20",
      "provider": "amazon",
      "content_id": "B0GCWZ6WWS",
      "seasons": null,
      "timestamp": 1774567547847
    }
  ],
  "redis": {
    "connected": true,
    "memory_used": "5.2M",
    "uptime": 172800
  },
  "system": {
    "cpu_percent": 12.5,
    "memory_percent": 45.2,
    "disk_free_gb": 120.5
  }
}
```

### フィールド

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Nagisa のバージョン (`pyproject.toml` から取得) |
| `uptime` | `integer` | Nagisa プロセスの稼働時間 (秒)。起動時に `time.monotonic()` を記録して算出 |
| `queue` | `object \| null` | キューのジョブカウント。Redis 未接続の場合は `null` |
| `queue.wait` | `integer` | 待機中のジョブ数 |
| `queue.active` | `integer` | 実行中のジョブ数 |
| `queue.completed` | `integer` | 完了済みジョブ数 |
| `queue.failed` | `integer` | 失敗したジョブ数 |
| `queue.delayed` | `integer` | 遅延/スケジュール済みジョブ数 |
| `active_jobs` | `ActiveJob[]` | 実行中ジョブの詳細リスト |
| `redis` | `Redis \| null` | Redis 接続情報。Redis 未使用または取得失敗時は `null` |
| `system` | `System \| null` | システムリソース情報。取得失敗時は `null` |

#### ActiveJob

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | `string` | BullMQ ジョブ ID |
| `provider` | `string` | `"amazon"` または `"hulu"` |
| `content_id` | `string` | コンテンツ ID (ASIN または slug) |
| `seasons` | `SeasonFilter[] \| null` | シーズンフィルタ (`null` = 全シーズン) |
| `timestamp` | `integer` | ジョブ作成時刻 (Unix ms) |

#### Redis

`redis.info()` から取得。

| Field | Type | Description |
|-------|------|-------------|
| `connected` | `boolean` | Redis への接続状態 |
| `memory_used` | `string` | メモリ使用量 (`INFO memory` の `used_memory_human`) |
| `uptime` | `integer` | Redis の稼働時間 (秒、`INFO server` の `uptime_in_seconds`) |

#### System

`psutil` で取得。

| Field | Type | Description |
|-------|------|-------------|
| `cpu_percent` | `float` | CPU 使用率 (%) |
| `memory_percent` | `float` | メモリ使用率 (%) |
| `disk_free_gb` | `float` | 録画先ディスクの空き容量 (GB) |

---

## `GET /health`

```bash
curl http://localhost:5000/health
# => {"status": "ok"}
```
