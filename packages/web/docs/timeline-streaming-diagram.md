# Timeline Streaming Architecture - Visual Diagrams

## Current Architecture (Before Refactoring)

```text
┌─────────────────────────────────────────────────────────────┐
│  VirtualizedTimeline.tsx (Component)                        │
│  ┌─────────────────────────────────────┐                    │
│  │ useAtomValue(allLoadedPlayIdsAtom)  │                    │
│  │ useAtom(loadNextPageAtom)           │                    │
│  └─────────────────────────────────────┘                    │
│           │                        │                         │
│           │ reads                  │ triggers                │
└───────────┼────────────────────────┼─────────────────────────┘
            │                        │
            ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│  timeline-infinite.ts (Atoms)                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ timelineInfiniteStateAtom (writable)                 │   │
│  │  - pages: TimelinePage[]                             │   │
│  │  - status: "idle" | "loading" | "error"             │   │
│  │  - hasMore: boolean                                  │   │
│  │  - nextCursor: string                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                        ▲                                     │
│                        │ get.set()                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ loadNextTimelinePageAtom (action)                    │   │
│  │  Effect.gen(function* () {                           │   │
│  │    const response = yield* client.getTimeline(...)   │   │
│  │    yield* kvs.storePlay(...)  // normalize           │   │
│  │    get.set(stateAtom, { pages: [...] })  // update  │   │
│  │  })                                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                        │                                     │
│                        │ calls                               │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  http-runtime.ts (Services)                                 │
│  ┌────────────────┐      ┌─────────────────┐               │
│  │ TimelineClient │      │   TimelineKVS   │               │
│  │  - HTTP calls  │      │  - localStorage │               │
│  └────────────────┘      └─────────────────┘               │
└─────────────────────────────────────────────────────────────┘

ISSUES:
❌ Pagination logic mixed with state management
❌ Direct HTTP calls in action atoms
❌ Hard to test business logic separately
❌ Not forward-compatible with SSE
```

---

## Proposed Architecture (After Refactoring)

```text
┌─────────────────────────────────────────────────────────────┐
│  VirtualizedTimeline.tsx (Component)                        │
│  ┌─────────────────────────────────────┐                    │
│  │ useAtomValue(allLoadedPlayIdsAtom)  │                    │
│  │ useAtom(loadNextPageAtom)           │                    │
│  └─────────────────────────────────────┘                    │
│           │                        │                         │
│           │ reads                  │ triggers                │
└───────────┼────────────────────────┼─────────────────────────┘
            │                        │
            ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│  timeline-infinite.ts (Atoms - State Management)            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ timelineInfiniteStateAtom (writable)                 │   │
│  │  - pages: TimelinePage[]                             │   │
│  │  - status: "idle" | "loading" | "error"             │   │
│  │  - hasMore: boolean                                  │   │
│  │  - nextCursor: string                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                        ▲                                     │
│                        │ get.set() (same as before)         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ loadNextTimelinePageAtom (action)                    │   │
│  │  Effect.gen(function* () {                           │   │
│  │    const stream = createPaginationStream(config) ────┼───┼─┐
│  │    const page = yield* Stream.runCollect(           │   │ │
│  │      stream.pipe(Stream.take(1))                     │   │ │
│  │    )                                                  │   │ │
│  │    get.set(stateAtom, { pages: [...pages, page] })  │   │ │
│  │  })                                                   │   │ │
│  └──────────────────────────────────────────────────────┘   │ │
└─────────────────────────────────────────────────────────────┘ │
                                                                │
                NEW LAYER                                       │
                ▼                                               │
┌─────────────────────────────────────────────────────────────┐ │
│  timeline-pagination.ts (Stream - Business Logic)         │◄─┘
│  ┌──────────────────────────────────────────────────────┐   │
│  │ createPaginationStream(config)                       │   │
│  │  Stream.paginateEffect(                              │   │
│  │    initialCursor,                                    │   │
│  │    (cursor) => Effect.gen(function* () {             │   │
│  │      const response = yield* client.getTimeline(...) │───┼─┐
│  │      yield* kvs.storePlay(...)                       │◄──┼─┤
│  │      return [page, nextCursor]                       │   │ │
│  │    })                                                 │   │ │
│  │  )                                                    │   │ │
│  └──────────────────────────────────────────────────────┘   │ │
│                                                              │ │
│  Future: createSSEStream(cursor)                            │ │
│  Stream.async<TimelinePage>((emit) => {                     │ │
│    const es = new EventSource("/api/timeline/stream")       │ │
│    es.onmessage = (e) => emit.single(parsePage(e.data))     │ │
│  })                                                          │ │
└──────────────────────────────────────────────────────────────┘ │
                         │                      │                │
                         │ calls                │ calls          │
                         ▼                      ▼                │
┌─────────────────────────────────────────────────────────────┐ │
│  http-runtime.ts (Services - Infrastructure)               │ │
│  ┌────────────────┐      ┌─────────────────┐               │ │
│  │ TimelineClient │◄─────┤   TimelineKVS   │◄──────────────┼─┘
│  │  - HTTP calls  │      │  - localStorage │               │
│  └────────────────┘      └─────────────────┘               │
└─────────────────────────────────────────────────────────────┘

IMPROVEMENTS:
✅ Separation of concerns (business logic vs state management)
✅ Stream layer is pure and testable
✅ Forward-compatible with SSE (same Stream interface)
✅ Atoms focus on React integration only
✅ Can swap pull/push streams without changing atoms
```

