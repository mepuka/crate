# Frontend Atom Architecture Refactor Plan

**Date:** 2025-11-14
**Status:** Planning Phase
**Risk Assessment:** All recommendations evaluated for safety and impact

---

## Executive Summary

This document consolidates findings from:
1. Effect-architect analysis of atom usage patterns
2. Manual review of service/layer dependencies
3. Identification of idiomatic Effect/Atom usage opportunities

**Current State:** 7 atom files, 61 hook usages, well-structured but with optimization opportunities
**Goal:** More reactive, consolidated, and idiomatic Effect-based state management

---

## Priority Matrix

| Priority | Risk | Impact | Effort | Changes |
|----------|------|--------|--------|---------|
| **P0** | Low | High | Low | Critical fixes, safe refactors |
| **P1** | Low | High | Medium | High-value consolidation |
| **P2** | Medium | Medium | Medium | Architectural improvements |
| **P3** | Low | Low | Low | Cleanup and documentation |

---

## P0: Critical Fixes (Safe, High Impact)

### P0.1: Fix Effect.cached Anti-Pattern in KEXP Atoms

**Issue:** Cached effects created at module scope instead of runtime scope
- **File:** `packages/web/src/atoms/kexp-atoms.ts:91-98`
- **Risk:** Low (pure refactor, no behavior change)
- **Impact:** High (proper cache lifecycle, TTL support, memory safety)

**Current Code:**
```typescript
// Lines 91-98: WRONG - module-scoped cache
const cachedProgramsEffect = Effect.cached(fetchProgramsEffect)
const cachedShowsEffect = Effect.cached(fetchShowsEffect)

const _programsAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const getCachedPrograms = yield* cachedProgramsEffect
    return yield* getCachedPrograms
  })
)
```

**Problems:**
- Cache lifecycle not tied to runtime
- No TTL → cache persists forever
- No manual invalidation capability
- Memory leak potential

**Proposed Solution:**
```typescript
const _programsAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const apiService = yield* KexpApiService
    const response = yield* apiService.fetchPrograms
    return HashMap.fromIterable(
      response.results.map((p) => [p.id, p] as const)
    )
  }).pipe(
    Effect.cachedWithTTL("24 hours")
  )
)

const _showsAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const apiService = yield* KexpApiService
    const response = yield* apiService.fetchShows(500)
    return HashMap.fromIterable(
      response.results.map((s) => [s.id, s] as const)
    )
  }).pipe(
    Effect.cachedWithTTL("24 hours")
  )
)
```

**Benefits:**
- ✅ Cache scoped to runtime lifecycle
- ✅ Automatic 24-hour TTL
- ✅ Memory-safe cleanup
- ✅ Idiomatic Effect pattern

**Testing Strategy:**
1. Verify initial fetch happens
2. Verify subsequent reads use cache (no network)
3. Wait 24 hours, verify re-fetch (or mock Duration.currentTimeMillis)
4. Verify dev tools show no memory leaks

**Estimated Effort:** 30 minutes
**Files Changed:** 1 (`kexp-atoms.ts`)

---

### P0.2: Fix Chunk Invalidation on Play Updates

