# Timeline Infinite Scroll Streaming Architecture - Executive Summary

## Current State Assessment

**Current implementation** (`packages/web/src/atoms/timeline-infinite.ts`):
- ✅ Correct pattern for Effect-Atom + React integration
- ✅ Uses `TimelineRuntime.fn()` for action atoms (idiomatic)
- ✅ Manual state updates via `get.set()` (acceptable for actions)
- ✅ TimelineKVS as normalized cache (single source of truth)
- ❌ Pagination logic mixed with state management
- ❌ Not forward-compatible with SSE/push updates
- ❌ Difficult to test pagination logic in isolation

**Status**: Implementation is **functionally correct** but architecturally **improvable**.

---

## Research Findings

### Effect Stream Pagination Patterns (from Effect Source)

Discovered `Stream.paginateEffect` in `/Users/pooks/Dev/crate/docs/effect-source/effect/src/Stream.ts`:

```typescript
/**
 * Like `Stream.unfold`, but allows the emission of values to end one step
 * further than the unfolding of the state. This is useful for embedding
 * paginated APIs, hence the name.
 */
export const paginateEffect: <S, A, E, R>(
  s: S,
  f: (s: S) => Effect.Effect<readonly [A, Option.Option<S>], E, R>
) => Stream<A, E, R>
```

**Key properties:**
- Pull-based (lazy evaluation)
- Backpressure-aware
- Terminates when state is `Option.none()`
- Composes with other Stream operators
- **Designed specifically for cursor pagination**

**Test example** from `pagination.test.ts`:
```typescript
Stream.paginateEffect(
  initialState,
  (state) => Effect.succeed([currentValue, Option.some(nextState)])
)
```

### Effect-Atom Integration Patterns

**From codebase analysis:**

1. **Effect-Atom does NOT have a "streaming atom" primitive**
   - `Atom.make()` creates derived atoms
   - `runtime.atom()` creates Effect-based atoms
   - `runtime.fn()` creates action atoms
   - No direct Stream → Atom bridge

2. **Correct pattern for actions**: Use `get.set()` inside `runtime.fn()`
   - This is NOT imperative anti-pattern
   - Action atoms are **meant** to update state
   - Pattern documented in Effect-Atom examples

3. **Reactivity**: Use `Atom.withReactivity(keys)` + TimelineKVS invalidation
   - TimelineKVS already handles this correctly
   - Derived atoms refresh when KVS invalidates

---

## Recommended Architecture

### Layer Separation

```text
┌─────────────────────────────────────────┐
│     Component Layer (React)             │
│  - Reads atoms (useAtomValue)           │
│  - Triggers actions (useAtom)           │
│  - NO business logic                    │
└─────────────────────────────────────────┘
              │
              │ atoms
              ▼
┌─────────────────────────────────────────┐
│     Atom Layer (State Management)       │
│  - Action atoms (runtime.fn)            │
│  - State atoms (Atom.make)              │
│  - Consumes streams                     │
│  - Updates React state via get.set()    │
└─────────────────────────────────────────┘
              │
              │ streams
              ▼
┌─────────────────────────────────────────┐
│     Stream Layer (Business Logic)       │
│  - Stream.paginateEffect (pull)         │
│  - Stream.async (push/SSE - future)     │
│  - Pure logic, no React knowledge       │
│  - Testable in isolation                │
└─────────────────────────────────────────┘
              │
              │ services
              ▼
┌─────────────────────────────────────────┐
│     Service Layer (Infrastructure)      │
│  - TimelineClient (HTTP)                │
│  - TimelineKVS (Storage)                │
│  - Requirements = never                 │
└─────────────────────────────────────────┘
```

### Key Insight: Hybrid Approach

**What we initially thought:**
- Need to replace manual state management with pure Stream reactivity
- Action atoms using `get.set()` is wrong

**What we discovered:**
- Action atoms SHOULD use `get.set()` (idiomatic Effect-Atom)
- Streams provide **data source abstraction**, not state replacement
- React needs discrete state updates for rendering

**Best pattern:**
```typescript
// Stream layer: Pure pagination logic
const paginationStream = Stream.paginateEffect(cursor, fetchPage)

// Atom layer: Consume stream, update React state
const loadNextPageAtom = runtime.fn()(() =>
  Effect.gen(function* () {
    // Consume ONE page from stream
    const page = yield* Stream.runCollect(stream.pipe(Stream.take(1)))

    // Update state for React (correct pattern!)
    get.set(stateAtom, { ...state, pages: [...state.pages, page] })
  })
)
```

---

## Refactoring Recommendation

### Option A: Full Refactoring (Recommended)

**Extract Stream layer while keeping atom patterns:**

1. Create `packages/web/src/streams/timeline-pagination.ts`
2. Move pagination logic into `Stream.paginateEffect`
3. Atoms consume streams via `Stream.runCollect(stream.pipe(Stream.take(1)))`
4. Keep current `get.set()` state management