---

## Data Flow: Loading Next Page (Current)

```text
User Scrolls to Bottom
        │
        ▼
┌─────────────────────┐
│ IntersectionObserver│
│  (in component)     │
└─────────────────────┘
        │
        │ calls loadMore()
        ▼
┌─────────────────────────────────────────┐
│ loadNextTimelinePageAtom (action atom)  │
│  1. Read state                          │
│  2. Build params                        │
│  3. Call HTTP API                       │◄─────────┐
│  4. Normalize into KVS                  │──┐       │
│  5. Update state via get.set()          │  │       │
└─────────────────────────────────────────┘  │       │
        │                                     │       │
        ▼                                     ▼       │
┌─────────────────────┐         ┌──────────────────┐ │
│ timelineInfiniteState│         │  TimelineKVS     │ │
│  - pages updated    │         │   - plays stored │ │
│  - status: "idle"   │         └──────────────────┘ │
└─────────────────────┘                  │           │
        │                                │           │
        │ read                           │ invalidate│
        ▼                                ▼           │
┌─────────────────────┐         ┌──────────────────┐ │
│ allLoadedPlayIdsAtom│         │ Other atoms      │ │
│  (derived)          │         │ - boundaries     │ │
└─────────────────────┘         │ - album art      │ │
        │                       └──────────────────┘ │
        │                                            │
        ▼                                            │
┌─────────────────────┐                             │
│  Component          │                             │
│   - Re-renders      │                             │
│   - Shows new plays │                             │
└─────────────────────┘                             │
        │                                            │
        └────────────────────────────────────────────┘
                If more needed, triggers again
```

---

## Data Flow: Loading Next Page (Proposed)

