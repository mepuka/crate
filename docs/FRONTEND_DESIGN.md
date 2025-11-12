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
/play/$playId               → Jump to specific play with context
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
  "state": "@effect-atom/atom-react (reactive state)",
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
  "@effect-atom/atom-react": "Reactive state management",
  "@effect/platform": "HTTP client",
  "@effect/schema": "Runtime validation & types",
  "@tanstack/react-router": "Type-safe file-based routing",
  "@tanstack/react-virtual": "Virtualized infinite scroll",
  "framer-motion": "Scroll animations",
  "date-fns": "Date formatting",
  "shadcn/ui": "Base component library"
}
```

**Philosophy**: Effect-first architecture using **atoms for ALL data fetching** (no React Query). TanStack Router handles routing only.

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
  total_count?: number
  anchor_position?: number
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
```

**Performance:** <20ms with FAISS

---

## Data Models (Effect Schema)

### PlayResult Schema

```typescript
// src/Domain/Play.ts
import { Schema } from "@effect/schema"

export class PlayResult extends Schema.Class<PlayResult>("PlayResult")({
  id: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  similarity: Schema.Number,

  // Metadata
  album: Schema.NullOr(Schema.String),
  airdate: Schema.DateTimeUtc,  // Parsed from ISO string
  labels: Schema.Array(Schema.String),
  rotation_status: Schema.NullOr(Schema.String),
  is_local: Schema.Boolean,
  is_live: Schema.Boolean,
  is_request: Schema.Boolean,
  comment: Schema.NullOr(Schema.String),
  show: Schema.Number,

  // Album artwork
  image_uri: Schema.NullOr(Schema.String),
  thumbnail_uri: Schema.NullOr(Schema.String),

  // MusicBrainz IDs
  artist_mbid: Schema.NullOr(Schema.Array(Schema.String)),
  recording_mbid: Schema.NullOr(Schema.String),
  release_mbid: Schema.NullOr(Schema.String),
  release_group_mbid: Schema.NullOr(Schema.String)
}) {}

export class TimelineResponse extends Schema.Class<TimelineResponse>("TimelineResponse")({
  results: Schema.Array(PlayResult),
  next_cursor: Schema.NullOr(Schema.String),
  has_more: Schema.Boolean,
  query_time_ms: Schema.Number,
  total_count: Schema.optional(Schema.Number),
  anchor_position: Schema.optional(Schema.Number)
}) {}

export class SearchResponse extends Schema.Class<SearchResponse>("SearchResponse")({
  results: Schema.Array(PlayResult),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  query: Schema.String
}) {}
```

---

## Architecture

### High-Level Component Tree

```
App
├── Providers
│   ├── AtomProvider (@effect-atom/atom-react)
│   └── RouterProvider (TanStack Router)
│
├── Authenticated (atom-gated)
│   ├── useAtomMount(timelineAtom)
│   ├── useAtomMount(searchAtom)
│   │
│   └── RouterProvider
│       └── Routes
│           ├── / (index)
│           │   └── InfiniteTimeline
│           ├── /play/$playId
│           │   └── InfiniteTimeline (anchored)
│           ├── /search
│           │   └── SearchResults
│           └── /timeline
│               └── InfiniteTimeline (jumped)
│
└── ErrorBoundary
```

---

## Effect Atom Architecture

### Atom Setup (No Runtime Layers Needed)

```typescript
// src/main.tsx
import { createRoot } from "react-dom/client"
import { StrictMode } from "react"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

**Note**: Unlike server-side Effect, frontend atoms don't need `Atom.runtime.addGlobalLayer`. Services are provided through atoms themselves.

---

## Core Atoms

### 1. Timeline Atom (Data Fetching)

```typescript
// src/Timeline.ts
import { Atom } from "@effect-atom/atom-react"
import { HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import { Effect, pipe } from "effect"
import { TimelineResponse } from "./Domain/Play"

export interface TimelineState {
  plays: PlayResult[]
  cursor: string | null
  hasMore: boolean
}

// Timeline atom with automatic HTTP fetching
export const timelineAtom = Atom.make(
  pipe(
    HttpClientRequest.get("/api/plays/timeline"),
    HttpClientRequest.setUrlParam("limit", "50"),
    HttpClient.fetchOk,
    Effect.flatMap(HttpClientResponse.schemaBodyJson(TimelineResponse)),
    Effect.map((response) => ({
      plays: response.results,
      cursor: response.next_cursor,
      hasMore: response.has_more
    }))
  )
)

// Computed atom for current plays
export const currentPlaysAtom = Atom.map(timelineAtom, (state) => state.plays)

// Append more plays (infinite scroll action)
export const appendPlaysAtom = Atom.fnEffect((get) =>
  Effect.gen(function* () {
    const state = yield* get(timelineAtom)

    if (!state.hasMore) return state

    const response = yield* pipe(
      HttpClientRequest.get("/api/plays/timeline"),
      HttpClientRequest.setUrlParams({
        cursor: state.cursor ?? "",
        limit: "50"
      }),
      HttpClient.fetchOk,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(TimelineResponse))
    )

    return {
      plays: [...state.plays, ...response.results],
      cursor: response.next_cursor,
      hasMore: response.has_more
    }
  })
)

