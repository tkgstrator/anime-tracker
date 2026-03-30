# Sync Queue アーキテクチャ

## 概要

Cloudflare Workers (Cron Trigger) → Queue → Lambda (日本/US IP) → D1 + R2 のパイプラインで、各プロバイダのタイトル・エピソード情報を定期取得する。

## 全体フロー

```mermaid
flowchart TD
    subgraph CF["Cloudflare"]
        Cron["Cron Trigger"] --> Scheduled["scheduled.ts"]

        Scheduled -->|"毎時"| EnqueueFetch["Queue に fetch メッセージ送信<br/>(provider × category)"]
        Scheduled -->|"毎日"| EnqueueExpiring["Queue に fetch (expiring) 送信"]

        subgraph FetchQueue["Queue Consumer: fetch"]
            FetchMsg["fetch メッセージ受信"]
            SyncFetch["SyncService.fetch()<br/>AniList 識別 + D1 upsert"]
        end

        subgraph UpdateQueue["Queue Consumer: update"]
            UpdateMsg["update メッセージ受信"]
            SyncUpdate["SyncService.update()<br/>シーズン・エピソード D1 upsert"]
        end

        EnqueueFetch --> FetchMsg
        EnqueueExpiring --> FetchMsg

        SyncFetch -->|"new_episode の場合<br/>contentId ごとに"| EnqueueUpdate["Queue に update メッセージ送信"]
        EnqueueUpdate --> UpdateMsg

        R2["R2 (nagisa-images)"]
    end

    subgraph AWS["AWS"]
        Lambda1["Lambda (JP/US)<br/>タイトル一覧取得"]
        Lambda2["Lambda (JP/US)<br/>タイトル詳細+エピソード取得"]
    end

    FetchMsg -->|"SigV4 (AWS IAM)<br/>Lambda /title_list"| Lambda1
    Lambda1 --> SyncFetch
    Lambda1 -->|"SigV4 (R2 API Token)<br/>タイトル画像"| R2

    UpdateMsg -->|"SigV4 (AWS IAM)<br/>Lambda /title_info"| Lambda2
    Lambda2 --> SyncUpdate
    Lambda2 -->|"SigV4 (R2 API Token)<br/>全画像"| R2
```

### 認証が必要な箇所

| 通信経路 | 認証方式 | 認証情報 |
|---|---|---|
| Workers → Lambda Function URL | AWS SigV4 署名 | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (LambdaInvoker IAM User) |
| Lambda → R2 S3 互換 API | AWS SigV4 署名 | `R2_IMAGE_ACCESS_KEY_ID` / `R2_IMAGE_SECRET_ACCESS_KEY` (R2 API Token) |
| Workers → R2 | Workers バインディング | 認証不要 (同一アカウント内、`IMAGES` バインディング) |
| Workers → D1 | Workers バインディング | 認証不要 (同一アカウント内、`DB` バインディング) |
| Lambda → Provider API | なし / 公開 API | 認証不要 |

## シーケンス図

