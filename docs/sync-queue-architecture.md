# Sync Queue アーキテクチャ

## 全体フロー

```mermaid
flowchart TD
    Cron["Cron Trigger (毎時)"] --> Scheduled["scheduled.ts"]

    Scheduled --> Enqueue["SYNC_QUEUE に送信<br/>check-new-episodes × プロバイダ数"]

    subgraph "queue.ts (Consumer)"
        Enqueue --> CheckNewEp["check-new-episodes"]
    end

    CheckNewEp --> FetchTitles["プロバイダから<br/>最新タイトル一覧取得"]
    FetchTitles --> ExistsCheck{DBに存在する?}

    ExistsCheck -- Yes --> Merge["エピソード取得対象"]

    ExistsCheck -- No --> Identify["TMDB / AniList で識別"]
    Identify --> Identified{識別できた?}
    Identified -- No --> Skip["スキップ"]
    Identified -- Yes --> Merge

    Merge --> FetchDetail["プロバイダから<br/>エピソード取得"]
    FetchDetail --> Upsert["DB upsert<br/>(タイトル+エピソード)"]
    Upsert --> SaveIds["識別結果を反映<br/>(tmdbId, aniListId, status等)"]
```

## シーケンス図

```mermaid
sequenceDiagram
    participant Cron as Cron Trigger<br/>(毎時)
    participant Scheduled as scheduled.ts
    participant Queue as SYNC_QUEUE
    participant Consumer as queue.ts
    participant D1 as D1 Database
    participant Provider as Hulu / Amazon
    participant TMDB as TMDB API
    participant AniList as AniList API

    Note over Cron,Consumer: ── Step 1: scheduled がメッセージを投入 ──

    Cron->>Scheduled: 0 */1 * * *
    Scheduled->>Queue: send({ type: "check-new-episodes",<br/>message: { provider: "hulu" } })
    Scheduled->>Queue: send({ type: "check-new-episodes",<br/>message: { provider: "amazon" } })

    Note over Queue,Consumer: ── Step 2: check-new-episodes ──

    Queue->>Consumer: MessageBatch

    Consumer->>Provider: fetchTitleList({ newEpisodesOnly: true })
    Provider-->>Consumer: 最新タイトル一覧

    Consumer->>D1: 既存 contentId を一括チェック

    alt 新規タイトル
        Consumer->>TMDB: searchTmdbTv(title)
        Consumer->>AniList: searchAniList(title)
        TMDB-->>Consumer: tmdbId
        AniList-->>Consumer: aniListId, nativeTitle, status
        alt 識別失敗
            Note over Consumer: スキップ
        end
    end

    Note over Consumer,Provider: 既存 + 識別成功のタイトルをまとめて処理

    Consumer->>Provider: fetchEpisodeList(contentId)
    Provider-->>Consumer: エピソード詳細
    Consumer->>D1: upsert (タイトル+エピソード)
    Consumer->>D1: update (識別結果反映)
    Consumer-->>Queue: ack()

    Note over Queue,Consumer: 失敗時は msg.retry() → 最大3回リトライ
```

## キュー設定

| 項目 | 値 |
|---|---|
| キュー名 | `anime-tracker-sync-{staging\|production}` |
| バインディング | `SYNC_QUEUE` |
| 最大バッチサイズ | 5 |
| 最大リトライ回数 | 3 |
| Cron スケジュール | `0 */1 * * *`（毎時） |

## メッセージタイプ

| type | 概要 | 外部API |
|---|---|---|
| `check-new-episodes` | プロバイダから最新タイトル一覧を取得し、既存はエピソード更新、新規はTMDB/AniListで識別後に追加 | Hulu / Amazon + TMDB + AniList |

## 手動実行

`POST /api/sync` でキューにメッセージを直接投入できる。詳細は [sync-queue-api.md](sync-queue-api.md) を参照。
