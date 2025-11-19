# Timeline Infinite Scroll: Pull-Based Streaming Architecture

## Executive Summary

This document proposes a refactoring of the current imperative infinite scroll implementation to use **Effect Stream-based pull patterns** with Effect Atom integration. The design is forward-compatible with SSE/push-based updates and follows idiomatic Effect patterns.

**Current State**: Manual state management with `get.set()`, action atoms triggering imperative updates.
**Target State**: Stream-based pagination where atoms consume Effect Streams, enabling reactive pull and future push integration.

---

## 1. Current Implementation Analysis

### 1.1 Files

- `/Users/pooks/Dev/crate/packages/web/src/atoms/timeline-infinite.ts` - Current infinite scroll state
- `/Users/pooks/Dev/crate/packages/web/src/components/VirtualizedTimeline.tsx` - Consumer component
- `/Users/pooks/Dev/crate/packages/web/src/lib/http-runtime.ts` - TimelineRuntime and TimelineKVS

### 1.2 Current Pattern

```typescript
// Writable state atom
const timelineInfiniteStateAtom = Atom.make(initialInfiniteState)

// Action atoms with manual state updates
const loadNextTimelinePageAtom = TimelineRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const state = get(timelineInfiniteStateAtom)

    // Manual state mutation via get.set()
    get.set(timelineInfiniteStateAtom, { ...state, status: "loading-more" })

    const result = yield* loadNextPageEffect(nextParams)

    // Another manual mutation
    get.set(timelineInfiniteStateAtom, {
      ...state,
      pages: [...state.pages, newPage],
      status: "idle"
    })
  })
)
```

**Component triggers:**
```typescript
// IntersectionObserver manually calls action
useEffect(() => {
  if (shouldLoadMore) {
    loadMore() // Calls the action atom
  }
}, [virtualItems, playIds.length])
```

### 1.3 Problems with Current Approach

1. **Imperative state management**: `get.set()` breaks Effect's declarative model
2. **Manual invalidation**: No automatic reactivity when pages change
3. **Tight coupling**: Component must know when to trigger loads
4. **Not stream-compatible**: Can't easily swap to SSE push model
5. **Redundant with TimelineKVS**: Already have reactive KVS layer but bypassing it

---

## 2. Effect Stream Pagination Patterns (from Source)

### 2.1 Stream.paginate and Stream.paginateEffect

From `/Users/pooks/Dev/crate/docs/effect-source/effect/src/Stream.ts`:

```typescript
/**
 * Like `Stream.unfold`, but allows the emission of values to end one step
 * further than the unfolding of the state. This is useful for embedding
 * paginated APIs, hence the name.
 */
export const paginate: <S, A>(
  s: S,
  f: (s: S) => readonly [A, Option.Option<S>]
) => Stream<A>

export const paginateEffect: <S, A, E, R>(
  s: S,
  f: (s: S) => Effect.Effect<readonly [A, Option.Option<S>], E, R>
) => Stream<A, E, R>
```

**Test example** from `pagination.test.ts`:

```typescript
// Paginate through a list using cursors
const s: readonly [number, Array<number>] = [0, [1, 2, 3]]

const stream = Stream.paginateEffect(
  s,
  ([current, remaining]) =>
    remaining.length === 0
      ? Effect.succeed([current, Option.none()])
      : Effect.succeed([current, Option.some([remaining[0], remaining.slice(1)])])
)

const result = yield* Stream.runCollect(stream)
// Result: [0, 1, 2, 3]
```

### 2.2 Key Properties

1. **Pull-based**: Stream only pulls next page when consumer requests it
2. **Backpressure**: Natural flow control via Stream semantics
3. **Composable**: Can transform with `Stream.map`, `Stream.filter`, etc.
4. **Lazy**: Pages not fetched until stream is consumed
5. **Cancelable**: Stream can be interrupted mid-pagination

---

## 3. Proposed Architecture: Stream-Based Infinite Scroll

### 3.1 Core Design Principles

1. **Stream as source of truth**: Pages are Stream elements, not manual array state
2. **Atom consumes Stream**: Use runtime atoms to bridge Stream → React
3. **Reactive invalidation**: Leverage TimelineKVS reactivity, not manual `get.set()`
4. **Forward-compatible**: Easy swap from cursor pagination to SSE events
5. **Separation of concerns**:
   - Stream layer: pagination logic
   - Atom layer: React integration
   - Component layer: rendering only