```mermaid
sequenceDiagram
    participant Cron as Cron Trigger
    participant Sched as scheduled.ts
    participant Q as SYNC_QUEUE
    participant QC as queue.ts
    participant Lambda as Lambda (JP/US)
    participant Provider as Hulu / Amazon / CR
    participant AniList as AniList API
    participant D1 as D1 Database
    participant R2 as R2 (nagisa-images)

    Note over Cron,QC: Step 1: Cron → Queue にメッセージ投入

    Cron->>Sched: 0 */1 * * * (毎時)
    Sched->>Q: { type: "fetch", message: { provider, category: "new_episode" } }
    Sched->>Q: { type: "fetch", message: { provider, category: "coming_soon" } }

    Cron->>Sched: 0 0 * * * (毎日)
    Sched->>Q: { type: "fetch", message: { provider, category: "expiring" } }

    Note over Q,R2: Step 2: fetch メッセージ処理

    Q->>QC: fetch メッセージ
    QC->>Lambda: SigV4 (AWS IAM) POST /title_list { provider, category }
    Lambda->>Provider: タイトル一覧 API 呼び出し
    Provider-->>Lambda: タイトル一覧 + 画像URL
    Lambda->>R2: SigV4 (R2 API Token) タイトル画像を webp で PUT
    Lambda-->>QC: タイトル一覧レスポンス

    QC->>D1: 既存 contentId チェック

    alt 新規タイトル
        QC->>AniList: タイトル識別 (バッチ)
        AniList-->>QC: aniListId, nativeTitle, status
        QC->>D1: INSERT (識別結果 + メタデータ)
    end

    QC->>D1: 既存タイトルの badge/nextEpisodeDate 更新

    loop new_episode のバッジ付きタイトルごと
        QC->>Q: { type: "update", message: { provider, contentId } }
    end

    Note over Q,R2: Step 3: update メッセージ処理

    Q->>QC: update メッセージ
    QC->>Lambda: SigV4 (AWS IAM) POST /title_info { provider, contentId }
    Lambda->>Provider: タイトル詳細 + エピソード API 呼び出し
    Provider-->>Lambda: シーズン・エピソード一覧 + 画像URL
    Lambda->>R2: SigV4 (R2 API Token) 全画像を webp で PUT
    Lambda-->>QC: TitleInfo レスポンス

    QC->>D1: シーズン・エピソードの差分 upsert
    QC-->>Q: ack()

    Note over Q: 失敗時は retry() → 最大3回リトライ
```

## 画像配信フロー

```mermaid
flowchart LR
    Browser["ブラウザ"] -->|"/api/img/{uuid}.webp"| ImgTS["img.ts (Workers)"]
    ImgTS -->|"IMAGES.get(key)"| R2["R2 (nagisa-images)"]
    R2 -->|"webp 画像"| ImgTS
    ImgTS -->|"Cache-Control: 1年"| Browser

    subgraph "画像キー生成"
        DB_URL["DB の imageUrl"] -->|"UUIDv5(url, namespace)"| Key["{uuid}.webp"]
    end

    subgraph "画像アップロード (Lambda)"
        LambdaUP["Lambda"] -->|"fetch 元画像"| ProviderCDN["Provider CDN"]
        ProviderCDN --> LambdaUP
        LambdaUP -->|"cwebp q=90 変換"| LambdaUP
        LambdaUP -->|"PUT {uuid}.webp"| R2
    end
```

## キュー設定

| 項目 | 値 |
|---|---|
| キュー名 | `anime-tracker-sync-{staging\|production}` |
| バインディング | `SYNC_QUEUE` |
| 最大バッチサイズ | 5 |
| 最大リトライ回数 | 3 |

## Cron スケジュール

| Cron | 頻度 | 処理内容 |
|---|---|---|
| `0 */1 * * *` | 毎時 | `new_episode` + `coming_soon` を各プロバイダで取得 |
| `0 0 * * *` | 毎日 | `expiring` を各プロバイダで取得 |

## メッセージタイプ

| type | 概要 | Lambda エンドポイント |
|---|---|---|
| `fetch` | タイトル一覧取得 → AniList 識別 → D1 登録 → update キュー投入 | `/title_list`, `/expiring` |
| `update` | タイトル詳細+エピソード取得 → D1 差分更新 → 画像 R2 アップロード | `/title_info` |

## Lambda エンドポイント

| パス | 処理 | リージョン |
|---|---|---|
| `POST /title_list` | タイトル一覧取得 + タイトル画像 R2 アップロード | JP (Amazon/Hulu), US (Crunchyroll) |
| `POST /title_info` | タイトル詳細+エピソード取得 + 全画像 R2 アップロード | JP (Amazon/Hulu), US (Crunchyroll) |
| `POST /expiring` | 配信終了間近タイトル取得 | JP |

## R2 画像ストレージ

| 項目 | 値 |
|---|---|
| バケット名 | `nagisa-images` |
| キー形式 | `{UUIDv5(imageUrl)}.webp` (フラット構造) |
| UUIDv5 namespace | `uuidv5('animetracker', DNS)` |
| 画像形式 | webp (q=90) |
| Workers バインディング | `IMAGES` (読み取り専用) |
| Lambda からのアクセス | R2 S3 互換 API (aws4fetch) |

## 手動実行

`POST /api/queues` でキューを経由せず SyncService を直接実行できる。詳細は [sync-queue-api.md](sync-queue-api.md) を参照。