**Issue:** Metadata updates to existing plays don't invalidate chunk atoms
- **File:** `packages/web/src/lib/http-runtime.ts:123`
- **Risk:** Low (adds invalidation, doesn't remove)
- **Impact:** High (keeps UI in sync with data changes)

**Current Code:**
```typescript
// Line 123: Only invalidates on NEW plays
if (isNew) {
  yield* Reactivity.invalidate(["timeline:plays_chunk"])
}
```

**Problem:**
If KEXP corrects artist name or enriches metadata for existing play ID, `playsChunkAtom` never refetches even though `playAtom(id)` does. This breaks "single source of truth" principle.

**Proposed Solution:**

**Option A: Always Invalidate (Simple)**
```typescript
storePlay: (play: Play) =>
  Effect.gen(function* () {
    const store = yield* BrowserKeyValueStore
    const key = `play:${play.id}`
    const exists = yield* store.has(key)

    yield* store.set(key, JSON.stringify(play))
    yield* addPlayIdIfNew(play.id)

    // Always invalidate chunk atoms
    yield* Reactivity.invalidate([
      "timeline:plays_chunk",
      `timeline:play:${play.id}`
    ])
  }).pipe(Effect.withSpan("TimelineKVS.storePlay"))
```

**Option B: Hash-Based Invalidation (Optimal)**
```typescript
import { Hash, Equal } from "effect"

storePlay: (play: Play) =>
  Effect.gen(function* () {
    const store = yield* BrowserKeyValueStore
    const key = `play:${play.id}`

    // Get existing play for comparison
    const existingJson = yield* store.get(key).pipe(Effect.option)
    const hasChanged = Option.match(existingJson, {
      onNone: () => true, // New play
      onSome: (json) => {
        const existing = JSON.parse(json) as Play
        return !Equal.equals(existing, play)
      }
    })

    if (hasChanged) {
      yield* store.set(key, JSON.stringify(play))
      yield* addPlayIdIfNew(play.id)
      yield* Reactivity.invalidate([
        "timeline:plays_chunk",
        `timeline:play:${play.id}`
      ])
    }
  }).pipe(Effect.withSpan("TimelineKVS.storePlay"))
```

**Recommendation:** Start with Option A (simple), measure performance impact. If updates are too frequent, switch to Option B.

**Benefits:**
- ✅ Atoms stay consistent with KV store
- ✅ Artist corrections appear in timeline
- ✅ Follows "single source of truth + reactivity" guidance

**Testing Strategy:**
1. Store play with ID 123
2. Update play 123 metadata (change artist)
3. Verify `playsChunkAtom` refetches
4. Verify Timeline component shows new data

**Estimated Effort:** 45 minutes (Option A), 90 minutes (Option B)
**Files Changed:** 1 (`http-runtime.ts`)

---

### P0.3: Remove Unused PullAtom

**Issue:** Dead code cluttering codebase
- **File:** `packages/web/src/atoms/timeline.ts:172-177`
- **Risk:** None (removal only)
- **Impact:** Low (cleanup)

**Current Code:**
```typescript
export const PullAtom = TimelineRuntime.pull((_get) => {
  return Effect.gen(function* () {
    const timelineKVS = yield* TimelineKVS;
    return yield* timelineKVS.getPlayIds();
  });
});
```

**Grep Result:** 0 usages in codebase

**Proposed Solution:**
```typescript
// DELETE lines 172-177
```

**Benefits:**
- ✅ Reduces cognitive load
- ✅ Cleaner exports

**Testing Strategy:**
1. Run `pnpm check:ui`
2. Verify no build errors

**Estimated Effort:** 5 minutes
**Files Changed:** 1 (`timeline.ts`)

---

## P1: High-Value Consolidation (Low Risk, High Impact)

### P1.1: Consolidate Show Boundary Computation

**Issue:** Same logic exists in 3 places
- **Files:**
  - `packages/web/src/atoms/timeline.ts:227-235`
  - `packages/web/src/atoms/kexp-atoms.ts:272-308`
  - `packages/web/src/hooks/use-kexp-data.ts:150-183`
- **Risk:** Low (hook signature unchanged, components unaffected)
- **Impact:** High (single source of truth, automatic memoization)

**Current Duplication:**

1. **Atom version** (`timeline.ts:227`):
```typescript
export const showBoundariesAtom = Atom.make((get) => {
  const playsResult = get(playsArrayAtom);
  return Result.map(playsResult, (plays) => {
    const boundariesAtom = createShowBoundariesAtom(Atom.make(() => plays));
    return get(boundariesAtom);
  });
});
```

2. **Factory version** (`kexp-atoms.ts:272`):
```typescript
export function createShowBoundariesAtom(
  playsAtom: Atom.Atom<readonly Play[]>
): Atom.Atom<ShowBoundary[]> {
  return Atom.make((get) => {
    const plays = get.get(playsAtom)
    const shows = get.get(showsMapAtom)
    // ... 30 lines of boundary logic
  })
}
```

3. **Hook version** (`use-kexp-data.ts:150`):
```typescript
export function useShowBoundaries(plays: readonly Play[]): ShowBoundary[] {
  const showsMap = useAtomValue(showsMapAtom)

  return useMemo(() => {
    // ... 30 lines of boundary logic (duplicated)
  }, [plays, showsMap])
}
```

**Problems:**
- 3x maintenance burden
- Hook recomputes on every render dependency change
- Atom version creates new atoms dynamically (loses memoization)
- Inconsistent implementations may diverge

**Proposed Solution:**

**Step 1: Single Atom Family Implementation**

```typescript
// File: packages/web/src/atoms/kexp-atoms.ts

/**
 * Computes show boundaries for a given array of plays.
 *
 * A boundary is inserted at the first play of each new show,
 * enriched with program/host information from showsMapAtom.
 *
 * Uses Atom.family for automatic memoization per unique plays array.
 */
export const showBoundariesForPlaysAtom = Atom.family((plays: readonly Play[]) =>
  Atom.make((get) => {
    const shows = get.get(showsMapAtom)
    const boundaries: ShowBoundary[] = []

    plays.forEach((play, idx) => {
      const prevPlay = plays[idx - 1]
      const isNewShow = !prevPlay || prevPlay.show !== play.show

      if (isNewShow && play.show !== null) {
        const showOption = HashMap.get(shows, play.show)

        Option.match(showOption, {
          onNone: () => {
            // Show data not loaded yet, emit minimal boundary
            boundaries.push({
              timestamp: play.airdate,
              showId: play.show!
            })
          },
          onSome: (showInfo) => {
            // Enrich with program/host info
            boundaries.push({
              timestamp: play.airdate,
              showId: play.show!,
              programName: showInfo.program_name ?? undefined,
              programId: showInfo.program ?? undefined,
              hostNames: showInfo.host_names ?? undefined
            })
          }
        })
      }
    })

    return boundaries
  })
)
```

**Step 2: Update Timeline Atom**

```typescript
// File: packages/web/src/atoms/timeline.ts

export const showBoundariesAtom = Atom.make((get) => {
  const playsResult = get.get(playsChunkAtom)

  return Result.map(playsResult, (chunk) => {
    const plays = Chunk.toReadonlyArray(chunk)
    return get.get(showBoundariesForPlaysAtom(plays))
  })
})
```

**Step 3: Update Hook (Thin Wrapper)**

```typescript
// File: packages/web/src/hooks/use-kexp-data.ts

/**
 * Returns show boundaries for given plays array.
 *
 * Delegates to showBoundariesForPlaysAtom for computation,
 * ensuring consistent logic and automatic memoization.
 */
export function useShowBoundaries(plays: readonly Play[]): ShowBoundary[] {
  return useAtomValue(showBoundariesForPlaysAtom(plays))
}
```

**Step 4: Remove createShowBoundariesAtom**

```typescript
// File: packages/web/src/atoms/kexp-atoms.ts
// DELETE lines 272-308
```

**Benefits:**
- ✅ Single source of truth (DRY principle)
- ✅ Automatic memoization via Atom.family
- ✅ Reactive updates when shows data changes
- ✅ Hook signature unchanged (no component changes)
- ✅ Type-safe and consistent

**Testing Strategy:**
1. Verify Timeline component shows boundaries
2. Verify PlayDetailsPanel uses hook correctly
3. Verify boundaries update when shows data loads
4. Visual regression test: boundary markers appear at show transitions

**Estimated Effort:** 2 hours
**Files Changed:** 3 (`kexp-atoms.ts`, `timeline.ts`, `use-kexp-data.ts`)

---

### P1.2: Expose Result Atoms, Remove Loading/Error Atoms

**Issue:** 4 atoms extract state already available in Result
- **File:** `packages/web/src/atoms/kexp-atoms.ts:160-210`
- **Risk:** Medium (component changes required)
- **Impact:** High (more idiomatic, fewer atoms, more flexible)

**Current Pattern:**
```typescript
// Private atom with Result
const _programsAtom = TimelineRuntime.atom(...)

// Public atom unwraps to HashMap
export const programsMapAtom = Atom.make((get) => {
  const result = get.get(_programsAtom)
  return Result.matchWithWaiting(result, {
    onWaiting: () => HashMap.empty<number, KexpProgram>(),
    onSuccess: (s) => s.value,
    onError: () => HashMap.empty<number, KexpProgram>(),
    onDefect: () => HashMap.empty<number, KexpProgram>()
  })
})

// Separate loading atom
export const programsLoadingAtom = Atom.make<boolean>((get) => {
  const result = get.get(_programsAtom)
  return Result.matchWithWaiting(result, {
    onWaiting: () => true,
    onSuccess: () => false,
    onError: () => false,
    onDefect: () => false
  })
})

// Separate error atom
export const programsErrorAtom = Atom.make<string | null>((get) => {
  const result = get.get(_programsAtom)
  return Result.matchWithWaiting(result, {
    onWaiting: () => null,
    onSuccess: () => null,
    onError: () => "Failed to load programs",
    onDefect: () => "Unexpected error loading programs"
  })
})

// Same pattern for shows: +2 atoms
```

**Problems:**
- State decomposed into 6 atoms (2 Result + 2 loading + 2 error)
- Components can't access full Result (lose error details)
- Not idiomatic Effect (Result should flow through)

**Proposed Solution:**

**Step 1: Expose Result Atoms**

```typescript
// File: packages/web/src/atoms/kexp-atoms.ts

// Keep private atom as-is
const _programsAtom = TimelineRuntime.atom(...)
const _showsAtom = TimelineRuntime.atom(...)

// Export Result directly
export const programsResultAtom = _programsAtom
export const showsResultAtom = _showsAtom

// Keep convenience atoms for common case (just need data)
export const programsMapAtom = Atom.make((get) => {
  const result = get.get(programsResultAtom)
  return Result.matchWithWaiting(result, {
    onWaiting: () => HashMap.empty<number, KexpProgram>(),
    onSuccess: (s) => s.value,
    onError: () => HashMap.empty<number, KexpProgram>(),
    onDefect: () => HashMap.empty<number, KexpProgram>()
  })
})

export const showsMapAtom = Atom.make((get) => {
  const result = get.get(showsResultAtom)
  return Result.matchWithWaiting(result, {
    onWaiting: () => HashMap.empty<number, KexpShow>(),
    onSuccess: (s) => s.value,
    onError: () => HashMap.empty<number, KexpShow>(),
    onDefect: () => HashMap.empty<number, KexpShow>()
  })
})

// DELETE programsLoadingAtom, showsLoadingAtom
// DELETE programsErrorAtom, showsErrorAtom
```

**Step 2: Update Components**

Find components using loading/error atoms:

```bash
grep -r "programsLoadingAtom\|showsLoadingAtom\|programsErrorAtom\|showsErrorAtom" packages/web/src
```

Update to use Result pattern:

```typescript
// BEFORE
const loading = useAtomValue(programsLoadingAtom)
const error = useAtomValue(programsErrorAtom)
const programs = useAtomValue(programsMapAtom)

if (loading) return <Spinner />
if (error) return <Error message={error} />
return <ProgramsList programs={programs} />

// AFTER
const result = useAtomValue(programsResultAtom)

return Result.matchWithWaiting(result, {
  onWaiting: () => <Spinner />,
  onSuccess: (s) => <ProgramsList programs={s.value} />,
  onError: (error) => <Error error={error} />,
  onDefect: (defect) => <CriticalError defect={defect} />
})
```

**Benefits:**
- ✅ Eliminates 4 atoms (programsLoadingAtom, showsLoadingAtom, programsErrorAtom, showsErrorAtom)
- ✅ More flexible - components access full error details
- ✅ Idiomatic Effect - Result flows through system
- ✅ Convenience atoms still available for simple cases

**Caveat:** This change requires component updates. Audit all usages first.

**Testing Strategy:**
1. Grep for all loading/error atom usages
2. Update components to use Result pattern
3. Test loading states (clear cache, refresh)
4. Test error states (disconnect network, refresh)
5. Verify error details display correctly

**Estimated Effort:** 3 hours (depends on component count)
**Files Changed:** 1 atom file + N component files

**Decision Point:** Should we proceed with this? It's higher risk due to component changes.

---

### P1.3: Cache Reconstructed Chunks

**Issue:** `getPlayIds` and `getPlaysChunk` both call `reconstructChunkFromAllPlays()` independently
- **File:** `packages/web/src/lib/http-runtime.ts:181`
- **Risk:** Low (pure optimization, no behavior change)
- **Impact:** Medium (reduces redundant work)

**Current Code:**
```typescript
// Line 181
getPlayIds: Effect.gen(function* () {
  const store = yield* BrowserKeyValueStore
  const idsJson = yield* store.get("play_ids")
  return JSON.parse(idsJson) as number[]
}).pipe(
  Effect.orElse(() => reconstructChunkFromAllPlays()), // Expensive
  Effect.withSpan("TimelineKVS.getPlayIds")
)

// Line 188
getPlaysChunk: Effect.gen(function* () {
  const playIds = yield* getPlayIds() // May call reconstructChunkFromAllPlays
  const plays = yield* Effect.all(
    playIds.map((id) => getPlay(id)),
    { concurrency: "unbounded" }
  )
  return Chunk.fromIterable(plays)
}).pipe(Effect.withSpan("TimelineKVS.getPlaysChunk"))
```

**Problem:**
- `getPlayIds` reconstructs when `play_ids` missing
- `getPlaysChunk` calls `getPlayIds` → may trigger reconstruction again
- Heavy operation: iterates all localStorage keys, parses JSON, sorts

**Proposed Solution:**

**Option A: Shared Effect.cached**

```typescript
// Create cached reconstruction effect
const cachedReconstruction = Effect.cached(reconstructChunkFromAllPlays())

const getPlayIds = Effect.gen(function* () {
  const store = yield* BrowserKeyValueStore
  const idsJson = yield* store.get("play_ids")
  return JSON.parse(idsJson) as number[]
}).pipe(
  Effect.orElse(() => cachedReconstruction.pipe(Effect.flatMap(getCached => getCached))),
  Effect.withSpan("TimelineKVS.getPlayIds")
)
```

**Option B: Store Reconstruction Result**

```typescript
const reconstructAndStore = Effect.gen(function* () {
  const ids = yield* reconstructChunkFromAllPlays()
  const store = yield* BrowserKeyValueStore

  // Cache the result in localStorage
  yield* store.set("play_ids", JSON.stringify(ids))

  return ids
})

const getPlayIds = Effect.gen(function* () {
  const store = yield* BrowserKeyValueStore
  const idsJson = yield* store.get("play_ids")
  return JSON.parse(idsJson) as number[]
}).pipe(
  Effect.orElse(() => reconstructAndStore),
  Effect.withSpan("TimelineKVS.getPlayIds")
)
```

**Recommendation:** Option B - store the reconstruction result. It's already using localStorage as cache, just wasn't persisting the computed `play_ids`.

**Benefits:**
- ✅ Reconstruction happens once, cached in localStorage
- ✅ Subsequent page loads skip reconstruction
- ✅ `getPlaysChunk` benefits from cached `play_ids`

**Testing Strategy:**
1. Clear localStorage
2. Load page → verify reconstruction happens once
3. Refresh page → verify no reconstruction
4. Add new play → verify `play_ids` updates

**Estimated Effort:** 1 hour
**Files Changed:** 1 (`http-runtime.ts`)

---

## P2: Architectural Improvements (Medium Risk, Medium Impact)

### P2.1: Add Request-Driven Timeline Fetching

**Issue:** Timeline only updates via 100s polling loop, URL params (`timelineParamsAtom`) not used
- **Files:**
  - `packages/web/src/atoms/timeline-url-sync.ts:95` (params ready)
  - `packages/web/src/lib/http-runtime.ts:220` (only polling layer exists)
- **Risk:** Medium (new atom, need coordination with polling)
- **Impact:** Medium (enables manual refresh, cursor navigation)

**Current State:**
- `timelineParamsAtom` exposes `{ limit, airdate_before, airdate_after, ordering }`
- `FetchLatestLive` polls every 100s with hardcoded `limit: 50`
- No way to manually trigger fetch or use URL params

**Proposed Solution:**

**Step 1: Create Request-Driven Fetch Atom**

```typescript
// File: packages/web/src/atoms/timeline.ts

/**
 * Fetches timeline plays using current URL params.
 *
 * This is a request atom - it only executes when explicitly read.
 * Use this for manual refreshes or cursor-based navigation.
 *
 * Background polling continues via FetchLatestLive layer.
 */
export const fetchTimelineWithParamsAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const client = yield* TimelineClient
    const timelineKVS = yield* TimelineKVS
    const params = yield* Effect.sync(() => {
      // Read URL params directly (not reactive)
      const searchParams = new URLSearchParams(window.location.search)
      return {
        limit: Number(searchParams.get("limit")) || 50,
        airdate_before: searchParams.get("airdate_before") ?? undefined,
        airdate_after: searchParams.get("airdate_after") ?? undefined,
        ordering: searchParams.get("ordering") ?? undefined
      }
    })

    yield* Effect.logInfo("Fetching timeline with params", params)

    const response = yield* client.timeline.getTimeline({ urlParams: params })

    // Store all plays
    yield* Effect.all(
      response.results.map((play) => timelineKVS.storePlay(play)),
      { concurrency: "unbounded" }
    )

    yield* Effect.logInfo(`Stored ${response.results.length} plays from request`)

    return response
  })
)
```

**Step 2: Add Manual Refresh Hook**

```typescript
// File: packages/web/src/hooks/use-timeline.ts

export function useTimelineRefresh() {
  const runtime = TimelineRuntime.runtime

  return useCallback(() => {
    const effect = Atom.get(fetchTimelineWithParamsAtom)

    Effect.runPromise(
      Effect.provideService(effect, Atom.Atom, Atom.make(() => ({})))
    )(runtime).catch(console.error)
  }, [runtime])
}
```

**Step 3: Add Refresh Button to UI**

```typescript
// File: packages/web/src/components/Timeline.tsx

export function Timeline() {
  const refresh = useTimelineRefresh()

  return (
    <div>
      <button onClick={refresh}>Refresh Timeline</button>
      {/* existing timeline */}
    </div>
  )
}
```

**Benefits:**
- ✅ Enables manual refresh
- ✅ Enables cursor-based pagination
- ✅ Uses URL params (already tracked)
- ✅ Coexists with polling (no conflicts)

**Caveats:**
- Polling and manual fetch may overlap → deduplication needed
- URL params changing should trigger fetch → need reactivity hook

**Testing Strategy:**
1. Change URL params, click refresh
2. Verify fetch uses new params
3. Verify plays stored and displayed
4. Verify polling continues independently

**Estimated Effort:** 4 hours
**Files Changed:** 2 (`timeline.ts`, new hook file) + component updates

**Decision Point:** Is manual refresh needed? Or can we enhance polling to respect URL params?

---

### P2.2: Integrate KEXP Cache Service with TTL

**Issue:** KEXP atoms use Effect.cached without TTL, while dedicated cache service with TTL exists unused
- **Files:**
  - `packages/web/src/atoms/kexp-atoms.ts:91` (no TTL)
  - `packages/web/src/services/kexp-cache.ts` (unused)
- **Risk:** Medium (need to wire cache service into runtime)
- **Impact:** Medium (automatic TTL-based invalidation)

**Current State:**
- `kexp-cache.ts` has `CachedValue` type and `get/set/isExpired` helpers
- Not wired into TimelineRuntime or KexpApiService
- Atoms use Effect.cached with no expiration

**Analysis:**
After P0.1 (switching to `Effect.cachedWithTTL`), this service may not be needed. Effect's built-in caching with TTL is more idiomatic.

**Proposed Solution:**

**Option A: Use Effect.cachedWithTTL (P0.1) + Delete kexp-cache.ts**

This is already covered by P0.1. The separate cache service adds complexity without benefit.

**Option B: Keep kexp-cache.ts for localStorage persistence**

If you want cache to persist across page reloads:

```typescript
// File: packages/web/src/atoms/kexp-atoms.ts

const _programsAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const store = yield* BrowserKeyValueStore

    // Check localStorage cache first
    const cachedJson = yield* store.get("kexp:programs").pipe(Effect.option)

    return yield* Option.match(cachedJson, {
      onNone: () => fetchAndCachePrograms(),
      onSome: (json) => {
        const cached = JSON.parse(json) as CachedValue<KexpProgramsResponseType>

        if (isExpired(cached)) {
          return fetchAndCachePrograms()
        }

        return Effect.succeed(
          HashMap.fromIterable(
            cached.value.results.map((p) => [p.id, p] as const)
          )
        )
      }
    })
  })
)

const fetchAndCachePrograms = () =>
  Effect.gen(function* () {
    const apiService = yield* KexpApiService
    const store = yield* BrowserKeyValueStore

    const response = yield* apiService.fetchPrograms

    // Cache in localStorage with TTL
    const cached: CachedValue<typeof response> = {
      value: response,
      timestamp: Date.now(),
      ttl: 24 * 60 * 60 * 1000 // 24 hours
    }

    yield* store.set("kexp:programs", JSON.stringify(cached))

    return HashMap.fromIterable(
      response.results.map((p) => [p.id, p] as const)
    )
  })
```

**Recommendation:** Option A - use Effect.cachedWithTTL and delete kexp-cache.ts. In-memory cache with TTL is sufficient; cross-session caching not needed for KEXP metadata that changes occasionally.

**Decision Point:** Do KEXP programs/shows change frequently enough to warrant cross-session cache invalidation?

**Estimated Effort:**
- Option A: 15 min (delete file)
- Option B: 3 hours (wire into atoms + test persistence)

---

### P2.3: Consolidate Atom Families for Sorted Plays

**Issue:** 8 separate atoms for simple sort variations
- **File:** `packages/web/src/atoms/timeline.ts:97-170`
- **Risk:** Low (refactor with backward-compatible exports)
- **Impact:** Low (cleaner code, easier to extend)

**Current Pattern:**
```typescript
export const playsSortedByAirdateDescAtom = Atom.make((get) => { ... })
export const playsSortedByAirdateAscAtom = Atom.make((get) => { ... })
export const playsSortedByIdDescAtom = Atom.make((get) => { ... })
export const playIdsFromChunkAtom = Atom.make((get) => { ... })
export const playIdsSortedAtom = Atom.make((get) => { ... })
export const newestPlayAtom = Atom.make((get) => { ... })
export const oldestPlayAtom = Atom.make((get) => { ... })
export const newestNPlaysAtom = Atom.family((n: number) => { ... })
```

**Proposed Solution:**

```typescript
// Parameterized sort atom
export const sortedPlaysAtom = Atom.family((
  orderBy: "airdate-desc" | "airdate-asc" | "id-desc" | "id-asc"
) =>
  Atom.make((get) => {
    const chunk = get.get(playsChunkAtom)
    return Result.map(chunk, (chunkValue) => {
      switch (orderBy) {
        case "airdate-desc": return sortPlaysByAirdateDesc(chunkValue)
        case "airdate-asc": return sortPlaysByAirdateAsc(chunkValue)
        case "id-desc": return sortPlaysByIdDesc(chunkValue)
        case "id-asc": return sortPlaysByIdAsc(chunkValue)
      }
    })
  })
)

// Backward-compatible exports
export const playsSortedByAirdateDescAtom = sortedPlaysAtom("airdate-desc")
export const playsSortedByAirdateAscAtom = sortedPlaysAtom("airdate-asc")
export const playsSortedByIdDescAtom = sortedPlaysAtom("id-desc")

// Parameterized derived atoms
export const extremePlayAtom = Atom.family((
  position: "newest" | "oldest"
) =>
  Atom.make((get) => {
    const sorted = get.get(
      position === "newest"
        ? sortedPlaysAtom("airdate-desc")
        : sortedPlaysAtom("airdate-asc")
    )
    return Result.flatMap(sorted, (chunk) =>
      Chunk.head(chunk).pipe(
        Option.match({
          onNone: () => Result.fail(new Error("No plays")),
          onSome: (play) => Result.succeed(play)
        })
      )
    )
  })
)

export const newestPlayAtom = extremePlayAtom("newest")
export const oldestPlayAtom = extremePlayAtom("oldest")
```

**Benefits:**
- ✅ Reduces 8 atoms to 2 families
- ✅ Easier to add new sort orders
- ✅ Backward compatible (existing exports work)

**Testing Strategy:**
1. Verify all existing usages work
2. No behavioral changes
3. Type-check passes

**Estimated Effort:** 2 hours
**Files Changed:** 1 (`timeline.ts`)

---

### P2.4: Merge SearchWorkerClient into TimelineRuntime

**Issue:** Separate SearchWorkerRuntime prevents state sharing with timeline
- **Files:**
  - `packages/web/src/atoms/search-worker.ts:22` (separate runtime)
  - `packages/web/src/lib/http-runtime.ts:254` (TimelineRuntime)
- **Risk:** Medium (runtime merge, need careful layer composition)
- **Impact:** Medium (enables cross-state reactivity)

**Current State:**
```typescript
// Separate runtime for search
export const SearchWorkerRuntime = Atom.runtime(
  Layer.mergeAll(
    Reactivity.layer,
    BrowserKeyValueStore.layerLocalStorage,
    SearchWorkerClient.Default
  )
)
```

**Problem:**
If you want search results to trigger timeline updates (or vice versa), separate runtimes prevent direct communication.

**Analysis:**
Is this needed? Current architecture seems intentional:
- Search is independent feature
- Doesn't need TimelineKVS, TimelineClient, AlbumBarWorkerClient
- Simpler to keep separate

**Proposed Solution:**

**Only merge if cross-feature reactivity is needed.**

```typescript
// File: packages/web/src/lib/http-runtime.ts

export const TimelineRuntime = Atom.runtime(
  Layer.mergeAll(
    Reactivity.layer,
    BrowserKeyValueStore.layerLocalStorage,
    FetchHttpClient.layer,
    TimelineKVS.Default,
    AlbumBarWorkerClient.Default,
    SearchWorkerClient.Default // ADD THIS
  )
)
```

Then update search atoms:

```typescript
// File: packages/web/src/atoms/search-worker.ts

// DELETE SearchWorkerRuntime

// Use TimelineRuntime instead
export const searchArtistAtom = Atom.family((query: string) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const searchWorker = yield* SearchWorkerClient
      return yield* searchWorker.searchArtist(query)
    })
  ).pipe(Atom.withReactivity([`search:artist:${query}`]))
)
```

**Benefits:**
- ✅ Single runtime (simpler)
- ✅ Cross-feature reactivity possible
- ✅ Shared Reactivity.layer

**Caveats:**
- ⚠️ Larger runtime (more services loaded)
- ⚠️ May not need cross-feature reactivity yet

**Decision Point:** Is cross-feature reactivity (search → timeline, timeline → search) needed?

**Estimated Effort:** 2 hours (if proceeding)
**Files Changed:** 2 (`http-runtime.ts`, `search-worker.ts`)

---

## P3: Cleanup and Documentation (Low Risk, Low Impact)

### P3.1: Document Runtime Architecture

**Issue:** Runtime separation rationale not documented
- **File:** `packages/web/src/lib/http-runtime.ts:254`
- **Risk:** None (documentation only)
- **Impact:** Low (developer experience)

**Proposed Solution:**

Add comprehensive JSDoc:

```typescript
/**
 * TimelineRuntime - Main application runtime for timeline features
 *
 * Provides the following services:
 * - Reactivity.layer: Reactive atom invalidation
 * - BrowserKeyValueStore.layerLocalStorage: localStorage persistence
 * - FetchHttpClient.layer: HTTP client for API requests
 * - TimelineKVS.Default: Key-value store for play data
 * - AlbumBarWorkerClient.Default: Web worker for album artwork
 *
 * Architecture Decision:
 * SearchWorkerClient uses a separate SearchWorkerRuntime because it has
 * non-overlapping service dependencies. Runtimes should be split when:
 * 1. Features have distinct service requirements
 * 2. Features don't need cross-state reactivity
 * 3. Loading all services would impact performance
 *
 * Cross-runtime communication happens via:
 * - URL params (timelineParamsAtom, search query params)
 * - Shared atoms that don't require runtime services
 * - Browser events (if needed)
 *
 * Related: SearchWorkerRuntime in atoms/search-worker.ts
 */
export const TimelineRuntime = Atom.runtime(
  Layer.mergeAll(
    Reactivity.layer,
    BrowserKeyValueStore.layerLocalStorage,
    FetchHttpClient.layer,
    TimelineKVS.Default,
    AlbumBarWorkerClient.Default
  )
)
```

**Benefits:**
- ✅ Documents rationale
- ✅ Guides future decisions
- ✅ Onboarding aid

**Estimated Effort:** 30 minutes
**Files Changed:** 1 (`http-runtime.ts`)

---

### P3.2: Add Effect.log Observability

**Issue:** No structured logging for atom operations
- **Files:** All atom files
- **Risk:** Low (logging only)
- **Impact:** Low (debugging aid)

**Proposed Solution:**

Add Effect.logInfo/logDebug to key operations:

```typescript
// Example: timeline.ts
export const playsChunkAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    yield* Effect.logDebug("Fetching plays chunk")

    const timelineKVS = yield* TimelineKVS
    const chunk = yield* timelineKVS.getPlaysChunk()

    yield* Effect.logInfo(`Loaded ${Chunk.size(chunk)} plays from KVS`)

    return chunk
  })
).pipe(Atom.withReactivity(["timeline:plays_chunk"]))

// Example: kexp-atoms.ts
const _programsAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    yield* Effect.logDebug("Fetching KEXP programs")

    const apiService = yield* KexpApiService
    const response = yield* apiService.fetchPrograms

    yield* Effect.logInfo(`Loaded ${response.results.length} KEXP programs`)

    return HashMap.fromIterable(
      response.results.map((p) => [p.id, p] as const)
    )
  }).pipe(Effect.cachedWithTTL("24 hours"))
)
```

**Benefits:**
- ✅ Structured logs for debugging
- ✅ Performance metrics (with Effect.withSpan)
- ✅ Production observability

**Estimated Effort:** 1 hour
**Files Changed:** 3-4 atom files

---

## Implementation Roadmap

### Week 1: Critical Fixes (P0)

**Day 1-2:**
- [ ] P0.1: Fix Effect.cached anti-pattern (30 min)
- [ ] P0.2: Fix chunk invalidation (45 min)
- [ ] P0.3: Remove PullAtom (5 min)
- [ ] Test all changes (2 hours)
- [ ] Create commit: "refactor(atoms): fix caching patterns and invalidation"

**Day 3-4:**
- [ ] P1.1: Consolidate show boundary computation (2 hours)
- [ ] Test show boundaries in Timeline and PlayDetailsPanel (1 hour)
- [ ] Create commit: "refactor(atoms): consolidate show boundary computation"

**Day 5:**
- [ ] P1.3: Cache reconstructed chunks (1 hour)
- [ ] Test localStorage caching behavior (1 hour)
- [ ] Create commit: "perf(atoms): cache reconstructed play chunks"

**Week 1 Total:** ~8 hours, 3 commits

---

### Week 2: High-Value Consolidation (P1)

**Day 1-3:**
- [ ] P1.2: Expose Result atoms, remove loading/error atoms (3 hours)
  - [ ] Audit all component usages of loading/error atoms
  - [ ] Update components to use Result.matchWithWaiting
  - [ ] Remove 4 atoms from kexp-atoms.ts
  - [ ] Test loading and error states
- [ ] Create commit: "refactor(atoms): expose Result atoms, simplify state"

**Day 4:**
- [ ] P2.3: Consolidate sorted atoms (2 hours)
- [ ] Test backward compatibility (1 hour)
- [ ] Create commit: "refactor(atoms): consolidate sorted atoms with families"

**Day 5:**
- [ ] P3.1: Document runtime architecture (30 min)
- [ ] P3.2: Add Effect.log observability (1 hour)
- [ ] Create commit: "docs(atoms): document runtime architecture and add logging"

**Week 2 Total:** ~8 hours, 3 commits

---

### Future (P2 - As Needed)

- [ ] P2.1: Request-driven timeline fetching (4 hours)
  - Only if manual refresh or cursor navigation is needed
  - Decision point: Wait for user requirement

- [ ] P2.2: Integrate KEXP cache service (3 hours OR delete in 15 min)
  - Decision: Delete kexp-cache.ts after P0.1 is done
  - Effect.cachedWithTTL is sufficient

- [ ] P2.4: Merge SearchWorkerClient (2 hours)
  - Only if cross-feature reactivity is needed
  - Decision point: Wait for user requirement

---

## Risk Mitigation

### High-Risk Changes
- **P1.2 (Expose Result atoms):** Requires component updates
  - Mitigation: Audit all usages first, test each component
  - Rollback plan: Keep old atoms temporarily, gradual migration

### Medium-Risk Changes
- **P2.1 (Request-driven fetch):** May conflict with polling
  - Mitigation: Add deduplication, test concurrent fetches
  - Rollback plan: Keep as separate feature, don't integrate with polling

- **P2.4 (Merge runtimes):** Large architectural change
  - Mitigation: Comprehensive testing, performance profiling
  - Rollback plan: Git revert, runtime merge is single commit

### Testing Strategy for All Changes

1. **Unit Tests:**
   - Atom computations (memoization, reactivity)
   - Effect caching (TTL behavior)
   - Result matching (all branches)

2. **Integration Tests:**
   - Timeline component rendering
   - Show boundary markers
   - KEXP data loading states

3. **Manual Testing:**
   - Clear cache, refresh
   - Network offline, online
   - URL param changes
   - Dev tools memory profiling

4. **Performance Tests:**
   - Measure reconstruction time
   - Count unnecessary re-renders
   - Profile atom subscription overhead

---

## Success Metrics

**Before:**
- 7 atom files
- 21+ atoms
- 4 redundant loading/error atoms
- 3x duplicated boundary logic
- Module-scoped caches (memory leak risk)
- 8 atoms for simple sorts

**After Phase 1 (P0 + P1.1 + P1.3):**
- 7 atom files
- 18 atoms (-3: PullAtom, 2 duplicate boundary helpers)
- 1 boundary implementation (from 3)
- Runtime-scoped caches with TTL
- Cached chunk reconstruction

**After Phase 2 (P1.2 + P2.3 + P3):**
- 7 atom files
- 12 atoms (-4 loading/error, -6 sorted + 2 families)
- Idiomatic Result exposure
- Consolidated families
- Documented architecture

**Quantitative Goals:**
- 40% reduction in atom count (21 → 12)
- 100% elimination of duplicate logic
- 0 module-scoped caches
- 100% of atoms use Effect best practices

**Qualitative Goals:**
- More maintainable (single source of truth)
- More flexible (Result exposure, families)
- More idiomatic (Effect patterns throughout)
- Better documented (runtime rationale clear)

---

## Decision Points

Before proceeding, please decide:

1. **P1.2 (Result atoms):** Proceed with component changes? Or keep loading/error atoms?
2. **P2.1 (Request-driven fetch):** Is manual refresh needed? Or enhance polling instead?
3. **P2.2 (KEXP cache):** Delete kexp-cache.ts or wire up localStorage persistence?
4. **P2.4 (Merge runtimes):** Is cross-feature reactivity needed? Or keep separate?

Recommended: **Start with P0 (all), P1.1, P1.3 (safe, high-impact) and defer others until needed.**

---

## Files Requiring Changes

### Phase 1 (P0 + P1.1 + P1.3)

| File | Changes | Lines | Risk |
|------|---------|-------|------|
| `packages/web/src/atoms/kexp-atoms.ts` | Fix caching, consolidate boundaries | ~50 | Low |
| `packages/web/src/atoms/timeline.ts` | Update boundary atom, remove PullAtom | ~20 | Low |
| `packages/web/src/hooks/use-kexp-data.ts` | Update hook to delegate to atom | ~10 | Low |
| `packages/web/src/lib/http-runtime.ts` | Fix invalidation, cache reconstruction | ~30 | Low |

**Total:** 4 files, ~110 lines changed

### Phase 2 (P1.2 + P2.3 + P3)

| File | Changes | Lines | Risk |
|------|---------|-------|------|
| `packages/web/src/atoms/kexp-atoms.ts` | Expose Result, remove 4 atoms | ~40 | Medium |
| `packages/web/src/atoms/timeline.ts` | Consolidate sorted atoms | ~60 | Low |
| `packages/web/src/lib/http-runtime.ts` | Add documentation | ~30 | None |
| Components (TBD) | Update Result usage | ~20/each | Medium |

**Total:** 3-6 files, ~150-250 lines changed

---

## Appendix: Effect Patterns Reference

### Pattern 1: Effect.cachedWithTTL
```typescript
const cachedEffect = Effect.gen(function* () {
  // expensive computation
}).pipe(Effect.cachedWithTTL("24 hours"))
```

### Pattern 2: Result Composition
```typescript
return Result.all([result1, result2]).pipe(
  Result.map(([r1, r2]) => combine(r1, r2))
)
```

### Pattern 3: Atom.family
```typescript
export const paramAtom = Atom.family((param: Type) =>
  Atom.make((get) => {
    // computation using param
  })
)
```

### Pattern 4: Result.matchWithWaiting
```typescript
return Result.matchWithWaiting(result, {
  onWaiting: () => /* loading */,
  onSuccess: (s) => /* success */,
  onError: (e) => /* error */,
  onDefect: (d) => /* defect */
})
```

### Pattern 5: Reactivity.invalidate
```typescript
yield* Reactivity.invalidate([
  "namespace:key",
  `namespace:item:${id}`
])
```

---

**End of Refactor Plan**

Next step: Review priorities, approve scope, begin implementation.
