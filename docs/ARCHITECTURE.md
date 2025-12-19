# Crate System Architecture

**Last Updated:** 2025-12-19

## Overview

Crate is a music discovery and curation platform that enriches KEXP radio play data with AI-generated insights, visual art, and knowledge graph connections.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CRATE ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌──────────────────┐     ┌─────────────────────────────────┐
│  KEXP API   │────▶│  faiss-search-api │────▶│          GCP Pub/Sub            │
│  (External) │     │  (Digital Ocean)  │     │        new-plays topic          │
└─────────────┘     └──────────────────┘     └─────────────────────────────────┘
                            │                              │
                            │                              ▼
                            │                 ┌─────────────────────────────────┐
                            │                 │        crate-agent              │
                            │                 │      (GCP Cloud Run)            │
                            │                 │                                 │
                            │                 │  • AI Enrichment (Claude)       │
                            │                 │  • Art Generation (Gemini)      │
                            │                 │  • Graph Queries                │
                            ▼                 └─────────────────────────────────┘
                    ┌──────────────────┐                   │
                    │   music_kb.sqlite │◀──────────────────┘
                    │   (Shared DB)     │
                    └──────────────────┘
                            │
                            ▼
                    ┌──────────────────┐
                    │    crate-web     │
                    │   (Firebase)     │
                    │                  │
                    │  React + Effect  │
                    │  Jotai Atoms     │
                    └──────────────────┘
```

---

## Components

### 1. faiss-search-api (Digital Ocean Droplet)

**Location:** `/faiss-search-api/`
**URL:** `https://cratemusic.duckdns.org`
**Stack:** Python, FastAPI, FAISS, SQLite

**Responsibilities:**
- Sync plays from KEXP API every 30 seconds
- Store plays in SQLite (`music_kb.sqlite`)
- Semantic search via FAISS embeddings (2.1M vectors)
- Timeline and play detail APIs
- Publish new plays to GCP Pub/Sub (for AI enrichment)
- MusicBrainz graph queries

**Key Files:**
- `scripts/sync_plays.py` - Cron job syncing KEXP plays
- `app/main.py` - FastAPI application
- `app/services/search_service.py` - FAISS semantic search
- `app/services/pubsub_publisher.py` - Pub/Sub integration

**Deployment:** Docker on Digital Ocean, via `./scripts/deploy_to_droplet.sh`

---

### 2. crate-agent (GCP Cloud Run)

**Location:** `/packages/agent/`
**URL:** `https://crate-agent-cjatp5myqa-uw.a.run.app`
**Stack:** TypeScript, Effect-TS, Claude API, Gemini API

**Responsibilities:**
- Receive Pub/Sub triggers for new plays (only plays with DJ comments)
- Generate AI insights and narratives via Claude
- Generate visual assets via Gemini (Nano Banana Pro)
- Enrichment pipeline: plays → insights → assets
- Scheduled batch enrichment via Cloud Scheduler

**Key Services:**
- `MusicAgent` - Main agent orchestrator
- `LinerNoteGenerationService` - Era-aware visual liner notes
- `AlbumArtEnhancementService` - Album art variations
- `CharacterGenerationService` - Crate Cat mascot
- `MusicGraphService` - Knowledge graph queries

**Deployment:** Cloud Build + Cloud Run, via `cloudbuild.yaml`

---

### 3. crate-web (Firebase Hosting)

**Location:** `/packages/web/`
**URL:** TBD (Firebase)
**Stack:** React, TypeScript, Effect-TS, Jotai, TanStack Router, Tailwind

**Responsibilities:**
- Timeline UI for browsing plays
- Play detail panels with insights
- Semantic search interface
- Era-aware visual theming
- Streaming insights display

**Key Components:**
- `ScrollingAlbumBar` - Infinite scroll album covers
- `InsightPanel` / `InsightStream` - AI insight display
- `PlayDetailsPanel` - Play detail view
- Timeline with filtering (date, show, artist)

**Deployment:** Firebase Hosting

---

### 4. packages/domain