**Benefits:**
- ✅ Separation of concerns (business logic vs state management)
- ✅ Testability (stream logic isolated)
- ✅ Forward-compatible (easy SSE integration)
- ✅ Idiomatic Effect patterns (`Stream.paginateEffect`)
- ✅ No breaking changes to atoms or components

**Effort:** ~15 hours (2 days)

**See:** `docs/timeline-streaming-refactor-plan.md`

### Option B: Minimal Changes (Alternative)

**Keep current implementation, document SSE path:**

1. Add comments explaining future SSE integration
2. Document Stream patterns in architecture docs
3. Defer refactoring until SSE is actually needed

**Benefits:**
- ✅ Zero risk (no changes)
- ✅ Current implementation works

**Drawbacks:**
- ❌ Pagination logic still mixed with state
- ❌ Harder to test
- ❌ SSE integration will require larger refactor later

**Effort:** ~2 hours (documentation only)

### Option C: Do Nothing

**Current implementation is acceptable:**

The existing `timeline-infinite.ts` follows Effect-Atom patterns correctly. The "imperative" style is actually correct for action atoms.

**When to refactor:**
- When SSE backend is ready
- When pagination logic needs to be reused elsewhere
- When testing becomes a pain point

---

## Forward Compatibility: SSE Integration

### Current Pull Pattern
```typescript
// Cursor-based pagination (current)
const stream = Stream.paginateEffect(cursor, fetchPage)
```

### Future Push Pattern
```typescript
// SSE events (future)
const stream = Stream.async<TimelinePage>((emit) => {
  const es = new EventSource("/api/timeline/stream")
  es.onmessage = (event) => emit.single(parsePage(event.data))
  return Effect.sync(() => es.close())
})
```

### Unified Interface
```typescript
// Factory abstracts over pull vs push
const createTimelineStream = (config, mode: "pull" | "push") =>
  mode === "pull"
    ? Stream.paginateEffect(cursor, fetchPage)
    : Stream.async(setupSSE)

// Atoms don't change - just consume different stream
const stream = createTimelineStream(config, mode)
const page = yield* Stream.runCollect(stream.pipe(Stream.take(1)))
```

**Key point**: Both streams have type `Stream<TimelinePage, Error, ...>`

Atoms consume them identically via `Stream.runCollect`.

---

## Questions Answered

### 1. Should we use pull-based streaming atoms?

**Answer**: Yes, but with clarification.

- **Do**: Use `Stream.paginateEffect` for pagination logic (pull-based)
- **Do**: Consume streams in action atoms via `Stream.runCollect`
- **Don't**: Try to make atoms themselves streaming (not how Effect-Atom works)
- **Don't**: Replace `get.set()` with reactive magic (action atoms need state updates)

### 2. Looking forward to SSE/push-based updates?

**Answer**: Stream abstraction enables this.

**Integration path:**
1. Create `Stream.async` for SSE events (push)
2. Use same `Stream<TimelinePage>` type as pagination
3. Atoms consume identically (no changes needed)
4. Toggle via mode switcher

### 3. Can we use Stream.paginate for cursor-based pagination?

**Answer**: Yes! `Stream.paginateEffect` is **exactly** designed for this.

From Effect source:
> "Like Stream.unfold, but allows the emission of values to end one step
> further than the unfolding of the state. This is useful for embedding
> paginated APIs, hence the name."

**Our use case:**
```typescript
Stream.paginateEffect(
  { cursor: Option.none(), hasMore: true },
  (state) => Effect.gen(function* () {
    const response = yield* fetchPage(state.cursor)
    const nextState = response.has_more
      ? Option.some({ cursor: Option.some(response.next_cursor), hasMore: true })
      : Option.none()
    return [response, nextState]
  })
)
```

### 4. How do we integrate IntersectionObserver with pull-based atoms?

**Answer**: Keep current pattern.

IntersectionObserver is **not** part of the Stream layer. It's a React concern:

```typescript
// Component layer
useEffect(() => {
  if (shouldLoadMore) {
    loadMore() // Calls action atom
  }
}, [virtualItems, playIds.length])

// Atom layer
const loadMoreAtom = runtime.fn()(() =>
  Effect.gen(function* () {
    const page = yield* Stream.runCollect(stream.pipe(Stream.take(1)))
    get.set(stateAtom, { ...state, pages: [...state.pages, page] })
  })
)
```

IntersectionObserver triggers the action, action consumes stream.

### 5. What's the boundary between pull vs push?

**Answer**: Stream source, not atom behavior.

**Pull boundary (cursor pagination):**
```
User scrolls → Component triggers loadMore() → Atom pulls from Stream → Stream fetches page
```

**Push boundary (SSE):**
```
Server emits event → Stream receives → Atom consumes → State updates → Component re-renders
```

