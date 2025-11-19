# Stream-Based Refactoring Summary

**Date:** 2025-11-16
**Context:** Improving infinite scroll with Effect Stream patterns
**Based On:** Design review branch `claude/infinite-scroll-design-review-01AMtbhFvL6Bd6qrBaq6ckuN`

---

## Key Insight from Design Review

The comprehensive design documents (1000+ lines) identified that **our current implementation is fundamentally sound**, but can be improved by:

1. **Separating concerns** - Business logic (streams) vs state management (atoms)
2. **Using Stream.paginateEffect** - Idiomatic Effect pattern for pagination
3. **Adding gap detection** - Dual-cursor model for filling timeline holes
4. **Forward compatibility** - Easy path to SSE/push-based updates

---

## What's Working Well (Keep)

✅ **Hybrid push-pull architecture** - Background fetch + user scroll pagination
✅ **Cursor-based pagination** - Python API supports this correctly
✅ **Centralized state** - Single source of truth in `timelineInfiniteStateAtom`
✅ **Action atoms with get.set()** - This IS idiomatic Effect-Atom pattern!
✅ **TanStack Virtual** - Virtualization working correctly
✅ **TimelineKVS normalization** - Play cache is solid

---

## What To Improve

### 1. Add Stream Layer for Business Logic

**Current:**
```typescript
// Action atom calls API directly
const loadNextPageAtom = runtime.fn()(() =>
  Effect.gen(function* () {
    const client = yield* TimelineClient;
    const response = yield* client.timeline.getTimeline({...});
    // ... normalize, update state
  })
);
```

**Improved:**
```typescript
// Stream layer: Pure pagination logic
const paginationStream = Stream.paginateEffect(cursor, fetchPage);

// Atom layer: Consume stream, update state
const loadNextPageAtom = runtime.fn()(() =>
  Effect.gen(function* () {
    const page = yield* Stream.runCollect(stream.pipe(Stream.take(1)));
    get.set(stateAtom, { pages: [...pages, page] }); // ✅ Correct!
  })
);
```

**Benefits:**
- Testable business logic (stream tests don't need React)
- Built-in retry via `Stream.retry()`
- Easy to swap sources (cursor → SSE)

---

### 2. Add Gap Detection Stream

**Missing:** We don't detect when plays are missing between sessions

**Solution:**
```typescript
const gapDetectionStream = Stream.asyncEffect<TimelineGap>((emit) =>
  Effect.gen(function* () {
    const newestCached = yield* kvs.getLastSeenPlay();
    const latestFromApi = yield* client.timeline.getTimeline({ limit: 1 });

    if (latestFromApi.id > newestCached.id) {
      emit.single({
        newestCachedId: newestCached.id,
        oldestApiId: latestFromApi.id,
        estimatedMissing: latestFromApi.id - newestCached.id
      });
    }
  })
).pipe(Stream.schedule(Effect.scheduleSpaced(Duration.minutes(5))));
```

**Benefits:**
- Automatic gap detection every 5 minutes
- Can trigger auto-fill or show notification
- Implements "dual-cursor model" from design review

---

### 3. Forward Compatibility: SSE Path

**Goal:** Make it easy to swap cursor pagination for SSE push

**Current (pull-based):**
```typescript
const stream = Stream.paginateEffect(cursor, fetchPage);
```

**Future (push-based SSE):**
```typescript
const stream = Stream.async<TimelineResponse>((emit) => {
  const es = new EventSource("/api/timeline/stream");
  es.onmessage = (e) => emit.single(JSON.parse(e.data));
  return Effect.sync(() => es.close());
});
```

**Atoms remain unchanged** - same consumption pattern!

---

## Implementation Phases

| Phase | What | Effort | Value |
|-------|------|--------|-------|
| 1 | Create `timeline-pagination-stream.ts` with `Stream.paginateEffect` | 2h | High - testable logic |
| 2 | Refactor atoms to consume streams | 2h | High - cleaner separation |
| 3 | Add gap detection stream | 2h | Medium - better UX |
| 4 | Add prefetching | 1h | Low - nice to have |
| 5 | Disable album bar (temporary) | 5min | High - reduce noise |

**Total: ~7 hours**

---

## Key Takeaway

**Don't overthink it.** The current implementation is 90% correct. The refactor is about:

1. **Extracting** pagination logic into streams (testability)
2. **Adding** gap detection (robustness)
3. **Preparing** for SSE (future-proofing)

NOT about changing the fundamental atom patterns - those are correct!

---

## Next Steps

1. **Disable album bar** - Quick win to reduce distractions
2. **Review** design docs on branch for full context
3. **Implement** Phase 1-2 (stream layer + atom refactor)
4. **Test** with real data
5. **Add** gap detection if needed

---

## References

- Design Review Branch: `claude/infinite-scroll-design-review-01AMtbhFvL6Bd6qrBaq6ckuN`
- Key Files:
  - `docs/frontend/infinite-scroll-design-considerations.md` (1116 lines)
  - `docs/frontend/pull-based-pagination-design.md` (1354 lines)
  - `packages/web/src/atoms/timeline-infinite.ts` (current implementation)
  - `packages/web/src/components/VirtualizedTimeline.tsx` (current UI)