```text
User Scrolls to Bottom
        │
        ▼
┌─────────────────────┐
│ IntersectionObserver│
│  (in component)     │
└─────────────────────┘
        │
        │ calls loadMore()
        ▼
┌──────────────────────────────────────────────┐
│ loadNextTimelinePageAtom (action atom)       │
│  1. Read state                               │
│  2. Create stream ────────────────────┐      │
│  3. Consume one page from stream      │      │
│  4. Update state via get.set()        │      │
└───────────────────────────────────────┼──────┘
        │                               │
        ▼                               ▼
┌─────────────────────┐    ┌────────────────────────────┐
│ timelineInfiniteState│    │ Stream Layer (NEW)         │
│  - pages updated    │    │  createPaginationStream()  │
│  - status: "idle"   │    │   Stream.paginateEffect(   │
└─────────────────────┘    │     cursor,                │
        │                  │     (cursor) => Effect.gen(│
        │                  │       yield* HTTP call ────┼──┐
        │                  │       yield* KVS store ────┼──┼──┐
        │                  │       return [page, next]  │  │  │
        │                  │     )                       │  │  │
        │                  │   )                         │  │  │
        │                  └────────────────────────────┘  │  │
        │                                   ▲              │  │
        │                                   │              │  │
        │                  Future: SSE Stream              │  │
        │                  Stream.async((emit) => {        │  │
        │                    es.onmessage = emit.single    │  │
        │                  })                              │  │
        │                                                  │  │
        │ read                                             │  │
        ▼                                                  ▼  ▼
┌─────────────────────┐                      ┌──────────────────┐
│ allLoadedPlayIdsAtom│                      │  Services        │
│  (derived)          │                      │  - TimelineClient│
└─────────────────────┘                      │  - TimelineKVS   │
        │                                    └──────────────────┘
        │                                             │
        ▼                                             │ invalidate
┌─────────────────────┐                              ▼
│  Component          │                    ┌──────────────────┐
│   - Re-renders      │                    │ Derived atoms    │
│   - Shows new plays │                    │ - boundaries     │
└─────────────────────┘                    │ - album art      │
                                           └──────────────────┘
```

---

## Pull vs Push Streams Comparison

### Pull-Based Stream (Current/Cursor Pagination)

```text
Component needs more data
        │
        ▼
┌─────────────────────┐
│ Trigger action atom │
│  loadMore()         │
└─────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Stream.paginateEffect           │
│  - Lazy evaluation              │
│  - Fetch on demand              │
│  - Backpressure aware           │
│                                 │
│  (cursor) => Effect.gen(        │
│    response = yield* HTTP.get() │
│    return [page, nextCursor]    │
│  )                              │
└─────────────────────────────────┘
        │
        │ pulls when needed
        ▼
┌─────────────────────┐
│  HTTP API           │
│  GET /timeline?cursor│
└─────────────────────┘

Characteristics:
- Consumer controls pace
- No data fetched until requested
- Natural backpressure
- Good for infinite scroll
```

### Push-Based Stream (Future/SSE)

```text
Server has new data
        │
        ▼
┌─────────────────────┐
│ Server pushes event │
│  via SSE            │
└─────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Stream.async                    │
│  - Reactive                     │
│  - Data arrives asynchronously  │
│  - Buffering may be needed      │
│                                 │
│  (emit) => {                    │
│    es.onmessage = (e) =>        │
│      emit.single(parsePage(e))  │
│  }                              │
└─────────────────────────────────┘
        │
        │ pushes as events arrive
        ▼
┌─────────────────────┐
│  Component          │
│  Auto-updates       │
└─────────────────────┘

Characteristics:
- Server controls pace
- Data arrives proactively
- May need buffering
- Good for real-time updates
```

### Unified Interface (Both Use Same Atom Pattern)

```text
┌─────────────────────────────────────┐
│ createTimelineStream(config, mode)  │
│                                     │
│  mode === "pull"                    │
│    ? Stream.paginateEffect(cursor)  │
│    : Stream.async(setupSSE)         │
└─────────────────────────────────────┘
              │
              │ both return Stream<TimelinePage>
              ▼
┌─────────────────────────────────────┐
│ Action Atom (same code!)            │
│  const stream = createStream(mode)  │
│  const page = yield* Stream.take(1) │
│  get.set(state, { pages: [...] })   │
└─────────────────────────────────────┘

KEY INSIGHT: Atoms don't care about stream source!
```

---

## Testing Architecture

### Current Testing (Difficult)

```text
┌──────────────────────────────────┐
│  Test                            │
│  ├─ Mock TimelineClient          │
│  ├─ Mock TimelineKVS             │
│  ├─ Create test runtime          │
│  ├─ Call loadNextPageAtom        │
│  └─ Assert state updated         │
└──────────────────────────────────┘
        │
        │ Tests EVERYTHING at once:
        │  - HTTP logic
        │  - Normalization
        │  - State management
        │  - Pagination logic
        ▼
    Hard to isolate bugs!
```

### Proposed Testing (Easy)

