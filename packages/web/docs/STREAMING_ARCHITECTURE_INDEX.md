# Timeline Streaming Architecture - Documentation Index

**Created**: 2025-11-16
**Status**: Design Complete - Awaiting Implementation Decision
**Author**: Claude (effect-architect)

---

## Overview

This documentation set provides a **complete architecture design** for refactoring the timeline infinite scroll implementation to use Effect Streams as a pagination abstraction layer, with forward compatibility for Server-Sent Events (SSE) push-based updates.

---

## Documentation Files

### 1. Executive Summary 📋
**File**: [`timeline-streaming-summary.md`](./timeline-streaming-summary.md)
**Purpose**: High-level overview and recommendations
**Audience**: Technical leads, product owners, decision makers
**Length**: ~15 minutes reading time

**Key Contents**:
- Current state assessment
- Research findings from Effect source code
- Three implementation options (A, B, C)
- Recommendation: Option A (full refactoring)
- Decision point for team
- Key takeaways

**Start here if**: You need to understand the business case and make a decision.

---

### 2. Architecture Deep Dive 🏗️
**File**: [`timeline-streaming-architecture.md`](./timeline-streaming-architecture.md)
**Purpose**: Detailed architectural analysis and patterns
**Audience**: Architects, senior engineers
**Length**: ~45 minutes reading time

