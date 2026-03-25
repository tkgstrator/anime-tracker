# nextEpisodeDate 更新ロジック

## 概要

`nextEpisodeDate` は「次回エピソードの配信日時」を表すカラム（`anime.next_episode_date`、nullable DateTime、UTC）。
フロントエンドの「もうすぐ配信！」セクションや、API の `upcoming=true` フィルタで使用される。

---

## データソース

| ソース | タイミング | データの由来 |
|--------|-----------|-------------|
| browse API (`Title.nextEpisodeDate`) | fetch 時 | Hulu: `badge_text_end_at` (JST → ISO 8601 変換)、Amazon: なし (`null`) |
| エピソード `releaseDate` | update 時 | 各プロバイダの詳細ページから取得した全エピソードの配信日 |

---

## 処理フロー

### 全体の流れ

```
Cron (毎時) ─→ scheduled()
                 │
                 ├─ Queue: { type: "fetch", provider: "hulu" }
                 └─ Queue: { type: "fetch", provider: "amazon" }
                          │
                          ▼
                    queue() ─→ SyncService.fetch()
                                 │
                                 ├─ 新規タイトル → DB INSERT (nextEpisodeDate セット)
                                 ├─ 既存タイトル → nextEpisodeDate UPDATE
                                 └─ return contentIds
                                          │
                                          ▼
                                    Queue: { type: "update", contentId, provider }
                                          │
                                          ▼
                                    queue() ─→ SyncService.update()
                                                 │
                                                 └─ エピソードから nextEpisodeDate 再計算 → DB UPDATE
```

### fetch 時: nextEpisodeDate の書き込み

```
fetch() 開始
  │
  ▼
provider.fetchTitleList({ newEpisodesOnly: true })
  │  ※ Hulu: badge_text_end_at → normalizeHuluDate() → Title.nextEpisodeDate
  │  ※ Amazon: Title.nextEpisodeDate = null (常に)
  │
  ▼
┌─────────────────────────────────┐
│ 新規タイトル (DB に未登録)       │
│                                 │
│  t.nextEpisodeDate              │
│    │                            │
│    ▼                            │
│  parseFutureDate(dateStr)       │
│    ├─ null/undefined → null     │
│    ├─ 過去の日付     → null     │  ← ★ 過去なら捨てる
│    └─ 未来の日付     → Date     │
│    │                            │
│    ▼                            │
│  anime.create({ nextEpisodeDate }) │
└─────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 既存タイトル (DB に登録済み)                   │
│                                               │
│  t.nextEpisodeDate が truthy か？              │
│    ├─ No  → ★ スキップ (UPDATE しない)         │  ← ★ 問題1
│    └─ Yes                                     │
│         │                                     │
│         ▼                                     │
│       parseFutureDate(dateStr)                │
│         ├─ 過去の日付 → null                   │  ← ★ 問題2: null で上書き
│         └─ 未来の日付 → Date                   │
│         │                                     │
│         ▼                                     │
│       anime.update({ nextEpisodeDate })       │
└──────────────────────────────────────────────┘
```

### update 時: nextEpisodeDate の再計算

```
update() 開始
  │
  ▼
provider.fetchTitleInfo(contentId)
  │  ※ 詳細ページから全シーズン・全エピソードを取得
  │
  ▼
DB から現在の nextEpisodeDate を取得
  │
  ▼
DB の nextEpisodeDate > now か？
  ├─ Yes → nextEpisodeDate を更新しない (fetch で設定された値を維持)
  └─ No (過去 or null)
       │
       ▼
     computeNextEpisodeDate(detail.seasons)
       │
       │  全エピソードの releaseDate を走査:
       │    ├─ 未来の releaseDate がある → 最も近い日付をセット
       │    └─ 全て過去               → null をセット
       │
       ▼
     anime.update({ nextEpisodeDate })
```

---

## 問題点

### 問題 1: Amazon のタイトルは fetch 時に nextEpisodeDate が設定されない

Amazon の browse API は `nextEpisodeDate` を返さない（常に `null`）。
既存タイトルの更新ループ（sync.ts L227）は `t.nextEpisodeDate` が truthy な場合のみ実行されるため、
Amazon タイトルは fetch 段階では一切 `nextEpisodeDate` が書き込まれない。

→ update で `computeNextEpisodeDate()` が正しく動けば問題ないが、update が失敗・スキップされると永久に null。

### 問題 2: fetch → update の実行順で値が消える (修正済み)

update 時に DB 上の `nextEpisodeDate` が未来なら再計算をスキップするよう修正。
fetch で設定された browse API 由来の値が update で上書きされなくなった。

### 問題 3: parseFutureDate の実行タイミングが早すぎる

`parseFutureDate` は「fetch 実行時点で過去なら null」とするが、
同期処理のバッチ全体で数分〜数十分かかる場合、fetch 時点では未来だった日付が
update 処理時には過去になるケースが想定される。

ただしこれは軽微で、実際には数時間先の日付がほとんど。

### 問題 4: nextEpisodeDate を持たないタイトルが fetch でクリアされない

既存タイトルで `t.nextEpisodeDate` が falsy の場合、fetch ではそのタイトルの
`nextEpisodeDate` に触れない（L227 のフィルタでスキップ）。
これ自体は正しいが、過去に設定された `nextEpisodeDate` が古いまま残り続ける
可能性がある（update がそれを null にしてくれることを期待している）。

---

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `src/lib/sync.ts` | `SyncService.fetch()`, `SyncService.update()`, `parseFutureDate()`, `computeNextEpisodeDate()` |
| `src/lib/providers/hulu/index.ts` | `vodItemToTitle()` — `badge_text_end_at` → `nextEpisodeDate` |
| `src/lib/providers/hulu/detail.ts` | `normalizeHuluDate()` — Hulu 日付形式を ISO 8601 に変換 |
| `src/lib/providers/amazon/index.ts` | Amazon は `nextEpisodeDate` を返さない |
| `src/scheduled.ts` | Cron トリガー → fetch メッセージをキューに投入 |
| `src/queue.ts` | キューコンシューマ — fetch → update の連鎖 |
| `src/routes/anime.ts` | API — `upcoming=true` → `nextEpisodeDate: { not: null }` でフィルタ |
