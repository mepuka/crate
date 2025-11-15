# Infinite Scroll Timeline Architecture

**Date:** 2025-11-13
**Purpose:** Design document for performant, reactive infinite scroll timeline using Effect Atom patterns

---

## Table of Contents

1. [Overview](#overview)
2. [System Survey](#system-survey)
3. [Architecture Design](#architecture-design)
4. [Atom Dependency Graph](#atom-dependency-graph)
5. [Core Atoms Implementation](#core-atoms-implementation)
6. [Virtualization Strategy](#virtualization-strategy)
7. [Gap Detection Algorithm](#gap-detection-algorithm)
8. [Background Service Integration](#background-service-integration)
9. [Component Patterns](#component-patterns)
10. [Implementation Plan](#implementation-plan)
11. [Performance Characteristics](#performance-characteristics)

---

## Overview

### Problem Statement

Current implementation:
- Background service fetches latest plays every 3 seconds
- Stores all plays in KVS and renders them all at once
- No pagination or infinite scroll
- No gap handling on initial load
- Performance degrades with large lists

### Goals

1. **Infinite Scroll**: Load initial 50 plays, paginate on scroll
2. **Gap Handling**: Detect and fill gaps between stored and latest plays
3. **Virtualization**: Render only visible items for performance
4. **Reactivity**: Background service updates new plays seamlessly
5. **Type Safety**: Full Effect Schema validation throughout

---

## System Survey

### Python API Capabilities

From `faiss-search-api/TIMELINE_API.md`:

**Endpoint:** `GET /api/plays/timeline`

**Navigation Methods:**

1. **Cursor Pagination** (default, newest first)
   - `?limit=50` - Initial page
   - `?cursor={next_cursor}&limit=50` - Next page
   - Performance: <5ms per query
   - Returns: `next_cursor` (base64), `has_more` (boolean)

2. **Time-Based Jump**
   - `?since=2015-03-15T00:00:00&limit=50`
   - `?since=2015-03-01&until=2015-04-01&limit=50`
   - Performance: <10ms per query
   - Use case: Gap filling

3. **Percentage Jump** (0.0 = newest, 1.0 = oldest)
   - `?percentage=0.5&limit=50`
   - Performance: ~50ms
   - Use case: Timeline scrubber

4. **Anchor Jump** (center around play ID)
   - `?anchor_id=3576848&limit=50`
   - Performance: ~100ms
   - Use case: Context around specific play

**Response Format:**
```json
{
  "results": [{ /* PlayResult */ }],
  "next_cursor": "base64string",
  "has_more": true,
  "query_time_ms": 2.43,
  "total_count": 2193235,
  "anchor_position": 24
}
```

### TypeScript API Client

Located in `packages/api/src/endpoints/timeline.ts`:

```typescript
export const TimelineApi = HttpApiGroup.make("timeline")
  .add(
    HttpApiEndpoint.get("getTimeline", "/timeline")
      .setUrlParams(TimelineParams)
      .addSuccess(TimelineResponse)
      // ...
  )
  .prefix("/api/plays")
```

**TimelineParams Schema:**
- `limit`: number (default 50, max 200)
- `cursor`: string (optional)
- `since`: string (ISO 8601, optional)
- `until`: string (ISO 8601, optional)
- `percentage`: number (0.0-1.0, optional)
- `anchor_id`: number (optional)

**TimelineResponse Schema:**
- `results`: PlayResult[]
- `next_cursor`: string | null
- `has_more`: boolean
- `query_time_ms`: number
- `total_count`: number (optional)
- `anchor_position`: number (optional)

### Current Implementation

**Files:**
- `packages/web/src/lib/http-runtime.ts` - TimelineClient, TimelineKVS, FetchLatestLive
- `packages/web/src/atoms/timeline.ts` - Reactive atoms
- `packages/web/src/components/Timeline.tsx` - Timeline component

**Current Flow:**
1. `FetchLatestLive` runs every 3 seconds
2. Fetches latest play from API
3. Stores in TimelineKVS (localStorage)
4. Calls `Reactivity.invalidate(["timeline:play_ids"])`
5. `playIdsAtom` refetches from KVS
6. Timeline component renders all plays

**Issues:**
- No cursor pagination
- No gap detection
- Renders all plays (performance issue)
- Background service and manual pagination would conflict

---

## Architecture Design

### Core Principles

1. **Separation of Concerns**
   - Data fetching (effectful atoms)
   - State management (core atoms)
   - Virtualization (derived atoms)
   - Background sync (service layer)
   - Rendering (React components)

2. **Manual State for Infinite Scroll**
   - Use `Atom.make()` with writable state for `playIdsListAtom`
   - Append new pages explicitly (not reactive refetch)
   - Cursor state tracks next page

3. **Reactive Individual Plays**
   - Use `Atom.family` for individual play atoms
   - Each play reads from TimelineKVS reactively
   - Background service updates specific plays, not entire list

4. **Gap Filling Strategy**
   - Use time-based `since` parameter for efficient gap fills
   - Single request to fetch all missing plays
   - Prepend to play IDs list

---

## Atom Dependency Graph

```
┌──────────────────────────────────────────────────────────┐
│                 INFRASTRUCTURE LAYER                      │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│ │TimelineClient│  │  TimelineKVS │  │FetchLatestLive│   │
│ │ (HTTP API)   │  │(localStorage)│  │(bg service)   │   │
│ └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                    STATE ATOMS (Core)                     │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│ │  cursorAtom  │  │loadingState  │  │  errorAtom   │   │
│ │Option<string>│  │    Atom      │  │Option<Error> │   │
│ └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                           │
│ ┌──────────────────────────────────────────────────┐    │
│ │         playIdsListAtom: number[]                │    │
│ │         (ordered, newest first)                  │    │
│ └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                   DERIVED ATOMS                           │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│ │  hasMoreAtom │  │ isLoadingAtom│  │timelineState │   │
│ │  (derived)   │  │  (derived)   │  │Atom(combined)│   │
│ └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│              EFFECTFUL ATOMS (Actions)                    │
│ ┌──────────────────────────────────────────────────┐    │
│ │  initializeTimelineAtom                          │    │
│ │  - Load from cache                               │    │
│ │  - Detect gaps                                   │    │
│ │  - Fill gaps                                     │    │
│ │  - Fetch initial if needed                       │    │
│ └──────────────────────────────────────────────────┘    │
│                                                           │
│ ┌──────────────────────────────────────────────────┐    │
│ │  loadMorePlaysAtom                               │    │
│ │  - Check guards (loading state, cursor)          │    │
│ │  - Fetch next page with cursor                   │    │
│ │  - Append to playIdsListAtom                     │    │
│ └──────────────────────────────────────────────────┘    │
│                                                           │
│ ┌──────────────────────────────────────────────────┐    │
│ │  fillGapAtom                                     │    │
│ │  - Get newest stored play                        │    │
│ │  - Fetch latest from API                         │    │
│ │  - Fetch gap with 'since' parameter              │    │
│ │  - Prepend gap plays                             │    │
│ └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│               VIRTUALIZATION ATOMS                        │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│ │  scrollYAtom │  │viewportHeight│  │visibleRange  │   │
│ │  (writable)  │  │Atom(writable)│  │Atom(derived) │   │
│ └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                           │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│ │visiblePlayIds│  │ totalHeight  │  │ shouldLoad   │   │
│ │Atom(derived) │  │Atom(derived) │  │MoreAtom      │   │
│ └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                   ATOM FAMILIES                           │
│ ┌──────────────────────────────────────────────────┐    │
│ │  playAtom = Atom.family((id: number) => ...)    │    │
│ │  - Reads from TimelineKVS reactively             │    │
│ │  - Uses Atom.withReactivity([`timeline:play:${id}`]) │
│ └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                 REACT COMPONENTS                          │
│ ┌──────────────────────────────────────────────────┐    │
│ │  Timeline                                        │    │
│ │  - Virtualized container                         │    │
│ │  - Scroll tracking                               │    │
│ │  - Load more trigger                             │    │
│ └──────────────────────────────────────────────────┘    │
│                                                           │
│ ┌──────────────────────────────────────────────────┐    │
│ │  PlayItem                                        │    │
│ │  - Individual play renderer                      │    │
│ │  - Reads from playAtom(id)                       │    │
│ └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## Core Atoms Implementation

### File: `packages/web/src/atoms/timeline-infinite-scroll.ts`

```typescript
import { Atom } from "@effect-atom/atom-react"
import { Effect, Option, Schema } from "effect"
import { TimelineRuntime, TimelineClient, TimelineKVS } from "@/lib/http-runtime"

/**
 * CORE STATE ATOMS
 */

// Cursor for next page
const cursorAtom = Atom.make<Option.Option<string>>(Option.none())

// Loading state
const LoadingState = Schema.Literal("initial", "loading_more", "complete", "error")
type LoadingState = Schema.Schema.Type<typeof LoadingState>

const loadingStateAtom = Atom.make<LoadingState>("initial")

// Error state
const errorAtom = Atom.make<Option.Option<Error>>(Option.none())

// Play IDs list (ordered, newest first) - writable for manual management
const playIdsListAtom = Atom.make<number[]>([])

/**
 * DERIVED ATOMS
 */

// Has more pages to load
const hasMoreAtom = Atom.make((get) =>
  Option.isSome(get(cursorAtom)) || get(loadingStateAtom) === "initial"
)

// Is currently loading
const isLoadingAtom = Atom.make((get) => {
  const state = get(loadingStateAtom)
  return state === "initial" || state === "loading_more"
})

/**
 * EFFECTFUL ATOMS - DATA FETCHING
 */

// Fetch initial page
const fetchInitialPageAtom = TimelineRuntime.fn<void>()(
  (_, get) => Effect.gen(function* () {
    const client = yield* TimelineClient
    const timelineKVS = yield* TimelineKVS

    yield* Effect.log("Fetching initial timeline page")

    // Fetch first page
    const response = yield* client.timeline.getTimeline({
      urlParams: { limit: 50 }
    })

    // Store all plays in KVS
    yield* Effect.all(
      response.results.map(play => timelineKVS.storePlay(play)),
      { concurrency: "unbounded" }
    )

    // Extract play IDs
    const playIds = response.results.map(play => play.id)

    return {
      playIds,
      nextCursor: Option.fromNullable(response.next_cursor),
      hasMore: response.has_more
    }
  })
)

// Fetch next page with cursor
const fetchNextPageAtom = TimelineRuntime.fn<string>()(
  (cursor, get) => Effect.gen(function* () {
    const client = yield* TimelineClient
    const timelineKVS = yield* TimelineKVS
    const currentIds = get(playIdsListAtom)

    yield* Effect.log(`Fetching next page with cursor: ${cursor}`)

    // Fetch next page
    const response = yield* client.timeline.getTimeline({
      urlParams: { limit: 50, cursor }
    })

    // Store new plays in KVS
    yield* Effect.all(
      response.results.map(play => timelineKVS.storePlay(play)),
      { concurrency: "unbounded" }
    )

    // Extract new play IDs
    const newPlayIds = response.results.map(play => play.id)

    return {
      playIds: [...currentIds, ...newPlayIds], // Append to existing
      nextCursor: Option.fromNullable(response.next_cursor),
      hasMore: response.has_more
    }
  })
)

// Detect and fill gaps
const fillGapAtom = TimelineRuntime.fn<void>()(
  (_, get) => Effect.gen(function* () {
    const client = yield* TimelineClient
    const timelineKVS = yield* TimelineKVS
    const currentIds = get(playIdsListAtom)

    // If we have no plays yet, skip gap detection
    if (currentIds.length === 0) {
      return { gapFilled: false, newPlayIds: [] }
    }

    // Get the most recent play we have stored
    const newestStoredId = currentIds[0]
    const newestStoredPlayOption = yield* timelineKVS.getPlay(newestStoredId)

    if (Option.isNone(newestStoredPlayOption)) {
      return { gapFilled: false, newPlayIds: [] }
    }

    const newestStoredPlay = newestStoredPlayOption.value

    // Fetch latest from API
    const latestResponse = yield* client.timeline.getTimeline({
      urlParams: { limit: 1 }
    })

    const latestPlay = latestResponse.results[0]

    // If our newest is already the latest, no gap
    if (!latestPlay || latestPlay.id === newestStoredId) {
      return { gapFilled: false, newPlayIds: [] }
    }

    // Gap detected - fetch plays since our newest stored play
    yield* Effect.log(
      `Gap detected: fetching plays since ${newestStoredPlay.airdate.toISOString()}`
    )

    const gapResponse = yield* client.timeline.getTimeline({
      urlParams: {
        limit: 200,
        since: newestStoredPlay.airdate.toISOString()
      }
    })

    // Store gap plays
    yield* Effect.all(
      gapResponse.results.map(play => timelineKVS.storePlay(play)),
      { concurrency: "unbounded" }
    )

    // Prepend gap play IDs
    const gapPlayIds = gapResponse.results.map(play => play.id)

    return {
      gapFilled: true,
      newPlayIds: [...gapPlayIds, ...currentIds]
    }
  })
)

/**
 * PUBLIC API - COMBINED ATOMS
 */

// Initialize timeline
export const initializeTimelineAtom = TimelineRuntime.fn<void>()(
  (_, get, set) => Effect.gen(function* () {
    const currentIds = get(playIdsListAtom)

    // Try to load from localStorage first
    const storedIds = yield* Effect.gen(function* () {
      const timelineKVS = yield* TimelineKVS
      return yield* timelineKVS.getPlayIds()
    })

    // If we have stored IDs, use them and check for gaps
    if (storedIds.length > 0) {
      set(playIdsListAtom, storedIds)

      // Check for gaps
      const gapResult = yield* fillGapAtom()

      if (gapResult.gapFilled) {
        set(playIdsListAtom, gapResult.newPlayIds)
      }

      // Fetch one page to get the latest cursor
      const client = yield* TimelineClient
      const response = yield* client.timeline.getTimeline({
        urlParams: { limit: 50 }
      })

      set(cursorAtom, Option.fromNullable(response.next_cursor))
      set(loadingStateAtom, response.has_more ? "loading_more" : "complete")

      return { initialized: true, fromCache: true }
    }

    // No stored data - fetch initial page
    set(loadingStateAtom, "initial")

    const result = yield* fetchInitialPageAtom()

    set(playIdsListAtom, result.playIds)
    set(cursorAtom, result.nextCursor)
    set(loadingStateAtom, result.hasMore ? "loading_more" : "complete")
    set(errorAtom, Option.none())

    return { initialized: true, fromCache: false }
  })
)

// Load more plays
export const loadMorePlaysAtom = TimelineRuntime.fn<void>()(
  (_, get, set) => Effect.gen(function* () {
    const cursor = get(cursorAtom)
    const loadingState = get(loadingStateAtom)

    // Guard: don't load if already loading or no more pages
    if (loadingState !== "loading_more" || Option.isNone(cursor)) {
      return { loaded: false, reason: "no_more_or_loading" }
    }

    const result = yield* fetchNextPageAtom(cursor.value)

    set(playIdsListAtom, result.playIds)
    set(cursorAtom, result.nextCursor)
    set(loadingStateAtom, result.hasMore ? "loading_more" : "complete")
    set(errorAtom, Option.none())

    return { loaded: true, count: result.playIds.length }
  }).pipe(
    Effect.catchAll(error => Effect.gen(function* () {
      set(loadingStateAtom, "error")
      set(errorAtom, Option.some(error))
      return { loaded: false, reason: "error" }
    }))
  )
)

/**
 * READ-ONLY EXPORT ATOMS
 */

export const timelineStateAtom = Atom.make((get) => ({
  playIds: get(playIdsListAtom),
  cursor: get(cursorAtom),
  loadingState: get(loadingStateAtom),
  error: get(errorAtom),
  hasMore: get(hasMoreAtom),
  isLoading: get(isLoadingAtom)
}))

/**
 * ATOM FAMILY FOR INDIVIDUAL PLAYS
 */

export const playAtom = Atom.family((id: number) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const timelineKVS = yield* TimelineKVS
      return yield* timelineKVS.getPlay(id)
    })
  ).pipe(Atom.withReactivity([`timeline:play:${id}`]))
)
```

---

## Virtualization Strategy

### File: `packages/web/src/atoms/timeline-virtualization.ts`

```typescript
import { Atom } from "@effect-atom/atom-react"
import { timelineStateAtom } from "./timeline-infinite-scroll"

/**
 * VIRTUALIZATION ATOMS
 */

// Viewport scroll position (pixels from top)
export const scrollYAtom = Atom.make<number>(0)

// Viewport height (pixels)
export const viewportHeightAtom = Atom.make<number>(800)

// Item height constant (can be made dynamic with atom family later)
const ITEM_HEIGHT = 120 // pixels per play card

// Buffer multiplier (render 2x viewport worth for smooth scrolling)
const BUFFER_MULTIPLIER = 2

/**
 * Visible range with buffer
 *
 * Calculates which items should be rendered based on scroll position.
 * Includes buffer above and below viewport for smooth scrolling.
 */
export const visibleRangeAtom = Atom.make((get) => {
  const scrollY = get(scrollYAtom)
  const viewportHeight = get(viewportHeightAtom)
  const { playIds } = get(timelineStateAtom)

  // Calculate visible indices
  const viewportItems = Math.ceil(viewportHeight / ITEM_HEIGHT)
  const startIndex = Math.max(
    0,
    Math.floor(scrollY / ITEM_HEIGHT) - (viewportItems * BUFFER_MULTIPLIER)
  )
  const endIndex = Math.min(
    playIds.length,
    Math.ceil((scrollY + viewportHeight) / ITEM_HEIGHT) + (viewportItems * BUFFER_MULTIPLIER)
  )

  return { startIndex, endIndex }
})

/**
 * Visible play IDs
 *
 * Slices the play IDs array to only include items in visible range.
 */
export const visiblePlayIdsAtom = Atom.make((get) => {
  const { playIds } = get(timelineStateAtom)
  const { startIndex, endIndex } = get(visibleRangeAtom)

  return playIds.slice(startIndex, endIndex).map((id, index) => ({
    id,
    index: startIndex + index
  }))
})

/**
 * Total height for virtual scrolling container
 */
export const totalHeightAtom = Atom.make((get) => {
  const { playIds } = get(timelineStateAtom)
  return playIds.length * ITEM_HEIGHT
})

/**
 * Y offset for positioning the visible items
 */
export const offsetYAtom = Atom.make((get) => {
  const { startIndex } = get(visibleRangeAtom)
  return startIndex * ITEM_HEIGHT
})

/**
 * Should trigger load more
 *
 * Returns true when user has scrolled near bottom (80% threshold).
 */
export const shouldLoadMoreAtom = Atom.make((get) => {
  const scrollY = get(scrollYAtom)
  const viewportHeight = get(viewportHeightAtom)
  const totalHeight = get(totalHeightAtom)
  const { hasMore, isLoading } = get(timelineStateAtom)

  // Trigger when scrolled to bottom 20%
  const scrollBottom = scrollY + viewportHeight
  const scrollPercentage = scrollBottom / totalHeight

  return hasMore && !isLoading && scrollPercentage > 0.8
})

/**
 * Export item height constant for components
 */
export const PLAY_CARD_HEIGHT = ITEM_HEIGHT
```

---

## Gap Detection Algorithm

### Flowchart

```
┌─────────────────────────────────────────┐
│  initializeTimelineAtom()               │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  Load play IDs from TimelineKVS         │
│  (localStorage)                         │
└────────────┬────────────────────────────┘
             │
             ▼
      ┌──────┴──────┐
      │  Empty?     │
      └──────┬──────┘
         YES │ NO
             │  │
             │  ▼
             │  ┌─────────────────────────────────────┐
             │  │  fillGapAtom()                      │
             │  │  1. Get newest stored play (id[0])  │
             │  │  2. Fetch latest from API (limit=1) │
             │  └────────────┬────────────────────────┘
             │               │
             │               ▼
             │        ┌──────┴──────┐
             │        │  IDs match? │
             │        └──────┬──────┘
             │           YES │ NO
             │               │  │
             │               │  ▼
             │               │  ┌─────────────────────────────────────┐
             │               │  │  Gap detected!                      │
             │               │  │  - Get timestamp of stored play     │
             │               │  │  - Fetch since that timestamp       │
             │               │  │  - GET /timeline?since={ts}&limit=200
             │               │  │  - Store all gap plays in KVS       │
             │               │  │  - Prepend gap IDs to list          │
             │               │  └────────────┬────────────────────────┘
             │               │               │
             │               ▼               ▼
             │        ┌──────────────────────────┐
             │        │  No gap, continue        │
             │        └──────┬───────────────────┘
             │               │
             ▼               ▼
┌────────────────────────────────────────────┐
│  fetchInitialPageAtom()                    │
│  - GET /timeline?limit=50                  │
│  - Store plays in KVS                      │
│  - Extract play IDs                        │
│  - Save next_cursor                        │
└────────────┬───────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────┐
│  Set initial state:                        │
│  - playIdsListAtom = play IDs              │
│  - cursorAtom = next_cursor                │
│  - loadingStateAtom = "loading_more"       │
└────────────────────────────────────────────┘
```

### Gap Detection Logic

```typescript
// Pseudo-code for gap detection

function detectAndFillGap(currentPlayIds: number[]) {
  if (currentPlayIds.length === 0) {
    return { gapFilled: false }
  }

  // Step 1: Get newest stored play
  const newestStoredId = currentPlayIds[0]
  const newestStoredPlay = getPlayFromKVS(newestStoredId)

  // Step 2: Fetch latest from API
  const latestResponse = fetch("/api/plays/timeline?limit=1")
  const latestPlay = latestResponse.results[0]

  // Step 3: Compare IDs
  if (latestPlay.id === newestStoredId) {
    // No gap - we're up to date
    return { gapFilled: false }
  }

  // Step 4: Gap detected - fetch missing plays
  const gapResponse = fetch(
    `/api/plays/timeline?since=${newestStoredPlay.airdate}&limit=200`
  )

  // Step 5: Store gap plays and prepend IDs
  storeGapPlaysInKVS(gapResponse.results)
  const gapPlayIds = gapResponse.results.map(p => p.id)

  return {
    gapFilled: true,
    newPlayIds: [...gapPlayIds, ...currentPlayIds]
  }
}
```

---

## Background Service Integration

### Updated FetchLatestLive Service

```typescript
// File: packages/web/src/lib/http-runtime.ts (update)

export const FetchLatestLive = Effect.gen(function* () {
  const client = yield* TimelineClient
  const timelineKVS = yield* TimelineKVS

  // Get current play IDs from KVS
  const currentIds = yield* timelineKVS.getPlayIds()

  // Fetch latest play
  const latestTimeline = yield* client.timeline.getTimeline({
    urlParams: { limit: 1 }
  })

  const latestPlay = latestTimeline.results[0]

  if (!latestPlay) return

  // If we have no plays, do nothing (infinite scroll will handle initial load)
  if (currentIds.length === 0) return

  // Check if latest is newer than our newest stored play
  const newestStoredId = currentIds[0]

  if (latestPlay.id === newestStoredId) {
    // Already have the latest
    return
  }

  // Fetch gap between stored and latest
  const newestStoredPlayOption = yield* timelineKVS.getPlay(newestStoredId)

  if (Option.isNone(newestStoredPlayOption)) return

  const newestStoredPlay = newestStoredPlayOption.value

  yield* Effect.log(
    `Background sync: fetching plays since ${newestStoredPlay.airdate.toISOString()}`
  )

  const sinceTimeline = yield* client.timeline.getTimeline({
    urlParams: {
      limit: 200,
      since: newestStoredPlay.airdate.toISOString()
    }
  })

  // Store all new plays
  yield* Effect.all(
    sinceTimeline.results.map(play => timelineKVS.storePlay(play)),
    { concurrency: "unbounded" }
  )

  yield* Effect.log(`Background sync: stored ${sinceTimeline.results.length} new plays`)
}).pipe(
  Effect.repeat(Schedule.spaced(Duration.millis(3000))),
  Effect.forever,
  Effect.forkScoped,
  Effect.uninterruptible,
  Layer.scopedDiscard,
  Layer.provide(Layer.mergeAll(TimelineClient.layer, TimelineKVS.Default))
)
```

**Key Changes:**
- No longer updates `playIdsListAtom` directly
- Only stores plays in TimelineKVS
- Reactivity system handles updating individual play atoms
- Infinite scroll atoms remain independent

---

## Component Patterns

### File: `packages/web/src/components/Timeline.tsx`

```typescript
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react"
import { useEffect, useRef } from "react"
import { Option, Result } from "effect"
import {
  initializeTimelineAtom,
  loadMorePlaysAtom,
  timelineStateAtom,
  playAtom
} from "@/atoms/timeline-infinite-scroll"
import {
  scrollYAtom,
  viewportHeightAtom,
  visiblePlayIdsAtom,
  totalHeightAtom,
  offsetYAtom,
  shouldLoadMoreAtom,
  PLAY_CARD_HEIGHT
} from "@/atoms/timeline-virtualization"

export function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null)

  // Atom setters
  const initialize = useAtomSet(initializeTimelineAtom)
  const loadMore = useAtomSet(loadMorePlaysAtom)
  const setScrollY = useAtomSet(scrollYAtom)
  const setViewportHeight = useAtomSet(viewportHeightAtom)

  // Atom values
  const state = useAtomValue(timelineStateAtom)
  const visiblePlays = useAtomValue(visiblePlayIdsAtom)
  const totalHeight = useAtomValue(totalHeightAtom)
  const offsetY = useAtomValue(offsetYAtom)
  const shouldLoadMore = useAtomValue(shouldLoadMoreAtom)

  // Initialize on mount
  useEffect(() => {
    initialize()
  }, [initialize])

  // Track scroll position
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      setScrollY(container.scrollTop)
    }

    container.addEventListener("scroll", handleScroll)
    return () => container.removeEventListener("scroll", handleScroll)
  }, [setScrollY])

  // Track viewport height
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    setViewportHeight(container.clientHeight)

    const observer = new ResizeObserver(() => {
      setViewportHeight(container.clientHeight)
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [setViewportHeight])

  // Trigger load more when near bottom
  useEffect(() => {
    if (shouldLoadMore) {
      loadMore()
    }
  }, [shouldLoadMore, loadMore])

  return (
    <div
      ref={containerRef}
      className="h-screen overflow-y-auto"
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {/* Visible items container */}
        <div
          style={{
            position: "absolute",
            top: offsetY,
            left: 0,
            right: 0
          }}
        >
          {visiblePlays.map(({ id, index }) => (
            <PlayItem
              key={id}
              playId={id}
              index={index}
            />
          ))}
        </div>
      </div>

      {/* Loading indicator */}
      {state.isLoading && (
        <div className="p-4 text-center text-gray-500">
          Loading more plays...
        </div>
      )}

      {/* Error display */}
      {Option.isSome(state.error) && (
        <div className="p-4 text-center text-red-500">
          Error: {state.error.value.message}
        </div>
      )}

      {/* Complete state */}
      {state.loadingState === "complete" && (
        <div className="p-4 text-center text-gray-400">
          End of timeline
        </div>
      )}
    </div>
  )
}

function PlayItem({ playId, index }: { playId: number; index: number }) {
  const playResult = useAtomValue(playAtom(playId))

  return (
    <div
      style={{
        height: PLAY_CARD_HEIGHT,
        position: "relative"
      }}
      className="border-b"
    >
      {Result.matchWithWaiting(playResult, {
        onWaiting: () => (
          <div className="p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        ),
        onError: (error) => (
          <div className="p-4 text-red-500">
            Error loading play: {String(error)}
          </div>
        ),
        onDefect: (defect) => (
          <div className="p-4 text-red-500">
            Defect: {String(defect)}
          </div>
        ),
        onSuccess: (success) => (
          <div>
            {Option.match(success.value, {
              onNone: () => (
                <div className="p-4 text-gray-500">
                  Play #{playId} not found
                </div>
              ),
              onSome: (play) => (
                <div className="p-4">
                  <div className="font-semibold text-lg">{play.song}</div>
                  <div className="text-gray-700">{play.artist}</div>
                  {play.album && (
                    <div className="text-sm text-gray-600 italic">{play.album}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(play.airdate).toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
```

---

## Implementation Plan

### Phase 1: Core Infinite Scroll (No Virtualization)

**Duration:** 2-3 hours

**Tasks:**

1. **Create `timeline-infinite-scroll.ts`** (60 min)
   - [ ] Implement core state atoms (cursor, loading, error, playIds)
   - [ ] Implement derived atoms (hasMore, isLoading)
   - [ ] Implement fetchInitialPageAtom
   - [ ] Implement fetchNextPageAtom
   - [ ] Implement initializeTimelineAtom (without gap filling)
   - [ ] Implement loadMorePlaysAtom
   - [ ] Implement timelineStateAtom
   - [ ] Implement playAtom family

2. **Create simple Timeline component** (30 min)
   - [ ] Use timelineStateAtom for state
   - [ ] Render all plays (no virtualization yet)
   - [ ] Implement scroll-to-bottom detection (IntersectionObserver)
   - [ ] Call loadMorePlaysAtom on trigger

3. **Test basic pagination** (30 min)
   - [ ] Initial load works (50 plays)
   - [ ] Scroll to bottom triggers load more
   - [ ] Cursor updates correctly
   - [ ] Error handling works
   - [ ] "End of timeline" shows when complete

**Success Criteria:**
- Initial load shows 50 plays
- Scrolling to bottom loads next 50 plays
- Can scroll through 200+ plays without issues
- Loading states display correctly

---

### Phase 2: Gap Detection & Background Sync

**Duration:** 2-3 hours

**Tasks:**

1. **Implement gap detection** (60 min)
   - [ ] Implement fillGapAtom
   - [ ] Update initializeTimelineAtom to call fillGapAtom
   - [ ] Add logging for gap detection events
   - [ ] Handle edge cases (no stored plays, API errors)

2. **Update background service** (30 min)
   - [ ] Modify FetchLatestLive to not interfere with infinite scroll
   - [ ] Only update TimelineKVS (not playIdsListAtom)
   - [ ] Add logging for background sync events

3. **Test gap scenarios** (60 min)
   - [ ] Fresh load (no localStorage) → no gap
   - [ ] Reload after 10 minutes → small gap (few plays)
   - [ ] Reload after 1 day → large gap (100+ plays)
   - [ ] Gap fills correctly and prepends to list
   - [ ] Background service updates new plays reactively

**Success Criteria:**
- Gap detection works on reload
- Missing plays are fetched and displayed
- Background service updates without disrupting scroll
- No duplicate plays in list

---

### Phase 3: Virtualization

**Duration:** 3-4 hours

**Tasks:**

1. **Create `timeline-virtualization.ts`** (60 min)
   - [ ] Implement scroll tracking atoms (scrollY, viewportHeight)
   - [ ] Implement visibleRangeAtom
   - [ ] Implement visiblePlayIdsAtom
   - [ ] Implement totalHeightAtom, offsetYAtom
   - [ ] Implement shouldLoadMoreAtom

2. **Update Timeline component** (90 min)
   - [ ] Add virtual scrolling container
   - [ ] Track scroll position with useEffect
   - [ ] Track viewport height with ResizeObserver
   - [ ] Render only visible plays
   - [ ] Position items with absolute positioning
   - [ ] Use shouldLoadMoreAtom for load trigger

3. **Performance testing** (60 min)
   - [ ] Test with 1000+ plays
   - [ ] Measure FPS during scroll
   - [ ] Optimize buffer size if needed
   - [ ] Profile memory usage
   - [ ] Test on mobile devices

**Success Criteria:**
- Can load 1000+ plays without performance issues
- Smooth scrolling at 60 FPS
- Only ~20-30 play cards rendered at once
- Memory usage stays under 200MB

---

### Phase 4: Polish & Optimization

**Duration:** 2-3 hours

**Tasks:**

1. **Loading states** (45 min)
   - [ ] Add skeleton loaders for loading plays
   - [ ] Add smooth loading spinner at bottom
   - [ ] Add transition animations for new plays

2. **Error handling** (45 min)
   - [ ] Add retry button for failed loads
   - [ ] Display error messages clearly
   - [ ] Implement exponential backoff for retries
   - [ ] Fallback UI for missing plays

3. **Persistence** (30 min)
   - [ ] Update TimelineKVS to persist play IDs array
   - [ ] Restore scroll position on mount (optional)
   - [ ] Clear old plays from localStorage if needed

4. **Performance optimizations** (30 min)
   - [ ] Debounce scroll events if needed
   - [ ] Use Chunk for efficient array operations
   - [ ] Optimize reactivity keys
   - [ ] Add memoization where helpful

**Success Criteria:**
- Loading states are smooth and informative
- Errors are handled gracefully with retry options
- Scroll position restored on reload (if implemented)
- Optimizations maintain 60 FPS scrolling

---

## Performance Characteristics

### Memory Efficiency

**Play Data Storage:**
- Stored in TimelineKVS (localStorage), not in memory
- Only metadata (play IDs) in memory

**Play IDs Array:**
- 4 bytes per ID (JavaScript number)
- 10,000 plays = ~40KB in memory
- Negligible memory footprint

**Rendered Components:**
- Only visible + buffer items rendered
- ~20-30 play cards at viewport size
- ~100KB for rendered DOM

**Total Memory:**
- For 10,000 plays: ~100KB (IDs + metadata)
- Plus ~100KB (rendered DOM)
- **Total: ~200KB**

### Render Performance

**Initial Render:**
- O(n) where n = visible items (~20)
- ~16ms for 20 items
- **< 1 frame at 60 FPS**

**Scroll Render:**
- O(m) where m = newly visible items (~5-10)
- ~8ms for 10 items
- **< 1 frame at 60 FPS**

**Load More:**
- O(p) where p = new page size (50)
- ~40ms for 50 items (not in viewport yet)
- **No impact on scrolling**

**Background Update:**
- O(1) per updated play
- Only changed plays re-render
- **< 1ms per play**

### Network Efficiency

**Initial Load:**
- 1 request: `GET /timeline?limit=50`
- Response: ~50KB (50 plays with full data)
- **< 5ms API time + network latency**

**Infinite Scroll:**
- 1 request per page: `GET /timeline?cursor={cursor}&limit=50`
- Response: ~50KB per page
- **< 5ms API time per request**

**Gap Fill:**
- 1 request: `GET /timeline?since={timestamp}&limit=200`
- Response: ~200KB (up to 200 plays)
- **< 10ms API time**

**Background Sync:**
- 1 request every 3 seconds: `GET /timeline?limit=1`
- Response: ~1KB (1 play)
- **< 5ms API time**

### API Response Times

From `TIMELINE_API.md`:
- **Cursor pagination:** < 5ms
- **Time-based jump:** < 10ms
- **Percentage jump:** ~50ms (not used in infinite scroll)
- **Anchor jump:** ~100ms (not used in infinite scroll)

---

## File Structure

```
packages/web/src/
├── atoms/
│   ├── timeline-infinite-scroll.ts    # Core infinite scroll atoms (~500 lines)
│   ├── timeline-virtualization.ts     # Virtualization atoms (~150 lines)
│   └── timeline.ts                     # Existing reactive atoms (keep for compat)
│
├── components/
│   ├── Timeline.tsx                    # Main timeline component (~200 lines)
│   ├── PlayItem.tsx                    # Individual play renderer (~100 lines)
│   └── TimelineLoader.tsx              # Loading states (~50 lines)
│
└── lib/
    └── http-runtime.ts                 # Update FetchLatestLive (~50 lines change)
```

**Total New Code:** ~1,050 lines
**Modified Code:** ~50 lines

---

## Key Design Decisions

### 1. Manual State Management for Infinite Scroll

**Decision:** Use `Atom.make()` with writable state for `playIdsListAtom` instead of reactive refetch pattern.

**Rationale:**
- Infinite scroll requires **appending** to existing list
- Reactive refetch would replace entire list (not append)
- Manual state gives explicit control over list growth
- Cursor state requires manual tracking anyway

**Trade-off:**
- More explicit state management code
- But clearer intent and behavior
- Easier to debug and reason about

---

### 2. Atom Family for Individual Plays

**Decision:** Use `Atom.family((id: number) => ...)` for individual play atoms that read from TimelineKVS reactively.

**Rationale:**
- Fine-grained reactivity (only changed plays re-render)
- Efficient lookups (O(1) via atom family cache)
- Background service can update specific plays without re-rendering entire list
- Plays stored in KVS, not duplicated in memory

**Trade-off:**
- Slight complexity in atom structure
- But massive performance benefits
- Clean separation of concerns

---

### 3. Derived Atoms for UI State

**Decision:** Use derived atoms for `hasMoreAtom`, `isLoadingAtom`, `visibleRangeAtom`, etc.

**Rationale:**
- UI state always in sync with source state
- No manual synchronization needed
- Automatic recomputation when dependencies change
- Declarative style matches Effect philosophy

**Trade-off:**
- None - this is pure benefit

---

### 4. Gap Filling with Time-Based Jump

**Decision:** Use `since` parameter (time-based jump) to fill gaps in single request.

**Rationale:**
- Efficient: 1 request vs. multiple cursor pagination requests
- API performance: < 10ms for time-based queries
- Leverages API's built-in time navigation
- Handles gaps of any size (up to 200 plays)

**Trade-off:**
- Relies on accurate timestamps
- But timestamps are reliable in KEXP data

---

### 5. Background Service Independence

**Decision:** FetchLatestLive only updates TimelineKVS, not `playIdsListAtom` directly.

**Rationale:**
- Infinite scroll and background sync don't interfere
- User can scroll without interruption
- Individual play atoms reactively update via KVS
- Clear separation: background service = data layer, atoms = state layer

**Trade-off:**
- Play IDs list may not include very latest plays until gap fill
- But gap fill runs on initialization, so user sees latest shortly

---

### 6. Virtualization with Fixed Item Height

**Decision:** Use fixed `ITEM_HEIGHT = 120px` for all play cards.

**Rationale:**
- Simplifies virtualization calculations
- No need to measure each item
- Consistent UI appearance
- Can upgrade to variable heights later with atom family if needed

**Trade-off:**
- All play cards must fit in 120px
- But design constraints can be beneficial

---

## Next Steps

1. **Review this architecture document**
   - Discuss design decisions
   - Clarify any unclear sections
   - Adjust approach if needed

2. **Begin Phase 1 implementation**
   - Create `timeline-infinite-scroll.ts`
   - Create simple Timeline component
   - Test basic pagination flow

3. **Iterate through phases 2-4**
   - Gap detection & background sync
   - Virtualization
   - Polish & optimization

4. **Deploy and monitor**
   - Performance metrics
   - Error tracking
   - User feedback

---

## Appendix: Effect Patterns Reference

### Pattern: Manual State Atom

```typescript
// Writable state atom
const stateAtom = Atom.make<T>(initialValue)

// Read with get
const value = get(stateAtom)

// Write with set
set(stateAtom, newValue)
```

### Pattern: Derived Atom

```typescript
// Automatically recomputes when dependencies change
const derivedAtom = Atom.make((get) => {
  const dep1 = get(atom1)
  const dep2 = get(atom2)
  return computeSomething(dep1, dep2)
})
```

### Pattern: Effectful Atom Function

```typescript
// Function that can set state and run effects
const myActionAtom = RuntimeAtom.fn<ArgType>()(
  (arg, get, set) => Effect.gen(function* () {
    const currentState = get(stateAtom)
    const result = yield* someEffect(arg)
    set(stateAtom, result)
    return result
  })
)
```

### Pattern: Atom Family

```typescript
// Memoized by key
const itemAtom = Atom.family((id: number) =>
  RuntimeAtom.atom(
    Effect.gen(function* () {
      const service = yield* MyService
      return yield* service.getItem(id)
    })
  )
)
```

### Pattern: Reactive Atom

```typescript
// Refetches when reactivity key invalidated
const reactiveAtom = RuntimeAtom.atom(
  Effect.gen(function* () {
    const kvs = yield* KeyValueStore
    return yield* kvs.get("key")
  })
).pipe(Atom.withReactivity(["reactivity-key"]))
```

---

**End of Document**
