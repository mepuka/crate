# Timeline Atom Bugs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix race conditions, error handling gaps, and state management issues in timeline atoms.

**Architecture:** These are targeted fixes to existing atoms - no architectural changes. Each fix is isolated and can be tested independently.

**Tech Stack:** Effect-TS, @effect-atom/atom-react, React

---

## Issue Summary

| Priority | Issue | File | Line(s) |
|----------|-------|------|---------|
| HIGH | EntityTimeline load-more missing isError guard | `EntityTimeline.tsx` | 78-92 |
| MEDIUM | Initial load has no in-flight dedupe | `entity-timeline.ts` | 188-227 |
| MEDIUM | streamPlaysAtom ignores streamPlayIdsAtom | `timeline-stream-atoms.ts` | 249-280 |
| MEDIUM | Stream restart/stop doesn't cancel running stream | `timeline-stream-atoms.ts` | 94-219, 221-229 |
| LOW | stopStreamAtom leaves streamPlayIdsAtom intact | `timeline-stream-atoms.ts` | 224-229 |

---

## Task 1: Add isError Guard to EntityTimeline Load-More

**Files:**
- Modify: `packages/web/src/components/EntityTimeline.tsx:78-92`

**Context:** The main `VirtualizedTimeline.tsx` has an `isError` guard at line 91 that prevents load-more calls after an error. EntityTimeline is missing this, causing API hammering when errors occur.

**Step 1: Modify the infinite scroll effect**

Find this code at lines 78-92:

```tsx
// Infinite scroll trigger
useEffect(() => {
  if (!loadingState.hasMore || loadingState.isLoadingMore) {
    return;
  }

  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  if (!lastVirtualItem) {
    return;
  }

  if (playIds.length - lastVirtualItem.index <= LOAD_MORE_THRESHOLD) {
    loadMore();
  }
}, [virtualItems, playIds.length, loadingState.hasMore, loadingState.isLoadingMore, loadMore]);
```

Replace with:

```tsx
// Infinite scroll trigger
useEffect(() => {
  // Don't load more if: no more pages, already loading, or in error state
  if (!loadingState.hasMore || loadingState.isLoadingMore || loadingState.isError) {
    return;
  }

  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  if (!lastVirtualItem) {
    return;
  }

  if (playIds.length - lastVirtualItem.index <= LOAD_MORE_THRESHOLD) {
    loadMore();
  }
}, [virtualItems, playIds.length, loadingState.hasMore, loadingState.isLoadingMore, loadingState.isError, loadMore]);
```

