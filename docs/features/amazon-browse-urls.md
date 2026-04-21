# Amazon Prime Video Browse API

## serviceToken Structure

The `serviceToken` is a `v0_` prefixed URL-safe Base64 string containing a protobuf-encoded message. It encodes the search parameters, pagination cursor, and page context needed by the `paginateCollection` API.

### Protobuf Schema

```
message ServiceToken {
  string type       = 2;   // "query" (browse) or "hpage" (pagination) or "filter" (expiring)
  uint32 flag       = 3;   // 1 (browse) or 0 (pagination)
  string page_id    = 4;   // "browse" (pagination only)
  string variant    = 5;   // "default"
  string position   = 6;   // "center"
  string widget     = 7;   // "search"
  string reserved   = 15;  // "" (empty)
  bytes  nested     = 16;  // Nested message (see below)
}

message Nested {
  string search_params = 3;   // URL query params (see below)
  string keyword       = 4;   // Search keyword (default: "")
  uint32 flag1         = 6;   // 0
  string cursor        = 7;   // Pagination cursor JSON (pagination only)
  uint32 page_size     = 10;  // Items per page, e.g. 20 (pagination only)
  uint32 flag2         = 14;  // 0
}
```

### Encoding Flow

```
Search Params → protobuf encode → Uint8Array → btoa → URL-safe Base64 → "v0_" prefix
```

1. Build URL query parameters string (see below)
2. Embed into the nested protobuf message (field 16)
3. Encode the outer message to `Uint8Array`
4. Convert to Base64, then replace `+` → `-`, `/` → `_` for URL safety
5. Prepend `v0_` prefix

Implementation: [`src/lib/providers/amazon/protobuf.ts`](../../src/lib/providers/amazon/protobuf.ts), [`src/lib/providers/amazon/browse.ts`](../../src/lib/providers/amazon/browse.ts)

### Pagination Cursor

For pagination tokens, the nested message includes a JSON cursor string in field 7:

```json
{"sbsin": 0, "cursize": 0, "presize": 0}
```

- `sbsin` — Start index offset
- `cursize` — Total number of items available (populated in server responses)
- `presize` — Previous page size

## Search Parameters

The `search_params` field (nested field 3) is a URL-encoded query string with the following parameters:

### Offer Types

| Offer | `qs-offer_type` | `field-ways_to_watch` | `pv_browse_internal_offer` |
|-------|------------------|-----------------------|----------------------------|
| svod (Prime Video) | `1` | `3746330051` | `svod` |
| tvod (rental/purchase) | `2` | `3746332051` | `tvod` |
| subscription (channels) | `3` | `2` | `subscription` |

### Common Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `search-alias` | Search namespace | `instant-video` |
| `sort` | Sort order | `pv-public-release-date-desc-rank` |
| `field-ways_to_watch` | Offer type filter (see above) | — |
| `bq` | CloudSearch boolean query for genre/entity filtering | Anime genre filter |
| `qs-country-code` | Country code | `JP` |
| `qs-offer_type` | Offer type numeric code | — |
| `adult-product` | Adult content flag | `0` |
| `pv_browse_internal_offer` | Internal offer type string | — |
| `pv_browse_internal_language` | Language filter | `all` |
| `field-subscription_id` | Subscription channel ID (e.g. `danime`) | — |
| `pv_browse_internal_benefit` | Benefit ID (e.g. `danime`) | — |
| `field-genre-bin` | Genre bin filter | — |
| `node` | Category node ID | — |

### bq (Boolean Query) Filter

CloudSearch-style boolean query for filtering by genre and excluding non-content entities:

```
(and
  (or genre:'av_genre_anime' genre:'av_subgenre_anime*' genre:'av_genre_animation_adult_interest')
  (not genre:'kids')
  (not entity_type:'Promotion|Trailer|Bonus Content')
)
```

The `(not genre:'kids')` clause is included by default for `tvod` and `subscription` offers.

### Mode-Specific Parameters

**New Arrivals** (`newAnime`):
- `sort` = `-prime_video_start_date`
- `is_movie_collection` = `0,0,0,0,0`
- Anime genre bq filter (without kids exclusion)

**Expiring** (`expiring`):
- `node` = `4217520051` (anime category)
- `bbn` = `4217520051`
- `p_n_theme_browse-bin` = `4435524051`
- `is_movie_collection` = `0,0`

## paginateCollection API

```
GET https://www.amazon.co.jp/gp/video/api/paginateCollection
```

### Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `paginationTargetId` | Pagination target | `default` |
| `serviceToken` | Protobuf-encoded token (see above) | `v0_...` |
| `startIndex` | Offset for pagination | `0`, `20`, `40`, ... |
| `pageType` | Page type | `browse` |
| `pageId` | Page ID | `default` |
| `collectionType` | Collection type | `Container` |
| `actionScheme` | Action scheme | `default` |
| `payloadScheme` | Payload scheme | `default` |
| `decorationScheme` | Decoration scheme | `web-liveFDP-decoration-asins-v2` |
| `featureScheme` | Feature scheme | `web-search-v4` |
| `dynamicFeatures` | Feature flags (repeated) | `integration`, `CleanSlate`, ... |
| `widgetScheme` | Widget scheme | `web-explore-v33` |
| `variant` | Client variant | `desktopOSX` |

### Response

```json
{
  "entities": [...],
  "hasMoreItems": true,
  "pagination": {
    "queryParameters": {
      "serviceToken": "v0_..."
    }
  }
}
```

## Reference URLs

**Anime TV — New Releases (sorted by start date)**

```
https://www.amazon.co.jp/gp/video/browse/ref=atv_unknown?serviceToken=v0_...
```

**Expiring Soon**

```
https://www.amazon.co.jp/gp/video/browse/ref=atv_unknown?serviceToken=v0_...
```

## Entity Message Fields (as of 2026-03-28)

### titleMetadataBadge.message

Badge displayed on the top-left of title cards. Can be used as enum candidates.

| Value | Meaning | Frequency |
|-------|---------|-----------|
| `セール` | Limited-time sale | High |
| `新エピソード` | New episode added | Medium |
| `新着` | Newly available | Medium |
| `新作` | New title | Low |
| `人気上昇中` | Trending | Low |

Badge filtering is not supported via API parameters. Filtering must be done client-side after fetching.

### highValueMessage.message

Supplementary info displayed on title cards. Free-form text with the following patterns:

**Expiring** — Parseable via `parseExpiringMessage()`
- `シーズンNの{service}での配信はN日以内に終了`
- `{service}での配信はN日以内に終了`
- `シーズンNの{service}での配信はN時間以内に終���`
- `シーズンNの{service}での配信はN時間N分以内に終了`

Services: `Prime` / `アニメタイムズ` / `dアニメストア for Prime Video` / `FODチャンネル for Prime Video`

**Rankings**
- `#N 日本` — Overall ranking
- `トップ10にN週間ランクイン`
- `{genre}のTV番組で第N位`
- `{genre}の映画で第N位`

**New Episode Notification**
- `新しいエピソード{day of week}`

**Awards**
- `{award}にノミネートされています`
- `{award}を受賞しています`

Empty string `""` is common (titles without badges). The schema converts empty strings to `undefined`.
