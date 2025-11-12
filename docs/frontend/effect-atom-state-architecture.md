# Effect-Atom State Architecture for Crate Frontend

**Date:** 2025-11-12
**Purpose:** Complete state modeling using effect-atom reactive patterns for Crate's music exploration frontend

---

## Table of Contents

1. [Effect-Atom Overview](#effect-atom-overview)
2. [State Model](#state-model)
3. [Atom Dependency Graph](#atom-dependency-graph)
4. [Core Atoms](#core-atoms)
5. [Derived Atoms](#derived-atoms)
6. [Effectful Atoms](#effectful-atoms)
7. [Implementation Patterns](#implementation-patterns)
8. [Performance Considerations](#performance-considerations)

---

## Effect-Atom Overview

### Core Concepts

**effect-atom** by Tim Smart is a reactive state management library built entirely on Effect. Key advantages for Crate:

1. **Native Effect Integration**: Atoms wrap Effects, returning `Result.Result<A, E>` types
2. **Automatic Dependency Tracking**: Derived atoms track dependencies via `get` function
3. **Service Integration**: `Atom.runtime()` provides Layer-based dependency injection
4. **Reference Stability**: Atoms work by identity, not value comparison
5. **Lifecycle Management**: Automatic cleanup with `Atom.keepAlive` control
6. **Streaming Support**: Direct integration with Effect streams

### API Highlights

```typescript
// Basic atom
const countAtom = Atom.make(0).pipe(Atom.keepAlive)

// Derived atom
const doubleAtom = Atom.make((get) => get(countAtom) * 2)

// Effectful atom
const usersAtom = runtimeAtom.atom(
  Effect.gen(function*() {
    const service = yield* UsersService
    return yield* service.getAll()
  })
)

// Atom family (parameterized)
const userAtom = Atom.family((id: string) =>
  runtimeAtom.atom(fetchUser(id))
)

// Stream atom
const streamAtom = Atom.make(Stream.fromSchedule(Schedule.spaced(1000)))

// Pull-based pagination
const pullAtom = Atom.pull(playsStream)
```

### React Hooks

```typescript
// Read only
const value = useAtomValue(atom)

// Write only
const setValue = useAtomSet(atom)

// Read + Write
const [value, setValue] = useAtom(atom)

// Subscribe to changes
useAtomSubscribe(atom, (value) => console.log(value))

// Suspense integration
const value = useAtomSuspense(resultAtom)
```

---

## State Model

### State Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **URL State** | Browser URL as source of truth | Play IDs, filters, search query |
| **Viewport State** | What user sees | Visible plays, scroll position |
| **Timeline State** | Timeline visualization | Density buckets, aggregated data |
| **Data State** | Loaded data from backend | Plays, shows, artists |
| **UI State** | Ephemeral UI state | Modals, tooltips, loading spinners |
| **Preference State** | User preferences | Theme, settings, display options |

### State Flow Pattern

```
URL State (searchParam atoms)
  ↓
Parse & Validate (derived atoms)
  ↓
Fetch Data (effectful atoms with services)
  ↓
Transform & Aggregate (derived atoms)
  ↓
Render (React components with hooks)
```

---

## Atom Dependency Graph

### Visual Graph

```
                    ┌─────────────────┐
                    │  urlPlayIdsAtom │ (searchParam)
                    └────────┬────────┘
                             │
                             ↓
                    ┌─────────────────┐
                    │ parsedPlayIds   │ (derived)
                    │   Atom          │
                    └────────┬────────┘
                             │
                ┌────────────┼────────────┐
                ↓            ↓            ↓
       ┌────────────┐  ┌──────────┐  ┌──────────────┐
       │ firstPlay  │  │ lastPlay │  │ playCount    │
       │ IdAtom     │  │ IdAtom   │  │ Atom         │
       └─────┬──────┘  └────┬─────┘  └──────────────┘
             │              │
             └──────┬───────┘
                    ↓
           ┌────────────────┐
           │  playsRange    │ (derived)
           │  Atom          │
           └────────┬───────┘
                    ↓
           ┌────────────────┐
           │  playsDataAtom │ (effectful, uses PlaysService)
           └────────┬───────┘
                    │
        ┌───────────┼───────────┐
        ↓           ↓           ↓
┌──────────┐ ┌─────────────┐ ┌──────────────┐
│ viewport │ │  timeline   │ │  playCard    │
│ Atom     │ │  DensityAtom│ │  AtomFamily  │
└──────────┘ └─────────────┘ └──────────────┘

          Scroll Position
                ↓
    ┌───────────────────────┐
    │ scrollPositionAtom    │ (writable)
    └───────────┬───────────┘
                ↓
    ┌───────────────────────┐
    │ visiblePlayIdsAtom    │ (derived)
    └───────────────────────┘

          Theme & Preferences
                ↓
    ┌───────────────────────┐
    │ themeAtom             │ (kvs - localStorage)
    └───────────────────────┘
```

### Dependency Table

| Atom | Type | Dependencies | Consumers |
|------|------|--------------|-----------|
| `urlPlayIdsAtom` | searchParam | None (URL) | `parsedPlayIdsAtom` |
| `parsedPlayIdsAtom` | derived | `urlPlayIdsAtom` | `firstPlayIdAtom`, `lastPlayIdAtom`, `playCountAtom` |
| `playsRangeAtom` | derived | `firstPlayIdAtom`, `lastPlayIdAtom` | `playsDataAtom` |
| `playsDataAtom` | effectful | `playsRangeAtom`, `PlaysService` | `viewportAtom`, `timelineDensityAtom`, `playCardAtomFamily` |
| `scrollPositionAtom` | writable | None | `visiblePlayIdsAtom`, `timelineMarkerPositionAtom` |
| `visiblePlayIdsAtom` | derived | `scrollPositionAtom`, `playsDataAtom` | Components |
| `timelineDensityAtom` | effectful | `playsDataAtom` | Timeline component |
| `themeAtom` | kvs | None (localStorage) | Root component |

---

## Core Atoms

### 1. URL State (Source of Truth)

```typescript
import { Atom } from "@effect-atom/atom"
import { Schema } from "effect"

// URL search param: ?plays=123,456,789
export const urlPlayIdsAtom = Atom.searchParam(
  "plays",
  Schema.optional(
    Schema.String.pipe(
      Schema.transform(
        Schema.Array(Schema.Number),
        {
          decode: (s) => s.split(',').map(Number).filter(Boolean),
          encode: (arr) => arr.join(',')
        }
      )
    )
  )
)

// URL search param: ?view=timeline|list|grid
export const urlViewModeAtom = Atom.searchParam(
  "view",
  Schema.optional(
    Schema.Literal("timeline", "list", "grid")
  )
).pipe(
  Atom.withFallback(Option.some("timeline" as const))
)

// URL search param: ?q=searchquery
export const urlSearchQueryAtom = Atom.searchParam(
  "q",
  Schema.optional(Schema.String)
)

// URL search param: ?date=2018-03-15
export const urlDateFilterAtom = Atom.searchParam(
  "date",
  Schema.optional(Schema.Date)
)
```

**Why `searchParam`?**
- Bidirectional sync: URL ↔ State
- Schema validation built-in
- Browser back/forward works automatically
- Shareable URLs for free

---

### 2. Scroll & Viewport State

```typescript
import { Atom } from "@effect-atom/atom"

// Scroll position (pixels from top)
export const scrollPositionAtom = Atom.state(0)

// Scroll percentage (0-100)
export const scrollPercentageAtom = Atom.make((get) => {
  const scrollPos = get(scrollPositionAtom)
  const totalHeight = get(totalHeightAtom)
  if (totalHeight === 0) return 0
  return (scrollPos / totalHeight) * 100
})

// Viewport dimensions
export const viewportDimensionsAtom = Atom.state({
  width: window.innerWidth,
  height: window.innerHeight
})

// Debounced scroll position (for expensive operations)
export const debouncedScrollPositionAtom = scrollPositionAtom.pipe(
  Atom.debounce("100 millis")
)
```

---

### 3. Theme & Preferences (Persisted)

```typescript
import { Atom } from "@effect-atom/atom"
import { Schema } from "effect"
import { KeyValueStore } from "@effect/platform"

// Theme stored in localStorage
export const themeAtom = Atom.kvs(
  "theme",
  Schema.Literal("light", "dark", "auto"),
  { defaultValue: "dark" }
)

// Display density
export const displayDensityAtom = Atom.kvs(
  "displayDensity",
  Schema.Literal("comfortable", "compact", "spacious"),
  { defaultValue: "comfortable" }
)

// Timeline settings
export const timelineSettingsAtom = Atom.kvs(
  "timelineSettings",
  Schema.Struct({
    showDensity: Schema.Boolean,
    showMarkers: Schema.Boolean,
    gradientIntensity: Schema.Number.pipe(Schema.between(0, 100))
  }),
  {
    defaultValue: {
      showDensity: true,
      showMarkers: true,
      gradientIntensity: 70
    }
  }
)
```

---

## Derived Atoms

### 1. Parse URL State

```typescript
import { Atom } from "@effect-atom/atom"
import { Array, Option } from "effect"

// Parse play IDs from URL
export const parsedPlayIdsAtom = Atom.make((get) => {
  const maybeIds = get(urlPlayIdsAtom)
  return Option.getOrElse(maybeIds, () => [] as number[])
})

// First play ID
export const firstPlayIdAtom = Atom.make((get) => {
  const ids = get(parsedPlayIdsAtom)
  return Array.head(ids)
})

// Last play ID
export const lastPlayIdAtom = Atom.make((get) => {
  const ids = get(parsedPlayIdsAtom)
  return Array.last(ids)
})

// Play count
export const playCountAtom = Atom.make((get) => {
  const ids = get(parsedPlayIdsAtom)
  return ids.length
})

// Is empty?
export const isEmptyPlaylistAtom = Atom.make((get) => {
  return get(playCountAtom) === 0
})
```

---

### 2. Compute Viewport Plays

```typescript
import { Atom } from "@effect-atom/atom"

// Constants
const PLAY_CARD_HEIGHT = 120 // pixels
const BUFFER_MULTIPLIER = 2 // Load 2x viewport worth

// Calculate visible play indices based on scroll
export const visiblePlayIndicesAtom = Atom.make((get) => {
  const scrollPos = get(scrollPositionAtom)
  const viewportHeight = get(viewportDimensionsAtom).height
  const totalPlays = get(playCountAtom)

  // Calculate start/end indices
  const startIndex = Math.max(0, Math.floor(scrollPos / PLAY_CARD_HEIGHT))
  const endIndex = Math.min(
    totalPlays,
    Math.ceil((scrollPos + viewportHeight) / PLAY_CARD_HEIGHT)
  )

  // Add buffer
  const bufferedStart = Math.max(0, startIndex - Math.floor(viewportHeight / PLAY_CARD_HEIGHT * BUFFER_MULTIPLIER))
  const bufferedEnd = Math.min(totalPlays, endIndex + Math.floor(viewportHeight / PLAY_CARD_HEIGHT * BUFFER_MULTIPLIER))

  return {
    visible: { start: startIndex, end: endIndex },
    buffered: { start: bufferedStart, end: bufferedEnd }
  }
})

// Get visible play IDs
export const visiblePlayIdsAtom = Atom.make((get) => {
  const indices = get(visiblePlayIndicesAtom)
  const allPlayIds = get(parsedPlayIdsAtom)

  return allPlayIds.slice(
    indices.buffered.start,
    indices.buffered.end
  )
})
```

---

### 3. Timeline Calculations

```typescript
import { Atom } from "@effect-atom/atom"

// Total plays in KEXP database (constant)
export const totalPlaysConstant = 2_200_000

// Timeline percentage for each play ID
export const playIdToPercentageAtom = Atom.make((get) => {
  return (playId: number) => (playId / totalPlaysConstant) * 100
})

// Inverse: percentage to play ID
export const percentageToPlayIdAtom = Atom.make((get) => {
  return (percentage: number) => Math.floor((percentage / 100) * totalPlaysConstant)
})

// Timeline date estimation
export const playIdToDateAtom = Atom.make((get) => {
  const TIMELINE_START = new Date('2001-01-01')
  const TIMELINE_END = new Date()
  const totalTime = TIMELINE_END.getTime() - TIMELINE_START.getTime()

  return (playId: number) => {
    const playTime = TIMELINE_START.getTime() + (playId / totalPlaysConstant) * totalTime
    return new Date(playTime)
  }
})
```

---

## Effectful Atoms

### 1. Runtime Setup

```typescript
import { Atom } from "@effect-atom/atom"
import { Layer } from "effect"
import { PlaysService } from "../services/PlaysService"
import { TimelineService } from "../services/TimelineService"

// Create runtime with service layers
export const runtimeAtom = Atom.runtime(
  Layer.mergeAll(
    PlaysService.Default,
    TimelineService.Default
  )
)

// Global config layer
Atom.runtime.addGlobalLayer(
  Layer.setConfigProvider(
    ConfigProvider.fromJson(import.meta.env)
  )
)
```

---

### 2. Fetch Plays Data

```typescript
import { Atom } from "@effect-atom/atom"
import { Effect, Schema } from "effect"
import { FactPlay } from "@crate/domain/kexp/schemas"

// Fetch plays for a range
export const playsRangeAtom = Atom.make((get) => {
  const playIds = get(parsedPlayIdsAtom)

  if (playIds.length === 0) {
    return Option.none()
  }

  const first = Array.head(playIds)
  const last = Array.last(playIds)

  return Option.all([first, last]).pipe(
    Option.map(([start, end]) => ({
      startId: start,
      endId: end,
      count: playIds.length
    }))
  )
})

// Effectful atom: fetch plays from service
export const playsDataAtom = runtimeAtom.atom(
  Effect.gen(function*() {
    const get = yield* Atom.Context
    const range = get(playsRangeAtom)

    // No range, return empty
    if (Option.isNone(range)) {
      return []
    }

    const { startId, endId } = range.value
    const playsService = yield* PlaysService

    // Fetch plays in range
    const plays = yield* playsService.getPlaysInRange(startId, endId)

    return plays
  })
)

// Plays data as map (for O(1) lookup)
export const playsMapAtom = Atom.make((get) => {
  const plays = get(playsDataAtom)

  // Handle Result type
  if (plays._tag === "Failure" || plays._tag === "Initial") {
    return new Map()
  }

  const playsArray = plays.value
  return new Map(
    playsArray.map(play => [play.id, play])
  )
})
```

---

### 3. Timeline Density Aggregation

```typescript
import { Atom } from "@effect-atom/atom"
import { Effect, Chunk } from "effect"

const BUCKET_COUNT = 500

// Schema for timeline bucket
const TimelineBucket = Schema.Struct({
  startTime: Schema.Date,
  endTime: Schema.Date,
  playCount: Schema.Number,
  density: Schema.Number.pipe(Schema.between(0, 1))
})

// Effectful atom: aggregate timeline density
export const timelineDensityAtom = runtimeAtom.atom(
  Effect.gen(function*() {
    const get = yield* Atom.Context
    const playsResult = get(playsDataAtom)

    // Wait for plays to load
    if (playsResult._tag !== "Success") {
      return []
    }

    const plays = playsResult.value

    // No plays, return empty buckets
    if (plays.length === 0) {
      return []
    }

    const timelineService = yield* TimelineService
    const buckets = yield* timelineService.aggregateDensity(plays, BUCKET_COUNT)

    return buckets
  })
)
```

---

### 4. Atom Families (Parameterized Atoms)

```typescript
import { Atom } from "@effect-atom/atom"

// Atom family: individual play by ID
export const playAtomFamily = Atom.family((playId: number) =>
  Atom.make((get) => {
    const playsMap = get(playsMapAtom)
    return Option.fromNullable(playsMap.get(playId))
  })
)

// Atom family: play card UI state
export const playCardUIAtomFamily = Atom.family((playId: number) =>
  Atom.state({
    isHovered: false,
    isExpanded: false,
    isPlaying: false
  })
)

// Fetch single play (if not in cache)
export const fetchPlayAtomFamily = Atom.family((playId: number) =>
  runtimeAtom.atom(
    Effect.gen(function*() {
      const get = yield* Atom.Context

      // Check if already loaded
      const cachedPlay = get(playAtomFamily(playId))
      if (Option.isSome(cachedPlay)) {
        return cachedPlay.value
      }

      // Fetch from service
      const playsService = yield* PlaysService
      const play = yield* playsService.getPlay(playId)

      return play
    })
  )
)
```

---

### 5. Pull-Based Pagination

```typescript
import { Atom } from "@effect-atom/atom"
import { Stream, Schedule } from "effect"

// Stream of plays (infinite scroll)
const playsStreamAtom = runtimeAtom.atom(
  Effect.gen(function*() {
    const playsService = yield* PlaysService

    // Create stream with pagination
    const stream = Stream.paginateChunkEffect(
      { offset: 0, limit: 20 },
      ({ offset, limit }) =>
        Effect.gen(function*() {
          const plays = yield* playsService.getPlays(offset, limit)

          const hasMore = plays.length === limit
          const nextState = hasMore
            ? Option.some({ offset: offset + limit, limit })
            : Option.none()

          return [Chunk.fromIterable(plays), nextState]
        })
    )

    return stream
  })
)

// Pull atom: load more plays on demand
export const playsPullAtom = Atom.pull(
  Stream.unwrap(
    playsStreamAtom.pipe(
      Effect.map(result =>
        result._tag === "Success" ? result.value : Stream.empty
      )
    )
  )
)

// Usage in component:
// const [result, pull] = useAtom(playsPullAtom)
// <button onClick={() => pull()}>Load More</button>
```

---

### 6. Function Atoms (Mutations)

```typescript
import { Atom } from "@effect-atom/atom"
import { Effect } from "effect"

// Function atom: add play to URL
export const addPlayToUrlAtom = runtimeAtom.fn(
  Effect.fnUntraced(function*(playId: number) {
    const get = yield* Atom.Context
    const currentIds = get(parsedPlayIdsAtom)

    // Add if not already present
    if (!currentIds.includes(playId)) {
      const newIds = [...currentIds, playId]
      get.set(urlPlayIdsAtom, Option.some(newIds))
    }
  })
)

// Function atom: remove play from URL
export const removePlayFromUrlAtom = runtimeAtom.fn(
  Effect.fnUntraced(function*(playId: number) {
    const get = yield* Atom.Context
    const currentIds = get(parsedPlayIdsAtom)
    const newIds = currentIds.filter(id => id !== playId)

    get.set(
      urlPlayIdsAtom,
      newIds.length > 0 ? Option.some(newIds) : Option.none()
    )
  })
)

// Function atom: navigate to play position on timeline
export const seekToPlayAtom = runtimeAtom.fn(
  Effect.fnUntraced(function*(playId: number) {
    const get = yield* Atom.Context
    const percentage = get(playIdToPercentageAtom)(playId)
    const totalHeight = get(totalHeightAtom)
    const targetScroll = (percentage / 100) * totalHeight

    get.set(scrollPositionAtom, targetScroll)
  })
)

// Usage in component:
// const addPlay = useAtomSet(addPlayToUrlAtom, { mode: "promiseExit" })
// await addPlay(123456)
```

---

## Implementation Patterns

### Pattern 1: URL-Driven Navigation

```typescript
// Component: PlaysList
function PlaysList() {
  // Read from URL (automatically updates when URL changes)
  const playIds = useAtomValue(parsedPlayIdsAtom)
  const playsResult = useAtomValue(playsDataAtom)

  // Loading state
  if (playsResult._tag === "Initial") {
    return <LoadingSpinner />
  }

  // Error state
  if (playsResult._tag === "Failure") {
    return <ErrorMessage error={playsResult.cause} />
  }

  // Success
  const plays = playsResult.value

  return (
    <div>
      {plays.map(play => (
        <PlayCard key={play.id} playId={play.id} />
      ))}
    </div>
  )
}
```

---

### Pattern 2: Virtualized Scrolling

```typescript
// Component: VirtualizedTimeline
function VirtualizedTimeline() {
  const [scrollPos, setScrollPos] = useAtom(scrollPositionAtom)
  const visibleIndices = useAtomValue(visiblePlayIndicesAtom)
  const visiblePlayIds = useAtomValue(visiblePlayIdsAtom)
  const totalPlays = useAtomValue(playCountAtom)

  const containerRef = useRef<HTMLDivElement>(null)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollPos(e.currentTarget.scrollTop)
  }

  const totalHeight = totalPlays * PLAY_CARD_HEIGHT

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ height: '100vh', overflowY: 'auto' }}
    >
      {/* Spacer to maintain total height */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Visible cards */}
        {visiblePlayIds.map((playId, index) => (
          <div
            key={playId}
            style={{
              position: 'absolute',
              top: (visibleIndices.buffered.start + index) * PLAY_CARD_HEIGHT,
              left: 0,
              right: 0
            }}
          >
            <PlayCard playId={playId} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

### Pattern 3: Timeline with Suspense

```typescript
// Component: Timeline
function Timeline() {
  const densityResult = useAtomSuspense(timelineDensityAtom)
  const viewportPlayIds = useAtomValue(visiblePlayIdsAtom)
  const settings = useAtomValue(timelineSettingsAtom)

  return (
    <svg viewBox="0 0 60 1000" className="timeline">
      {/* Gradient background */}
      <TimelineGradient />

      {/* Density heatmap */}
      {settings.showDensity && (
        <DensityHeatmap buckets={densityResult} />
      )}

      {/* Viewport markers */}
      {settings.showMarkers && (
        <TimelineMarkers playIds={viewportPlayIds} />
      )}

      {/* Interaction layer */}
      <TimelineInteraction />
    </svg>
  )
}

// Wrap with Suspense boundary
function TimelineWithSuspense() {
  return (
    <Suspense fallback={<TimelineLoading />}>
      <Timeline />
    </Suspense>
  )
}
```

---

### Pattern 4: Optimistic Updates

```typescript
import { Atom } from "@effect-atom/atom"

// Optimistic add play
export const addPlayOptimisticAtom = Atom.optimisticFn(
  // Reducer: immediate state update
  (state: number[], playId: number) => {
    return [...state, playId]
  },
  // Async function: actual mutation
  runtimeAtom.fn(
    Effect.fnUntraced(function*(playId: number) {
      const playsService = yield* PlaysService
      yield* playsService.addPlayToList(playId)
    })
  )
)

// Component
function AddPlayButton({ playId }: { playId: number }) {
  const [optimisticIds, addPlay] = useAtom(addPlayOptimisticAtom)

  const handleClick = async () => {
    await addPlay(playId)
  }

  return (
    <button onClick={handleClick} disabled={optimisticIds.includes(playId)}>
      {optimisticIds.includes(playId) ? "Adding..." : "Add to List"}
    </button>
  )
}
```

---

### Pattern 5: Refreshing on Focus

```typescript
import { Atom } from "@effect-atom/atom"

// Auto-refresh plays when window gains focus
export const playsDataWithRefreshAtom = playsDataAtom.pipe(
  Atom.refreshOnWindowFocus
)

// Manual refresh
function PlaysListWithRefresh() {
  const plays = useAtomValue(playsDataWithRefreshAtom)
  const refresh = useAtomRefresh(playsDataWithRefreshAtom)

  return (
    <div>
      <button onClick={refresh}>Refresh</button>
      <PlaysList plays={plays} />
    </div>
  )
}
```

---

### Pattern 6: Batch Updates

```typescript
import { Atom } from "@effect-atom/atom"
import { Effect } from "effect"

// Batch multiple state updates
const bulkUpdatePlaysAtom = runtimeAtom.fn(
  Effect.fnUntraced(function*(updates: Array<{ id: number, data: Partial<FactPlay> }>) {
    const get = yield* Atom.Context

    // Batch updates (single render)
    yield* Atom.batch(
      Effect.gen(function*() {
        for (const { id, data } of updates) {
          const playAtom = playAtomFamily(id)
          const current = get(playAtom)

          if (Option.isSome(current)) {
            const updated = { ...current.value, ...data }
            get.set(playAtom, Option.some(updated))
          }
        }
      })
    )
  })
)
```

---

## Performance Considerations

### 1. Atom Lifecycle

**Keep Alive vs Auto Dispose**

```typescript
// Global atoms (always alive)
export const themeAtom = Atom.make("dark").pipe(
  Atom.keepAlive
)

// Component-scoped atoms (dispose when unmounted)
export const modalStateAtom = Atom.state(false) // auto-dispose by default
```

**Idle TTL**

```typescript
// Dispose after 30 seconds of inactivity
export const expensiveDataAtom = runtimeAtom
  .atom(fetchExpensiveData())
  .pipe(Atom.setIdleTTL("30 seconds"))
```

---

### 2. Debouncing Expensive Operations

```typescript
// Debounce scroll updates
export const debouncedScrollAtom = scrollPositionAtom.pipe(
  Atom.debounce("100 millis")
)

// Use debounced version for expensive calculations
export const visiblePlayIdsAtom = Atom.make((get) => {
  const scrollPos = get(debouncedScrollAtom) // debounced!
  // ... expensive calculation
})
```

---

### 3. Memoization with Atom Families

```typescript
// Atom family automatically memoizes by key
export const playAtomFamily = Atom.family((playId: number) =>
  Atom.make((get) => {
    // Called once per playId, then cached
    const playsMap = get(playsMapAtom)
    return playsMap.get(playId)
  })
)

// Multiple components reading same playId → same atom instance
```

---

### 4. Lazy Loading with Suspense

```typescript
// Don't load until rendered
export const playDetailAtomFamily = Atom.family((playId: number) =>
  runtimeAtom.atom(
    Effect.gen(function*() {
      const playsService = yield* PlaysService
      return yield* playsService.getPlayDetail(playId)
    })
  ).pipe(
    Atom.setLazy(true) // Don't evaluate until subscribed
  )
)
```

---

### 5. Stream Backpressure

```typescript
// Stream with backpressure control
const playsStreamAtom = Atom.make(
  Stream.fromSchedule(Schedule.spaced("1 second")).pipe(
    Stream.buffer({ capacity: 10, strategy: "dropping" }) // Drop old items if buffer full
  )
)
```

---

## Complete Example: Timeline Component

```typescript
import { Atom } from "@effect-atom/atom"
import { useAtomValue, useAtomSet, useAtomSuspense } from "@effect-atom/atom-react"
import { Suspense } from "react"

// ============================================================================
// Atoms
// ============================================================================

// Timeline hover state
const timelineHoverAtom = Atom.state<number | null>(null)

// Timeline click handler
const timelineClickAtom = runtimeAtom.fn(
  Effect.fnUntraced(function*(percentage: number) {
    const get = yield* Atom.Context
    const playId = get(percentageToPlayIdAtom)(percentage)

    // Add to URL
    yield* get.set(addPlayToUrlAtom, playId)

    // Scroll to position
    yield* get.set(seekToPlayAtom, playId)
  })
)

// ============================================================================
// Components
// ============================================================================

function TimelineInteraction() {
  const [hoveredPosition, setHoveredPosition] = useAtom(timelineHoverAtom)
  const handleClick = useAtomSet(timelineClickAtom, { mode: "promiseExit" })
  const playIdToPercentage = useAtomValue(playIdToPercentageAtom)

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const percentage = (y / rect.height) * 100
    setHoveredPosition(percentage)
  }

  const handleSvgClick = async (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const percentage = (y / rect.height) * 100
    await handleClick(percentage)
  }

  return (
    <svg
      className="timeline-interaction"
      onMouseMove={handleMouseMove}
      onClick={handleSvgClick}
      onMouseLeave={() => setHoveredPosition(null)}
    >
      {hoveredPosition !== null && (
        <line
          x1="0"
          x2="60"
          y1={`${hoveredPosition}%`}
          y2={`${hoveredPosition}%`}
          stroke="white"
          strokeWidth="1"
          strokeOpacity="0.5"
        />
      )}
    </svg>
  )
}

function Timeline() {
  const densityBuckets = useAtomSuspense(timelineDensityAtom)
  const visiblePlayIds = useAtomValue(visiblePlayIdsAtom)
  const settings = useAtomValue(timelineSettingsAtom)

  return (
    <div className="timeline-container">
      <svg viewBox="0 0 60 1000" className="timeline-svg">
        {/* Gradient background */}
        <defs>
          <linearGradient id="timeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsla(220, 30%, 85%, 0.25)" />
            <stop offset="100%" stopColor="hsla(220, 30%, 15%, 0.1)" />
          </linearGradient>
        </defs>

        <rect
          x="22"
          y="0"
          width="16"
          height="1000"
          fill="url(#timeGradient)"
          rx="8"
        />

        {/* Density visualization */}
        {settings.showDensity && (
          <DensityHeatmap buckets={densityBuckets} />
        )}

        {/* Viewport markers */}
        {settings.showMarkers && (
          <TimelineMarkers playIds={visiblePlayIds} />
        )}
      </svg>

      {/* Interaction layer */}
      <TimelineInteraction />
    </div>
  )
}

export function TimelineWithSuspense() {
  return (
    <Suspense fallback={<TimelineLoading />}>
      <Timeline />
    </Suspense>
  )
}
```

---

## Key Takeaways

### Advantages of effect-atom for Crate

1. **Single Source of Truth**: URL state as foundation
2. **Automatic Dependency Tracking**: No manual subscription management
3. **Type Safety**: Full TypeScript + Effect Schema integration
4. **Service Integration**: Effect Layers → atoms → components
5. **Lazy Evaluation**: Atoms only compute when subscribed
6. **Automatic Cleanup**: Unused atoms are disposed
7. **Streaming Support**: Native Effect Stream integration
8. **Optimistic UI**: Built-in optimistic update patterns
9. **Testing**: Mock atoms with test layers

### State Flow Summary

```
URL (searchParam atoms)
  ↓ (parse & validate)
Derived Atoms
  ↓ (fetch data)
Effectful Atoms (with services)
  ↓ (transform & aggregate)
Derived Atoms
  ↓ (render)
React Components (with hooks)
```

### Atom Types Used

| Type | Purpose | Example |
|------|---------|---------|
| `Atom.searchParam` | URL state | `urlPlayIdsAtom` |
| `Atom.state` | Writable local state | `scrollPositionAtom` |
| `Atom.make((get) => ...)` | Derived read-only | `visiblePlayIdsAtom` |
| `runtimeAtom.atom(Effect)` | Async data fetching | `playsDataAtom` |
| `Atom.family` | Parameterized atoms | `playAtomFamily` |
| `Atom.kvs` | Persisted to storage | `themeAtom` |
| `runtimeAtom.fn` | Effectful mutations | `addPlayToUrlAtom` |
| `Atom.pull` | Stream pagination | `playsPullAtom` |

---

**Next Steps**: Implement atom structure in frontend package and connect to React components with hooks.
