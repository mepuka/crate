# KXP Radio Crate - Frontend Design Document (Effect Atom Edition)

## Project Vision

A single-page React application built with **Effect Atom** that presents KXP Radio plays as an infinite, chronologically-ordered "crate" - a visual metaphor for browsing through records. Users can scroll endlessly through **2.2M+ plays from 2007 to present**, search semantically using FAISS embeddings, and share specific positions in the timeline via URL.

---

## Core Concepts

### 1. The "Crate" Metaphor
- **Always Chronological**: Plays are ALWAYS shown in the order they aired (by `airdate DESC`)
- **Infinite Exploration**: No traditional pagination - just scroll forever using cursor-based navigation
- **Position-Based URLs**: URLs represent positions/slices in the timeline, not traditional "pages"
- **Semantic Search**: Natural language search powered by FAISS embeddings ("psychedelic rock", "jazz fusion")
- **Reactive State**: Effect Atom manages all state with first-class async support

### 2. URL Philosophy
```
/                           → Default view (most recent plays, scrolling backwards in time)
/play/:id                   → Jump to specific play with context
/search?q=nirvana           → Semantic search results in chronological order
/timeline?since=2015-03-15  → Jump to specific date
/timeline?percentage=0.5    → Jump to 50% through timeline (~2016)
```

**Key Insight**: Every URL is just a different "window" into the same chronologically-ordered stream, managed by reactive atoms.

---

## Technology Stack

### Frontend Core
```json
{
  "framework": "React 18+",
  "language": "TypeScript",
  "state": "Effect Atom (reactive state management)",
  "effects": "Effect-TS (async operations, services, DI)",
  "styling": "Tailwind CSS + shadcn/ui (customized)",
  "routing": "TanStack Router (file-based)",
  "deployment": "Vercel"
}
```

### Key Libraries
```json
{
  "effect": "^3.19+",
  "@effect/platform": "For HTTP client",
  "@effect/schema": "Runtime validation & types",
  "effect-atom": "Reactive state management",
  "@tanstack/react-router": "Type-safe routing",
  "@tanstack/react-virtual": "Virtualized infinite scroll",
  "framer-motion": "Scroll animations",
  "date-fns": "Date formatting",
  "shadcn/ui": "Base component library"
}
```

**Philosophy**: Effect-first architecture on both frontend and backend for consistency, type-safety, and composability.

---

## Backend API Reference

### Base URL
```
Production: https://api.kxp-crate.com
Development: http://localhost:8000
```

### Available Endpoints

#### 1. Timeline Browse (Primary Endpoint)
```http
GET /api/plays/timeline
```

**Query Parameters:**
- `limit`: Number of results (1-200, default 50)
- `cursor`: Base64 cursor for pagination
- `since`: ISO 8601 datetime (time-based jump)
- `until`: ISO 8601 datetime (time range end)
- `percentage`: Float 0.0-1.0 (percentage-based jump)
- `anchor_id`: Play ID to center around

**Response:**
```typescript
interface TimelineResponse {
  results: PlayResult[]
  next_cursor: string | null
  has_more: boolean
  query_time_ms: number
  total_count?: number         // Only for percentage queries
  anchor_position?: number     // Only for anchor queries
}
```

**Performance:**
- Cursor pagination: <5ms
- Time-based jump: <1ms
- Percentage jump: ~50ms
- Anchor jump: ~100ms

#### 2. Semantic Search
```http
POST /api/search
Content-Type: application/json

{
  "query": "psychedelic rock",
  "limit": 20,
  "offset": 0
}
```

**Response:**
```typescript
interface SearchResponse {
  results: PlayResult[]
  total: number
  query_time_ms: number
  query: string
}
```

**Performance:** <20ms with FAISS

---

## Data Models (Effect Schema)

### PlayResult Schema

