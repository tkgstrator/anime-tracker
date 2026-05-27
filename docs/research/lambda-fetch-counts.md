# Lambda fetch / identify の取得・識別件数

`lambda/fetch` の各エンドポイントが provider × category ごとに何件返すか、また `/identify` で AniList と突き合わせた際の識別率を測ったメモ。

ローカルから AWS Lambda を介さずに `lambda/fetch/index.ts#handler` を直接呼んで計測している。Crunchyroll は VPN (US-east-1) 必須なのでローカル計測対象外。

## 測定方法

`scripts/lambda/count.ts` を実行する。

```sh
source .env
bun scripts/lambda/count.ts
```

スクリプトの動作:

1. provider × category の組み合わせごとに `handler({ rawPath, body })` を呼ぶ
2. `/title_list` 系は `entries[].title` を 10 件ずつ `/identify` に投げ、識別成功 / 失敗を集計
3. `/expiring` は応答に `title` を含まないため `/identify` はスキップ
4. 最後にサマリ表を出力

## 結果 (2026-05-27 計測)

| label                | fetched | identified | unidentified | 識別率 |
| -------------------- | ------: | ---------: | -----------: | -----: |
| amazon/new_episode   |     195 |        141 |           54 |  72.3% |
| amazon/expiring      |      19 |          — |            — |      — |
| hulu/new_episode     |      90 |         78 |           12 |  86.7% |
| hulu/coming_soon     |       2 |          2 |            0 |   100% |
| hulu/expiring        |      18 |          — |            — |      — |
| abema/new_episode    |      71 |         61 |           10 |  85.9% |

備考:

- **amazon/new_episode** の識別失敗が突出。後半バッチで 4/10, 2/10, 0/10 といった低ヒット帯が固まっており、Amazon ストアフロント固有の表記（副題・"〜編"・キャンペーン名混じり）が AniList 検索に通らない傾向。`src/lib/metadata/anilist.ts#cleanTitle` の改善余地あり。
- **amazon/expiring** は upstream が 21 件返したうち `expiring`（残り時間）情報を持つ 19 件のみ entries に入る。`lambda/fetch/index.ts#fetchExpiring` の `t.expiring` フィルタによる。
- **/expiring** 全般は `title` を返さない（`{ contentId, expiredAt, expiringSeason }` のみ）ため、`/identify` で識別したい場合は別途 `/title_info` を引くか catalog 側と `contentId` で突き合わせる必要がある。
- **hulu/coming_soon** は季節スラッグから抽出するため件数が少ない（今期で 2 件）。季節の変わり目に再計測すべき。

## Lambda 結果 → SYNC_QUEUE のファンアウト

`fetch` メッセージを処理した `queue` ワーカー (`src/queue.ts#queue`) が、Lambda の戻り値を元に何件の後続キューを投げるかも整理しておく。

```
fetch (1 message)
  ├─ lambda.fetchTitleList / fetchExpiring
  └─ service.fetch が contentIds[] を返す
        └─ category が new_episode / catalog のときのみ
              env.SYNC_QUEUE.send({ type: 'bulk_update', ... }) を ceil(M / 25) 回
```

- `service.fetch` が返す `contentIds` の中身 (`src/lib/sync.ts#fetchTitleList`):
  - `updateTargets`: 既存タイトルのうち `badge` が立っているもの (= 既知の `new_episode` / `recently_added` など)
  - `identifiedContentIds`: 今回新しく入ってきて AniList と紐付けに成功したもの
- `M = updateTargets + identifiedContentIds`
- `BULK_SIZE = 25` (`src/queue.ts:64`) で分割するので **`bulk_update` メッセージ数 = `ceil(M / 25)`**
- 各 `bulk_update` は内部で `service.update` を CONCURRENT=5, DELAY_MS=3000 で実行する。SYNC_QUEUE への再投入は無し
- **category が `expiring` / `coming_soon` のときは `bulk_update` を投げない** (`src/queue.ts:63`)。理由:
  - `expiring`: `service.fetchExpiring` が DB の `expiredAt` を直接更新するため、エピソード単位の再 fetch が要らない
  - `coming_soon`: badge と nextEpisodeDate を入れて終わり

### 2026-05-27 計測時の上限見積もり

`identified` を全部新規と仮定した上限値 (実際は既存タイトルが多いほど DB の `badge` 付き既存数次第で変動)。

| label              | fetched | identified | 上限 bulk_update 数 |
| ------------------ | ------: | ---------: | ------------------: |
| amazon/new_episode |     195 |        141 |   **6** (= ⌈141/25⌉) |
| amazon/expiring    |      19 |          — |                **0** |
| hulu/new_episode   |      90 |         78 |    **4** (= ⌈78/25⌉) |
| hulu/coming_soon   |       2 |          2 |                **0** |
| hulu/expiring      |      18 |          — |                **0** |
| abema/new_episode  |      71 |         61 |    **3** (= ⌈61/25⌉) |