### 3.2 Architecture Layers

```text
┌─────────────────────────────────────────────────────────────┐
│                     Component Layer                         │
│  VirtualizedTimeline.tsx                                    │
│  - Reads loadedPagesAtom (Result<PageWindow>)              │
│  - Renders virtualized window                               │
│  - NO manual state, NO imperative loads                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ useAtomValue
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Atom Layer                             │
│  Bridges Streams to React with Result handling             │
│                                                             │
│  loadedPagesAtom = TimelineRuntime.atom(                   │
│    Effect.gen(function* () {                               │
│      const pages = yield* Stream.runCollect(               │
│        timelinePaginationStream.pipe(                       │
│          Stream.take(currentWindowSize)                     │
│        )                                                    │
│      )                                                      │
│      return PageWindow.fromChunk(pages)                    │
│    })                                                       │
│  ).pipe(                                                    │
│    Atom.withReactivity(["timeline:cursor"])                │
│  )                                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ consumes
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Stream Layer                            │
│  Pure Effect Streams - no React knowledge                  │
│                                                             │
│  timelinePaginationStream: Stream<TimelinePage, Error>     │
│    = Stream.paginateEffect(                                │
│        initialCursor,                                       │
│        (cursor) => fetchPageAndReturnNext(cursor)           │
│      )                                                      │
│                                                             │
│  Future SSE variant:                                        │
│  timelineSSEStream = Stream.async<TimelineEvent>(...)      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Effect.gen
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                            │
│  TimelineClient - HTTP API calls                           │
│  TimelineKVS - Normalized play storage                     │
│  - Both services have Requirements = never                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Design: Stream Construction

### 4.1 Cursor State Type

```typescript
/**
 * Pagination cursor state for Stream.paginateEffect
 *
 * Tracks both the cursor AND accumulated metadata needed for UI
 */
interface TimelineCursor {
  readonly cursor: Option.Option<string>
  readonly hasMore: boolean
  readonly totalLoaded: number
  readonly initialMethod: TimelineNavigationMethod
  readonly initialParams: TimelineParams
}

const initialCursor = (config: TimelineInitialConfig): TimelineCursor => ({
  cursor: Option.none(),
  hasMore: true,
  totalLoaded: 0,
  initialMethod: config.method,
  initialParams: config.params
})
```

### 4.2 Core Pagination Stream

```typescript
/**
 * Creates an infinite stream of timeline pages using cursor pagination.
 *
 * Pull-based: Only fetches next page when stream consumer pulls.
 * Terminates when API returns has_more = false.
 */
const timelinePaginationStream = (
  config: TimelineInitialConfig
): Stream.Stream<TimelinePage, TimelineError, TimelineClient | TimelineKVS> =>
  Stream.paginateEffect(
    initialCursor(config),

    // Fetch function: cursor state → [page, next cursor]
    (state) => Effect.gen(function* () {
      const client = yield* TimelineClient
      const kvs = yield* TimelineKVS

      // Build params from cursor state
      const params = buildParamsForCursor(state)

      // Fetch from API
      const response = yield* client.timeline.getTimeline({
        urlParams: params
      })

      // Normalize into KVS (single source of truth)
      yield* Effect.all(
        response.results.map((play) => kvs.storePlay(play)),
        { concurrency: 50 }
      )

      // Build page result
      const page: TimelinePage = {
        params,
        response
      }

      // Compute next cursor state
      const nextState = response.has_more
        ? Option.some<TimelineCursor>({
            cursor: Option.fromNullable(response.next_cursor),
            hasMore: response.has_more,
            totalLoaded: state.totalLoaded + response.results.length,
            initialMethod: state.initialMethod,
            initialParams: state.initialParams
          })
        : Option.none<TimelineCursor>()

      // Return tuple: [current page, next state]
      return [page, nextState] as const
    })
  )

/**
 * Helper: Build API params from cursor state
 * After initial jump, only cursor pagination is used
 */