```typescript
// src/domain/Play.ts
import { Schema as S } from "@effect/schema"

export class PlayResult extends S.Class<PlayResult>("PlayResult")({
  id: S.Number,
  artist: S.String,
  song: S.String,
  similarity: S.Number,  // -1.0 to 1.0 (0.0 for timeline browsing)

  // Metadata
  album: S.NullOr(S.String),
  airdate: S.String.pipe(S.dateFromString),  // ISO 8601
  labels: S.Array(S.String),
  rotation_status: S.NullOr(S.String),
  is_local: S.Boolean,
  is_live: S.Boolean,
  is_request: S.Boolean,
  comment: S.NullOr(S.String),
  show: S.Number,

  // MusicBrainz IDs
  artist_mbid: S.NullOr(S.Array(S.String)),
  recording_mbid: S.NullOr(S.String),
  release_mbid: S.NullOr(S.String),
  release_group_mbid: S.NullOr(S.String),
  thumbnail_uri: S.optional(S.NullOr(S.String)),
  image_uri: S.optional(S.NullOr(S.String))
}) {}

export class TimelineResponse extends S.Class<TimelineResponse>("TimelineResponse")({
  results: S.Array(PlayResult),
  next_cursor: S.NullOr(S.String),
  has_more: S.Boolean,
  query_time_ms: S.Number,
  total_count: S.optional(S.Number),
  anchor_position: S.optional(S.Number)
}) {}

export class SearchResponse extends S.Class<SearchResponse>("SearchResponse")({
  results: S.Array(PlayResult),
  total: S.Number,
  query_time_ms: S.Number,
  query: S.String
}) {}
```

---

## Architecture

### High-Level Component Tree

```
App
├── Atom.runtime (Global)
│   ├── ConfigProvider (env vars)
│   ├── Logger
│   └── HttpClient (API)
│
├── Providers
│   └── RouterProvider (TanStack Router)
│
├── Layout
│   ├── Header
│   │   ├── Logo/Branding
│   │   ├── SearchBar (atom-driven)
│   │   └── NavigationControls
│   │
│   └── Main
│       └── Router
│           ├── HomePage (/)
│           │   └── InfiniteTimeline
│           │       ├── VirtualScroller
│           │       ├── PlayCard (repeated)
│           │       ├── DateDivider
│           │       └── LoadingSpinner
│           │
│           ├── PlayDetailPage (/play/$playId)
│           │   └── InfiniteTimeline (anchored)
│           │
│           ├── SearchResultsPage (/search?q=$query)
│           │   └── SearchResults (semantic)
│           │
│           └── TimelineJumpPage (/timeline)
│               └── InfiniteTimeline (jumped)
│
└── ErrorBoundary
```

---

## Effect Atom Architecture

### Atom Runtime Setup

```typescript
// src/main.tsx
import { Atom } from "effect-atom"
import { ConfigProvider, Layer, Logger } from "effect"
import { createRoot } from "react-dom/client"
import { StrictMode } from "react"
import { App } from "./App"

// Configuration from environment
const configProvider = ConfigProvider.fromJson(import.meta.env)

// Global runtime layer
Atom.runtime.addGlobalLayer(
  Layer.mergeAll(
    Layer.setConfigProvider(configProvider),
    Logger.pretty,
    HttpClient.layer  // Add HTTP client for API calls
  )
)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

---

## Core Atoms

### 1. Timeline Atom

```typescript
// src/atoms/timeline.ts
import { Atom } from "effect-atom"
import { Effect, Stream } from "effect"
import { TimelineApi } from "@/services/TimelineApi"

export interface TimelineState {
  plays: PlayResult[]
  cursor: string | null
  hasMore: boolean
  isLoading: boolean
}

// Base timeline atom with cursor pagination
export const timelineAtom = Atom.make(
  Effect.gen(function* () {
    const api = yield* TimelineApi
    const response = yield* api.fetchTimeline({ limit: 50 })

    return {
      plays: response.results,
      cursor: response.next_cursor,
      hasMore: response.has_more,
      isLoading: false
    } satisfies TimelineState
  })
)

// Append more plays (infinite scroll)
export const appendPlaysAtom = Atom.fn(
  Effect.fnUntraced(function* (get: Atom.Context) {
    const state = yield* get(timelineAtom)

    if (!state.hasMore || state.isLoading) {
      return state
    }

    const api = yield* TimelineApi
    const response = yield* api.fetchTimeline({
      cursor: state.cursor,
      limit: 50
    })

    return {
      plays: [...state.plays, ...response.results],
      cursor: response.next_cursor,
      hasMore: response.has_more,
      isLoading: false
    }
  })
)

