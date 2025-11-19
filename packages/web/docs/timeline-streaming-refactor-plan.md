# Timeline Infinite Scroll: Stream Refactoring Implementation Plan

## Overview

This document provides a **step-by-step implementation plan** for refactoring the current imperative infinite scroll to use Effect Streams as the pagination abstraction layer.

**Goal**: Extract cursor pagination logic into a `Stream.paginateEffect` layer while keeping current atom patterns working.

**Non-goal**: Rewriting atom architecture (current pattern is correct for React integration).

---

## Prerequisites

- Read: `/Users/pooks/Dev/crate/packages/web/docs/timeline-streaming-architecture.md`
- Review: Effect Stream pagination tests in `docs/effect-source/effect/test/Stream/pagination.test.ts`
- Understand: Current implementation in `packages/web/src/atoms/timeline-infinite.ts`

---

## Phase 1: Create Stream Abstraction Layer

### Step 1.1: Define Stream Types

**File**: `packages/web/src/streams/timeline-types.ts`

```typescript
import type { Option } from "effect"
import type { TimelineParams, TimelineResponse } from "@crate/api"

/**
 * Timeline navigation method for initial load.
 * After initial jump, pagination always uses cursor-only.
 */
export type TimelineNavigationMethod =
  | "cursor"
  | "time-range"
  | "percentage"
  | "anchor"

/**
 * Initial configuration for timeline stream.
 */
export interface TimelineInitialConfig {
  readonly params: TimelineParams
  readonly method: TimelineNavigationMethod
}

/**
 * A single page in the timeline stream.
 */
export interface TimelinePage {
  readonly params: TimelineParams
  readonly response: TimelineResponse
}

/**
 * Internal cursor state for Stream.paginateEffect.
 *
 * Tracks both the API cursor and metadata needed for pagination logic.
 */
export interface TimelineCursor {
  readonly cursor: Option.Option<string>
  readonly hasMore: boolean
  readonly totalLoaded: number
  readonly initialMethod: TimelineNavigationMethod
  readonly initialParams: TimelineParams
}

/**
 * Timeline-specific errors.
 */
export class TimelinePaginationError extends Data.TaggedError(
  "TimelinePaginationError"
)<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class TimelineSSEError extends Data.TaggedError("TimelineSSEError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export type TimelineError = TimelinePaginationError | TimelineSSEError
```

**Why**: Centralize types for stream layer, separate from atom layer types.

### Step 1.2: Implement Cursor Helpers

**File**: `packages/web/src/streams/timeline-cursor.ts`

```typescript
import { Option } from "effect"
import type { TimelineParams, TimelineResponse } from "@crate/api"
import type {
  TimelineCursor,
  TimelineInitialConfig,
  TimelinePage
} from "./timeline-types"

/**
 * Create initial cursor state from config.
 */
export const initialCursor = (config: TimelineInitialConfig): TimelineCursor => ({
  cursor: Option.fromNullable(config.params.cursor),
  hasMore: true,
  totalLoaded: 0,
  initialMethod: config.method,
  initialParams: config.params
})

/**
 * Advance cursor after successful page fetch.
 */
export const advanceCursor = (
  current: TimelineCursor,
  response: TimelineResponse
): TimelineCursor => ({
  cursor: Option.fromNullable(response.next_cursor),
  hasMore: response.has_more,
  totalLoaded: current.totalLoaded + response.results.length,
  initialMethod: current.initialMethod,
  initialParams: current.initialParams
})

/**
 * Convert cursor state to API params.
 *
 * After initial page, only cursor and limit are used (no special navigation).
 */
export const cursorToParams = (cursor: TimelineCursor): TimelineParams => {
  const limit = cursor.initialParams.limit ?? 50

  // First page: use all params from initial config
  if (cursor.totalLoaded === 0) {
    return cursor.initialParams
  }

  // Subsequent pages: cursor-only pagination
  return {
    limit,
    cursor: Option.getOrUndefined(cursor.cursor)
  }
}
```

**Why**: Pure helper functions, easy to test, separate from Effect logic.

### Step 1.3: Implement Pagination Stream

