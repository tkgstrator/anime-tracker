# Lambda fetch ハンドラ 処理フロー

`lambda/fetch/index.ts` の処理を Mermaid でまとめたもの。

- 役割: 日本 IP (ap-northeast-1) が必要な Provider 取得と AniList 照合の代行
- 副作用: KV / DB は触らない（fetch → 整形 → JSON 返却のみ）
- 呼び出し元: Workers 側の `src/lib/lambda.ts` (`createFetchClient`) が SigV4 署名付き POST で叩く
- Provider 振り分け: 既定は JP Lambda、`crunchyroll` のみ US Lambda

## 1. エントリーポイント (handler)

```mermaid
flowchart TD
  Start([event 受信]) --> Parse[path = event.rawPath ?? event.path<br/>body = JSON.parse event.body]
  Parse --> Route{path}

  Route -->|/expiring| ExA{provider あり?}
  ExA -->|No| E400a[400 Missing provider]
  ExA -->|Yes| ExFlow[/fetchExpiring/]

  Route -->|/title_list| TlA{provider あり?}
  TlA -->|No| E400b[400 Missing provider]
  TlA -->|Yes| TlFlow[/fetchTitleList/]

  Route -->|/title_info| TiA{provider と contentId あり?}
  TiA -->|No| E400c[400 Missing provider or contentId]
  TiA -->|Yes| TiFlow[/fetchTitleInfo/]

  Route -->|/identify| IdA{titles 配列?}
  IdA -->|No| E400d[400 Missing titles array]
  IdA -->|Yes| IdFlow[/identifyTitles/]

  Route -->|その他| E404[404 Unknown path]

  ExFlow --> Resp[statusCode + JSON body]
  TlFlow --> Resp
  TiFlow --> Resp
  IdFlow --> Resp
  E400a --> Resp
  E400b --> Resp
  E400c --> Resp
  E400d --> Resp
  E404 --> Resp

  Resp --> End([return])

  Parse -.例外.-> Catch[500 message+stack を console.error]
  Catch --> End
```

`getProvider(name)` は `hulu | crunchyroll | abema | amazon` のいずれかを返す（既定は Amazon）。

## 2. POST /expiring  (配信終了間近)

```mermaid
flowchart TD
  S([fetchExpiring provider]) --> P[provider.fetchTitleList<br/>category=expiring]
  P --> F[expiring を持つタイトルのみ抽出]
  F --> M[remainingHours を now に加算<br/>JST 0:00 へ丸めて ISO 化]
  M --> N{entries.length === 0?}
  N -->|Yes| Err[500 No expiring entries found]
  N -->|No| Ok[200 fetchedAt + entries<br/>contentId / expiredAt / expiringSeason]
```

## 3. POST /title_list  (new_episode / coming_soon / catalog)

```mermaid
flowchart TD
  S([fetchTitleList provider, category]) --> V{category は<br/>new_episode | coming_soon | catalog?}
  V -->|No| Err[400 Invalid category]
  V -->|Yes| Fetch[provider.fetchTitleList category]
  Fetch --> Map[各タイトルを整形<br/>contentId, title, description,<br/>entityType, imageUrl,<br/>maturityRating, nextEpisodeDate, badge]
  Map --> Ok[200 fetchedAt + entries]
```

## 4. POST /title_info  (タイトル詳細)

```mermaid
flowchart TD
  S([fetchTitleInfo provider, contentId]) --> F[provider.fetchTitleInfo contentId]
  F --> Log[seasons.length をログ出力]
  Log --> Ok[200 detail そのまま<br/>TitleInfoSchema 準拠]
```

## 5. POST /identify  (AniList 照合)

```mermaid
flowchart TD
  S([identifyTitles rawTitles]) --> E{length === 0?}
  E -->|Yes| Empty[200 results: empty]
  E -->|No| L{length > 50?}
  L -->|Yes| Over[400 titles must be 50 or fewer]
  L -->|No| Clean[各タイトルを cleanTitle で正規化]
  Clean --> Q[buildBatchQuery で<br/>q0..qN の Page クエリを合成]
  Q --> Req[fetchWithRetry POST graphql.anilist.co]

  Req --> R429{status === 429?}
  R429 -->|Yes| Wait[Retry-After 最大 5s 待機して再試行]
  R429 -->|No| OkCheck{res.ok?}
  Wait --> OkCheck
  OkCheck -->|No| Bad[502 AniList API error]
  OkCheck -->|Yes| Parse[各 qi.media 0 を MetadataMediaSchema.safeParse]

  Parse --> Loop{安全に取れた?}
  Loop -->|No| Null[結果 null]
  Loop -->|Yes| YQ[year = seasonYear ?? startDate.year<br/>quarter = season → SEASON_TO_QUARTER<br/>            or month → MONTH_TO_QUARTER]
  YQ --> YQv{year か quarter が null?}
  YQv -->|Yes| Null
  YQv -->|No| Hit[aniListId, title, status, year, quarter]

  Null --> Out[results 配列に詰めて 200]
  Hit --> Out
```

補足:

- `MEDIA_FIELDS` は `id / title.native / countryOfOrigin / status / season / seasonYear / startDate{year,month,day}` を取得
- `SEASON_TO_QUARTER`: WINTER=0 / SPRING=1 / SUMMER=2 / FALL=3
- `MONTH_TO_QUARTER`: 1-3月=0, 4-6月=1, 7-9月=2, 10-12月=3
- `fetchWithRetry` は 429 のときだけ 1 回だけ再試行（Retry-After は 5 秒で頭打ち）

## 6. 上流から見た呼び出し関係

```mermaid
flowchart LR
  W[Workers<br/>src/lib/lambda.ts<br/>createFetchClient] -->|aws4fetch SigV4| FU[Lambda Function URL]
  FU --> H[handler index.ts]
  H -->|provider=crunchyroll| US[(US Lambda)]
  H -->|それ以外| JP[(JP Lambda<br/>ap-northeast-1)]
  H --> AL[(AniList GraphQL)]
  H --> PR[(各 Provider:<br/>Abema / Amazon / Hulu / Crunchyroll)]
```

呼び出し側のクライアントは `src/lib/lambda.ts:61` を参照。レスポンスは `src/schemas/lambda.dto.ts` の各 Schema (`ExpiringResponseSchema` / `TitleListResponseSchema` / `TitleInfoSchema` / `IdentifyResponseSchema`) で `safeParse` 検証している。