const buildParamsForCursor = (state: TimelineCursor): TimelineParams => {
  const baseLimitFromConfig = state.initialParams.limit ?? 50

  return {
    limit: baseLimitFromConfig,
    cursor: Option.getOrUndefined(state.cursor)
    // Note: No percentage/anchor/since/until after first page
  }
}
```

### 4.3 Windowed Pages Atom

```typescript
/**
 * Atom that consumes the pagination stream and returns a window of pages.
 *
 * Uses reactivity keys to invalidate when URL params change.
 */
const loadedPagesAtom = Atom.family((windowSize: number) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      // Read URL-derived config
      const config = yield* Effect.sync(() =>
        // This would be derived from timelineInitialConfigAtom
        // In practice, we'd access via get() in atom context
        getCurrentConfig()
      )

      // Create stream
      const paginationStream = timelinePaginationStream(config)

      // Take only the requested window
      const pages = yield* Stream.runCollect(
        paginationStream.pipe(
          Stream.take(windowSize)
        )
      )

      return {
        pages: Chunk.toReadonlyArray(pages),
        totalLoaded: pages.reduce((sum, p) => sum + p.response.results.length, 0),
        hasMore: pages[pages.length - 1]?.response.has_more ?? false
      }
    })
  ).pipe(
    // Invalidate when URL params change
    Atom.withReactivity(["timeline:params", "timeline:plays_chunk"])
  )
)

/**
 * Derived atom: All play IDs from loaded pages
 */
const loadedPlayIdsAtom = Atom.make((get) => {
  const windowResult = get(loadedPagesAtom(currentWindowSize))

  return Result.map(windowResult, (window) =>
    pipe(
      window.pages,
      Array.flatMap((page) => page.response.results),
      Array.map((play) => play.id),
      Array.dedupe // Handle any overlaps from anchor queries
    )
  )
})
```

---

## 5. Progressive Loading Pattern

### 5.1 Challenge: Infinite Scroll Needs Dynamic Window Growth

The `Stream.take(windowSize)` approach above works for initial load, but infinite scroll needs **incremental expansion** of the window as user scrolls.

### 5.2 Solution: Managed Stream Subscription

```typescript
/**
 * Stateful atom that manages a growing subscription to the pagination stream.
 *
 * As component requests more pages (via loadMoreAtom), this atom
 * expands its consumption of the underlying stream.
 */
const infiniteScrollStateAtom = Atom.make<{
  readonly pages: ReadonlyArray<TimelinePage>
  readonly subscription: Option.Option<Stream.Stream<TimelinePage, TimelineError>>
  readonly status: "idle" | "loading" | "error"
  readonly error: Option.Option<TimelineError>
  readonly hasMore: boolean
}>({
  pages: [],
  subscription: Option.none(),
  status: "idle",
  error: Option.none(),
  hasMore: true
})

/**
 * Action atom: Initialize stream subscription
 */
const initializeStreamAtom = TimelineRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const config = get(timelineInitialConfigAtom)

    // Create the infinite stream
    const stream = timelinePaginationStream(config)

    // Store stream reference (not consumed yet)
    get.set(infiniteScrollStateAtom, {
      ...get(infiniteScrollStateAtom),
      subscription: Option.some(stream),
      status: "idle"
    })
  })
)

/**
 * Action atom: Pull next page from stream
 */
const loadNextPageAtom = TimelineRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const state = get(infiniteScrollStateAtom)

    // Guard: Already loading or no more pages
    if (state.status === "loading" || !state.hasMore) {
      return
    }

    // Guard: Stream not initialized
    if (Option.isNone(state.subscription)) {
      yield* Effect.fail(new Error("Stream not initialized"))
    }

    const stream = state.subscription.value

    // Set loading
    get.set(infiniteScrollStateAtom, {
      ...state,
      status: "loading"
    })

    // Pull one page from stream
    const nextPageChunk = yield* Stream.runCollect(
      stream.pipe(Stream.take(1))
    )

    const nextPages = Chunk.toReadonlyArray(nextPageChunk)

    if (nextPages.length === 0) {
      // Stream exhausted
      get.set(infiniteScrollStateAtom, {
        ...state,
        status: "idle",
        hasMore: false
      })
      return
    }

    const [page] = nextPages

    // Append to pages
    get.set(infiniteScrollStateAtom, {
      ...state,
      pages: [...state.pages, page],
      status: "idle",
      hasMore: page.response.has_more
    })
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const state = get(infiniteScrollStateAtom)
        get.set(infiniteScrollStateAtom, {
          ...state,
          status: "error",
          error: Option.some(error)
        })
      })
    )
  )
)
```

**PROBLEM**: The above pattern still uses manual `get.set()` state management! This defeats the purpose of using Streams.

---

## 6. Better Pattern: Stream + Ref for Stateful Pull

### 6.1 Insight: Use Effect.Ref Inside Stream

Instead of managing state in atoms, keep stream consumption state **inside the Effect** via `Ref`:

```typescript
/**
 * Stream-based infinite scroll state managed via Effect.Ref
 *
 * Component triggers pull via atom, which advances a Ref-backed cursor
 */
