# Sync Queue アーキテクチャ

## 概要

Cloudflare Workers (Cron Trigger) → Queue → Lambda (日本IP) → D1 のパイプラインで、各プロバイダのタイトル・エピソード情報を定期取得する。

## Cron スケジュール

| Cron | 頻度 | 処理内容 |
|---|---|---|
| `0 */1 * * *` | 毎時 | `new_episode` + `coming_soon` を全プロバイダで fetch キューに投入 |
| `0 0 * * *` | 毎日 0時 | `expiring` を全プロバイダで fetch キューに投入 |
| `0 3 * * *` | 毎日 3時 | `catalog` を全プロバイダで fetch キューに投入 |
| `0 4 * * *` | 毎日 4時 | ABEMA HLS鍵未取得アニメを abema_archive キューに投入 |
| `0 5 * * SUN` | 毎週日曜 5時 | AniList メディア情報を年度ごとに anilist_sync キューに投入 (30秒ずつ遅延) |

対象プロバイダ: `hulu`, `amazon`, `crunchyroll`, `abema`

## メッセージタイプ

| type | 投入元 | 概要 |
|---|---|---|
| `fetch` | Cron (scheduled.ts) | Lambda でタイトル一覧取得 → D1で識別・絞り込み → update キューに投入 |
| `update` | fetch 処理後 / 手動 | Lambda でタイトル詳細取得 → D1 差分更新 |
| `bulk_update` | 手動 (admin API) | contentId リストをまとめて update キューに投入するだけ |
| `anilist_sync` | Cron (日曜5時) | AniList APIから年度別アニメ情報を取得して D1 の anilist_media テーブルを更新 |
| `abema_archive` | Cron (毎日4時) / 手動 | ABEMA HLS鍵未取得エピソードの暗号化キーを取得して D1 に保存 |

## 全体フロー

```
[Cron: 毎時]
    ↓
scheduled.ts
    ↓ Queue.send({ type: "fetch", provider, category: "new_episode" | "coming_soon" })
    ↓ (全プロバイダ × 全カテゴリ)

[Queue Consumer]
    ↓ fetch メッセージ受信
    ↓
SyncService.fetch()
    ├─ Lambda /title_list → プロバイダのタイトル一覧を全件取得
    ├─ D1: anime + unidentifiedAnime テーブルで既知 contentId を除外
    ├─ 新規タイトル → D1 の anilist_media テーブルで正規化タイトル検索して識別
    │       ├─ 識別成功 → anime テーブルに INSERT
    │       └─ 識別失敗 → unidentifiedAnime テーブルに upsert
    ├─ 既存タイトル → badge / nextEpisodeDate を更新
    └─ badge 付き既存タイトル + 新規識別済み → update キューに投入
    
    ↓ update メッセージ受信 (contentId 1件ずつ)
    ↓
SyncService.update()
    ├─ Lambda /title_info → タイトル詳細 (シーズン・エピソード) を取得
    └─ D1: シーズン・エピソードを差分 upsert

[バッチ完了後]
    └─ Discord Webhook → "Queue: バッチ完了" 通知 (成功N件)
       失敗が3回に達した場合 → Discord Webhook → "Queue: 最終リトライ失敗" 通知
```

## fetch フローの絞り込みロジック

```
Lambda から取得した全タイトル (例: Abema 71件)
    │
    ├─ [new_episode の場合] badge=COMING_SOON を除外
    │
    ├─ knownIds チェック (anime + unidentifiedAnime)
    │       └─ 既知 → スキップ (新規のみ残す)
    │
    ├─ 新規タイトル → D1 の anilist_media で識別 (20件ずつバッチ)
    │       ├─ 識別成功 → anime INSERT → update キューに積む
    │       └─ 識別失敗 → unidentifiedAnime upsert (スキップ)
    │
    ├─ 既存タイトル → badge / nextEpisodeDate 更新
    │
    └─ badge 付き既存タイトル → update キューに積む
       (badge なし = 変化なし = スキップ)
```

## badge の種類と付与ルール

| badge | 意味 | カテゴリ |
|---|---|---|
| `NEW_EPISODE` | 新着エピソードあり | new_episode |
| `RECENTLY_ADDED` | 最近追加 | new_episode |
| `COMING_SOON` | 近日配信予定 | coming_soon |
| `EXPIRING` | 配信終了間近 | expiring |

badge の付与はプロバイダ実装が判断する（Worker側は保存するだけ）:

| プロバイダ | NEW_EPISODE | RECENTLY_ADDED |
|---|---|---|
| Crunchyroll | `item.new === true` | `item.new === false` |
| Hulu | badge_text が新着系 | それ以外の更新済み |
| Amazon | badge未設定を強制昇格 | APIのバッジそのまま |
| Abema | 一律 NEW_EPISODE に固定 | 使わない |

## Lambda エンドポイント

| パス | 処理 |
|---|---|
| `POST /title_list` | プロバイダのタイトル一覧取得 (`new_episode` / `coming_soon` / `catalog`) |
| `POST /expiring` | 配信終了間近タイトル一覧取得 |
| `POST /title_info` | タイトル詳細 + シーズン・エピソード取得 |
| `POST /identify` | AniList API でタイトル識別 (現在未使用: D1 ローカル検索に移行済み) |

Worker → Lambda の通信は AWS SigV4 署名 (Lambda Function URL)。

## AniList 識別

現在は Lambda `/identify` (AniList API 直接呼び出し) は使用しておらず、事前に `anilist_sync` cron で同期済みの D1 `anilist_media` テーブルをローカル検索する (`identifyTitlesViaD1`)。

毎週日曜 5時の `anilist_sync` cron が年度ごとに AniList API を叩いて `anilist_media` を更新する (2000年〜翌年分、1年あたり30秒遅延で rate limit 対策)。

## キュー設定

| 項目 | 値 |
|---|---|
| キュー名 | `anime-tracker-sync-{staging\|production}` |
| バインディング | `SYNC_QUEUE` |
| 最大バッチサイズ | 5 件 |
| 最大並行数 | 2 Worker |
| 最大リトライ回数 | 3 回 |

並行数とバッチサイズを絞っているのはプロバイダのスクレイピング先をレートリミットしないため。

## 手動実行

`POST /api/queues` でキューを経由せず SyncService を直接実行できる。詳細は [sync-queue-endpoints.md](sync-queue-endpoints.md) を参照。