**File**: `packages/web/src/streams/timeline-pagination.ts`

```typescript
import { Stream, Effect, Option } from "effect"
import { TimelineClient, TimelineKVS } from "@/lib/http-runtime"
import type {
  TimelineCursor,
  TimelineInitialConfig,
  TimelinePage,
  TimelineError
} from "./timeline-types"
import { TimelinePaginationError } from "./timeline-types"
import { initialCursor, advanceCursor, cursorToParams } from "./timeline-cursor"

/**
 * Create a cursor-based pagination stream for timeline.
 *
 * This is a **pure pull-based stream** that:
 * - Fetches pages lazily (only when consumed)
 * - Stores plays in TimelineKVS (normalized cache)
 * - Terminates when API returns has_more = false
 * - Uses Stream.paginateEffect (idiomatic Effect pattern)
 *
 * @example
 * ```typescript
 * const stream = createPaginationStream(config)
 * const firstThreePages = yield* Stream.runCollect(
 *   stream.pipe(Stream.take(3))
 * )
 * ```
 */
export const createPaginationStream = (
  config: TimelineInitialConfig
): Stream.Stream<TimelinePage, TimelineError, TimelineClient | TimelineKVS> =>
  Stream.paginateEffect(
    initialCursor(config),
    fetchPageAndAdvanceCursor
  )

/**
 * Fetch a single page and return next cursor state.
 *
 * This is the step function for Stream.paginateEffect.
 * Returns: [current page, Option<next cursor>]
 */
const fetchPageAndAdvanceCursor = (
  cursor: TimelineCursor
): Effect.Effect<
  readonly [TimelinePage, Option.Option<TimelineCursor>],
  TimelineError,
  TimelineClient | TimelineKVS
> =>
  Effect.gen(function* () {
    const client = yield* TimelineClient
    const kvs = yield* TimelineKVS

    // Build params from cursor state
    const params = cursorToParams(cursor)

    yield* Effect.log(
      `Fetching timeline page: limit=${params.limit}, cursor=${params.cursor ?? "none"}, total_loaded=${cursor.totalLoaded}`
    )

    // Fetch from API
    const response = yield* client.timeline.getTimeline({
      urlParams: params
    }).pipe(
      Effect.mapError((error) =>
        new TimelinePaginationError({
          message: "Failed to fetch timeline page",
          cause: error
        })
      )
    )

    yield* Effect.log(
      `Received ${response.results.length} plays, has_more=${response.has_more}`
    )

    // Normalize plays into TimelineKVS (single source of truth)
    yield* Effect.all(
      response.results.map((play) => kvs.storePlay(play)),
      { concurrency: 50 }
    )

    yield* Effect.log(
      `Stored ${response.results.length} plays in KVS`
    )

    // Build page result
    const page: TimelinePage = {
      params,
      response
    }

    // Compute next cursor state
    const nextCursor = response.has_more
      ? Option.some(advanceCursor(cursor, response))
      : Option.none<TimelineCursor>()

    yield* Effect.log(
      nextCursor._tag === "Some"
        ? `Next cursor: ${Option.getOrUndefined(nextCursor.value.cursor) ?? "(none)"}`
        : "Stream complete (no more pages)"
    )

    // Return tuple for Stream.paginateEffect
    return [page, nextCursor] as const
  })

/**
 * Create a pagination stream that resumes from a specific cursor.
 *
 * Useful for "load more" scenarios where we already have pages loaded.
 */
export const createResumablePaginationStream = (
  cursor: TimelineCursor
): Stream.Stream<TimelinePage, TimelineError, TimelineClient | TimelineKVS> =>
  Stream.paginateEffect(cursor, fetchPageAndAdvanceCursor)
```

**Why**:
- Uses `Stream.paginateEffect` (idiomatic Effect pattern from docs)
- Pure stream, no side effects beyond KVS normalization
- Lazy evaluation, backpressure-aware
- Easy to test in isolation

### Step 1.4: Add Stream Tests

**File**: `packages/web/src/streams/timeline-pagination.test.ts`