const createInfiniteScrollStream = (
  config: TimelineInitialConfig
) => Effect.gen(function* () {
  // Create base pagination stream
  const paginationStream = timelinePaginationStream(config)

  // Create a Ref to track consumed pages
  const consumedRef = yield* Ref.make(0)

  // Create pull function
  const pullNextPage = Effect.gen(function* () {
    const currentCount = yield* Ref.get(consumedRef)

    // Take next chunk from stream
    const pages = yield* Stream.runCollect(
      paginationStream.pipe(
        Stream.drop(currentCount),
        Stream.take(1)
      )
    )

    if (Chunk.size(pages) === 0) {
      return Option.none<TimelinePage>()
    }

    yield* Ref.update(consumedRef, (n) => n + 1)
    return Option.some(Chunk.unsafeHead(pages))
  })

  return {
    pullNextPage,
    getAllConsumed: Effect.gen(function* () {
      const count = yield* Ref.get(consumedRef)
      return yield* Stream.runCollect(
        paginationStream.pipe(Stream.take(count))
      )
    })
  }
})

/**
 * Scoped atom that provides infinite scroll operations
 */
const infiniteScrollOpsAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const config = /* get from URL atoms */
    const ops = yield* createInfiniteScrollStream(config)
    return ops
  })
).pipe(
  Atom.withReactivity(["timeline:params"]),
  Atom.keepAlive // Keep stream alive during session
)

/**
 * Action atom: Pull next page
 */
const loadNextPageAtom = TimelineRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const ops = yield* Effect.fromResult(get(infiniteScrollOpsAtom))
    const maybePage = yield* ops.pullNextPage

    // Page automatically stored in TimelineKVS during stream execution
    // No manual state management needed!

    return maybePage
  })
)

/**
 * Derived atom: Current loaded pages
 */
const loadedPagesAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const ops = yield* Effect.fromResult(get(infiniteScrollOpsAtom))
    const pages = yield* ops.getAllConsumed
    return Chunk.toReadonlyArray(pages)
  })
).pipe(
  Atom.withReactivity(["timeline:plays_chunk"]) // Invalidate when KVS updates
)
```

**PROBLEM**: This is getting complex. Stream.take creates a new stream each time, doesn't maintain position.

---

## 7. BEST Pattern: Queue + Stream.fromQueue

### 7.1 The Right Abstraction

After reviewing Effect source patterns, the **cleanest** approach for infinite scroll is:

1. **Stream produces pages** via `Stream.paginateEffect` (pull-based)
2. **Queue buffers consumed pages** for React consumption
3. **Atom reads from Queue** as needed
4. **Component triggers demand** by requesting queue size increase

```typescript
/**
 * Service: Infinite scroll coordinator
 *
 * Manages a Queue-backed stream that grows on demand
 */