// Jump to position (anchor, date, percentage)
export const jumpToPositionAtom = Atom.fn((params: {
  anchor_id?: number
  since?: string
  percentage?: number
}) =>
  Effect.gen(function* () {
    const request = pipe(
      HttpClientRequest.get("/api/plays/timeline"),
      HttpClientRequest.setUrlParams({
        limit: "50",
        ...(params.anchor_id && { anchor_id: String(params.anchor_id) }),
        ...(params.since && { since: params.since }),
        ...(params.percentage !== undefined && { percentage: String(params.percentage) })
      })
    )

    const response = yield* pipe(
      request,
      HttpClient.fetchOk,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(TimelineResponse))
    )

    return {
      plays: response.results,
      cursor: response.next_cursor,
      hasMore: response.has_more,
      anchorPosition: response.anchor_position
    }
  })
)
```

### 2. Search Atom

```typescript
// src/Search.ts
import { Atom } from "@effect-atom/atom-react"
import { HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import { Effect, pipe, Stream, Schedule, Duration } from "effect"
import { SearchResponse } from "./Domain/Play"

// Search query atom (user input)
export const searchQueryAtom = Atom.make("")

// Search results atom (derived from query)
export const searchResultsAtom = Atom.make((get) =>
  pipe(
    Effect.sync(() => get(searchQueryAtom)),
    Effect.flatMap((query) => {
      if (query.length < 3) {
        return Effect.succeed({ results: [], total: 0, query_time_ms: 0, query: "" })
      }

      return pipe(
        HttpClientRequest.post("/api/search"),
        HttpClientRequest.bodyJson({ query, limit: 20, offset: 0 }),
        HttpClient.fetchOk,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(SearchResponse))
      )
    })
  )
)

// Debounced search (300ms delay)
export const debouncedSearchAtom = Atom.stream(
  pipe(
    Stream.fromSchedule(Schedule.spaced(Duration.millis(300))),
    Stream.flatMap(() => searchResultsAtom)
  )
)
```

### 3. Navigation Atoms

```typescript
// src/Navigation.ts
import { Atom } from "@effect-atom/atom-react"

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

## Component Patterns

### Pattern 1: Reading Atom State

```typescript
// src/components/PlayList.tsx
import { useAtomValue } from "@effect-atom/atom-react"
import { currentPlaysAtom } from "@/Timeline"

export const PlayList = () => {
  const plays = useAtomValue(currentPlaysAtom)

  return (
    <div>
      {plays.map(play => (
        <PlayCard key={play.id} play={play} />
      ))}
    </div>
  )
}
```

### Pattern 2: Reading with Suspense

```typescript
// src/routes/index.tsx
import { useAtomSuspense } from "@effect-atom/atom-react"
import { timelineAtom } from "@/Timeline"
import { Suspense } from "react"

export const Route = createFileRoute('/')({
  component: () => (
    <Suspense fallback={<LoadingSpinner />}>
      <HomePage />
    </Suspense>
  )
})

function HomePage() {
  const timeline = useAtomSuspense(timelineAtom)

  return (
    <InfiniteTimeline plays={timeline.plays} hasMore={timeline.hasMore} />
  )
}
```

### Pattern 3: Atom Mutations

```typescript
// src/components/InfiniteScroll.tsx
import { useAtomSet } from "@effect-atom/atom-react"
import { appendPlaysAtom } from "@/Timeline"

export const InfiniteScroll = ({ children }: { children: React.ReactNode }) => {
  const appendPlays = useAtomSet(appendPlaysAtom)
  const lastItemRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          appendPlays()  // Atom handles the async Effect
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

### Pattern 4: Bidirectional State

```typescript
// src/components/SearchBar.tsx
import { useAtom } from "@effect-atom/atom-react"
import { searchQueryAtom } from "@/Search"

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