**Step 2: Verify the fix compiles**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/components/EntityTimeline.tsx
git commit -m "fix(EntityTimeline): add isError guard to prevent API hammering after failures"
```

---

## Task 2: Add Initial Load Dedupe to Entity Timeline

**Files:**
- Modify: `packages/web/src/atoms/entity-timeline.ts:188-227`

**Context:** `loadInitialEntityPageAtom` has no guard against concurrent calls. In React 18 Strict Mode (double-mount) or rapid filter toggles, multiple concurrent `loadInitial()` calls can fire, causing duplicate network requests and state churn.

**Step 1: Add status guard at the start of loadInitialEntityPageAtom**

Find this code starting at line 188:

```typescript
export const loadInitialEntityPageAtom = Atom.family((filter: EntityFilter) =>
  TimelineRuntime.fn<void>()((_, get) =>
    Effect.gen(function* () {
      const key = entityFilterKey(filter);

      // Set loading state reactively
      const loadingState: EntityTimelineState = {
```

Replace with (add guard before setting loading state):

```typescript
export const loadInitialEntityPageAtom = Atom.family((filter: EntityFilter) =>
  TimelineRuntime.fn<void>()((_, get) =>
    Effect.gen(function* () {
      const key = entityFilterKey(filter);
      const map = get(entityTimelineStateMapAtom);
      const existingState = map.get(key);

      // Guard: don't load if already loading initial
      if (existingState?.status === "loading-initial") {
        yield* Effect.log(
          `Skipping entity initial load: already loading for ${key}`
        );
        return;
      }

      // Set loading state reactively
      const loadingState: EntityTimelineState = {
```

**Step 2: Verify the fix compiles**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/atoms/entity-timeline.ts
git commit -m "fix(entity-timeline): add dedupe guard for initial load to prevent concurrent requests"
```

---

## Task 3: Fix streamPlaysAtom to Filter by Stream IDs

**Files:**
- Modify: `packages/web/src/atoms/timeline-stream-atoms.ts:249-280`

**Context:** `streamPlaysAtom` claims to expose plays "using stream play IDs" (line 250-251) but actually returns the entire KVS chunk. This causes stream UIs to show stale or non-stream data.

**Step 1: Update streamPlaysAtom to filter by collected stream IDs**

The current `streamPlaysAtom` is an Effect-based atom that returns the entire KVS. Since components use `playAtomFamily(playId)` to get individual plays, `streamPlaysAtom` should return the filtered IDs as a Chunk.

Replace lines 249-263 with:

```typescript
/**
 * Derived atom: Stream play IDs as a Chunk for UI consumption.
 * Components should use these IDs with playAtomFamily to get actual play data.
 * Only returns IDs collected during the current stream session.
 */
export const streamPlaysAtom = Atom.make((get) => {
  const streamStatus = get(streamStatusAtom);
  const streamIds = get(streamPlayIdsAtom);

  // Return empty if stream is off or no IDs collected
  if (streamStatus.status === "off" || streamIds.length === 0) {
    return Chunk.empty<number>();
  }

  return Chunk.fromIterable(streamIds);
});
```

**Step 2: Verify the fix compiles**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/atoms/timeline-stream-atoms.ts
git commit -m "fix(stream-atoms): filter streamPlaysAtom by collected stream IDs"
```

---

## Task 4: Add Fiber Cancellation to Stream Restart/Stop

**Files:**
- Modify: `packages/web/src/atoms/timeline-stream-atoms.ts:68` (add fiber ref atom)
- Modify: `packages/web/src/atoms/timeline-stream-atoms.ts:94-219` (restartStreamAtom)
- Modify: `packages/web/src/atoms/timeline-stream-atoms.ts:224-229` (stopStreamAtom)

**Context:** Each `restartStreamAtom` call spawns a new `Stream.runForEach` without canceling the previous fiber. Multiple overlapping streams write to the same atoms/KVS, causing duplicate entries and race conditions.

**Design Decision:** Use `Effect.forkScoped` for automatic cleanup when the scope closes. Store fiber ref in an atom for manual interruption on restart/stop.

**Step 1: Add Fiber import and fiber ref atom after line 87**

Update the Effect import at line 18:
```typescript
import { Effect, Stream, Chunk, Fiber } from "effect";
```

After `streamStatusAtom` definition (around line 87), add:

```typescript
/**
 * Atom: Reference to running stream fiber (internal)
 * Used to cancel previous stream on restart/stop.
 */
const runningStreamFiberAtom = Atom.make<Fiber.RuntimeFiber<void, unknown> | null>(null);
```

**Step 2: Update restartStreamAtom to cancel previous fiber and use forkScoped**

Replace lines 94-219 with:

```typescript
/**
 * Action atom: Start/restart stream with config.
 * Actually runs the stream and collects results.
 * Uses Effect patterns for proper error handling and fiber management.
 */
export const restartStreamAtom = TimelineRuntime.fn<StreamTimelineConfig>()(
  (config, get) => {
    // Track collected play IDs using a mutable ref that survives across Effect steps
    let collectedIds: number[] = [];

    return Effect.gen(function* () {
      yield* Effect.log(
        `[Stream Atoms] Restarting stream with mode: ${config.mode}`
      );

      // Cancel any existing stream fiber
      const existingFiber = get(runningStreamFiberAtom);
      if (existingFiber !== null) {
        yield* Effect.log("[Stream Atoms] Interrupting previous stream fiber");
        yield* Fiber.interrupt(existingFiber);
        get.set(runningStreamFiberAtom, null);
      }

      // Update config
      get.set(streamTimelineConfigAtom, config);

      // Clear previous results
      get.set(streamPlayIdsAtom, []);
      collectedIds = [];

      // If mode is off, just update status and return
      if (config.mode === "off") {
        get.set(streamStatusAtom, { status: "off" });
        return;
      }

      // Set loading status
      get.set(streamStatusAtom, { status: "loading" });

      // Get KVS for storing plays
      const kvs = yield* TimelineKVS;

      // Create appropriate stream based on mode
      const stream = (() => {
        switch (config.mode) {
          case "pagination": {
            const paginationStream = createTimelinePaginationStream(
              config.paginationParams ?? { limit: 20 }
            );
            // Limit to maxPages if specified
            return config.maxPages
              ? paginationStream.pipe(Stream.take(config.maxPages))
              : paginationStream;
          }
          case "mock-sse":
            return createMockSSEStream(
              config.sseConfig ?? { emitIntervalMs: 2000, maxPlays: 100 }
            );
          case "burst-sse":
            return createBurstMockSSEStream(5, 10000, 100).pipe(
              Stream.take(config.sseConfig?.maxPlays ?? 100)
            );
          default:
            return Stream.empty;
        }
      })();

      // Define the stream processing effect
      const streamEffect = Effect.gen(function* () {
        // Run the stream - handle different types appropriately
        if (config.mode === "pagination") {
          // Pagination mode returns PageResult objects
          const paginationStream = stream as ReturnType<typeof createTimelinePaginationStream>;

          yield* Stream.runForEach(
            paginationStream,
            (pageResult) =>
              Effect.gen(function* () {
                // Extract plays from PageResult
                const plays = pageResult.response.results;

                // Plays are already stored in KVS by the pagination stream
                // Just collect the IDs
                const pageIds = plays.map((play) => play.id);
                collectedIds.push(...pageIds);

                // Update atom with accumulated IDs
                get.set(streamPlayIdsAtom, [...collectedIds]);

                yield* Effect.log(
                  `[Stream Atoms] Collected ${collectedIds.length} plays so far`
                );
              })
          );
        } else {
          // SSE modes return PlayResult objects directly
          const playStream = stream as Stream.Stream<PlayResult, never, never>;

          yield* Stream.runForEach(
            playStream,
            (play) =>
              Effect.gen(function* () {
                // Store play in KVS
                yield* kvs.storePlay(play);

                // Collect ID
                collectedIds.push(play.id);

                // Update atom with accumulated IDs
                get.set(streamPlayIdsAtom, [...collectedIds]);

                yield* Effect.log(
                  `[Stream Atoms] Received play: ${play.artist} - ${play.song} (${collectedIds.length} total)`
                );
              })
          );
        }

        // Stream completed successfully
        get.set(streamStatusAtom, {
          status: "complete",
          count: collectedIds.length,
        });
        get.set(runningStreamFiberAtom, null);

        yield* Effect.log(
          `[Stream Atoms] Stream completed with ${collectedIds.length} plays`
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            // Stream failed - update status with error
            get.set(streamStatusAtom, { status: "error", error });
            get.set(runningStreamFiberAtom, null);
            yield* Effect.logError(
              `[Stream Atoms] Stream failed: ${String(error)}`
            );
          })
        )
      );

      // Fork the stream effect using forkScoped for automatic cleanup
      const fiber = yield* Effect.forkScoped(streamEffect);
      get.set(runningStreamFiberAtom, fiber);

      yield* Effect.log("[Stream Atoms] Stream fiber started");
    });
  }
);
```

**Step 3: Update stopStreamAtom to cancel fiber and clear state**

Replace lines 221-230 with:

```typescript
/**
 * Action atom: Stop stream and clear state
 */
export const stopStreamAtom = TimelineRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    yield* Effect.log("[Stream Atoms] Stopping stream");

    // Cancel any running fiber
    const existingFiber = get(runningStreamFiberAtom);
    if (existingFiber !== null) {
      yield* Effect.log("[Stream Atoms] Interrupting stream fiber");
      yield* Fiber.interrupt(existingFiber);
      get.set(runningStreamFiberAtom, null);
    }

    // Clear all stream state
    get.set(streamTimelineConfigAtom, { ...defaultStreamConfig, mode: "off" });
    get.set(streamStatusAtom, { status: "off" });
    get.set(streamPlayIdsAtom, []);
  })
);
```

**Step 4: Verify the fix compiles**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/web/src/atoms/timeline-stream-atoms.ts
git commit -m "fix(stream-atoms): cancel existing fiber on restart/stop to prevent overlapping streams"
```

---

## Task 5: Clear streamPlayIdsAtom in stopStreamAtom (Already Done in Task 4)

This was included in Task 4's `stopStreamAtom` update which now includes:
```typescript
get.set(streamPlayIdsAtom, []);
```

No additional changes needed.

---

## Verification

After all tasks, run the full type check:

```bash
pnpm --filter @crate/web exec tsc --noEmit
```

And run the dev server to verify the UI still works:

```bash
pnpm --filter @crate/web dev
```

---

## Open Questions (Documented for Future Reference)

1. **Entity timelines + live updates:** Should entity timelines merge in live plays from streams? Current design uses separate pagination - this appears intentional for entity pages to show complete historical data.

2. **Stream data isolation:** Current fix uses filtering by `streamPlayIdsAtom` (Option A). Alternative would be separate KVS namespace (Option B) for complete isolation if needed later.
