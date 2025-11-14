# KEXP Radio Crate - Codebase Architecture & Data Models

## Project Overview

This is a monorepo for KEXP Radio Crate, a web application for browsing and analyzing KEXP (Seattle independent radio station) play history with semantic search capabilities.

**Technology Stack:**
- **Monorepo**: Pnpm workspace
- **Frontend**: React 18 with TanStack Router + Vite
- **State Management**: Effect-Atom (reactive atoms with Effect-TS)
- **Runtime**: Effect-TS (functional effect system)
- **Backend API**: FastAPI + Python (separate from repo structure visible here)
- **Styling**: Tailwind CSS + Radix UI components

---

## 1. KEXP-RELATED CODE STRUCTURE

### 1.1 Directory Layout

```
packages/
├── domain/               # Shared domain types & schemas
│   └── src/kexp/
│       └── schemas.ts    # KEXP API response types (KexpPlay, KexpProgram, etc.)
├── api/                  # Type-safe HTTP API client
│   └── src/
│       ├── schemas/Play.ts          # PlayResult, Timeline, Search responses
│       ├── endpoints/
│       │   ├── timeline.ts          # GET /api/plays/timeline
│       │   ├── search.ts            # POST /api/search
│       │   └── play.ts              # GET /api/plays/:id
│       └── api.ts                   # Combined API definition
├── server/               # Backend (Python FastAPI)
│   └── src/
│       ├── kexp/schemas.ts          # KEXP API integration schemas
│       └── knowledge_base/          # MusicBrainz, database, search
├── web/                  # Frontend React app
│   └── src/
│       ├── domain/Play.ts           # Re-exports from @crate/api
│       ├── atoms/                   # State management (Effect-Atom)
│       │   ├── kexp-atoms.ts        # Programs & shows state
│       │   ├── timeline.ts          # Play data & derived atoms
│       │   ├── play-details.ts      # Selected play state
│       │   └── album-bar.ts         # Album artwork for background
│       ├── services/                # HTTP & data services
│       │   ├── kexp-api-service.ts  # Effect-based KEXP API client
│       │   ├── kexp-cache.ts        # LocalStorage caching strategy
│       │   └── kexp-cache.ts        # Cache implementation
│       ├── hooks/
│       │   └── use-kexp-data.ts     # React hooks for KEXP data access
│       ├── components/              # React components
│       │   ├── Timeline.tsx         # Main timeline view
│       │   ├── PlayCard.tsx         # Individual play card
│       │   ├── PlayDetailsPanel.tsx # Side panel with full details
│       │   ├── ShowTransitionMarker.tsx # Show boundary marker
│       │   ├── ScrollingAlbumBar.tsx # Canvas-based album art background
│       │   └── [others]
│       ├── workers/                 # Web Workers
│       │   ├── album-bar-worker.ts  # Album artwork processing
│       │   ├── search-worker.ts     # Semantic search
│       │   └── [protocols & clients]
│       └── lib/
│           ├── http-runtime.ts      # Effect runtime + HTTP client setup
│           └── timeline-utils.ts    # Play sorting & utilities
└── cli/                  # CLI tools
```