// Jump to specific position (anchor, date, percentage)
export const jumpToPositionAtom = Atom.fn(
  Effect.fnUntraced(function* (params: {
    anchor_id?: number
    since?: string
    percentage?: number
  }) {
    const api = yield* TimelineApi
    const response = yield* api.fetchTimeline({ ...params, limit: 50 })

    return {
      plays: response.results,
      cursor: response.next_cursor,
      hasMore: response.has_more,
      isLoading: false,
      anchorPosition: response.anchor_position
    }
  })
)
```

### 2. Search Atom

```typescript
// src/atoms/search.ts
import { Atom } from "effect-atom"
import { Effect } from "effect"
import { SearchApi } from "@/services/SearchApi"

export const searchQueryAtom = Atom.make("")

export const searchResultsAtom = Atom.make(
  Effect.gen(function* (get: Atom.Context) {
    const query = yield* get(searchQueryAtom)

    if (query.length < 3) {
      return { results: [], total: 0, query_time_ms: 0, query: "" }
    }

    const api = yield* SearchApi
    return yield* api.search(query, 20, 0)
  })
)

// Optimistic search with debouncing
export const debouncedSearchAtom = Atom.make(
  Stream.fromSchedule(Schedule.spaced(Duration.millis(300))).pipe(
    Stream.switchMap(() => searchResultsAtom)
  )
)
```

### 3. Navigation Atom

```typescript
// src/atoms/navigation.ts
import { Atom } from "effect-atom"

export const selectedDateAtom = Atom.make<Date | null>(null)
export const percentageAtom = Atom.make(0)

// Derived atom for URL query params
export const navigationParamsAtom = Atom.make((get) => {
  const date = get(selectedDateAtom)
  const percentage = get(percentageAtom)

  if (date) {
    return { since: date.toISOString().split('T')[0] + 'T00:00:00' }
  }

  if (percentage > 0) {
    return { percentage: percentage / 100 }
  }

  return {}
})
```

---

## Services (Effect Services)

### TimelineApi Service

```typescript
// src/services/TimelineApi.ts
import { Effect, Context, HttpClient } from "effect"
import { TimelineResponse, PlayResult } from "@/domain/Play"

export class TimelineApi extends Context.Tag("TimelineApi")<
  TimelineApi,
  {
    readonly fetchTimeline: (params: {
      cursor?: string | null
      limit?: number
      since?: string
      until?: string
      percentage?: number
      anchor_id?: number
    }) => Effect.Effect<TimelineResponse>

    readonly fetchPlay: (playId: number) => Effect.Effect<PlayResult>
  }
>() {}

// Implementation
export const TimelineApiLive = Layer.succeed(
  TimelineApi,
  TimelineApi.of({
    fetchTimeline: (params) =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        const response = yield* client.get("/api/plays/timeline", {
          urlParams: params
        })

        // Validate with Effect Schema
        return yield* response.json.pipe(
          Effect.flatMap(S.decodeUnknown(TimelineResponse))
        )
      }),

    fetchPlay: (playId) =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        const response = yield* client.get(`/api/plays/${playId}`)

        return yield* response.json.pipe(
          Effect.flatMap(S.decodeUnknown(PlayResult))
        )
      })
  })
)
```

### SearchApi Service

```typescript
// src/services/SearchApi.ts
import { Effect, Context, HttpClient } from "effect"
import { SearchResponse } from "@/domain/Play"

export class SearchApi extends Context.Tag("SearchApi")<
  SearchApi,
  {
    readonly search: (
      query: string,
      limit: number,
      offset: number
    ) => Effect.Effect<SearchResponse>
  }
>() {}

export const SearchApiLive = Layer.succeed(
  SearchApi,
  SearchApi.of({
    search: (query, limit, offset) =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        const response = yield* client.post("/api/search", {
          body: HttpBody.json({ query, limit, offset })
        })

        return yield* response.json.pipe(
          Effect.flatMap(S.decodeUnknown(SearchResponse))
        )
      })
  })
)
```

---

## Component Patterns

### Using Atoms in Components

#### Pattern 1: Read-Only State

```typescript
// src/components/PlayList.tsx
import { useAtomValue } from "effect-atom"
import { timelineAtom } from "@/atoms/timeline"

