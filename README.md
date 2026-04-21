# Nagisa WebUI — Recording Manager

An app for managing and tracking anime recordings from streaming services.

> **[日本語版 README はこちら](README.ja.md)**

## Supported Streaming Services

| Service | Status | Notes |
|---------|--------|-------|
| Amazon Prime Video | Supported | Including subscription channels (d Anime Store, Anime Times, Toei Animation) |
| Hulu | Supported | Hulu Japan |
| Netflix | Planned | See [docs/features/netflix-provider.md](docs/features/netflix-provider.md) |

## Features

### Data Collection (Automated Backend Sync)

- **Provider Scraping** — Automatically fetches anime catalogs from Amazon Prime Video / Hulu every hour
- **AniList Identification** — Matches fetched titles against the AniList GraphQL API to identify anime (50-item batch processing)
- **Metadata Enrichment** — Attaches metadata such as airing status, year, and season from AniList
- **Differential Sync** — Compares with existing data and adds only new seasons/episodes (no duplicates)
- **Queue-Based Processing** — Asynchronous message processing via Cloudflare Queues (fetch → update, two-stage pipeline)

### API

- `GET /api/anime` — Anime list (pagination, filters, sorting, search)
- `GET /api/anime/:id` — Anime details (including seasons and episodes)
- `PATCH /api/anime/:id` — Update recording reservation / recorded flags
- `POST /api/anime/:id/record` — Send recording request to external backend
- `GET /api/recordings` — List of recorded episodes
- `PUT /api/recordings` — Update episode recording status
- `PUT /api/recordings/bulk` — Bulk update recording status
- OpenAPI documentation (`/docs`, `/openapi.json`)

### Frontend

- **Anime List** (`/`) — Card-based list view with filtering by provider, year, season, and status; title search; sort toggle; pagination
- **Anime Detail** (`/anime/:id`) — Detail page with hero image, season/episode grid, recording reservation toggle, recording request submission
- **Recordings** (`/recordings`) — Dedicated view for anime with recording reservations

## Tech Stack