**Key Contents**:
- Current implementation analysis (problems identified)
- Effect Stream pagination patterns (from source code)
- Proposed architecture with layer separation
- Pattern explorations (what we tried, what worked, what didn't)
- Stream construction patterns
- Pull-based pagination using `Stream.paginateEffect`
- SSE integration path using `Stream.async`
- Hybrid approach rationale (why we keep `get.set()`)
- Benefits and trade-offs
- Questions answered (6 key design questions)

**Read this if**: You need to understand WHY we're making these architectural choices.

---

### 3. Implementation Plan 🛠️
**File**: [`timeline-streaming-refactor-plan.md`](./timeline-streaming-refactor-plan.md)
**Purpose**: Step-by-step implementation guide
**Audience**: Engineers implementing the refactoring
**Length**: ~30 minutes reading time, ~15 hours implementation time

**Key Contents**:

**Phase 1**: Create Stream Abstraction Layer
- Define types (`timeline-types.ts`)
- Implement cursor helpers (`timeline-cursor.ts`)
- Implement pagination stream (`timeline-pagination.ts`)
- Add stream tests

**Phase 2**: Refactor Action Atoms
- Update `loadInitialTimelinePageAtom` to consume stream
- Update `loadNextTimelinePageAtom` to consume stream
- Remove old Effect functions

**Phase 3**: Add SSE Scaffold
- Create SSE stream stub (`timeline-sse.ts`)
- Add stream mode switcher (`timeline-factory.ts`)

**Phase 4**: Testing and Validation
- Unit tests for streams
- Integration tests for atoms
- Component integration tests
- Manual testing checklist

**Phase 5**: Documentation Updates
- Update architecture docs
- Create stream layer README
- Update reactive patterns guide

**Phase 6**: Cleanup and Finalization
- Remove dead code
- Type safety audit
- Performance benchmarks

**Timeline Estimate**: 15 hours (~2 days)

**Use this when**: You're ready to implement the refactoring.

---

### 4. Visual Diagrams 📊
**File**: [`timeline-streaming-diagram.md`](./timeline-streaming-diagram.md)
**Purpose**: Visual representation of architecture and data flows
**Audience**: Everyone (visual learners)
**Length**: ~20 minutes reading time

**Key Contents**:
- Current architecture diagram (before refactoring)
- Proposed architecture diagram (after refactoring)
- Data flow diagrams (current vs proposed)
- Pull vs Push stream comparison
- Testing architecture comparison
- Migration path visualization
- Layer responsibility breakdown

**Look at this if**: You prefer visual explanations or need to present the design to others.

---

## Quick Navigation by Use Case

### "I need to make a decision about this refactoring"
1. Read: [Summary](./timeline-streaming-summary.md) → Decision Point section
2. Look at: [Diagrams](./timeline-streaming-diagram.md) → Proposed Architecture
3. Review: Timeline estimate in [Implementation Plan](./timeline-streaming-refactor-plan.md)

**Time investment**: 20 minutes
**Outcome**: Informed decision on Option A/B/C

---

### "I need to understand the technical approach"
1. Read: [Architecture](./timeline-streaming-architecture.md) → Section 3-6
2. Look at: [Diagrams](./timeline-streaming-diagram.md) → Data Flow comparison
3. Review: [Summary](./timeline-streaming-summary.md) → Questions Answered

**Time investment**: 1 hour
**Outcome**: Deep understanding of patterns and rationale

---

### "I need to implement this refactoring"
1. Read: [Implementation Plan](./timeline-streaming-refactor-plan.md) → All phases
2. Reference: [Architecture](./timeline-streaming-architecture.md) → Code examples
3. Use: [Diagrams](./timeline-streaming-diagram.md) → As visual reference

**Time investment**: 15 hours + reading time
**Outcome**: Complete implementation

---

### "I need to present this to stakeholders"
1. Start with: [Diagrams](./timeline-streaming-diagram.md) → Before/After comparison
2. Present: [Summary](./timeline-streaming-summary.md) → Key Takeaways
3. Show: [Implementation Plan](./timeline-streaming-refactor-plan.md) → Timeline estimate

**Time investment**: 30 minutes prep
**Outcome**: Clear stakeholder communication

---

## Key Concepts Quick Reference

### Effect Stream Patterns

**Pull-based pagination**:
```typescript
Stream.paginateEffect(
  initialCursor,
  (cursor) => Effect.gen(function* () {
    const response = yield* fetchPage(cursor)
    const nextCursor = response.has_more ? Option.some(...) : Option.none()
    return [response, nextCursor]
  })
)
```

**Push-based events (SSE)**:
```typescript
Stream.async<Event>((emit) => {
  const es = new EventSource(url)
  es.onmessage = (e) => emit.single(parseEvent(e.data))
  return Effect.sync(() => es.close())
})
```

**Consuming streams in atoms**:
```typescript
const loadNextPageAtom = runtime.fn()(() =>
  Effect.gen(function* () {
    const stream = createPaginationStream(config)
    const page = yield* Stream.runCollect(stream.pipe(Stream.take(1)))
    get.set(stateAtom, { pages: [...pages, page] })
  })
)
```

---

## Implementation Options Summary

### Option A: Full Refactoring (RECOMMENDED)
- **Effort**: ~15 hours (2 days)
- **Risk**: Low (no breaking changes)
- **Benefits**: Idiomatic Effect, testable, SSE-ready
- **Status**: Design complete, ready to implement

### Option B: Documentation Only
- **Effort**: ~2 hours
- **Risk**: None
- **Benefits**: Documents SSE path for future
- **Drawback**: Defers technical debt

### Option C: Do Nothing
- **Effort**: 0 hours
- **Risk**: None
- **Benefits**: Current code works
- **Drawback**: Harder SSE integration later

**Recommendation**: **Option A** - small investment now, big payoff later

---

## Related Documentation

### Existing Documents (Context)
- [`timeline-atoms-infinite-scroll.md`](./timeline-atoms-infinite-scroll.md) - Original infinite scroll design
- [`timeline-refactor-plan.md`](./timeline-refactor-plan.md) - Previous refactoring plan (different scope)
- `REACTIVE_PATTERNS.md` - Reactive patterns guide (to be updated)

### Effect Source Code References
- `/Users/pooks/Dev/crate/docs/effect-source/effect/src/Stream.ts` (lines 3360-3420) - `Stream.paginateEffect` definition
- `/Users/pooks/Dev/crate/docs/effect-source/effect/test/Stream/pagination.test.ts` - Pagination test examples

### Current Implementation
- `packages/web/src/atoms/timeline-infinite.ts` - Current infinite scroll atoms
- `packages/web/src/components/VirtualizedTimeline.tsx` - Component using atoms
- `packages/web/src/lib/http-runtime.ts` - TimelineRuntime and services

---

## Key Design Decisions

### 1. Keep Action Atoms Using `get.set()`
**Rationale**: Effect-Atom action atoms (`runtime.fn()`) are **designed** to use imperative state updates. This is not an anti-pattern.

**See**: [Architecture](./timeline-streaming-architecture.md) Section 8 - "FINAL RECOMMENDATION"

### 2. Use `Stream.paginateEffect` for Cursor Pagination
**Rationale**: Idiomatic Effect pattern specifically designed for paginated APIs.

**See**: [Architecture](./timeline-streaming-architecture.md) Section 2 - "Effect Stream Pagination Patterns"

### 3. Same Stream Interface for Pull and Push
**Rationale**: Both `Stream.paginateEffect` (pull) and `Stream.async` (push) return `Stream<TimelinePage>`, allowing seamless swapping.

**See**: [Summary](./timeline-streaming-summary.md) Section "Forward Compatibility"

### 4. Separate Stream Layer from Atom Layer
**Rationale**: Separation of concerns - business logic (Stream) vs state management (Atom).

**See**: [Diagrams](./timeline-streaming-diagram.md) - Layer diagrams

### 5. TimelineKVS Remains Complementary to Streams
**Rationale**: KVS is normalized per-play cache, Streams handle page-level operations. Different concerns.

**See**: [Summary](./timeline-streaming-summary.md) Question 6 - "How does TimelineKVS fit?"

---

## Success Metrics

### Technical
- ✅ All tests passing (stream, atom, component)
- ✅ Type safety maintained (no TypeScript errors)
- ✅ Functionality preserved (infinite scroll works as before)
- ✅ Performance acceptable (no regression)

### Architectural
- ✅ Stream layer testable in isolation
- ✅ Pagination logic separated from state management
- ✅ SSE integration path clearly defined
- ✅ Idiomatic Effect patterns throughout

### Documentation
- ✅ Complete implementation guide
- ✅ Visual diagrams for communication
- ✅ Pattern documentation updated
- ✅ Team understands rationale

---

## Next Steps

### Immediate
1. **Team review** of architecture documents
2. **Decision** on Option A/B/C
3. **Timeline planning** if choosing Option A

### If Approved (Option A)
1. **Create feature branch**: `feature/timeline-streaming-refactor`
2. **Implement Phase 1**: Stream layer (4 hours)
3. **Review checkpoint**: Validate stream layer before proceeding
4. **Implement Phases 2-6**: Atom refactoring → SSE scaffold → Testing → Docs → Cleanup

### Future (After Option A Complete)
1. **Implement SSE backend** (`/api/timeline/stream` endpoint)
2. **Complete SSE integration** (remove stub, test push)
3. **Add mode switcher UI** (toggle pull/push)
4. **Optimize**: prefetching, bidirectional scroll, combinators

---

## FAQ

### Q: Why not just wait until SSE is needed?
**A**: Small investment now (15 hours) vs larger refactor later. Stream abstraction makes code more testable today, SSE-ready tomorrow.

### Q: Will this break existing functionality?
**A**: No. Stream layer is additive. Atoms keep same behavior. Components unchanged.

### Q: How do we roll back if issues arise?
**A**: Keep old Effect functions commented out initially. Feature flag for gradual rollout.

### Q: What's the risk level?
**A**: Low. Stream layer is pure and testable. Atom changes are minimal (consumption pattern only).

### Q: Do we need to change the component?
**A**: No. `VirtualizedTimeline.tsx` continues using same atoms with same interface.

### Q: Is this over-engineering?
**A**: No. Using `Stream.paginateEffect` is **more** idiomatic than manual pagination. We're actually simplifying the codebase.

---

## Contact

**Questions about architecture?**
See: [Architecture Deep Dive](./timeline-streaming-architecture.md)

**Questions about implementation?**
See: [Implementation Plan](./timeline-streaming-refactor-plan.md)

**Need visual explanation?**
See: [Visual Diagrams](./timeline-streaming-diagram.md)

**Want executive summary?**
See: [Summary](./timeline-streaming-summary.md)

---

## Document Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-11-16 | Initial architecture design created | Claude (effect-architect) |
| TBD | Implementation started | TBD |
| TBD | Phase 1 complete (Stream layer) | TBD |
| TBD | Phase 2 complete (Atom refactoring) | TBD |
| TBD | Full implementation complete | TBD |

---

**Status**: ✅ Design Complete - Ready for Team Review

**Recommendation**: Proceed with **Option A** (Full Refactoring)

**Next Action**: Schedule architecture review meeting with team