class InfiniteScrollCoordinator extends Effect.Service<InfiniteScrollCoordinator>()(
  "InfiniteScrollCoordinator",
  {
    effect: Effect.gen(function* () {
      const config = yield* getCurrentTimelineConfig

      // Create unbounded queue for pages
      const pageQueue = yield* Queue.unbounded<TimelinePage>()

      // Create pagination stream
      const paginationStream = timelinePaginationStream(config)

      // Fork fiber to consume stream into queue
      yield* Stream.runForEach(
        paginationStream,
        (page) => Queue.offer(pageQueue, page)
      ).pipe(Effect.forkScoped)

      return {
        /**
         * Request N pages to be available in queue
         * Returns immediately, pages stream in background
         */
        ensurePagesLoaded: (count: number) =>
          Effect.gen(function* () {
            const currentSize = yield* Queue.size(pageQueue)
            if (currentSize >= count) {
              return // Already have enough
            }

            // Stream will automatically fill queue via background fiber
            // This could add backpressure signaling if needed
          }),

        /**
         * Read all currently loaded pages from queue (non-destructive)
         */
        getAllLoadedPages: Effect.gen(function* () {
          const allPages = yield* Queue.takeAll(pageQueue)
          // Re-offer them back to keep queue intact
          yield* Effect.all(
            Chunk.map(allPages, (page) => Queue.offer(pageQueue, page))
          )
          return allPages
        })
      } as const
    }),
    dependencies: [
      /* Timeline services */
    ]
  }
) {}
```

**PROBLEM**: Queue.takeAll is destructive. We need a different structure.

---

## 8. FINAL RECOMMENDATION: Hybrid Approach

After deep analysis, the **pragmatic solution** that balances Effect idioms with React needs:

### 8.1 Keep Current Structure, Improve Reactivity

**Accept that React needs discrete state updates for rendering.**

The current implementation in `timeline-infinite.ts` is actually **close to optimal** for React integration. The issue isn't the pattern—it's missing Stream integration for future SSE.

### 8.2 Refactoring Plan

**Phase 1: Extract pagination logic into Stream (preparation for SSE)**

```typescript
/**
 * Pure Stream: Cursor-based pagination
 *
 * This Stream can be consumed by atoms OR subscribed to for SSE later
 */
export const createTimelinePaginationStream = (
  config: TimelineInitialConfig
): Stream.Stream<TimelinePage, TimelineError, TimelineClient | TimelineKVS> =>
  Stream.paginateEffect(
    initialCursor(config),
    (cursor) => fetchPageEffect(cursor)
  )

/**
 * Current action atom now consumes Stream instead of direct Effect
 */
export const loadNextTimelinePageAtom = TimelineRuntime.fn<void>()(
  (_, get) => Effect.gen(function* () {
    const state = get(timelineInfiniteStateAtom)

    if (state.status === "loading-more" || !state.hasMore) {
      return
    }

    // Get the pagination stream
    const stream = createTimelinePaginationStream(/* config */)

    // Consume ONE page from stream (using current cursor position)
    const nextPages = yield* Stream.runCollect(
      stream.pipe(
        Stream.drop(state.pages.length), // Skip already-loaded pages
        Stream.take(1)
      )
    )

    if (Chunk.isEmpty(nextPages)) {
      return
    }

    const [page] = Chunk.toReadonlyArray(nextPages)

    // Update state (keep current pattern for now)
    get.set(timelineInfiniteStateAtom, {
      ...state,
      pages: [...state.pages, page],
      status: "idle",
      hasMore: page.response.has_more,
      nextCursor: page.response.next_cursor
    })
  })
)
```

**Phase 2: Add SSE alternative stream**

```typescript
/**
 * SSE-based timeline stream (future)
 *
 * Pushes new plays in real-time instead of cursor pagination
 */
export const createTimelineSSEStream = (
  initialCursor: string
): Stream.Stream<TimelineEvent, TimelineError, TimelineClient> =>
  Stream.async<TimelineEvent>((emit) => {
    const eventSource = new EventSource(`/api/timeline/stream?cursor=${initialCursor}`)

    eventSource.onmessage = (event) => {
      const parsed = JSON.parse(event.data)
      emit.single(TimelineEvent.fromJSON(parsed))
    }

    eventSource.onerror = () => {
      emit.fail(new TimelineSSEError())
    }

    return Effect.sync(() => {
      eventSource.close()
    })
  })

/**
 * Unified atom that switches between pull and push
 */
export const timelineStreamModeAtom = Atom.make<"pull" | "push">("pull")