```typescript
import { it, describe } from "@effect/vitest"
import { Effect, Stream, Chunk, Option, Layer } from "effect"
import { createPaginationStream } from "./timeline-pagination"
import type { TimelineInitialConfig } from "./timeline-types"

// Mock services for testing
const MockTimelineClient = /* ... */
const MockTimelineKVS = /* ... */

const testLayer = Layer.mergeAll(MockTimelineClient, MockTimelineKVS)

describe("createPaginationStream", () => {
  it.effect("fetches first page with initial params", () =>
    Effect.gen(function* () {
      const config: TimelineInitialConfig = {
        params: { limit: 50 },
        method: "cursor"
      }

      const stream = createPaginationStream(config)

      const firstPage = yield* Stream.runCollect(
        stream.pipe(Stream.take(1))
      )

      expect(Chunk.size(firstPage)).toBe(1)
      expect(firstPage[0].response.results.length).toBe(50)
    }).pipe(Effect.provide(testLayer))
  )

  it.effect("paginates through multiple pages", () =>
    Effect.gen(function* () {
      const config: TimelineInitialConfig = {
        params: { limit: 50 },
        method: "cursor"
      }

      const stream = createPaginationStream(config)

      const pages = yield* Stream.runCollect(
        stream.pipe(Stream.take(3))
      )

      expect(Chunk.size(pages)).toBe(3)
      expect(pages[1].params.cursor).toBeDefined()
      expect(pages[2].params.cursor).toBeDefined()
    }).pipe(Effect.provide(testLayer))
  )

  it.effect("terminates when has_more is false", () =>
    Effect.gen(function* () {
      const config: TimelineInitialConfig = {
        params: { limit: 50 },
        method: "cursor"
      }

      const stream = createPaginationStream(config)

      const allPages = yield* Stream.runCollect(stream)

      const lastPage = Chunk.unsafeLast(allPages)
      expect(lastPage.response.has_more).toBe(false)
    }).pipe(Effect.provide(testLayer))
  )

  it.effect("uses special navigation params on first page only", () =>
    Effect.gen(function* () {
      const config: TimelineInitialConfig = {
        params: {
          limit: 50,
          percentage: 0.5,
          anchor_id: 12345
        },
        method: "percentage"
      }

      const stream = createPaginationStream(config)

      const pages = yield* Stream.runCollect(
        stream.pipe(Stream.take(2))
      )

      // First page: has special params
      expect(pages[0].params.percentage).toBe(0.5)

      // Second page: cursor-only (no percentage)
      expect(pages[1].params.percentage).toBeUndefined()
      expect(pages[1].params.cursor).toBeDefined()
    }).pipe(Effect.provide(testLayer))
  )
})
```

**Why**: Verify stream behavior in isolation before integrating with atoms.

---

## Phase 2: Refactor Action Atoms to Consume Streams

### Step 2.1: Update Load Initial Page Atom

**File**: `packages/web/src/atoms/timeline-infinite.ts`

**Change:**