### Pattern 5: Atom Mounting (Initialization)

```typescript
// src/App.tsx
import { useAtomMount } from "@effect-atom/atom-react"
import { timelineAtom, searchAtom } from "@/atoms"
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'

function App() {
  // Initialize atoms before routing
  useAtomMount(timelineAtom)
  useAtomMount(searchAtom)

  return <RouterProvider router={router} />
}
```

---

## Routing Strategy (TanStack Router)

### Router Setup

```typescript
// src/router.ts
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({ routeTree })
```

### Route Definitions

```typescript
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '@/components/Layout'

export const Route = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  )
})
```

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
  validateSearch: (search: Record<string, unknown>) => ({
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
  validateSearch: (search: Record<string, unknown>) => ({
    since: search.since as string | undefined,
    until: search.until as string | undefined,
    percentage: search.percentage ? Number(search.percentage) : undefined
  })
})
```

---

## Performance Optimizations

### 1. Virtual Scrolling

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAtomValue } from '@effect-atom/atom-react'
import { currentPlaysAtom } from '@/Timeline'

export const VirtualTimeline = () => {
  const plays = useAtomValue(currentPlaysAtom)
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: plays.length,
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

### 2. Atom Families for Dynamic State

```typescript
// src/PlayDetails.ts
export const playDetailsFamily = Atom.family((playId: number) =>
  Atom.make(
    pipe(
      HttpClientRequest.get(`/api/plays/${playId}`),
      HttpClient.fetchOk,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(PlayResult))
    )
  )
)

// Usage in component
const playDetails = useAtomValue(playDetailsFamily(playId))
```

### 3. Optimistic Updates

```typescript
// src/Favorites.ts
export const favoritesAtom = Atom.make<Set<number>>(new Set())

export const toggleFavoriteAtom = Atom.fnEffect((get, playId: number) =>
  Effect.gen(function* () {
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
    yield* pipe(
      HttpClientRequest.post("/api/favorites/toggle"),
      HttpClientRequest.bodyJson({ playId }),
      HttpClient.fetchOk
    )

    return newFavorites
  })
)
```

---

## Error Handling

### Tagged Errors

```typescript
// src/Domain/errors.ts
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
import { Component, ErrorInfo, ReactNode } from 'react'

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorMessage />
    }

    return this.props.children
  }
}
```

---

## Implementation Checklist

### Week 1: Foundation
- [ ] Set up Vite + React + TypeScript
- [ ] Install @effect-atom/atom-react, effect, @effect/platform
- [ ] Set up TanStack Router (file-based)
- [ ] Create basic Layout + Header
- [ ] Configure shadcn/ui + Tailwind

### Week 2: Core Atoms
- [ ] Define PlayResult, TimelineResponse schemas
- [ ] Create timeline atoms (base, append, jump)
- [ ] Create search atoms with debouncing
- [ ] Build navigation atoms

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
- [ ] Loading states + Suspense

### Week 5: Deploy & Monitor
- [ ] Deploy to Vercel
- [ ] Configure CORS on FastAPI backend
- [ ] Performance testing (Lighthouse)
- [ ] Add analytics (optional)

---

## Key Differences from React Query Approach

| Aspect | Effect Atom | React Query |
|--------|-------------|-------------|
| **Philosophy** | Effect-first, functional | React-first, imperative |
| **Data Fetching** | Atoms with Effect operators | useQuery hooks |
| **Type Safety** | Effect Schema validation | TypeScript only |
| **Error Handling** | Tagged errors, Effect channel | try/catch, error states |
| **Async State** | Suspense + atoms | { isLoading, error, data } |
| **Composability** | Atoms compose with pipe | Hooks compose with hooks |
| **Caching** | Atom-level automatic | Query-level manual |

---

## Next Steps

1. **Create `packages/web` directory** with Vite + React setup
2. **Install dependencies**: effect, @effect-atom/atom-react, @effect/schema, @effect/platform
3. **Set up TanStack Router** with file-based routes
4. **Build first atom** (timelineAtom) with HTTP fetching
5. **Create PlayCard component** with useAtomValue
6. **Deploy MVP to Vercel**

This design leverages **Effect Atom for ALL data management** (no React Query), with TanStack Router handling routing, and idiomatic Effect patterns throughout.
