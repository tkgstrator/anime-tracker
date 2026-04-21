# Webhook Specification

Nagisa sends per-episode status webhooks to [Nagisa WebUI](https://github.com/qtmleap/anime-tracker) as episodes progress through the download pipeline. This document is the authoritative reference for the webhook contract between Nagisa (sender) and Nagisa WebUI (receiver).

## Overview

- Webhooks fire **per episode**, not per job or per content.
- Each episode transitions through `pending → downloading → completed` or `pending → downloading → failed`.
- Webhook delivery failures never block the download pipeline.
- Webhooks are disabled by default; they activate automatically when all required environment variables are set.

## Environment Variables

All three must be set to enable webhooks. If any is missing, webhooks are silently disabled.

| Variable | Description |
|----------|-------------|
| `TRACKER_URL` | Nagisa WebUI base URL (e.g. `https://anime-tracker.example.com`) |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access service token Client ID |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service token Client Secret |

## Endpoint

```
POST {TRACKER_URL}/api/webhooks/record-status
```

## Authentication

Cloudflare Access service token headers:

```
CF-Access-Client-Id: <CF_ACCESS_CLIENT_ID>
CF-Access-Client-Secret: <CF_ACCESS_CLIENT_SECRET>
Content-Type: application/json
```

## Request Body

### Success statuses (`pending`, `downloading`, `completed`)

```json
{
  "provider": "amazon",
  "content_id": "B0DXV9MP4Y",
  "episode_id": "B0DXV9ABCD",
  "status": "downloading"
}
```

### Failure status (`failed`)

```json
{
  "provider": "amazon",
  "content_id": "B0DXV9MP4Y",
  "episode_id": "B0DXV9ABCD",
  "status": "failed",
  "error": {
    "status": "PSSH_MISSING",
    "message": "S01E03: Missing PSSH or license URL"
  }
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | `string` | Yes | `"amazon"` or `"hulu"`. The provider that originated the download. |
| `content_id` | `string` | Yes | The top-level content identifier used when the job was submitted (ASIN for Amazon, slug for Hulu). |
| `episode_id` | `string \| null` | Yes | Provider-specific episode identifier. For Amazon this is the episode ASIN. For Hulu this is the numeric asset ID (e.g. `"40029143"`; the `ASSET-` prefix is stripped). `null` when the error is at content level (e.g. `CONTENT_NOT_FOUND`). |
| `status` | `string` | Yes | One of `"pending"`, `"downloading"`, `"completed"`, `"failed"`. See lifecycle below. |
| `error` | `object \| undefined` | No | Present only when `status` is `"failed"`. Contains structured error information. |
| `error.status` | `string` | Yes (in error) | Machine-readable error code. See Error Codes below. |
| `error.message` | `string` | Yes (in error) | Human-readable error description with episode label prefix (e.g. `"S01E03: ..."`) |

### Error Codes

| Code | Description |
|------|-------------|
| `CONTENT_NOT_FOUND` | No episodes found for the given content ID, or no episodes matched the filter. |
| `MPD_NOT_FOUND` | Playback API returned no MPD URL. |
| `MPD_FETCH_FAILED` | MPD fetch or playback metadata retrieval failed (network error, API error, etc.). |
| `MPD_URL_MISSING` | content.json was saved but `mpd_url` field is empty. |
| `PSSH_MISSING` | Widevine PSSH or license URL not found in MPD / playback response. |
| `KEY_FETCH_FAILED` | Widevine license request failed (network error, server rejection, etc.). |
| `NO_CONTENT_KEYS` | License server responded but returned no CONTENT-type decryption keys. |
| `DOWNLOAD_FAILED` | N_m3u8DL-RE download, decryption, or mux process failed. |
| `PLAYBACK_FETCH_FAILED` | Playback info API call failed (Hulu-specific: playback_auth or session_open failure). |
| `INTERNAL_ERROR` | Unexpected exception not covered by the above codes. |

## Status Lifecycle

Each episode emits webhooks in the following order:

```
pending  →  downloading  →  completed
pending  →  downloading  →  failed
```

| Status | When | Description |
|--------|------|-------------|
| `pending` | Episode list finalized, before pipeline starts | Emitted for **all** selected episodes at once, immediately after filtering. Tells the receiver which episodes will be processed. |
| `downloading` | Pipeline starts processing the episode | Emitted when the episode's turn begins (before MPD fetch, key acquisition, or download). |
| `completed` | Final output file verified on disk | Episode was successfully downloaded, decrypted, and muxed. |
| `failed` | Any unrecoverable error during processing | Covers MPD fetch failure, missing PSSH/keys, download/mux failure, and unexpected exceptions. The `error` object contains the error code and message. |

### Edge Cases

- Episodes that already exist on disk (skipped due to deduplication) emit **no webhooks**.
- Dry-run mode emits **no webhooks**.
- A single content may produce multiple webhook calls (one `pending` + one `downloading` + one `completed`/`failed` per episode).
- Content-level errors (e.g. `CONTENT_NOT_FOUND`) emit a single `failed` webhook with `episode_id: null`.

## Directory Structure

Nagisa outputs files in Jellyfin-compatible directory structure:

```
{base_dir}/
  [AP] Frieren Beyond Journey's End (2023) [tmdbid-209867]/
    Season 01/
      S01E01.mkv
      S01E02.mkv
```

### Folder naming

| Component | Format | Example |
|-----------|--------|---------|
| Provider prefix | `[AP]` Amazon, `[HL]` Hulu | `[AP]` |
| Title | Series/movie title | `Frieren Beyond Journey's End` |
| Year | First-air or release year | `(2023)` |
| TMDb ID | Jellyfin metadata identifier | `[tmdbid-209867]` |
| Season folder | Zero-padded, Jellyfin style | `Season 01` |
| Episode file | `S{season}E{episode}` format | `S01E01.mkv` |

### TMDb series mapping

One TMDb series ID maps to one top-level folder. Titles that are separate seasons of a single TMDb series (e.g. Monogatari series = tmdbid-46195) should share the same folder with different `Season XX` subdirectories.

## Examples

### Successful episode download

```json
{"provider": "hulu", "content_id": "the-mentalist", "episode_id": "40029143", "status": "pending"}
{"provider": "hulu", "content_id": "the-mentalist", "episode_id": "40029143", "status": "downloading"}
{"provider": "hulu", "content_id": "the-mentalist", "episode_id": "40029143", "status": "completed"}
```

### Failed episode (missing PSSH)

```json
{"provider": "amazon", "content_id": "B0DXV9MP4Y", "episode_id": "B0DXV9ABCD", "status": "pending"}
{"provider": "amazon", "content_id": "B0DXV9MP4Y", "episode_id": "B0DXV9ABCD", "status": "downloading"}
{"provider": "amazon", "content_id": "B0DXV9MP4Y", "episode_id": "B0DXV9ABCD", "status": "failed", "error": {"status": "PSSH_MISSING", "message": "S01E03: Missing PSSH or license URL"}}
```

### Multi-episode job (3 episodes, 1 fails)

All `pending` webhooks are sent first (batch), then episodes are processed sequentially:

```json
{"provider": "hulu", "content_id": "frieren", "episode_id": "50001", "status": "pending"}
{"provider": "hulu", "content_id": "frieren", "episode_id": "50002", "status": "pending"}
{"provider": "hulu", "content_id": "frieren", "episode_id": "50003", "status": "pending"}
{"provider": "hulu", "content_id": "frieren", "episode_id": "50001", "status": "downloading"}
{"provider": "hulu", "content_id": "frieren", "episode_id": "50001", "status": "completed"}
{"provider": "hulu", "content_id": "frieren", "episode_id": "50002", "status": "downloading"}
{"provider": "hulu", "content_id": "frieren", "episode_id": "50002", "status": "failed", "error": {"status": "KEY_FETCH_FAILED", "message": "S01E02: Key fetch failed: ConnectionError..."}}
{"provider": "hulu", "content_id": "frieren", "episode_id": "50003", "status": "downloading"}
{"provider": "hulu", "content_id": "frieren", "episode_id": "50003", "status": "completed"}
```

### Content-level error (no episodes found)

```json
{"provider": "amazon", "content_id": "B0INVALID", "episode_id": null, "status": "failed", "error": {"status": "CONTENT_NOT_FOUND", "message": "No episodes found for B0INVALID"}}
```

## Receiver Contract (Nagisa WebUI)

For Nagisa WebUI to correctly handle these webhooks:

1. **Endpoint**: Implement `POST /api/webhooks/record-status` accepting the JSON body above.
2. **Authentication**: Protect the endpoint with Cloudflare Access; verify the service token.
3. **Idempotency**: The same `(provider, content_id, episode_id, status)` tuple may arrive more than once in edge cases. Treat as upsert.
4. **Missing webhooks**: If `pending` was received but no further status follows within a reasonable timeout (e.g. 30 minutes), consider the episode stale/failed. Similarly, if `downloading` arrives but no `completed`/`failed` follows, treat as stale.
5. **Error handling**: When `status` is `"failed"`, parse `error.status` for programmatic handling (e.g. retry logic, UI display) and `error.message` for logging/display.
6. **Response**: Return `2xx` on success. Nagisa does not inspect the response body.

## Sending Mechanism

Webhooks are sent via `EpisodeCallbacks` hooks defined in `nagisa/providers/base.py`. The server task runner (`nagisa/server/tasks.py`) constructs callbacks that call `send_webhook()` from `nagisa/server/webhook.py`.

```
server/tasks.py
  pending webhooks     → send_webhook(status="pending")  [batch, before pipeline]

EpisodeCallbacks
  on_episode_start     → send_webhook(status="downloading")
  on_episode_complete  → send_webhook(status="completed")
  on_episode_fail      → send_webhook(status="failed", error_status=..., error_message=...)
```

Both Amazon and Hulu pipelines use the same `EpisodeCallbacks` interface, ensuring identical webhook behavior across providers.

### Error Handling

- HTTP timeout: 10 seconds.
- On send failure: logged at `WARNING` level, pipeline continues.
- No retry logic. Nagisa WebUI should treat missing webhooks gracefully (e.g. poll or show stale status).
