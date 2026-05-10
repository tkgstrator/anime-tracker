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

## スナップショット (2026-05-10)

### Lambda 直叩き（素の取得件数）

`bun scripts/lambda/local.ts` で AWS を介さずローカル実行。Crunchyroll は VPN 必須なので未計測。

| provider | new_episode (内訳) | coming_soon | expiring |
|---|---:|---:|---:|
| amazon | **188** (NEW_EPISODE 169 / RECENTLY_ADDED 19) | 0 | **30** |
| hulu   | **88** (RECENTLY_ADDED 88) | **2** (COMING_SOON 2) | **17** |
| abema  | **89** (NEW_EPISODE 89) | 0 | 0 |

### ローカル D1（upsert 後）

`anime-tracker-staging` をローカル wrangler で集計。

| provider | (none) | NEW_EPISODE | RECENTLY_ADDED | COMING_SOON | EXPIRING | total |
|---|---:|---:|---:|---:|---:|---:|
| abema       | 866   | -   | -   | - | - | 866 |
| amazon      | 4,327 | 137 | 8   | - | 6 | 4,478 |
| crunchyroll | 1,684 | 21  | 168 | - | - | 1,873 |
| hulu        | 1,593 | -   | 78  | 2 | 8 | 1,681 |

メモ（Lambda vs D1 のギャップ）:

- **abema NEW_EPISODE 89 → D1 0 件**。`label.newest` 由来のバッジが D1 に反映されていない。実装側の追従漏れの可能性あり、要確認。
- **amazon NEW_EPISODE 169 → D1 137**。差分 32 は AniList 識別失敗または next_episode_date 上書き保護でリセットされた分。
- **hulu の new_episode は 88 件全部 RECENTLY_ADDED**。NEW_EPISODE は Lambda 段階でも 0 件で、`assetInfo` 由来の判定条件が厳しめ。
- **amazon EXPIRING 30 → D1 6 / hulu EXPIRING 17 → D1 8**。30 日以内の絞り込みは Lambda 側で済んでいるので、差分は AniList 識別ミスのはず。
- **amazon / abema の coming_soon は構造的に 0**（プロバイダ未対応）。hulu のみ 1〜数件で推移する想定。

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

### B. Lambda をローカル実行で素の件数（AWS 経由なし）

`scripts/lambda/local.ts` は `lambda/fetch/index.ts` の `handler` を直接呼ぶ。AWS を介さないので Crunchyroll 以外（amazon / hulu / abema）はネット越しの追加コスト無しで叩ける。レスポンスは `{ entries, fetchedAt }` 形式。

ワンライナーで件数を出す:

```bash
# title_list
for prov in amazon hulu abema; do
  for cat in new_episode coming_soon; do
    body=$(bun scripts/lambda/local.ts /title_list "{\"provider\":\"$prov\",\"category\":\"$cat\"}" 2>/dev/null | sed -n '/^===RESULT===$/,$p' | tail -n +2)
    echo "$prov/$cat: $(echo "$body" | jq '.entries | length')"
  done
done

# expiring
for prov in amazon hulu abema; do
  body=$(bun scripts/lambda/local.ts /expiring "{\"provider\":\"$prov\"}" 2>/dev/null | sed -n '/^===RESULT===$/,$p' | tail -n +2)
  echo "$prov/expiring: $(echo "$body" | jq '.entries | length')"
done
```

バッジ単位:

```bash
bun scripts/lambda/local.ts /title_list '{"provider":"amazon","category":"new_episode"}' 2>/dev/null \
  | sed -n '/^===RESULT===$/,$p' | tail -n +2 \
  | jq '.entries | group_by(.badge // "(none)") | map({badge: (.[0].badge // "(none)"), count: length})'
```

### C. AWS Lambda 経由で素の件数（Crunchyroll はこちら）

Crunchyroll は VPN（US Lambda）が必須なのでローカル実行不可。AWS を介して叩く。

```bash
scripts/lambda/invoke.sh title_list crunchyroll new_episode \
  | jq '.body | fromjson | .entries | length'
scripts/lambda/invoke.sh expiring amazon \
  | jq '.body | fromjson | .entries | length'
```

## 異常判定の目安

スナップショットからの相対変動で見る。絶対値は配信ラインナップで変わる。

- **0 件** … その provider × category が落ちている可能性大。Lambda 直叩き (B) で素の件数を確認、0 なら provider 側 API 変更、>0 なら sync / upsert 経路の問題。
- **半減以上** … API スキーマ変更でパースが部分的に壊れた可能性。Lambda レスポンスを `tee` で保存して diff。
- **EXPIRING が 0** … `0 0 * * *` cron の失敗を疑う。`scheduled-error` ログを確認。
- **NEW_EPISODE が極端に増加（>500）** … バッジリセットロジック（`badge: null` への戻し）が動いていない可能性。`SyncService.fetchTitleList` の `reset` ログを確認。
