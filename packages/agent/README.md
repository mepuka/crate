# @crate/agent

AI agent for music enrichment, visual art generation, and knowledge graph queries.

## Overview

The Crate agent enriches KEXP play data with AI-generated insights, visual assets, and graph connections. It runs on Google Cloud Run, triggered by Pub/Sub events for new plays or Cloud Scheduler for batch processing.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MusicAgent                               │
│  (Orchestrates enrichment pipeline)                              │
└─────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌─────────────────┐  ┌─────────────────────────┐
│ AI Insights   │  │ Visual Assets   │  │ Graph Connections       │
│ (Claude)      │  │ (Gemini)        │  │ (MusicBrainz)           │
└───────────────┘  └─────────────────┘  └─────────────────────────┘
```

## Services

### Core Services

| Service | Purpose |
|---------|---------|
| `MusicAgent` | Main orchestrator for enrichment pipeline |
| `InsightSessionService` | Claude-powered narrative insight generation |
| `PromptBuilderService` | Type-safe prompt construction |

### Art Generation Services

| Service | Purpose |
|---------|---------|
| `LinerNoteGenerationService` | Era-aware visual liner notes from album art |
| `AlbumArtEnhancementService` | Album art variations and enhancements |
| `CharacterGenerationService` | Crate Cat mascot generation |
| `DerivedAssetGenerator` | Derived assets (thumbnails, crops) |
| `ArtCurationService` | Curates and validates generated art |
| `DesignDirectiveService` | Visual design prompts and directives |
| `CanonicalReferenceService` | Canonical reference images for characters |
| `GeneratedAssetRepository` | Persistence for generated assets |

### Graph Services

| Service | Purpose |
|---------|---------|
| `MusicGraphService` | Knowledge graph queries |
| `GraphConnectionsService` | Artist/album relationship discovery |
| `MbidResolverService` | MusicBrainz ID resolution |

### Infrastructure Services

| Service | Purpose |
|---------|---------|
| `SemanticSearchService` | FAISS semantic search integration |
| `SearchPlaysService` | Play search and retrieval |
| `LinkFetcherService` | External link content extraction |
| `CircuitBreaker` | Resilience for external APIs |

## Art Generation Pipeline

The agent uses Gemini's "Nano Banana Pro" model (`gemini-3-pro-image-preview`) for visual asset generation.

### Era Visual System

Visual styling is based on album release year:

| Era | Years | Style |
|-----|-------|-------|
| pre-vinyl | < 1950 | Sepia, art deco, heavy weathering |
| golden-age | 1950-1969 | Blue Note, Reid Miles, vinyl ring wear |
| classic-rock | 1970-1979 | Gatefold, Hipgnosis, analog warmth |
| new-wave | 1980-1989 | Factory Records, bold color blocks |
| grunge | 1990-1999 | DIY zine, high contrast, Sub Pop |
| digital | 2000-2009 | Clean digital, transitional |
| streaming | 2010-2019 | Minimal, square format |
| contemporary | 2020+ | Pristine, fresh |

### Liner Note Generation

```typescript
import { LinerNoteGenerationService, generateLinerNote } from "@crate/agent"

const linerNote = yield* generateLinerNote({
  playId: 12345,
  albumArtBase64: "...",
  releaseYear: 1973,
  title: "The Dark Side Story",
  narrative: "Pink Floyd's masterpiece...",
  artistName: "Pink Floyd",
  albumName: "The Dark Side of the Moon",
  style: "art-forward"
})
// Returns: { imageBase64, mimeType, era, modelNotes, generatedAt }
```

### Styles

- `art-forward` - Text overlaid on abstracted album art atmosphere
- `editorial` - Magazine pull-quote card, Pitchfork aesthetic
- `archival` - Catalog card, library index, vintage press clipping
- `collage` - Zine collage, mixed media cut-out, punk DIY

## Configuration

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=...           # Claude API key
GOOGLE_AI_API_KEY=...           # Gemini API key
FAISS_API_URL=https://...       # FAISS search API URL

# Optional
ART_PROVIDER=gemini             # gemini | dalle | stable-diffusion
ART_CACHE_ENABLED=true          # Enable asset caching
ART_MAX_CONCURRENT=3            # Max parallel generations
```

## Deployment

### Cloud Run

The agent runs on Cloud Run, deployed via Cloud Build:

```bash
# Deploy
gcloud builds submit --config cloudbuild.yaml .

# View logs
gcloud run logs read crate-agent --region us-west1 --tail
```

### Pub/Sub Trigger

New plays with DJ comments trigger enrichment via the `/pubsub` endpoint:

```
KEXP API → sync_plays.py → Pub/Sub (new-plays) → /pubsub → enrichPlays()
```

### Batch Enrichment

Cloud Scheduler triggers daily batch enrichment via `/batch-enrich`.

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run locally
pnpm dev

# Test art generation
pnpm tsx src/scripts/test-liner-notes.ts
```

## Documentation

- [Art Pipeline Design](./docs/ART_PIPELINE_DESIGN.md) - Detailed art generation architecture
- [Semantic Image Store Design](./docs/SEMANTIC_IMAGE_STORE_DESIGN.md) - Asset storage design
- [System Architecture](../../docs/ARCHITECTURE.md) - Overall system architecture