export const timelineStreamAtom = Atom.make((get) => {
  const mode = get(timelineStreamModeAtom)
  const config = get(timelineInitialConfigAtom)

  return mode === "pull"
    ? createTimelinePaginationStream(config)
    : createTimelineSSEStream(config.params.cursor ?? "")
})
```

---

## 9. Final Architecture Recommendation

### 9.1 **Keep current atom pattern** from `timeline-infinite.ts`

The current implementation is correct for React integration. Manual `get.set()` is acceptable within `TimelineRuntime.fn()` action atoms—this is the Effect-Atom way of modeling imperative actions.

### 9.2 **Extract Stream layer for SSE compatibility**

Create a separate Stream module that provides:

1. `createTimelinePaginationStream` - Current cursor-based pull
2. `createTimelineSSEStream` - Future server-push events
3. Both return `Stream<TimelinePage, ...>`

### 9.3 **Atom layer bridges Stream to React state**

Action atoms consume streams and update state atoms:

- `loadInitialPageAtom` - Initializes stream, takes first page
- `loadNextPageAtom` - Takes next page from stream
- `timelineInfiniteStateAtom` - Stores pages array (current pattern)

### 9.4 **Component layer remains unchanged**

VirtualizedTimeline.tsx continues to:
- Read `allLoadedPlayIdsAtom`
- Trigger `loadNextPageAtom` on scroll
- Use IntersectionObserver for demand signaling

---

## 10. Implementation Steps

### Step 1: Create Stream module

**File**: `packages/web/src/streams/timeline-pagination.ts`

```typescript
import { Stream, Effect, Option } from "effect"
import type { TimelineClient, TimelineKVS } from "@/lib/http-runtime"
import type { TimelinePage, TimelineCursor } from "@/atoms/timeline-infinite"

/**
 * Pure cursor-based pagination stream.
 * Lazy, pull-based, terminates when has_more = false.
 */
export const createPaginationStream = (
  config: TimelineInitialConfig
): Stream.Stream<TimelinePage, TimelineError, TimelineClient | TimelineKVS> =>
  Stream.paginateEffect(
    initialCursor(config),
    fetchPageAndAdvanceCursor
  )

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

    const params = cursorToParams(cursor)
    const response = yield* client.timeline.getTimeline({ urlParams: params })

    // Normalize into KVS
    yield* Effect.all(
      response.results.map((play) => kvs.storePlay(play)),
      { concurrency: 50 }
    )

    const page: TimelinePage = { params, response }

    const nextCursor = response.has_more
      ? Option.some(advanceCursor(cursor, response))
      : Option.none()

    return [page, nextCursor] as const
  })
```

### Step 2: Refactor action atoms to consume stream

**File**: `packages/web/src/atoms/timeline-infinite.ts`

```typescript
import { createPaginationStream } from "@/streams/timeline-pagination"

export const loadInitialTimelinePageAtom = TimelineRuntime.fn<void>()(
  (_, get) => Effect.gen(function* () {
    const config = get(timelineInitialConfigAtom)

    // Create stream
    const stream = createPaginationStream(config)

    // Take first page
    const firstPageChunk = yield* Stream.runCollect(
      stream.pipe(Stream.take(1))
    )

    const [page] = Chunk.toReadonlyArray(firstPageChunk)

    // Update state (existing pattern)
    get.set(timelineInfiniteStateAtom, {
      pages: [page],
      status: "idle",
      hasMore: page.response.has_more,
      // ... rest of state
    })
  })
)

export const loadNextTimelinePageAtom = TimelineRuntime.fn<void>()(
  (_, get) => Effect.gen(function* () {
    const state = get(timelineInfiniteStateAtom)

    if (!state.hasMore || state.status === "loading-more") {
      return
    }

    // Recreate stream with current state as cursor
    const stream = createPaginationStream({
      method: state.initialMethod,
      params: {
        ...state.initialParams,
        cursor: state.nextCursor
      }
    })

    // Take next page
    const nextPageChunk = yield* Stream.runCollect(
      stream.pipe(Stream.take(1))
    )

    const [page] = Chunk.toReadonlyArray(nextPageChunk)

    // Append to state
    get.set(timelineInfiniteStateAtom, {
      ...state,
      pages: [...state.pages, page],
      status: "idle",
      hasMore: page.response.has_more,
      nextCursor: page.response.next_cursor
    })
  })
)
```

### Step 3: Add SSE stream variant (future)

**File**: `packages/web/src/streams/timeline-sse.ts`

```typescript
import { Stream, Effect, Chunk } from "effect"