```typescript
import { createPaginationStream } from "@/streams/timeline-pagination"
import type { TimelineError } from "@/streams/timeline-types"

/**
 * Action atom: Load initial timeline page.
 * Reads URL params, fetches first page via stream, and initializes infinite state.
 */
export const loadInitialTimelinePageAtom = TimelineRuntime.fn<void>()(
  (_, get) =>
    Effect.gen(function* () {
      const config = get(timelineInitialConfigAtom)

      // Update state to loading-initial
      const loadingState: TimelineInfiniteState = {
        ...initialInfiniteState,
        status: "loading-initial",
        initialParams: config.params,
        initialMethod: config.method,
      }
      get.set(timelineInfiniteStateAtom, loadingState)

      // Create pagination stream
      const stream = createPaginationStream(config)

      // Take first page from stream
      const firstPageChunk = yield* Stream.runCollect(
        stream.pipe(Stream.take(1))
      )

      const firstPageArray = Chunk.toReadonlyArray(firstPageChunk)

      if (firstPageArray.length === 0) {
        // Empty timeline (shouldn't happen, but handle it)
        const emptyState: TimelineInfiniteState = {
          ...loadingState,
          status: "idle",
          hasMore: false
        }
        get.set(timelineInfiniteStateAtom, emptyState)
        return
      }

      const [page] = firstPageArray

      // Find anchor position if anchor method was used
      let anchorPosition: TimelineInfiniteState["anchorPosition"]
      if (config.method === "anchor" && config.params.anchor_id) {
        const itemIndex = page.response.results.findIndex(
          (play) => play.id === config.params.anchor_id
        )
        if (itemIndex >= 0) {
          anchorPosition = { pageIndex: 0, itemIndex }
        }
      }

      // Update state with successful page
      const successState: TimelineInfiniteState = {
        pages: [page],
        status: "idle",
        hasMore: page.response.has_more,
        initialParams: config.params,
        initialMethod: config.method,
        ...(page.response.next_cursor && { nextCursor: page.response.next_cursor }),
        ...(page.response.total_count !== null &&
          page.response.total_count !== undefined && {
            totalCount: page.response.total_count
          }),
        ...(anchorPosition && { anchorPosition }),
      }
      get.set(timelineInfiniteStateAtom, successState)
    }).pipe(
      Effect.catchAll((error: TimelineError) =>
        Effect.gen(function* () {
          yield* Effect.logError(`Initial page load failed: ${error.message}`)
          const errorState: TimelineInfiniteState = {
            ...get(timelineInfiniteStateAtom),
            status: "error",
            error,
          }
          get.set(timelineInfiniteStateAtom, errorState)
        })
      )
    )
)
```

**Why**: Stream now handles fetching logic, atom just manages React state.

### Step 2.2: Update Load Next Page Atom

**File**: `packages/web/src/atoms/timeline-infinite.ts`

**Change:**

```typescript
import { createResumablePaginationStream } from "@/streams/timeline-pagination"
import { advanceCursor } from "@/streams/timeline-cursor"

/**
 * Action atom: Load next timeline page (cursor pagination).
 * Only works after initial page is loaded.
 */
export const loadNextTimelinePageAtom = TimelineRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const state = get(timelineInfiniteStateAtom)

    // Guard: don't load if already loading or no more pages
    if (state.status === "loading-more" || !state.hasMore) {
      yield* Effect.log(
        `Skipping load-more: status=${state.status}, hasMore=${state.hasMore}`
      )
      return
    }

    // Build cursor state from current infinite state
    const currentCursor: TimelineCursor = {
      cursor: Option.fromNullable(state.nextCursor),
      hasMore: state.hasMore,
      totalLoaded: state.pages.reduce(
        (sum, page) => sum + page.response.results.length,
        0
      ),
      initialMethod: state.initialMethod,
      initialParams: state.initialParams
    }

    // Set loading state
    const loadingState: TimelineInfiniteState = {
      ...state,
      status: "loading-more",
    }
    get.set(timelineInfiniteStateAtom, loadingState)

    // Create resumable stream from current cursor
    const stream = createResumablePaginationStream(currentCursor)

    // Take next page from stream
    const nextPageChunk = yield* Stream.runCollect(
      stream.pipe(Stream.take(1))
    )

    const nextPageArray = Chunk.toReadonlyArray(nextPageChunk)

    if (nextPageArray.length === 0) {
      // No more pages (stream exhausted)
      const exhaustedState: TimelineInfiniteState = {
        ...state,
        status: "idle",
        hasMore: false
      }
      get.set(timelineInfiniteStateAtom, exhaustedState)
      return
    }

    const [page] = nextPageArray

    // Append page to existing pages
    const successState: TimelineInfiniteState = {
      ...state,
      pages: [...state.pages, page],
      status: "idle",
      hasMore: page.response.has_more,
      ...(page.response.next_cursor && { nextCursor: page.response.next_cursor }),
    }
    get.set(timelineInfiniteStateAtom, successState)
  }).pipe(
    Effect.catchAll((error: TimelineError) =>
      Effect.gen(function* () {
        yield* Effect.logError(`Next page load failed: ${error.message}`)
        const currentState = get(timelineInfiniteStateAtom)
        const errorState: TimelineInfiniteState = {
          ...currentState,
          status: "error",
          error,
        }
        get.set(timelineInfiniteStateAtom, errorState)
      })
    )
  )
)
```