### 1.2 KEXP Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ KEXP API (https://api.kexp.org/v2)                     │
│ - /programs/     → KexpProgram[]                       │
│ - /shows/        → KexpShow[]                          │
│ - /plays/        → KexpPlay[] (legacy, not used)       │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ Backend API (FastAPI)                                   │
│ GET  /api/plays/timeline  → TimelineResponse           │
│ POST /api/search          → SearchResponse              │
│ GET  /api/plays/:id       → PlayResult                 │
│                                                          │
│ Returns enriched PlayResult with:                       │
│ - KEXP metadata (artist, song, album)                 │
│ - MusicBrainz IDs (MBIDs)                            │
│ - Similarity scores                                    │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ Frontend HTTP Client (Effect-based)                     │
│ AtomHttpApi with FetchHttpClient                       │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ TimelineKVS (localStorage)                             │
│ - Stores: Chunk<PlayResult>, individual plays          │
│ - Also fetches: KEXP programs & shows separately       │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ React Components (Effect-Atom driven)                   │
│ Timeline, PlayCard, PlayDetailsPanel, etc.              │
└──────────────────────────────────────────────────────────┘
```

---

## 2. DATA MODELS FOR PLAYS, SHOWS, ARTISTS, SONGS

### 2.1 Core Play Type (`PlayResult`)

**Location:** `/packages/api/src/schemas/Play.ts`

```typescript
export class PlayResult extends Schema.Class<PlayResult>("PlayResult")({
  // Core identification & metadata
  id: Schema.Number,                          // Unique play ID
  artist: Schema.String,                      // Artist name
  song: Schema.String,                        // Song/track title
  album: Schema.NullOr(Schema.String),        // Album name
  
  // Temporal
  airdate: Schema.DateFromString,             // ISO 8601 datetime (auto-parsed to Date)
  show: Schema.Number,                        // KEXP show ID (references KexpShow)
  
  // Album artwork
  image_uri: Schema.NullOr(Schema.String),    // Full-size image
  thumbnail_uri: Schema.NullOr(Schema.String),// Smaller image
  
  // Metadata flags
  rotation_status: Schema.NullOr(Schema.String),  // "Heavy" | "Medium" | "Light" | "R/N" | "Library"
  is_local: Schema.Boolean,                   // KEXP local artist
  is_live: Schema.Boolean,                    // Live performance
  is_request: Schema.Boolean,                 // Listener request
  comment: Schema.NullOr(Schema.String),      // DJ comment
  
  // Release info
  labels: Schema.Array(Schema.String),        // Record labels
  
  // **MusicBrainz IDs (for linking to external databases)**
  artist_mbid: Schema.Array(Schema.String),   // Artist MBID(s)
  recording_mbid: Schema.NullOr(Schema.String), // Recording MBID
  release_mbid: Schema.NullOr(Schema.String),   // Release (album) MBID
  release_group_mbid: Schema.NullOr(Schema.String), // Release group MBID
  
  // Search/similarity
  similarity: Schema.Number                   // 0.0-1.0 for search results
})
```

**Key Points:**
- `artist_mbid` is an **array** (never null, can be empty)
- Three MBID types: recording (track), release (album), release_group (album versions)
- `similarity` only populated in search results (0.0-1.0 scale)
- `airdate` is automatically parsed from ISO 8601 string to `Date` object

### 2.2 KEXP Show & Program Types

**Location:** `/packages/domain/src/kexp/schemas.ts`

```typescript
// KexpProgram - Show format/genre
interface KexpProgram {
  id: number
  uri: string                  // KEXP API URI
  name: string                 // e.g., "Variety Mix", "World Music"
  description: string
  tags: string                 // Comma-separated: "variety,music,talk"
  image_uri: string            // Program image
  thumbnail_uri: string
  is_active: boolean
  location: number             // KEXP location ID
  location_name: string        // e.g., "Seattle"
}

// KexpShow - Specific instance of a program
interface KexpShow {
  id: number
  uri: string
  program: number              // References KexpProgram.id
  program_uri: string
  program_name: string
  program_tags: string
  hosts: number[]              // Host IDs
  host_uris: string[]
  host_names: string[]         // e.g., ["John Doe", "Jane Smith"]
  tagline: string              // Show tagline/description
  image_uri: string            // Show-specific image
  program_image_uri: string
  start_time: string           // ISO datetime with timezone
  location: number
  location_name: string
}

// KexpHost
interface KexpHost {
  id: number
  name: string
  image_uri: NullOr<string>
  is_active: boolean
  location: number
}
```

**Relationship:**
```
PlayResult
  └─ play.show (number)
      └─ KexpShow {show: number}
          └─ show.program (number)
              └─ KexpProgram {id: number}