- [Vite](https://vite.dev/) - Build tool
- [React](https://react.dev/) - UI library
- [TanStack Router](https://tanstack.com/router) - Type-safe file-based router
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Hono](https://hono.dev/) + [Zod OpenAPI](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) - API framework
- [Cloudflare Workers](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/) + [Queues](https://developers.cloudflare.com/queues/) - Edge runtime, database, async queues
- [Prisma](https://www.prisma.io/) + [@prisma/adapter-d1](https://www.prisma.io/docs/orm/overview/databases/cloudflare-d1) - ORM
- [Zodios](https://www.zodios.org/) - Type-safe API client
- [Zod](https://zod.dev/) - Validation
- [Jotai](https://jotai.org/) - State management
- [Bun](https://bun.sh/) - Runtime / package manager
- [TypeScript](https://www.typescriptlang.org/)
- [Biome](https://biomejs.dev/) - Linter / Formatter

## Architecture

```mermaid
%%{init: {'theme': 'dark'}}%%
graph TD
    Cron["Scheduled<br/>(hourly cron)"] -->|enqueue| Queue["Cloudflare Queues"]
    Queue -->|consume| Sync["SyncService"]

    Sync -->|fetch catalog| Providers["Providers<br/>Amazon / Hulu"]
    Sync -->|enrich metadata| Metadata["Metadata<br/>AniList"]

    Providers --> DB["Cloudflare D1<br/>(Prisma)"]
    Metadata --> DB

    DB --> API["Hono API"]
    API --> Frontend["React Frontend<br/>(Zodios + Jotai)"]

    style Cron fill:#5e3a4d,stroke:#d4789c,color:#f0d0e0
    style Queue fill:#5e4a2d,stroke:#d4a04c,color:#f0e0c0
    style Sync fill:#2d3e5e,stroke:#4c8cd4,color:#c0d8f0
    style Providers fill:#2d5e3e,stroke:#4cd48c,color:#c0f0d8
    style Metadata fill:#2d5e3e,stroke:#4cd48c,color:#c0f0d8
    style DB fill:#5e4e2d,stroke:#d4b44c,color:#f0e4c0
    style API fill:#4e2d5e,stroke:#a44cd4,color:#e0c0f0
    style Frontend fill:#2d3a5e,stroke:#4c6cd4,color:#c0d0f0
```

### Data Sync Flow

1. **Scheduled** — Hourly cron enqueues `hulu` / `amazon` fetch messages to the Queue
2. **Queue Consumer** — Consumes messages in batches, delegates to SyncService
3. **Provider** — Scrapes catalogs and detail pages from Amazon / Hulu
4. **Metadata** — Enriches with metadata via AniList GraphQL
5. **Upsert** — Upserts Anime / Season / Episode into D1 via Prisma

### Prime Video Data Fetching

#### Title List

Generates a `serviceToken` by protobuf-encoding search parameters (genre filter, sort order, offer type, etc.) and converting to URL-safe Base64. This token is passed directly to the `paginateCollection` API without any HTML parsing. For details on the serviceToken format and parameters, see [docs/features/amazon-browse-urls.md](docs/features/amazon-browse-urls.md).

1. Fetch a lightweight page to obtain session cookies
2. Build a `serviceToken` via protobuf encoding with the desired search parameters
3. Call the `paginateCollection` API sequentially, incrementing `startIndex` until `hasMoreItems: false`

For new arrivals, two sources are fetched in parallel and merged:
- **SVOD browse** — Anime titles sorted by release date, filtered by `NEW_EPISODE` / `RECENTLY_ADDED` badges
- **Subscription channels** — "Recently Added" carousels from d Anime Store, Anime Times, and Toei Animation channel pages

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
    Params["Search Params<br/>(genre/sort/offer)"] -->|protobuf encode| Token["serviceToken<br/>(URL-safe Base64)"]
    Token --> Paginate["paginateCollection API"]
    Paginate -->|"hasMoreItems?"| Paginate
    Paginate --> Titles["Title List"]

    subgraph NewArrivals ["New Arrivals"]
        SVOD["SVOD Browse"] --> Union["Merge + Dedupe"]
        Channels["Channel Carousels<br/>(dAnime / AnimeTime / Toei)"] --> Union
    end

    style Params fill:#2d3e5e,stroke:#4c8cd4,color:#c0d8f0
    style Token fill:#5e4a2d,stroke:#d4a04c,color:#f0e0c0
    style Titles fill:#5e4e2d,stroke:#d4b44c,color:#f0e4c0
    style Paginate fill:#4e2d5e,stroke:#a44cd4,color:#e0c0f0
    style SVOD fill:#2d5e3e,stroke:#4cd48c,color:#c0f0d8
    style Channels fill:#2d5e3e,stroke:#4cd48c,color:#c0f0d8
    style Union fill:#5e3a4d,stroke:#d4789c,color:#f0d0e0
```

#### Title Detail

Fetches the detail page HTML (`/gp/video/detail/{contentId}`) and extracts the following from `<script type="application/json">`:

- Title name, synopsis, entity type (movie/tv), rating, image URL
- Season list (seasonId, displayName, seasonNumber)
- Episode list widget tokens (`episodePageTokens`)

Episode info is fetched by calling the `getDetailWidgets` API for each token. For multi-season titles, additional detail pages are fetched per season to obtain tokens.

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
    Detail["/gp/video/detail/{id}<br/>Fetch HTML"] -->|"HTML parse"| Meta["Title Info<br/>(title, synopsis, seasons)"]
    Detail -->|"HTML parse"| Tokens["episodePageTokens"]
    Tokens -->|"per token"| Widgets["getDetailWidgets API"]
    Widgets --> Episodes["Episode List"]
    Meta --> Result["TitleInfo"]
    Episodes --> Result

    style Detail fill:#2d5e3e,stroke:#4cd48c,color:#c0f0d8
    style Meta fill:#5e4e2d,stroke:#d4b44c,color:#f0e4c0
    style Tokens fill:#2d3e5e,stroke:#4c8cd4,color:#c0d8f0
    style Widgets fill:#4e2d5e,stroke:#a44cd4,color:#e0c0f0
    style Episodes fill:#5e4a2d,stroke:#d4a04c,color:#f0e0c0
    style Result fill:#5e3a4d,stroke:#d4789c,color:#f0d0e0
```

### Hulu Data Fetching

#### Title List

Two APIs are used depending on the fetch category:

- **Palette API** (`/api/v2/palettes/{slug}/vod/objects`) — Fetches by slug. For new arrivals, combines `recentlyadded-anime` + current season slugs (e.g. `april-june-quarter-anime26`), deduplicates by slug, and classifies badges as `NEW_EPISODE` (has new assets) / `RECENTLY_ADDED` / `COMING_SOON`
- **Filtered API** (`/api/v2/filtered`) — For full fetches, uses `g:8` (anime genre) filter to retrieve all anime (TV + movies) sorted by weekly popularity. For expiring titles, sorts by `publish_end_at` ascending with a 30-day threshold cutoff

Both paginate in batches of 50 using `from`/`to` parameters, recursively fetching until `total_count` is reached.

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
    subgraph NewArrivals ["New Arrivals"]
        Palette["Palette API<br/>recentlyadded-anime"] --> Dedup["Merge + Classify badges"]
        Season["Palette API<br/>current season slug"] --> Dedup
    end
    subgraph FullFetch ["Full Fetch"]
        Filtered["Filtered API<br/>g:8 (anime genre)"] --> All["All anime<br/>(TV + movies)"]
    end
    subgraph ExpiringGroup ["Expiring"]
        ExpNode["Filtered API<br/>publish_end_at asc"] --> Exp["Titles expiring<br/>within 30 days"]
    end

    style Palette fill:#2d5e3e,stroke:#4cd48c,color:#c0f0d8
    style Season fill:#2d5e3e,stroke:#4cd48c,color:#c0f0d8
    style Dedup fill:#5e4a2d,stroke:#d4a04c,color:#f0e0c0
    style Filtered fill:#4e2d5e,stroke:#a44cd4,color:#e0c0f0
    style All fill:#5e4e2d,stroke:#d4b44c,color:#f0e4c0
    style ExpNode fill:#5e3a4d,stroke:#d4789c,color:#f0d0e0
    style Exp fill:#5e4e2d,stroke:#d4b44c,color:#f0e4c0
```

#### Title Detail

Two data sources are fetched in parallel and merged:

- **Falcor JSON Graph API** (`/anon/ja/webp/path`) — Fetches title metadata (name, description, thumbnailUrl, service) by slug. Resolves slug to internal ID via the `titleSlug` path on the Falcor side
- **RSC (React Server Component) Payload** — Fetches the episode page HTML (`/{slug}/assets?ht=episode`), concatenates `self.__next_f.push()` chunks, extracts the `"metas"` array, and parses episode info. Episodes are grouped into seasons by `season_number_title`

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
    Slug["slug"] --> Falcor["Falcor API<br/>/anon/ja/webp/path"]
    Slug --> RSC["/{slug}/assets?ht=episode"]

    Falcor -->|"titleSlug -> meta/{id}"| Meta["Metadata<br/>(name, description,<br/>thumbnailUrl, service)"]
    RSC -->|"Fetch HTML"| Chunks["self.__next_f.push()<br/>Concatenate chunks"]
    Chunks -->|"Extract metas array"| EpParse["Episode Parse"]
    EpParse -->|"Group by<br/>season_number_title"| Seasons["Seasons + Episodes"]

    Meta --> Result["TitleInfo"]
    Seasons --> Result

    style Slug fill:#3e3e3e,stroke:#888,color:#ddd
    style Falcor fill:#2d5e3e,stroke:#4cd48c,color:#c0f0d8
    style RSC fill:#4e2d5e,stroke:#a44cd4,color:#e0c0f0
    style Meta fill:#5e4e2d,stroke:#d4b44c,color:#f0e4c0
    style Chunks fill:#2d3e5e,stroke:#4c8cd4,color:#c0d8f0
    style EpParse fill:#5e4a2d,stroke:#d4a04c,color:#f0e0c0
    style Seasons fill:#5e3a4d,stroke:#d4789c,color:#f0d0e0
    style Result fill:#5e3a4d,stroke:#d4789c,color:#f0d0e0
```

## Setup

```bash
bun install
```

## Development

```bash
bun run dev
```

## Build

```bash
bun run build
```

## Deploy

```bash
bun run deploy
```

You can specify the deploy target with the `CLOUDFLARE_ENV` environment variable (default: `staging`).

## Lint / Type Check

```bash
bunx tsc -b --noEmit        # Type check
bunx biome check src/        # Lint + format check
```

## Test

```bash
bun test
```

Test suites: Amazon provider, Hulu provider, title parser

## Project Structure

```
prisma/
├── schema.prisma               # Prisma schema (Anime, Season, Episode)
└── migrations/                 # D1 migrations
src/
├── index.ts                    # Hono entrypoint (fetch, scheduled, queue)
├── queue.ts                    # Cloudflare Queue consumer
├── scheduled.ts                # Cron trigger (hourly provider sync)
├── lib/
│   ├── db.ts                   # PrismaClient + D1 Adapter init
│   ├── sync.ts                 # Sync service (fetch → enrich → upsert)
│   ├── merge.ts                # Data merge logic
│   ├── title-parser.ts         # Anime title parser
│   ├── html-parser.ts          # HTML parser helpers
│   ├── image.ts                # Image processing
│   ├── logger.ts               # Logger
│   ├── metadata/               # Metadata integration
│   │   ├── base.ts             # Abstract enricher
│   │   ├── tmdb.ts             # TMDB API
│   │   ├── anilist.ts          # AniList GraphQL
│   │   └── index.ts            # Router
│   └── providers/              # Provider modules
│       ├── base.ts             # Abstract provider
│       ├── amazon/             # Amazon Prime Video
│       │   ├── browse.ts
│       │   ├── channel.ts
│       │   ├── detail.ts
│       │   ├── protobuf.ts
│       │   └── index.ts
│       └── hulu/               # Hulu
│           ├── browse.ts
│           ├── detail.ts
│           ├── rsc-parser.ts
│           └── index.ts
├── routes/                     # Backend API routes
│   ├── anime.ts                # /api/anime
│   └── recordings.ts           # /api/recordings
├── schemas/                    # Zod schemas (*.dto.ts)
│   ├── anime.dto.ts
│   ├── recording.dto.ts
│   ├── message.dto.ts          # Queue messages (tagged union)
│   └── providers/
│       ├── common.dto.ts
│       ├── amazon.dto.ts
│       ├── hulu.dto.ts
│       └── metadata.dto.ts
└── app/                        # Frontend (React)
    ├── main.tsx
    ├── index.css
    ├── lib/
    │   ├── api.ts              # Zodios client
    │   ├── atoms.ts            # Jotai atoms
    │   ├── constants.ts
    │   └── utils.ts
    ├── hooks/
    │   └── use-paginated-fetch.ts
    ├── components/
    │   ├── ui/                 # shadcn/ui primitives
    │   ├── anime-badges.tsx
    │   ├── loading-spinner.tsx
    │   ├── page-transition.tsx
    │   └── smart-pagination.tsx
    └── routes/                 # TanStack Router (directory-based)
        ├── __root.tsx          # Root layout
        ├── index.tsx           # / Anime list
        ├── anime/$id/
        │   └── index.tsx       # /anime/:id Detail
        ├── recordings/
        │   └── index.tsx       # /recordings Recording list
        └── -components/        # Shared route components
            ├── anime-card.tsx
            ├── search-bar.tsx
            └── filter-popover.tsx
```