**Why**:
- Stream handles pagination logic
- Atom focuses on React state management
- Easy to test stream separately from atom

### Step 2.3: Remove Old fetchPageEffect Functions

**File**: `packages/web/src/atoms/timeline-infinite.ts`

**Delete:**

```typescript
// DELETE THESE (now in stream layer)
const loadInitialPageEffect = (config: { ... }) => { ... }
const loadNextPageEffect = (params: TimelineParams) => { ... }
```

**Why**: Logic moved to stream layer, no duplication.

---

## Phase 3: Add SSE Stream Scaffold (Future-Proofing)

### Step 3.1: Create SSE Stream Stub

**File**: `packages/web/src/streams/timeline-sse.ts`

```typescript
import { Stream, Effect, Chunk } from "effect"
import { TimelineClient } from "@/lib/http-runtime"
import type { TimelinePage, TimelineError } from "./timeline-types"
import { TimelineSSEError } from "./timeline-types"

/**
 * Create a Server-Sent Events stream for real-time timeline updates.
 *
 * This is a **push-based stream** that:
 * - Receives new plays from server in real-time
 * - Emits TimelinePage events as they arrive
 * - Terminates on SSE connection close
 *
 * @example
 * ```typescript
 * const stream = createSSEStream("cursor_abc123")
 * yield* Stream.runForEach(stream, (page) =>
 *   Effect.log(`New page pushed: ${page.response.results.length} plays`)
 * )
 * ```
 *
 * NOTE: Currently a stub. Requires backend SSE endpoint implementation.
 */
export const createSSEStream = (
  initialCursor: string
): Stream.Stream<TimelinePage, TimelineError, TimelineClient> =>
  Stream.async<TimelinePage>((emit) => {
    // TODO: Implement SSE connection when backend is ready
    //
    // const eventSource = new EventSource(
    //   `/api/timeline/stream?cursor=${initialCursor}`
    // )
    //
    // eventSource.addEventListener("timeline-page", (event) => {
    //   const page = parseTimelinePage(event.data)
    //   emit.single(page)
    // })
    //
    // eventSource.addEventListener("error", () => {
    //   emit.fail(new TimelineSSEError({
    //     message: "SSE connection error"
    //   }))
    //   eventSource.close()
    // })
    //
    // return Effect.sync(() => {
    //   eventSource.close()
    // })

    // Stub: immediately fail with not-implemented error
    emit.fail(
      new TimelineSSEError({
        message: "SSE timeline stream not yet implemented"
      })
    )

    return Effect.unit
  })

/**
 * Helper: Parse timeline page from SSE event data
 */
const parseTimelinePage = (data: string): TimelinePage => {
  // TODO: Implement when SSE format is defined
  throw new Error("Not implemented")
}
```

**Why**: Demonstrates SSE integration path without blocking current work.

### Step 3.2: Add Stream Mode Switcher

**File**: `packages/web/src/streams/timeline-factory.ts`

```typescript
import { Stream } from "effect"
import type { TimelineClient, TimelineKVS } from "@/lib/http-runtime"
import type {
  TimelinePage,
  TimelineError,
  TimelineInitialConfig
} from "./timeline-types"
import { createPaginationStream } from "./timeline-pagination"
import { createSSEStream } from "./timeline-sse"

/**
 * Timeline stream mode.
 *
 * - "pull": Cursor-based pagination (current)
 * - "push": Server-Sent Events (future)
 */
export type TimelineStreamMode = "pull" | "push"

/**
 * Factory: Create timeline stream based on mode.
 *
 * Allows toggling between pull and push without changing consumers.
 */
export const createTimelineStream = (
  config: TimelineInitialConfig,
  mode: TimelineStreamMode = "pull"
): Stream.Stream<TimelinePage, TimelineError, TimelineClient | TimelineKVS> => {
  switch (mode) {
    case "pull":
      return createPaginationStream(config)

    case "push":
      // Use initial cursor from config
      const cursor = config.params.cursor ?? ""
      return createSSEStream(cursor).pipe(
        // SSE stream only provides TimelineClient, add TimelineKVS for storage
        Stream.mapEffect((page) =>
          Effect.gen(function* () {
            const kvs = yield* TimelineKVS
            // Store plays from SSE page
            yield* Effect.all(
              page.response.results.map((play) => kvs.storePlay(play)),
              { concurrency: 50 }
            )
            return page
          })
        )
      )
  }
}
```

