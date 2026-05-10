# プロバイダ別 バッジ取得件数

各プロバイダがアニメ一覧をどのバッジ（カテゴリ）でどれくらい取ってこれるかをまとめる。

スケジュール実行（`src/scheduled.ts`）でズレ・欠損が出ていないかをスナップショットと突き合わせて確認するためのもの。

## 取得カテゴリと付与バッジ

Queue から `SyncService.fetch()` が `provider × category` 単位で呼ばれる。各プロバイダの実装 (`src/lib/providers/*/index.ts`) に応じて付与可能なバッジが決まる。

| プロバイダ | new_episode | coming_soon | expiring | catalog |
|---|---|---|---|---|
| abema       | NEW_EPISODE のみ判定 (`label.newest`) ※badge は現状 D1 に未反映 | - | - | 全件 |
| amazon      | NEW_EPISODE / RECENTLY_ADDED (バッジ文字列で判定) | - | EXPIRING (残日数で判定) | 全件 |
| crunchyroll | NEW_EPISODE / RECENTLY_ADDED (`item.new` で判定) | - | - | 全件 |
| hulu        | NEW_EPISODE / RECENTLY_ADDED (assetInfo / palette) | COMING_SOON (`coming_soon_text`) | EXPIRING (publish_end_at asc) | 全件 |

cron は `src/scheduled.ts:39-58` のとおり。

- `0 */1 * * *` … 4 provider × {new_episode, coming_soon} を毎時 enqueue
- `0 0 * * *` … 4 provider × expiring を毎日 enqueue
- `0 4 * * *` … abema_archive

## スナップショット (2026-05-10, local D1)

`anime-tracker-staging` をローカル wrangler で集計。

| provider | (none) | NEW_EPISODE | RECENTLY_ADDED | COMING_SOON | EXPIRING | total |
|---|---:|---:|---:|---:|---:|---:|
| abema       | 866   | -   | -   | - | - | 866 |
| amazon      | 4,327 | 137 | 8   | - | 6 | 4,478 |
| crunchyroll | 1,684 | 21  | 168 | - | - | 1,873 |
| hulu        | 1,593 | -   | 78  | 2 | 8 | 1,681 |

メモ:

- abema は label.newest を見ているが D1 の `badge` 列に NEW_EPISODE が反映されていない。実装側の追従漏れの可能性あり、要確認。
- hulu の new_episode は実態として RECENTLY_ADDED に寄っており NEW_EPISODE は 0 件。`assetInfo` 由来の判定条件が厳しめ。
- amazon EXPIRING / hulu EXPIRING は 1 桁台で推移する想定（30 日以内）。0 になっていたら expiring cron が落ちてる疑い。

## 集計方法

### A. ローカル D1 を直接集計（早い）

`.env` を `source` してから wrangler を叩く（[memory: wrangler 実行前は source .env 必須]）。

```bash
source .env
bunx wrangler d1 execute anime-tracker-staging --local \
  --command "SELECT provider, COALESCE(badge,'(none)') AS badge, COUNT(*) AS cnt FROM Anime GROUP BY provider, badge ORDER BY provider, badge;"
```

合計件数だけ知りたい場合:

```bash
source .env
bunx wrangler d1 execute anime-tracker-staging --local \
  --command "SELECT provider, COUNT(*) AS total FROM Anime GROUP BY provider ORDER BY provider;"
```

本番 D1 を見るときは `--local` を `--remote` に差し替える。

### B. Lambda を直接叩いて素の件数（D1 upsert 前）

Lambda レスポンスの `titles[]` の長さが「プロバイダから今この瞬間に取れる件数」。AniList 識別前 / D1 upsert 前なので、ズレた時の切り分けに使う。

```bash
# title_list (new_episode / coming_soon)
scripts/lambda/invoke.sh title_list amazon new_episode | jq '.body | fromjson | .titles | length'
scripts/lambda/invoke.sh title_list amazon coming_soon | jq '.body | fromjson | .titles | length'

scripts/lambda/invoke.sh title_list hulu new_episode       | jq '.body | fromjson | .titles | length'
scripts/lambda/invoke.sh title_list hulu coming_soon       | jq '.body | fromjson | .titles | length'
scripts/lambda/invoke.sh title_list crunchyroll new_episode | jq '.body | fromjson | .titles | length'
scripts/lambda/invoke.sh title_list abema new_episode       | jq '.body | fromjson | .titles | length'

# expiring (毎日 cron)
scripts/lambda/invoke.sh expiring amazon | jq '.body | fromjson | .entries | length'
scripts/lambda/invoke.sh expiring hulu   | jq '.body | fromjson | .entries | length'
```

バッジ単位で見たい場合は `.titles | group_by(.badge)` する:

```bash
scripts/lambda/invoke.sh title_list amazon new_episode \
  | jq '.body | fromjson | .titles | group_by(.badge) | map({badge: .[0].badge, count: length})'
```

## 異常判定の目安

スナップショットからの相対変動で見る。絶対値は配信ラインナップで変わる。

- **0 件** … その provider × category が落ちている可能性大。Lambda 直叩き (B) で素の件数を確認、0 なら provider 側 API 変更、>0 なら sync / upsert 経路の問題。
- **半減以上** … API スキーマ変更でパースが部分的に壊れた可能性。Lambda レスポンスを `tee` で保存して diff。
- **EXPIRING が 0** … `0 0 * * *` cron の失敗を疑う。`scheduled-error` ログを確認。
- **NEW_EPISODE が極端に増加（>500）** … バッジリセットロジック（`badge: null` への戻し）が動いていない可能性。`SyncService.fetchTitleList` の `reset` ログを確認。