export const PlayList = () => {
  const timeline = useAtomValue(timelineAtom)

  return (
    <Result.match(timeline, {
      onInitial: () => <LoadingSpinner />,
      onFailure: (error) => <ErrorMessage error={error} />,
      onSuccess: (state) => (
        <div>
          {state.plays.map(play => (
            <PlayCard key={play.id} play={play} />
          ))}
        </div>
      )
    })
  )
}
```

#### Pattern 2: Actions with Atom Functions

```typescript
// src/components/InfiniteScroll.tsx
import { useAtomSet } from "effect-atom"
import { appendPlaysAtom } from "@/atoms/timeline"

export const InfiniteScroll = ({ children }: { children: React.ReactNode }) => {
  const appendPlays = useAtomSet(appendPlaysAtom, { mode: "promiseExit" })
  const lastItemRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (entry.isIntersecting) {
          const exit = await appendPlays()
          if (Exit.isFailure(exit)) {
            console.error("Failed to load more plays:", exit.cause)
          }
        }
      },
      { rootMargin: '400px' }
    )

    if (lastItemRef.current) {
      observer.observe(lastItemRef.current)
    }

    return () => observer.disconnect()
  }, [appendPlays])

  return (
    <div>
      {children}
      <div ref={lastItemRef} />
    </div>
  )
}
```

#### Pattern 3: Bidirectional State

```typescript
// src/components/SearchBar.tsx
import { useAtom } from "effect-atom"
import { searchQueryAtom } from "@/atoms/search"

export const SearchBar = () => {
  const [query, setQuery] = useAtom(searchQueryAtom)

  return (
    <Input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search plays... (⌘K)"
    />
  )
}
```

#### Pattern 4: Derived State

```typescript
// src/components/SearchResults.tsx
import { useAtomValue } from "effect-atom"
import { debouncedSearchAtom } from "@/atoms/search"

export const SearchResults = () => {
  const results = useAtomValue(debouncedSearchAtom)

  return (
    <Result.match(results, {
      onInitial: () => <div>Start typing to search...</div>,
      onFailure: (error) => <ErrorMessage error={error} />,
      onSuccess: (response) => (
        <div>
          <p>{response.total} plays found ({response.query_time_ms}ms)</p>
          {response.results.map(play => (
            <PlayCard key={play.id} play={play} />
          ))}
        </div>
      )
    })
  )
}
```

---

## Routing Strategy (TanStack Router)

### Route Definitions

```typescript
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '@/pages/HomePage'

export const Route = createFileRoute('/')({
  component: HomePage
})
```

```typescript
// src/routes/play/$playId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { PlayDetailPage } from '@/pages/PlayDetailPage'

export const Route = createFileRoute('/play/$playId')({
  component: PlayDetailPage
})
```

```typescript
// src/routes/search.tsx
import { createFileRoute } from '@tanstack/react-router'
import { SearchResultsPage } from '@/pages/SearchResultsPage'

export const Route = createFileRoute('/search')({
  component: SearchResultsPage,
  validateSearch: (search) => ({
    q: (search.q as string) || ''
  })
})
```

```typescript
// src/routes/timeline.tsx
import { createFileRoute } from '@tanstack/react-router'
import { TimelineJumpPage } from '@/pages/TimelineJumpPage'

export const Route = createFileRoute('/timeline')({
  component: TimelineJumpPage,
  validateSearch: (search) => ({
    since: search.since as string | undefined,
    until: search.until as string | undefined,
    percentage: search.percentage ? Number(search.percentage) : undefined
  })
})
```

---

## Performance Optimizations

### 1. Virtual Scrolling

Use `@tanstack/react-virtual` with atoms:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAtomValue } from 'effect-atom'
import { timelineAtom } from '@/atoms/timeline'

export const VirtualTimeline = () => {
  const timeline = useAtomValue(timelineAtom)
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: Result.isSuccess(timeline) ? timeline.value.plays.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 10
  })

  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      {/* Virtual items */}
    </div>
  )
}
```

### 2. Atom Families for Play Details