**Why**: Clean abstraction for future mode switching, no atom changes needed.

---

## Phase 4: Testing and Validation

### Step 4.1: Unit Tests for Stream Layer

**Run:**

```bash
pnpm test src/streams/timeline-pagination.test.ts
pnpm test src/streams/timeline-cursor.test.ts
```

**Verify:**
- ✅ Stream paginates correctly
- ✅ Cursor advances properly
- ✅ Terminates when has_more = false
- ✅ Special params only used on first page

### Step 4.2: Integration Tests for Atoms

**File**: `packages/web/src/atoms/timeline-infinite.test.ts`

```typescript
import { it, describe } from "@effect/vitest"
import { Effect } from "effect"
import {
  loadInitialTimelinePageAtom,
  loadNextTimelinePageAtom,
  timelineInfiniteStateAtom
} from "./timeline-infinite"

describe("loadInitialTimelinePageAtom", () => {
  it.effect("loads first page via stream", () =>
    Effect.gen(function* () {
      // Trigger initial load
      yield* loadInitialTimelinePageAtom

      // Read state
      const state = yield* Effect.sync(() =>
        get(timelineInfiniteStateAtom)
      )

      expect(state.pages.length).toBe(1)
      expect(state.status).toBe("idle")
      expect(state.hasMore).toBe(true)
    }).pipe(Effect.provide(testRuntime))
  )
})

describe("loadNextTimelinePageAtom", () => {
  it.effect("loads subsequent pages via stream", () =>
    Effect.gen(function* () {
      // Load initial
      yield* loadInitialTimelinePageAtom

      // Load next
      yield* loadNextTimelinePageAtom

      const state = yield* Effect.sync(() =>
        get(timelineInfiniteStateAtom)
      )

      expect(state.pages.length).toBe(2)
      expect(state.pages[1].params.cursor).toBeDefined()
    }).pipe(Effect.provide(testRuntime))
  )

  it.effect("does not load if already loading", () =>
    Effect.gen(function* () {
      yield* loadInitialTimelinePageAtom

      // Set loading state manually
      set(timelineInfiniteStateAtom, {
        ...get(timelineInfiniteStateAtom),
        status: "loading-more"
      })

      // Try to load (should be no-op)
      yield* loadNextTimelinePageAtom

      const state = yield* Effect.sync(() =>
        get(timelineInfiniteStateAtom)
      )

      // Should still only have 1 page
      expect(state.pages.length).toBe(1)
    }).pipe(Effect.provide(testRuntime))
  )
})
```

### Step 4.3: Component Integration Test

**File**: `packages/web/src/components/VirtualizedTimeline.test.tsx`

```typescript
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { VirtualizedTimeline } from "./VirtualizedTimeline"

describe("VirtualizedTimeline", () => {
  it("loads initial page on mount", async () => {
    render(<VirtualizedTimeline />)

    await waitFor(() => {
      expect(screen.getByText(/Timeline/)).toBeInTheDocument()
    })

    // Should show loaded play count
    await waitFor(() => {
      expect(screen.getByText(/50 plays loaded/)).toBeInTheDocument()
    })
  })

  it("loads more pages on scroll to bottom", async () => {
    render(<VirtualizedTimeline />)

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText(/50 plays loaded/)).toBeInTheDocument()
    })

    // Scroll to bottom
    const scrollContainer = screen.getByRole("list")
    fireEvent.scroll(scrollContainer, {
      target: { scrollTop: 5000 }
    })

    // Should trigger load more
    await waitFor(() => {
      expect(screen.getByText(/100 plays loaded/)).toBeInTheDocument()
    })
  })

  it("shows error state on stream failure", async () => {
    // Mock stream to fail
    mockTimelineClient.timeline.getTimeline.mockRejectedValue(
      new Error("Network error")
    )

    render(<VirtualizedTimeline />)

    await waitFor(() => {
      expect(screen.getByText(/Error/)).toBeInTheDocument()
    })
  })
})
```