export const createSSEStream = (
  initialCursor: string
): Stream.Stream<TimelineEvent, TimelineError, never> =>
  Stream.async<TimelineEvent>((emit) => {
    const eventSource = new EventSource(
      `/api/timeline/stream?cursor=${initialCursor}`
    )

    eventSource.addEventListener("play", (event) => {
      const play = parseTimelineEvent(event.data)
      emit.single(play)
    })

    eventSource.onerror = () => {
      emit.fail(new TimelineSSEError())
      eventSource.close()
    }

    return Effect.sync(() => {
      eventSource.close()
    })
  })
```

### Step 4: Timeline mode switcher (future)

```typescript
/**
 * Atom: Select pull vs push mode
 */
export const timelineStreamModeAtom = Atom.make<"pull" | "push">("pull")

/**
 * Factory: Create appropriate stream based on mode
 */
export const createTimelineStream = (
  config: TimelineInitialConfig,
  mode: "pull" | "push"
) =>
  mode === "pull"
    ? createPaginationStream(config)
    : createSSEStream(config.params.cursor ?? "")
```

---

## 11. Benefits of This Approach

### 11.1 Maintains Current Working Code

- No breaking changes to atoms or components
- Existing infinite scroll continues to work

### 11.2 Adds Stream Abstraction Layer

- Clean separation: Stream logic vs React state management
- Streams are pure, testable, composable
- Can swap implementations (pull vs push) without changing atoms

### 11.3 Forward-Compatible with SSE

- Stream interface is the same for pull and push
- Action atoms don't care about stream source
- Easy toggle between modes

### 11.4 Idiomatic Effect Patterns

- `Stream.paginateEffect` for cursor pagination (from Effect docs)
- `Stream.async` for SSE events (from Effect docs)
- `Effect.gen` throughout for sequential logic
- Service layer has `Requirements = never`

### 11.5 Reactivity Still Works

- TimelineKVS invalidates `timeline:plays_chunk` on new plays
- Derived atoms refresh automatically
- No loss of existing reactivity

---

## 12. Questions Answered

### Q1: Should we use Atom.stream()?

**A**: No. Effect-Atom's `Atom.stream()` is for creating an atom **from** a stream, but our use case needs **action atoms** that consume streams on-demand. Our hybrid approach is correct.

### Q2: Can we use Stream.paginate for cursor-based pagination?

**A**: Yes! `Stream.paginateEffect` is **exactly** designed for this (see Effect source). We should refactor to use it.

### Q3: How do we integrate IntersectionObserver with pull-based atoms?

**A**: Keep current pattern—IntersectionObserver triggers `loadMore()` which calls the action atom. The atom internally consumes from the stream.

### Q4: What's the right boundary between pull vs push?

**A**:
- **Pull boundary**: User scroll → action atom → stream consumption
- **Push boundary**: SSE events → stream emission → atom update

Both use the same Stream abstraction, different sources.

### Q5: How does TimelineKVS fit?

**A**: Remains the single source of truth for **normalized play data**. Streams write to KVS during pagination. Derived atoms read from KVS reactively.

---

## 13. Testing Strategy

### 13.1 Stream Layer Tests

```typescript
import { it } from "@effect/vitest"
import { Stream, Chunk, Effect } from "effect"
import { createPaginationStream } from "@/streams/timeline-pagination"

it.effect("paginates through cursor-based API", () =>
  Effect.gen(function* () {
    const stream = createPaginationStream(mockConfig)

    const pages = yield* Stream.runCollect(
      stream.pipe(Stream.take(3))
    )

    expect(Chunk.size(pages)).toBe(3)
    expect(pages[0].response.results.length).toBe(50)
    expect(pages[0].response.next_cursor).toBeDefined()
  })
)