```typescript
// src/atoms/playDetails.ts
export const playDetailsFamily = Atom.family((playId: number) =>
  Atom.make(
    Effect.gen(function* () {
      const api = yield* TimelineApi
      return yield* api.fetchPlay(playId)
    })
  )
)

// Usage in component
const playDetails = useAtomValue(playDetailsFamily(playId))
```

### 3. Optimistic Updates

```typescript
// src/atoms/favorites.ts
export const favoritesAtom = Atom.make<Set<number>>(new Set())

export const toggleFavoriteAtom = Atom.fn(
  Effect.fnUntraced(function* (get: Atom.Context, playId: number) {
    const favorites = yield* get(favoritesAtom)
    const newFavorites = new Set(favorites)

    if (newFavorites.has(playId)) {
      newFavorites.delete(playId)
    } else {
      newFavorites.add(playId)
    }

    // Optimistically update
    yield* Atom.set(favoritesAtom, newFavorites)

    // Persist to backend
    const api = yield* FavoritesApi
    yield* api.toggleFavorite(playId)

    return newFavorites
  })
)
```

---

## Error Handling

### Tagged Errors

```typescript
// src/domain/errors.ts
import { Data } from "effect"

export class NetworkError extends Data.TaggedError("NetworkError")<{
  message: string
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  playId: number
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  errors: string[]
}> {}
```

### Error Boundaries

```typescript
// src/components/ErrorBoundary.tsx
import { useAtomValue } from "effect-atom"
import { errorAtom } from "@/atoms/errors"

export const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const error = useAtomValue(errorAtom)

  return (
    <Result.match(error, {
      onInitial: () => children,
      onFailure: (err) => (
        <ErrorMessage error={err} />
      ),
      onSuccess: () => children
    })
  )
}
```

---

## Design System (shadcn customization)

Same as before - vinyl/record aesthetic with dark mode first.

---

## Implementation Checklist

### Week 1: Foundation
- [ ] Set up Vite + React + TypeScript
- [ ] Install Effect, Effect Atom, Effect Schema
- [ ] Configure Atom runtime with layers
- [ ] Set up TanStack Router (file-based)
- [ ] Create basic Layout + Header

### Week 2: Core Atoms & Services
- [ ] Define PlayResult, TimelineResponse schemas
- [ ] Implement TimelineApi service
- [ ] Create timeline atoms (base, append, jump)
- [ ] Build SearchApi service
- [ ] Create search atoms with debouncing

### Week 3: Components
- [ ] Build PlayCard component
- [ ] Implement InfiniteTimeline with virtual scrolling
- [ ] Add DateDivider component
- [ ] Build SearchBar with atom integration
- [ ] Create NavigationControls

### Week 4: Polish & Optimize
- [ ] Add atom families for play details
- [ ] Implement optimistic updates
- [ ] Mobile responsive design
- [ ] Error handling + boundaries
- [ ] Loading states + skeletons

### Week 5: Deploy & Monitor
- [ ] Deploy to Vercel
- [ ] Configure CORS on FastAPI backend
- [ ] Performance testing (Lighthouse)
- [ ] Add analytics (optional)

---

## Key Differences from TanStack Query Approach

| Aspect | Effect Atom | TanStack Query |
|--------|-------------|----------------|
| **Philosophy** | Effect-first, functional | React-first, imperative |
| **Type Safety** | Effect Schema validation | TypeScript only |
| **Error Handling** | Tagged errors, Effect.gen | try/catch, error states |
| **Dependencies** | Layer-based DI | Context providers |
| **Async State** | Result<Initial, Failure, Success> | { isLoading, error, data } |
| **Composability** | Atoms compose with Effect operators | Hooks compose with React hooks |
| **Services** | Effect.Service with layers | Custom hooks |

---

## Next Steps

1. **Create `packages/web` directory** with Vite + React setup
2. **Install Effect dependencies**: effect, effect-atom, @effect/schema, @effect/platform
3. **Set up Atom runtime** with config and logging
4. **Build first atom and service** (timeline API)
5. **Create PlayCard** and test with live API
6. **Deploy MVP to Vercel**

This design leverages Effect Atom for reactive, type-safe state management with first-class support for async operations, composable services, and functional programming patterns throughout the frontend.