```

### 2.3 Response Wrappers

**Timeline Response:**
```typescript
export class TimelineResponse extends Schema.Class<TimelineResponse>(...)({
  results: Schema.Array(PlayResult),    // Array of plays
  next_cursor: Schema.NullOr(Schema.String),  // For pagination
  has_more: Schema.Boolean,
  query_time_ms: Schema.Number,         // Query latency
  total_count: Schema.NullOr(Schema.Number),
  anchor_position: Schema.NullOr(Schema.Number)
})
```

**Search Response:**
```typescript
export class SearchResponse extends Schema.Class<SearchResponse>(...)({
  results: Schema.Array(PlayResult),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  query: Schema.String
})
```

---

## 3. MusicBrainz ID (MBID) INFORMATION & USAGE

### 3.1 What are MBIDs?

MusicBrainz IDs are UUIDs that uniquely identify entities in the MusicBrainz music database:

- **Artist MBID** (UUID): Unique identifier for an artist/musician
- **Recording MBID** (UUID): Unique identifier for a specific track/recording
- **Release MBID** (UUID): Unique identifier for a specific album release
- **Release Group MBID** (UUID): Unique identifier for all versions of an album

**Example:**
```
Artist: "The Beatles"
  → artist_mbid: ["c7c0a4ab-5cad-4bf0-b0d9-9b16a1b9a3ad"]

Song: "Let It Be" (The Beatles, 1970 album version)
  → recording_mbid: "17b5b5d4-9f7e-4c30-8f44-6fb7c9fbb8c3"
  → release_mbid: "91fe5e51-5e84-428a-a50b-ff69f96a0487"
  → release_group_mbid: "fcb53a7e-0d1c-3c0e-8b8d-9b5a8d8b5c7a"
```

### 3.2 MBID in Database Schema

**Location:** `/packages/server/src/knowledge_base/fact_plays/schemas.ts`

```typescript
export class FactPlay {
  id: PlayId
  recording_id: NullOr<string>      // MBID for recording
  artist_ids: NullOr<string>        // JSON string of array of MBIDs
  release_id: NullOr<string>        // MBID for release
  release_group_id: NullOr<string>  // MBID for release group
  
  // Helpers to parse JSON arrays
  get parsedArtistIds(): string[] {
    return JSON.parse(this.artist_ids || '[]')
  }
}
```

### 3.3 MBID Usage in Timeline Parameters

**Location:** `/packages/api/src/schemas/SearchParams.ts`

```typescript
export class TimelineParams {
  limit: number                          // Default: 50
  cursor: optional(String)               // Pagination cursor
  since: optional(String)                // Time-based filtering
  until: optional(String)
  percentage: optional(number)           // Jump to percentage in history
  anchor_id: optional(number)            // Jump to specific play
  