```text
Stream Layer Tests (Pure)
┌──────────────────────────────────┐
│  Test Stream in isolation        │
│  ├─ Mock services only           │
│  ├─ Call createPaginationStream  │
│  ├─ Consume with Stream.runCollect│
│  └─ Assert pages correct         │
└──────────────────────────────────┘
        │
        │ Tests ONLY pagination logic
        ▼
    Easy to debug!

Atom Layer Tests (Integration)
┌──────────────────────────────────┐
│  Test Atom integration           │
│  ├─ Use real stream              │
│  ├─ Call action atom             │
│  └─ Assert state updated         │
└──────────────────────────────────┘
        │
        │ Tests ONLY state management
        ▼
    Clear separation!

Component Tests (E2E)
┌──────────────────────────────────┐
│  Test full flow                  │
│  ├─ Render component             │
│  ├─ Trigger scroll               │
│  └─ Assert UI updated            │
└──────────────────────────────────┘
        │
        │ Tests ONLY React integration
        ▼
    High confidence!
```

---

## Migration Path

### Phase 1: Add Stream Layer (No Breaking Changes)

```text
┌─────────────────────────────────────┐
│  Current Atoms (unchanged)          │
│   - Still calling HTTP directly     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  NEW: Stream Layer (parallel)       │
│   - createPaginationStream          │
│   - Tests for stream logic          │
└─────────────────────────────────────┘

Status: Both exist, no integration yet
Risk: Zero (nothing broken)
```

### Phase 2: Integrate Streams into Atoms

```text
┌─────────────────────────────────────┐
│  Refactored Atoms                   │
│   - Now consume streams             │
│   - Remove direct HTTP calls        │
│   - Keep get.set() pattern          │
└─────────────────────────────────────┘
        │
        │ consumes
        ▼
┌─────────────────────────────────────┐
│  Stream Layer                       │
│   - Handles pagination logic        │
└─────────────────────────────────────┘

Status: Migration complete
Risk: Low (atom behavior unchanged)
```

### Phase 3: Add SSE (Future)

```text
┌─────────────────────────────────────┐
│  Atoms (NO CHANGES)                 │
│   - Same consumption pattern        │
└─────────────────────────────────────┘
        │
        │ consumes
        ▼
┌─────────────────────────────────────┐
│  Stream Factory                     │
│   mode === "pull"                   │
│     ? createPaginationStream        │
│     : createSSEStream (NEW)         │
└─────────────────────────────────────┘

Status: SSE integration via config
Risk: Zero (atoms unchanged)
```

---

## Summary: Why This Architecture?

### Separation of Concerns

```text
┌────────────────────────────────┐
│ Component: Rendering only      │
│  - No business logic           │
│  - No state management         │
└────────────────────────────────┘

┌────────────────────────────────┐
│ Atom: React integration        │
│  - State management only       │
│  - Bridge Stream → React       │
└────────────────────────────────┘

┌────────────────────────────────┐
│ Stream: Business logic         │
│  - Pagination rules            │
│  - API integration             │
│  - Pure, testable              │
└────────────────────────────────┘

┌────────────────────────────────┐
│ Service: Infrastructure        │
│  - HTTP, Storage, etc.         │
│  - Requirements = never        │
└────────────────────────────────┘
```

Each layer has ONE responsibility!

### Forward Compatibility

```text
Today:
Stream.paginateEffect (pull)
    │
    │ Same interface
    ▼
Future:
Stream.async (push/SSE)

Atoms don't change - just swap stream source!
```

### Testability

```text
Unit: Test stream logic
  ├─ Pure functions
  └─ Isolated from React

Integration: Test atom behavior
  ├─ State management
  └─ Stream consumption

E2E: Test component
  ├─ User interactions
  └─ Full flow
```

### Developer Experience

```text
Need to debug pagination?
  → Look at stream layer tests

Need to debug state updates?
  → Look at atom layer tests

Need to debug rendering?
  → Look at component tests

Clear separation = easier debugging!
```

---

**End of Diagrams**

All diagrams created: 2025-11-16
Status: Ready for review
