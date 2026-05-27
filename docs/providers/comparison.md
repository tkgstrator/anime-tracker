# プロバイダ間データ比較

同一作品を Amazon Prime Video / Hulu / Crunchyroll で取得した `TitleInfo` の各フィールドがどう異なるかをまとめる。

## 比較対象作品

| 作品 | Amazon | Hulu | Crunchyroll |
|------|--------|------|-------------|
| 死亡遊戯で飯を食う。 | B0F88J8N9N | shiboyugi-... | GT00365787 |
| New パンスト | B0FF2WZYM4 | new-panty-... | GYNV02MJR |
| New パンスト (CENSORED版) | B0FFL2WFG8 | - | - |
| 劇場版 SAO -オーディナル・スケール- | B0FLDMCJ6W | sword-art-... | - |
| 聲の形 | B0D4RQ2FWW | - | GP5HJ84XV |

---

## TitleInfo トップレベル

### title

| 作品 | Amazon | Hulu | Crunchyroll |
|------|--------|------|-------------|
| 死亡遊戯 | 死亡遊戯で飯を食う。 | 死亡遊戯で飯を食う。 | SHIBOYUGI: Playing Death Games to Put Food on the Table |
| パンスト | New PANTY & STOCKING with GARTERBELT | New PANTY ＆ STOCKING with GARTERBELT【CENSORED版】 | Panty & Stocking with Garterbelt |
| パンスト (CENSORED) | New PANTY ＆ STOCKING with GARTERBELT【CENSORED版】 | - | - |
| SAO映画 | 劇場版 ソードアート・オンライン –オーディナル・スケール- | 劇場版 ソードアート･オンライン －オーディナル･スケール－ | - |
| 聲の形 | 映画 聲の形 | - | A Silent Voice |

- Amazon / Hulu は日本語タイトル。Crunchyroll は英語タイトル。
- Hulu は全角記号（＆、･、－）を使い、版情報（【CENSORED版】）が付くことがある。
- Amazon でも CENSORED 版は全角記号+版情報が付く（B0FFL2WFG8）。通常版（B0FF2WZYM4）は半角。
- Amazon / Hulu 間でも微妙な記号差（`&` vs `＆`、`・` vs `･`、`–` vs `－`）がある。
- Crunchyroll は旧作版（Panty & Stocking with Garterbelt）を返す場合がある。

### entityType

| 作品 | Amazon | Hulu | Crunchyroll |
|------|--------|------|-------------|
| 死亡遊戯 | tv | tv | tv |
| パンスト | tv | tv | tv |
| SAO映画 | **movie** | **tv** | - |
| 聲の形 | **movie** | - | **tv** |

- **Amazon は映画を `movie` として返すが、Hulu / Crunchyroll は常に `tv` を返す。**
- Hulu は entityType を常に `tv` 固定（映画も1エピソードのTVとして扱う）。
- Crunchyroll も映画を `tv` + 1シーズン1エピソードとして返す。

### maturityRating

| 作品 | Amazon | Hulu | Crunchyroll |
|------|--------|------|-------------|
| 死亡遊戯 | null | null | 14 |
| パンスト | 18 | null | - |
| SAO映画 | null | null | - |
| 聲の形 | null | null | 14 |

- **Hulu は常に null**（レーティング情報を返さない）。
- Amazon は一部の作品でのみレーティングを返す。
- Crunchyroll は比較的一貫してレーティングを返す。

### description

- 全プロバイダで説明文を返すが、**言語がプロバイダの地域に依存**（Amazon/Hulu=日本語、Crunchyroll=英語）。
- Amazon / Hulu 間でもテキストは微妙に異なる（表記ゆれ：`《》` vs `〈〉`、`＜＞`、半角・全角の差）。

### imageUrl

- Amazon: `m.media-amazon.com/images/S/pv-target-images/...`
- Hulu: `images.prod.hjholdings.tv/...`
- Crunchyroll: `www.crunchyroll.com/imgsrv/display/thumbnail/...`
- それぞれ独自のCDNから配信。R2 に webp 変換して保存し、UUIDv5 で統一キーを生成する。