  // **Optional MBID filters** (can combine with navigation)
  artist_mbid: optional(String)          // Filter plays by artist MBID
  recording_mbid: optional(String)       // Filter by recording MBID
  release_mbid: optional(String)         // Filter by album MBID
  release_group_mbid: optional(String)   // Filter by album family MBID
}
```

**Usage:** These URL parameters allow filtering the timeline to show only plays of specific artists, recordings, or albums by MusicBrainz ID.

### 3.4 MBID Integration in Backend

The backend integrates with MusicBrainz API to:
1. **Link plays** to MBIDs (enrichment step)
2. **Store fact tables** for artists, recordings, releases
3. **Enable filtering** via MBID parameters
4. **Power semantic search** with knowledge graphs

**Key files:**
- `/packages/server/src/knowledge_base/musicbrainz_api/service.ts` - MusicBrainz API client
- `/packages/server/src/knowledge_base/migrations/0028_create_mb_canonical_tables.ts` - DB schema for MB entities

---

## 4. CURRENT VISUALIZATION & UI COMPONENTS

### 4.1 Timeline View

**Location:** `/packages/web/src/components/Timeline.tsx`

Main timeline component with:
- **PlayCard** components showing each play
- **ShowTransitionMarker** between show boundaries
- **ScrollingAlbumBar** as canvas-based background
- Virtual scrolling (future optimization)

**State Management:**
```typescript
playIdsAtom                    // List of play IDs
newestPlayAtom                 // Most recent play
playIdToBoundaryMapAtom       // Show boundaries by play
```

### 4.2 PlayCard Component

**Location:** `/packages/web/src/components/PlayCard.tsx`

Compact card showing:
- **Album artwork** (thumbnail or fallback)
- **Song title** + timestamp
- **Artist name**
- **Album** + release year
- **Badges:** rotation_status, labels, local/request/live flags
- **Similarity score** (for search results)

**Variants:**
- `size`: compact (80px art), default (120px), expanded (160px)
- `variant`: default, focused, dimmed
- Responsive sizing for mobile/desktop

### 4.3 PlayDetailsPanel

**Location:** `/packages/web/src/components/PlayDetailsPanel.tsx`

Right-side sliding panel with full play details:
- **Large album art** (400px)
- **Song/Artist titles**
- **Metadata fields:**
  - Play ID
  - Rotation status
  - Labels
  - Origin (local/request)
  - Performance type (live)
  - Comment
- **Future:** Analysis section (placeholder for Observable Plot integration)

**State:** URL-synchronized via `selectedPlayIdAtom` (/?playId=123)

### 4.4 ShowTransitionMarker

**Location:** `/packages/web/src/components/ShowTransitionMarker.tsx`

Visual separator between show transitions showing:
- **Timestamp** of show change
- **Program name** (e.g., "Variety Mix")
- **Host names** (e.g., "John Doe, Jane Smith")
- Subtle gradient line

### 4.5 ScrollingAlbumBar

**Location:** `/packages/web/src/components/ScrollingAlbumBar.tsx`

Canvas-based animated background:
- **Recent album artwork** (100 most recent plays)
- **Brick/staggered pattern** (200×200px tiles)
- **Analog defects:** vignetting, grain, color shifts
- **Responsive canvas** sizing with DPR scaling
- **GPU-optimized** with ImageBitmap

**Features:**
- Seeded pseudo-random noise for consistent appearance
- Subtle blur/opacity/brightness variations per tile
- Automatic refresh when new plays arrive

### 4.6 Additional Components

**AlbumArt:** Reusable image component with fallback
**DateDivider:** Section headers for date ranges
**LoadingSpinner, Skeleton:** Loading states
**UI Components:** button, input, badge, card, alert (Radix UI + custom)

---

## 5. API STACK STRUCTURE

### 5.1 Frontend HTTP Architecture

**Location:** `/packages/web/src/lib/http-runtime.ts`

```typescript
// Type-safe HTTP client
export class TimelineClient extends AtomHttpApi.Tag() {
  api: KexpApi          // API definition
  httpClient: FetchHttpClient.layer
  baseUrl: "/api"
}

// Three-tier state management:

1. **Backend API** → TimelineClient
   GET /api/plays/timeline
   POST /api/search
   GET /api/plays/:id

2. **TimelineKVS** (localStorage wrapper)
   - Stores: Chunk<PlayResult>
   - Stores: HashSet<number> (play IDs)
   - Stores: Individual plays by ID
   - Provides: getPlay(id), getPlaysChunk(), getPlayIds()

3. **Effect-Atom State** (reactive)
   - playsChunkAtom → Chunk<PlayResult>
   - playIdsAtom → number[]
   - playAtom(id) → Play
   - Derived atoms (sorted, filtered, boundaries)
```

### 5.2 API Endpoints

**Base URL:** `/api`

**Timeline API:**
```
GET /api/plays/timeline?limit=50&cursor=...&artist_mbid=...
  → TimelineResponse {
      results: PlayResult[],
      next_cursor?: string,
      has_more: boolean,
      query_time_ms: number
    }
```

**Search API:**
```
POST /api/search
Body: { query: string, limit?: number, offset?: number }
  → SearchResponse {
      results: PlayResult[],
      total: number,
      query_time_ms: number
    }
```

**Individual Play:**
```
GET /api/plays/:id
  → PlayResult
```

**Health:**
```
GET /api/health
  → { status: "ok" }
```

### 5.3 API Definition (Type-Safe)

**Location:** `/packages/api/src/api.ts`

```typescript
export const KexpApi = HttpApi.make("kexp-api")
  .add(HealthApi)
  .add(SearchApi)
  .add(TimelineApi)
  .add(PlayApi)
```

Each endpoint group is defined in `/endpoints/` with:
- **HTTP method** (GET, POST)
- **URL path**
- **Request schema** (body or URL params)
- **Response schema**
- **Error types**

### 5.4 Data Flow with Effect-Atom

```
API Response
  ↓