**Location:** `/packages/domain/`
**Stack:** TypeScript, Effect-TS, Effect Schema

**Responsibilities:**
- Shared domain types and schemas
- Play, Artist, Album, Track types
- Insight and enrichment schemas
- Database models

---

### 5. packages/server (Legacy/Deprecated)

**Location:** `/packages/server/`
**Status:** Partially deprecated, functionality moved to faiss-search-api

---

## Data Flow

### 1. Play Ingestion

```
KEXP API → sync_plays.py (every 30s) → music_kb.sqlite
                    │
                    ▼ (if play has DJ comment)
              Pub/Sub: new-plays topic
                    │
                    ▼
              crate-agent /pubsub endpoint
                    │
                    ▼
              AI Enrichment Pipeline
                    │
                    ▼
              insights table in music_kb.sqlite
```

### 2. User Request

```
User → crate-web → faiss-search-api
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
        /timeline   /search     /plays/{id}
            │            │            │
            └────────────┴────────────┘
                         │
                         ▼
                 music_kb.sqlite
```

---

## Infrastructure

### GCP Resources (Project: gen-lang-client-0874846742)

| Resource | Type | Purpose |
|----------|------|---------|
| crate-agent | Cloud Run (us-west1) | AI agent service |
| enrich-unprocessed | Cloud Scheduler | Hourly batch enrichment (0 * * * *) |
| new-plays | Pub/Sub Topic | Play enrichment triggers |
| new-plays-to-agent | Pub/Sub Subscription | Push to agent /pubsub |
| scheduler-invoker | Service Account | Invokes Cloud Run (Scheduler + PubSub) |

**Authentication:** See [INFRASTRUCTURE_RUNBOOK.md](./INFRASTRUCTURE_RUNBOOK.md) for IAM details.

### Digital Ocean

| Resource | Type | Purpose |
|----------|------|---------|
| KEXP Droplet | Droplet | faiss-search-api host |
| cratemusic.duckdns.org | DNS | API endpoint |

### External APIs

| API | Purpose |
|-----|---------|
| KEXP Playlist API | Play data source |
| MusicBrainz | Artist/album metadata, relationships |
| Cover Art Archive | Album artwork |
| Claude (Anthropic) | AI insights generation |
| Gemini (Google) | Visual asset generation |

---

## Key Patterns

### Effect-TS Service Pattern

All backend services use Effect-TS with Context.Tag pattern:

```typescript
// Service interface
interface MyServiceInterface {
  readonly doSomething: (input: Input) => Effect.Effect<Output, MyError>
}

// Service tag
class MyService extends Context.Tag("MyService")<MyService, MyServiceInterface>() {}

// Live implementation
const MyServiceLive = Layer.effect(MyService, makeMyService)
```

### Era Visual System

Visual theming based on album release year:

| Era | Years | Style |
|-----|-------|-------|
| pre-vinyl | < 1950 | Sepia, art deco |
| golden-age | 1950-1969 | Blue Note, mid-century |
| classic-rock | 1970-1979 | Gatefold, Hipgnosis |
| new-wave | 1980-1989 | Factory Records |
| grunge | 1990-1999 | DIY zine |
| digital | 2000-2009 | Clean digital |
| streaming | 2010-2019 | Minimal |
| contemporary | 2020+ | Pristine |

---

## Development

### Prerequisites

- Node.js 20+
- pnpm 8+
- Python 3.12+
- Docker

### Local Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run web dev server
cd packages/web && pnpm dev

# Run agent locally
cd packages/agent && pnpm dev
```

### Environment Variables

See `.env.example` files in each package.

---

## Related Documentation

- [Infrastructure Runbook](./INFRASTRUCTURE_RUNBOOK.md) - Operational guide, troubleshooting, auth details
- [faiss-search-api README](../faiss-search-api/README.md)
- [Agent README](../packages/agent/README.md)
- [Art Pipeline Design](../packages/agent/docs/ART_PIPELINE_DESIGN.md)
- [Effect Patterns](./effect-patterns/README.md)