---

## Season レベル

### seasonId

| プロバイダ | 形式 | 例 |
|------------|------|----|
| Amazon | ASIN（例: `B0G5DD7BVB`）。映画は contentId をそのまま使用 | `B0G5DD7BVB` |
| Hulu | `hulu-{slug}-s{number}` の合成ID | `hulu-shiboyugi-...-s1` |
| Crunchyroll | Crunchyroll内部ID + ロケール | `GS00365788JAJP` |

### displayName

| 作品 | Amazon | Hulu | Crunchyroll |
|------|--------|------|-------------|
| 死亡遊戯 | シーズン1 | シーズン1 | Season 1 |
| パンスト | シーズン1 | シーズン1 | Season 1 |
| SAO映画 | **本編** | シーズン1 | - |
| 聲の形 | **本編** | - | A Silent Voice |

- Amazon は映画の場合 `本編` を使用。TV は `シーズンN`。
- Hulu は映画でも `シーズン1`（TV扱いのため）。
- Crunchyroll は英語表記。映画の場合はタイトル名をそのまま使うことがある。

### seasonNumber / episodes count

| 作品 | seasons | episodes | 備考 |
|------|---------|----------|------|
| 死亡遊戯 | 1 | 11 | 全プロバイダ一致 |
| パンスト | 1 | Amazon: 13, Hulu: 13 | 件数は一致するが番号体系が異なる |
| SAO映画 | 1 | 1 | 全プロバイダ一致 |
| 聲の形 | 1 | 1 | 全プロバイダ一致 |

---

## Episode レベル

### episodeNumber

| 作品 | Amazon | Hulu | Crunchyroll | 備考 |
|------|--------|------|-------------|------|
| 死亡遊戯 | 1-11 (連番) | 1-11 (連番) | 1-11 (連番) | 一致 |
| パンスト | 1-13 (連番) | 1,2,4,7,10,13,14,16,19,22,24,27,29 | 1-13 (連番) | **Hulu のみ不一致** |

- **Amazon / Crunchyroll は放送回（配信パッケージ）ごとに連番を振る**（1話に複数話含む場合でも1つの番号）。
- **Hulu は原作話数ベースの番号を使い、欠番がある**（2話・3話をまとめた回は `#2` のみ、`#3` はスキップ）。

### title

| 作品 | Amazon | Hulu | Crunchyroll |
|------|--------|------|-------------|
| 死亡遊戯 ep1 | `#01 All You Need Is ----` | `All You Need Is ----` | `All You Need Is ----` |
| パンスト ep1 | `#1` | `パンティ アンド ストッキング ホームカミング` | - |

- Amazon は話数プレフィックス（`#01`）が付くことがある。Hulu / Crunchyroll はタイトルのみ。
- パンストの場合、Amazon のタイトルは `#N` 形式（話数番号のみ）、Hulu は各話の正式タイトル。

### duration (秒)

| 作品 | Amazon | Hulu | Crunchyroll | 備考 |
|------|--------|------|-------------|------|
| 死亡遊戯 ep1 | 2859 | 2860 | 2860 | ±1秒の誤差 |
| 死亡遊戯 ep2 | 1429 | 1430 | 1430 | ±1秒の誤差 |
| SAO映画 | 7216 | 7216 | - | 一致 |
| 聲の形 | 7782 | - | 7782 | 一致 |

- Amazon の映画は `headerDetail.duration` から取得（ウィジェット API はエピソードを返さないため）。
- TVシリーズでは Amazon が 1秒短くなる傾向（切り捨て vs 四捨五入の差）。
- Hulu / Crunchyroll は概ね一致。

### releaseDate

| 作品 ep1 | Amazon | Hulu | Crunchyroll |
|-----------|--------|------|-------------|
| 死亡遊戯 | 2026-01-06T15:00:00.000Z | 2026-01-07T14:00:00.000Z | 2026-01-07T15:00:00.000Z |
| パンスト | 2025-07-09T15:00:00.000Z | 2025-07-16T16:00:00.000Z | 2018-02-23T01:00:00.000Z |
| パンスト (CENSORED) | 2025-07-16T15:00:00.000Z | - | - |
| SAO映画 | 2017-08-24T15:00:00.000Z | 2021-10-07T15:00:00.000Z | - |
| 聲の形 | 2016-09-16T15:00:00.000Z | - | 2023-06-09T00:00:00.000Z |