Schema.decodeUnknown() [automatic in HttpApi]
  ↓
PlayResult | TimelineResponse
  ↓
TimelineKVS.set() [localStorage]
  ↓
Effect-Atom atoms [reactive]
  ↓
React components (.useAtomValue(), .useAtom())
  ↓
Re-render with new data
```

**Reactivity System:** Atoms invalidate via `Atom.withReactivity()` when KVS keys change

```typescript
playsChunkAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const kvs = yield* TimelineKVS
    return yield* kvs.getPlaysChunk()
  })
).pipe(Atom.withReactivity(["timeline:plays_chunk"]))
// Automatically re-executes effect when "timeline:plays_chunk" changes
```

---

## 6. KEXP DATA ENRICHMENT (SHOWS & PROGRAMS)

### 6.1 Separate KEXP Integration

KEXP shows and programs are fetched **separately** from play data:

**Location:** `/packages/web/src/atoms/kexp-atoms.ts`

```typescript
// Fetch from KEXP API (https://api.kexp.org/v2)
const fetchProgramsEffect = Effect.gen(function* () {
  const apiService = yield* KexpApiService
  const response = yield* apiService.fetchPrograms
  return HashMap.fromIterable(response.results.map(p => [p.id, p]))
})

const fetchShowsEffect = Effect.gen(function* () {
  const apiService = yield* KexpApiService
  const response = yield* apiService.fetchShows(200)  // Limit 200
  return HashMap.fromIterable(response.results.map(s => [s.id, s]))
})

// Public atoms
export const programsMapAtom: HashMap<number, KexpProgram>
export const showsMapAtom: HashMap<number, KexpShow>

// Derived
export const showToProgramMapAtom: HashMap<number, KexpProgram>
```

### 6.2 Show Boundaries

**Location:** `/packages/web/src/atoms/kexp-atoms.ts`

Factory function to create atoms that mark show transitions:

```typescript
export function createShowBoundariesAtom(
  playsAtom: Atom<Play[]>
): Atom<ShowBoundary[]> {
  // Computes where show ID changes in plays array
  // Returns array with program name, host names, timestamp
}

export interface ShowBoundary {
  timestamp: Date | string
  showId: number
  programName?: string
  programId?: number
  hostNames?: readonly string[]
}
```

---

## 7. KEY PATTERNS & ARCHITECTURE INSIGHTS

### 7.1 Effect-TS Usage

This codebase is a showcase of **Effect-TS** patterns:

1. **Services:** Context.Tag for dependency injection
2. **Errors:** Data.TaggedError for structured error handling
3. **Effects:** Effect.gen, Effect.map, Effect.flatMap for async operations
4. **Layers:** Layer.effect for service provisioning
5. **Collections:** HashMap (O(1) lookups), Chunk (ordered), HashSet (fast membership)
6. **Concurrency:** Effect.all with concurrency control

### 7.2 Effect-Atom (State Management)

1. **TimelineRuntime.atom():** Create atoms that execute Effects
2. **Atom.family():** Create parametric atoms (e.g., playAtom(id))
3. **Atom.withReactivity():** Invalidate when KVS changes
4. **Result type:** Used to represent async state (Waiting/Success/Error/Defect)
5. **Derived atoms:** Atom.make((get) => { ... }) with dependency tracking

### 7.3 Browser Runtime (localStorage-based)

The `TimelineKVS` service uses:
- **KeyValueStore** from `@effect/platform-browser`
- **Chunk<T>** for ordered storage
- **HashSet<T>** for fast lookups
- **Schema** validation on all reads

### 7.4 Web Workers

Two specialized workers:
1. **album-bar-worker:** Processes plays → album artwork
2. **search-worker:** Performs local semantic search

Both use Effect-based message protocol with type-safe encoding/decoding.

---

## 8. CURRENT VISUALIZATION GAPS & FUTURE POSSIBILITIES

### What's Currently Rendered

✓ Timeline list of plays (PlayCard components)
✓ Show transition markers with program info
✓ Canvas background with album artwork
✓ Play details panel with metadata
✓ Search results with similarity scores

### What's Missing (Opportunities for Observable Plot)

- **Temporal visualizations:**
  - Play frequency over time (histogram/bar chart)
  - Time-of-day patterns
  - Day-of-week analysis
  - Seasonal trends

- **Artist/Label analysis:**
  - Artist play count rankings
  - Label distribution pie/donut chart
  - Artist discovery patterns

- **Music metadata:**
  - Release year distribution
  - Album rotation status breakdown
  - Genre/tag analysis

- **Search insights:**
  - Search term frequency
  - Result similarity distributions
  - User engagement heatmaps

---

## 9. HOW TO EXTEND THE CODEBASE

### Adding a New Visualization

1. **Create PlayDetails section:**
   ```tsx
   // /packages/web/src/components/PlayAnalysisChart.tsx
   export function PlayAnalysisChart({ play }: { play: Play }) {
     // Use play.artist_mbid, play.recording_mbid for lookups
     // Return Observable Plot visualization
   }
   ```

2. **Add to PlayDetailsPanel:**
   ```tsx
   <PlayAnalysisChart play={play} />
   ```

3. **Create data aggregation service (if needed):**
   ```typescript
   // Effect-based service to gather stats from plays
   export class PlayStatsService extends Effect.Service() {
     readonly getArtistStats = (mbid: string) => ...
   }
   ```

### Using MBID for Filtering

Already built into TimelineParams:
```typescript
// URL: /timeline?artist_mbid=abc123&limit=50
const params = useSearchParams()  // TanStack Router
const artistMbid = params.artist_mbid
// Backend filters plays where artist_mbid contains this value
```

### Adding New KEXP Data

The pattern is established in `kexp-atoms.ts`:
```typescript
const fetchCustomData = Effect.gen(function* () {
  const apiService = yield* KexpApiService
  const response = yield* apiService.customEndpoint()
  return /* convert to HashMap, Chunk, etc. */
})