Both use the same atom consumption pattern:
```typescript
const page = yield* Stream.runCollect(stream.pipe(Stream.take(1)))
```

### 6. How does TimelineKVS fit?

**Answer**: Remains single source of truth for normalized play data.

**Flow:**
1. Stream fetches page from API
2. Stream stores plays in TimelineKVS (during stream execution)
3. Atom consumes page from stream
4. Atom updates UI state (page metadata)
5. TimelineKVS invalidates reactivity keys
6. Derived atoms refresh (boundaries, album art, etc.)

**Key**: TimelineKVS is **not** replaced by streams. It's complementary.

- **TimelineKVS**: Normalized play cache (per-play storage)
- **Streams**: Pagination/event source (page-level operations)
- **Atoms**: Bridge to React (state management)

---

## Recommended Next Steps

### Immediate (This Sprint)

1. **Review architecture documents**
   - `docs/timeline-streaming-architecture.md` (deep dive)
   - `docs/timeline-streaming-refactor-plan.md` (implementation steps)
   - This summary document

2. **Decide on refactoring approach**
   - Option A: Full refactoring (~2 days)
   - Option B: Minimal changes (documentation only)
   - Option C: Do nothing (defer until SSE needed)

3. **If choosing Option A**: Follow Phase 1 of refactor plan
   - Create stream layer
   - Add tests
   - Don't touch atoms yet (validate stream layer first)

### Medium Term (Next Sprint)

4. **Integrate streams into atoms** (Phase 2 of refactor plan)
   - Refactor action atoms to consume streams
   - Keep state management unchanged
   - Add integration tests

5. **Add SSE scaffold** (Phase 3 of refactor plan)
   - Create stub SSE stream
   - Document integration path
   - Add mode switcher (behind feature flag)

### Long Term (Future Sprints)

6. **Implement SSE backend**
   - Create `/api/timeline/stream` endpoint
   - Define SSE event format
   - Add authentication/cursor validation

7. **Complete SSE integration**
   - Implement real SSE stream
   - Test push-based updates
   - Add mode switcher UI

8. **Optimize streaming**
   - Add prefetching
   - Implement bidirectional scroll
   - Add stream combinators (filter, transform)

---

## Key Takeaways

### ✅ What's Good About Current Implementation

- Follows Effect-Atom patterns correctly
- TimelineKVS architecture is solid
- Reactivity system works well
- Infinite scroll is functional

### 🔧 What Could Be Improved

- Pagination logic mixed with state management
- Not forward-compatible with SSE
- Difficult to test pagination in isolation
- Missing Stream abstraction layer

### 🎯 What to Do

**Recommended: Option A (Full Refactoring)**

Extract Stream layer using `Stream.paginateEffect`, keep atom patterns as-is.

**Rationale:**
- Idiomatic Effect patterns
- Forward-compatible with SSE
- Testable in isolation
- Low risk (no atom changes)
- Moderate effort (~2 days)

### 📚 What We Learned

1. **Effect-Atom action atoms SHOULD use `get.set()`** - not an anti-pattern
2. **`Stream.paginateEffect` is designed for cursor pagination** - use it!
3. **Streams provide abstraction, not state replacement** - hybrid approach
4. **Pull and push streams have same interface** - easy to swap
5. **TimelineKVS and Streams are complementary** - not competing

---

## Files Created

1. **`docs/timeline-streaming-architecture.md`** (~300 lines)
   - Deep architectural analysis
   - Pattern explorations
   - Final recommendation with rationale

2. **`docs/timeline-streaming-refactor-plan.md`** (~600 lines)
   - Step-by-step implementation plan
   - Code examples for each phase
   - Testing strategy
   - Timeline estimates

3. **`docs/timeline-streaming-summary.md`** (this document)
   - Executive summary
   - Key findings
   - Recommendations
   - Next steps

---

## Decision Point

**Question for team**: Which option should we pursue?

- **Option A**: Full refactoring with Stream layer (~15 hours)
- **Option B**: Documentation only, defer refactoring (~2 hours)
- **Option C**: Do nothing, current implementation is acceptable

**My recommendation**: **Option A**

**Reason**: Small investment now pays off when SSE is ready. Idiomatic Effect patterns. Better testability.

**When to start**: After team review and approval of architecture documents.

---

## Resources

- **Effect Stream docs**: `docs/effect-source/effect/src/Stream.ts` (lines 3360-3420)
- **Effect pagination tests**: `docs/effect-source/effect/test/Stream/pagination.test.ts`
- **Current implementation**: `packages/web/src/atoms/timeline-infinite.ts`
- **Component**: `packages/web/src/components/VirtualizedTimeline.tsx`
- **Previous architecture doc**: `packages/web/docs/timeline-atoms-infinite-scroll.md`

---

**Document created**: 2025-11-16
**Review status**: Awaiting team review
**Implementation status**: Design complete, awaiting approval