実運用では DB に既知の badge 付きタイトルが残っているため、上記より増えることが多い。正確な値が欲しい場合は `service.fetch` を local D1 に対して走らせて返り値の長さを測る (DB を更新するので注意)。

## Discord 通知ペイロード

すべての通知は `src/lib/discord.ts#notify` を通り、以下の形に詰めて Webhook へ POST する:

```jsonc
{
  "embeds": [
    {
      "title": "<options.title>",
      "description": "<options.description>",
      "color": "<options.color ?? COLOR_ERROR>",   // 数値
      "fields": "<options.fields ?? []>",
      "thumbnail": { "url": "<options.thumbnailUrl>" },  // 指定時のみ
      "timestamp": "<ISO8601 (notify 呼び出し時刻)>"
    }
  ]
}
```

色 (`src/lib/discord.ts:19-21`):

| 定数            | 値         | 用途               |
| --------------- | ---------- | ------------------ |
| `COLOR_ERROR`   | `0xed4245` | 失敗 (デフォルト)  |
| `COLOR_WARN`    | `0xfee75c` | 部分失敗 (黄)      |
| `COLOR_SUCCESS` | `0x57f287` | 全成功 (緑)        |

### 呼び出し箇所

#### 1. Scheduled: キュー投入失敗 (`src/scheduled.ts:87`)

cron ハンドラ全体を try/catch していて、`SYNC_QUEUE.send` などが落ちた時に出る。

- **title**: `Scheduled: キュー投入失敗`
- **description**: エラーメッセージ (`e.message`)
- **color**: `COLOR_ERROR` (赤、デフォルト)
- **fields**:
  - `Cron` — `event.cron`、inline

#### 2. Queue: 最終リトライ失敗 (`src/queue.ts:144`)

メッセージ処理が例外を投げ、`message.attempts >= 3` になった時に出る。`message.retry()` 自体は毎回呼ぶが、この通知は最終リトライのみ。

- **title**: anime が引ければ `Queue: 最終リトライ失敗 — <anime.title>`、そうでなければ `Queue: 最終リトライ失敗`
- **description**: エラーメッセージを ` ```...``` ` で囲んだもの (改行込み)
- **color**: `COLOR_ERROR` (赤、デフォルト)
- **thumbnailUrl**: `anime?.imageUrl` (取得できれば)
- **fields** (下記 3 件):
  - `Type` — `message.body.type` (`fetch` / `update` / `bulk_update` / `anilist_sync` / `abema_archive`)、inline
  - `Attempts` — `String(message.attempts)`、inline
  - `Detail` — `message.body.message` を `JSON.stringify(..., null, 2)` した文字列を ` ```json ... ``` ` で囲んだもの (provider / contentId / animeId など)

該当 anime は `findAnimeForMessage` (`src/queue.ts:26`) で引く:

- `type === 'update'` → `(provider, contentId)` で検索
- `type === 'abema_archive'` → `animeId` で検索
- それ以外 → `null`

なので、`fetch` や `bulk_update` の最終失敗ではタイトルとサムネは付かない。

#### 3. Queue: バッチ完了 (`src/queue.ts:160`)

バッチ内で **1 件以上 ack できた** ときに出る (= `succeeded > 0` ガード)。全件失敗のバッチでは出ない (= 最終リトライ通知だけが残る)。

- **title**: `Queue: バッチ完了`
- **description**:
  - `failed > 0` → `成功 <succeeded> 件 / 失敗 <failed> 件`
  - `failed === 0` → `<succeeded> 件 正常に完了しました`
- **color**:
  - `failed > 0` → `COLOR_WARN` (黄)
  - `failed === 0` → `COLOR_SUCCESS` (緑)
- **fields**: なし

ここで言う `failed` は **最終リトライまで届いた件数** (= 通知 #2 が出た数) と一致する。一時失敗→次バッチで再試行のものは含まない。

### 通知タイミングの全体像

```
cron (scheduled.ts)
  └─ SYNC_QUEUE.send (失敗時 → 通知 #1 Scheduled: キュー投入失敗)

queue worker (queue.ts) バッチ受信
  ├─ メッセージごとに処理
  │    ├─ 例外 & attempts < 3 → retry (通知なし)
  │    └─ 例外 & attempts >= 3 → 通知 #2 + retry
  └─ バッチ末尾で succeeded > 0 なら 通知 #3 (色は failed の有無)
```

## 再現用スクリプト

`scripts/lambda/count.ts`。`JOBS` 配列を編集すれば対象を増減できる。AniList 側のレート制限を踏まないよう `/identify` は 10 件ごとに分割している。

## Crunchyroll を測りたい場合

`scripts/lambda/invoke.sh` 経由で US リージョンの `anime-tracker-fetch-us` を直接呼ぶ必要がある（ローカルから直接 fetch すると地域制限で 4xx）。