export const customDataAtom = TimelineRuntime.atom(
  Effect.cached(fetchCustomData)  // Memoize
).pipe(Atom.withReactivity(["custom:data"]))
```

---

## 10. KEY FILES BY USE CASE

### Implementing a Play Visualization Feature
1. `/packages/api/src/schemas/Play.ts` - Understand PlayResult structure
2. `/packages/web/src/components/PlayCard.tsx` - See how play data is rendered
3. `/packages/web/src/components/PlayDetailsPanel.tsx` - Where to add new visualization
4. `/packages/web/src/lib/http-runtime.ts` - Data access patterns

### Adding MusicBrainz-based Features
1. `/packages/api/src/schemas/SearchParams.ts` - MBID parameters
2. `/packages/api/src/endpoints/timeline.ts` - Query format
3. `/packages/server/src/knowledge_base/musicbrainz_api/service.ts` - Backend enrichment

### Working with KEXP Data (Shows, Programs, Hosts)
1. `/packages/domain/src/kexp/schemas.ts` - Type definitions
2. `/packages/web/src/atoms/kexp-atoms.ts` - State management
3. `/packages/web/src/hooks/use-kexp-data.ts` - React hooks
4. `/packages/web/src/components/ShowTransitionMarker.tsx` - Usage example

### Timeline State & Performance
1. `/packages/web/src/atoms/timeline.ts` - Complete timeline state
2. `/packages/web/src/lib/timeline-utils.ts` - Sorting, filtering utilities
3. `/packages/web/src/lib/http-runtime.ts` - Storage layer

### Workers & Background Processing
1. `/packages/web/src/workers/album-bar-worker.ts` - Image processing
2. `/packages/web/src/workers/album-bar-worker-protocol.ts` - Message schema
3. `/packages/web/src/workers/album-bar-worker-client.ts` - Client API

---

## Summary

This is a sophisticated Effect-TS application with:
- **Type-safe API client** with automatic schema validation
- **Reactive state management** via Effect-Atom
- **Efficient data storage** using Chunk/HashMap/HashSet
- **Rich metadata** including MusicBrainz IDs for external linking
- **Web Worker integration** for heavy processing
- **KEXP enrichment** via separate API calls
- **Modern UI** with Tailwind CSS and Radix UI

The architecture is well-structured for adding Observable Plot visualizations, with clear patterns for extending both data and UI layers.