### Step 4.4: Manual Testing Checklist

- [ ] Initial page loads with correct navigation method (cursor/time/percentage/anchor)
- [ ] Scrolling to bottom triggers load more
- [ ] Pages append correctly (no duplicates)
- [ ] Stream terminates when has_more = false
- [ ] Error states display correctly
- [ ] Browser back/forward works with URL params
- [ ] TimelineKVS reactivity triggers derived atoms (boundaries, album bar, etc.)
- [ ] Performance: smooth scrolling with 1000+ plays loaded

---

## Phase 5: Documentation Updates

### Step 5.1: Update Main Architecture Doc

**File**: `docs/timeline-atoms-infinite-scroll.md`

**Add section:**

```markdown
## Stream Layer (packages/web/src/streams/)

The infinite scroll implementation uses **Effect Streams** as the pagination abstraction:

### Cursor-Based Pagination Stream

`createPaginationStream(config)` returns a `Stream<TimelinePage>` that:
- Uses `Stream.paginateEffect` for lazy, pull-based pagination
- Fetches pages only when consumed (backpressure-aware)
- Stores plays in TimelineKVS during stream execution
- Terminates when API returns `has_more = false`

### SSE Stream (Future)

`createSSEStream(cursor)` will return a `Stream<TimelinePage>` that:
- Receives real-time updates from server
- Push-based event stream
- Same interface as pagination stream

### Factory Pattern

`createTimelineStream(config, mode)` allows toggling between pull and push:

```typescript
const stream = createTimelineStream(config, "pull") // Current
const stream = createTimelineStream(config, "push") // Future SSE
```

Both streams have the same type signature, so atoms don't need to change.
```

### Step 5.2: Create Stream Layer README

**File**: `packages/web/src/streams/README.md`

```markdown
# Timeline Streams

Effect Stream-based pagination and real-time update abstractions for timeline data.

## Overview

This directory contains pure Effect Streams that handle timeline pagination and (future) real-time updates. Streams are consumed by atoms in `src/atoms/timeline-infinite.ts`.

## Streams

### `createPaginationStream(config)` - Cursor Pagination

Pull-based stream using `Stream.paginateEffect`.

**Features:**
- Lazy evaluation (pages fetched on demand)
- Automatic backpressure handling
- Normalizes plays into TimelineKVS
- Supports special navigation (percentage, anchor, time-range) on first page
- Cursor-only pagination for subsequent pages

**Example:**
```typescript
const stream = createPaginationStream({ params: { limit: 50 }, method: "cursor" })
const firstPage = yield* Stream.runCollect(stream.pipe(Stream.take(1)))
```

### `createSSEStream(cursor)` - Server-Sent Events (Stub)

Push-based stream for real-time timeline updates.

**Status:** Stub implementation, requires backend SSE endpoint.

**Future Example:**
```typescript
const stream = createSSEStream("cursor_abc123")
yield* Stream.runForEach(stream, (page) => handleNewPage(page))
```

### `createTimelineStream(config, mode)` - Unified Factory

Abstracts over pull vs push streams.

**Example:**
```typescript
const stream = createTimelineStream(config, "pull") // Pagination
const stream = createTimelineStream(config, "push") // SSE (future)
```

## Integration with Atoms

Atoms consume streams using `Stream.runCollect` or `Stream.take`:

```typescript
export const loadNextPageAtom = TimelineRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const stream = createPaginationStream(config)
    const page = yield* Stream.runCollect(stream.pipe(Stream.take(1)))
    // Update atom state with page
  })
)
```

## Testing

See `*.test.ts` files for stream unit tests.

Run: `pnpm test src/streams/`
```

### Step 5.3: Update REACTIVE_PATTERNS.md

**File**: `docs/REACTIVE_PATTERNS.md`

**Add section:**

```markdown
## Pattern: Consuming Streams in Atoms

### Use Case

Infinite scroll pagination where pages are produced by an Effect Stream.

### Implementation

```typescript
// 1. Create stream (pure, no side effects except KVS normalization)
const paginationStream = createPaginationStream(config)