- 全プロバイダ **ISO 8601 UTC** (`Z` サフィックス) に統一済み。
- Amazon: 元データは JST 日付（`YYYY年M月D日`）で、`dayjs.tz('Asia/Tokyo')` で UTC に変換。時刻は `00:00:00 JST` = `15:00:00Z` 固定。TV・映画ともに `headerDetail.releaseDate` から取得。
- Hulu: UTC を返す。Hulu 配信開始時刻（JST 23:00 or 01:00 頃）。
- Crunchyroll: UTC を返す。旧作は配信開始日が異なることがある（パンストは旧作版の日付）。
- Amazon と Hulu/Crunchyroll で映画の releaseDate が大きく異なる場合がある（Amazon は劇場公開日、他は配信開始日）。

### hasSubtitles / hasDub

| 作品 | Amazon | Hulu | Crunchyroll |
|------|--------|------|-------------|
| 死亡遊戯 | sub=false, dub=false | sub=false, dub=false | sub=true, dub=false |
| パンスト | sub=true, dub=true | sub=false, dub=false | sub=true, dub=false |
| パンスト (CENSORED) | sub=false, dub=false | - | - |
| 聲の形 | sub=true, dub=false | - | sub=true, dub=false |

- **Hulu は常に hasSubtitles=false, hasDub=false**（字幕・吹替情報を返さない）。
- Amazon: ウィジェット API のエピソード詳細から取得。映画の場合はページ HTML の `headerDetail` から取得。
- Crunchyroll: 日本語字幕の有無を hasSubtitles として返す（日本語音声 + 日本語字幕あり → sub=true）。
- プロバイダ間で「字幕」の定義が異なるため、単純比較はできない。

### benefitId (Episode レベル)

| プロバイダ | 値 | 例 |
|------------|-----|-----|
| Amazon | `prime` / `danime` / `null` | パンスト通常版=`prime`, CENSORED版=`danime`, 映画フォールバック=`null` |
| Hulu | `hulu` (固定) | 常に `hulu` |
| Crunchyroll | `crunchyroll` (固定) | 常に `crunchyroll` |

- タイトルレベルの `benefitId` は廃止済み。エピソード単位でのみ保持する。
- Amazon はエピソードごとに `prime` / `danime` / レンタルのみが変わりうる。

---

## まとめ: プロバイダ間で一致するフィールド

| フィールド | 一致度 | 備考 |
|------------|--------|------|
| entityType | **不一致** | Amazon のみ movie を区別。Hulu/Crunchyroll は常に tv |
| seasons 数 | 一致 | |
| episodes 数 | 一致 | |
| episodeNumber | **不一致の場合あり** | Hulu は原作話数ベース、Amazon/Crunchyroll は配信パッケージ連番 |
| title | 不一致 | 言語・表記ゆれ・プレフィックスの有無 |
| duration | ほぼ一致 | ±1秒。映画も含め全プロバイダで取得可能 |
| releaseDate | ほぼ一致 | 全プロバイダ UTC 統一済み。映画は劇場公開日 vs 配信開始日の差あり |
| maturityRating | 不一致 | Hulu は常に null |
| hasSubtitles/hasDub | 不一致 | 定義がプロバイダごとに異なる。Hulu は常に false |
| benefitId | プロバイダ固有 | エピソード単位でのみ保持 |

## 同期時に信頼できるキー

プロバイダ間でデータを突き合わせる際に使えるのは:
1. **seasons 数** — 一致する
2. **episodes 数（シーズンごと）** — 一致する
3. **duration** — ±数秒の誤差を許容すれば突き合わせに利用可能（映画含む）
4. **releaseDate** — UTC 統一済み。TV は日付レベルでの比較が可能。映画は劇場公開日 vs 配信開始日の差があるため注意