it.effect("terminates when has_more is false", () =>
  Effect.gen(function* () {
    const stream = createPaginationStream(mockConfig)

    const allPages = yield* Stream.runCollect(stream)

    const lastPage = Chunk.last(allPages)
    expect(lastPage.response.has_more).toBe(false)
  })
)
```

### 13.2 Atom Integration Tests

```typescript
it("loads initial page from stream", async () => {
  const runtime = /* create test runtime */

  await runtime.runPromise(
    Effect.gen(function* () {
      yield* loadInitialTimelinePageAtom

      const state = yield* Atom.get(timelineInfiniteStateAtom)

      expect(state.pages.length).toBe(1)
      expect(state.status).toBe("idle")
    })
  )
})
```

### 13.3 Component Integration Tests

```typescript
it("triggers load more on scroll", async () => {
  render(<VirtualizedTimeline />)

  // Wait for initial load
  await waitFor(() => {
    expect(screen.getByText(/50 plays loaded/)).toBeInTheDocument()
  })

  // Scroll to bottom
  fireEvent.scroll(screen.getByRole("list"), {
    target: { scrollTop: 5000 }
  })

  // Should load more
  await waitFor(() => {
    expect(screen.getByText(/100 plays loaded/)).toBeInTheDocument()
  })
})
```

---

## 14. Documentation Updates Required

1. **Update**: `docs/timeline-atoms-infinite-scroll.md`
   - Add "Stream Layer" section
   - Document `createPaginationStream` API
   - Show SSE integration path

2. **Create**: `docs/streams/README.md`
   - Document all stream constructors
   - Show pull vs push patterns
   - Link to Effect Stream docs

3. **Update**: `REACTIVE_PATTERNS.md`
   - Add "Consuming Streams in Atoms" section
   - Show `Stream.paginateEffect` example
   - Document reactivity with streams

---

## 15. Migration Checklist

- [ ] Create `packages/web/src/streams/timeline-pagination.ts`
- [ ] Implement `createPaginationStream` using `Stream.paginateEffect`
- [ ] Add helper functions: `initialCursor`, `fetchPageAndAdvanceCursor`, `cursorToParams`
- [ ] Refactor `loadInitialTimelinePageAtom` to consume stream
- [ ] Refactor `loadNextTimelinePageAtom` to consume stream
- [ ] Add tests for pagination stream
- [ ] Add tests for atom integration with streams
- [ ] Update documentation
- [ ] Create SSE stream scaffold (stub implementation)
- [ ] Add mode switcher atom (for future use)

---

## 16. Future Enhancements

### 16.1 Bidirectional Infinite Scroll

Current design supports scrolling **down** (older plays). For scrolling **up** (newer plays):

```typescript
export const createBidirectionalPaginationStream = (
  anchorCursor: string
): {
  olderStream: Stream.Stream<TimelinePage, ...>
  newerStream: Stream.Stream<TimelinePage, ...>
} => ({
  olderStream: Stream.paginateEffect(
    { cursor: anchorCursor, direction: "older" },
    fetchPageOlder
  ),
  newerStream: Stream.paginateEffect(
    { cursor: anchorCursor, direction: "newer" },
    fetchPageNewer
  )
})
```

### 16.2 Stream Combinators for Filtering

```typescript
const filteredTimelineStream = createPaginationStream(config).pipe(
  Stream.filter((page) =>
    page.response.results.some((play) => play.artist.includes(searchTerm))
  )
)
```

### 16.3 Prefetching Strategy

```typescript
const prefetchNextPageAtom = TimelineRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const stream = createPaginationStream(config)

    // Prefetch next 2 pages in background
    yield* Stream.runCollect(
      stream.pipe(
        Stream.drop(currentPageCount),
        Stream.take(2)
      )
    ).pipe(Effect.fork)
  })
)
```

---

## 17. Conclusion

**Recommendation**: Implement **Phase 1** refactoring to extract Stream layer while keeping current atom patterns.

**Why this approach**:
1. Pragmatic - works with React's discrete rendering model
2. Idiomatic - uses `Stream.paginateEffect` from Effect docs
3. Forward-compatible - easy SSE integration path
4. Low-risk - minimal changes to working code
5. Testable - streams are pure and composable

**Not recommended**:
- Trying to make atoms "streaming" (Effect-Atom doesn't work that way)
- Replacing `get.set()` with reactive magic (action atoms need imperative updates)
- Over-engineering with Queue/Ref/custom subscriptions (unnecessary complexity)

**Next steps**: Create the Stream module as outlined in Step 1, then incrementally migrate action atoms to consume it.