// 2. Consume stream in action atom
export const loadNextPageAtom = TimelineRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const stream = createPaginationStream(config)

    // Take next page
    const pages = yield* Stream.runCollect(
      stream.pipe(Stream.take(1))
    )

    // Update React state via get.set()
    get.set(stateAtom, { ...state, pages: [...state.pages, pages[0]] })
  })
)
```

### Why This Pattern

- **Separation of concerns**: Stream handles pagination logic, atom handles React state
- **Testability**: Stream can be tested in isolation
- **Composability**: Streams can be transformed with `map`, `filter`, etc.
- **Forward-compatible**: Easy to swap pull stream for push stream (SSE)

### Key Insight

**Action atoms (`runtime.fn()`) are allowed to use imperative `get.set()`**. This is the correct way to model user actions that update state.

The Stream provides the **data source**, the atom provides the **React integration**.
```

---

## Phase 6: Cleanup and Finalization

### Step 6.1: Remove Dead Code

**Files to review:**

- `packages/web/src/atoms/timeline-infinite.ts` - Remove old Effect functions that moved to streams
- Ensure no duplicated pagination logic

### Step 6.2: Update Imports

Ensure all files import from new stream modules:

```typescript
// Old (delete)
import { loadInitialPageEffect } from "./timeline-infinite"

// New
import { createPaginationStream } from "@/streams/timeline-pagination"
import type { TimelineCursor } from "@/streams/timeline-types"
```

### Step 6.3: Type Safety Audit

Run type checker:

```bash
pnpm tsc --noEmit
```

Fix any type errors related to the refactoring.

### Step 6.4: Performance Benchmark

Measure infinite scroll performance before and after:

**Metrics:**
- Time to load first page
- Time to load 10 pages
- Memory usage with 1000 plays loaded
- Frame rate during scroll

Document results in PR description.

---

## Success Criteria

✅ **All tests passing**
- Stream unit tests
- Atom integration tests
- Component integration tests

✅ **Type safety maintained**
- No TypeScript errors
- Proper error types throughout

✅ **Functionality preserved**
- Infinite scroll works as before
- All navigation methods work (cursor, time, percentage, anchor)
- TimelineKVS reactivity intact

✅ **Documentation complete**
- Stream layer documented
- Integration patterns documented
- SSE path clearly described

✅ **Performance acceptable**
- No regression in load times
- Smooth scrolling maintained

---

## Rollback Plan

If issues arise:

1. **Revert stream integration**: Keep stream files but don't use them in atoms yet
2. **Keep old Effect functions**: Comment out instead of deleting
3. **Incremental rollout**: Enable stream-based loading behind feature flag

**Feature flag pattern:**

```typescript
const USE_STREAM_PAGINATION = false // Toggle via env var

export const loadNextPageAtom = TimelineRuntime.fn<void>()((_, get) =>
  USE_STREAM_PAGINATION
    ? loadViaStream(get)
    : loadViaOldMethod(get)
)
```

---

## Timeline Estimate

| Phase | Estimated Time |
|-------|---------------|
| Phase 1: Stream Layer | 4 hours |
| Phase 2: Atom Refactoring | 3 hours |
| Phase 3: SSE Scaffold | 1 hour |
| Phase 4: Testing | 4 hours |
| Phase 5: Documentation | 2 hours |
| Phase 6: Cleanup | 1 hour |
| **Total** | **15 hours** (~2 days) |

---

## Next Steps After Completion

1. **Implement SSE backend endpoint** (`/api/timeline/stream`)
2. **Add SSE stream implementation** (remove stub)
3. **Add mode switcher UI** (toggle pull/push)
4. **Optimize prefetching** (stream next page in background)
5. **Add bidirectional scroll** (newer plays stream)
6. **Implement stream combinators** (filter, search within stream)

---

## Questions?

See:
- Architecture doc: `docs/timeline-streaming-architecture.md`
- Effect Stream docs: `docs/effect-source/effect/src/Stream.ts`
- Effect pagination tests: `docs/effect-source/effect/test/Stream/pagination.test.ts`
