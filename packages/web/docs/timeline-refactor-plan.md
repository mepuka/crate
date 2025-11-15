# Timeline Atom Simplification Plan

## References

- [Effect Atom – keepAlive & reactivity](https://tim-smart.github.io/effect-atom/docs/atom)
- [Effect Atom React hooks](https://tim-smart.github.io/effect-atom/docs/atom-react)
- Existing context in `packages/web/src/atoms/timeline.ts` and `packages/web/src/components/Timeline.tsx`

## Current Flow (High-Level)

```
fetchTimelineEffect ──► timelineFetchAtom (Result)
                      └─► timelineStreamAtom (Stream<Result>)
timelineStreamSyncAtom ──► timelineAtom (Atom.kvs persisted)
initialTimelineFetchAtom ──► timelineAtom + streaming sync
Timeline component ──► reads timelineAtom + initialTimelineFetchAtom
append/jump atoms ──► mutate timelineAtom manually
```

Key traits:

1. Mixed paradigms: manual `Atom.kvs` persistence plus Result-based fetch atoms.
2. Multiple derived atoms (`timelineStreamSyncAtom`, `initialTimelineFetchAtom`, etc.) introduce circular dependencies and additional logging state.
3. Component must juggle two sources: `timelineAtom` for data and `initialTimelineFetchAtom` for loading/errors.
4. Streaming sync writes into local storage indirectly rather than exposing a single reactive feed.

## Goals

1. **Single Source of Truth**: Timeline UI should be derived from one Result-based atom that already encapsulates loading/error/data (leveraging Effect Atom React hooks).
2. **Streaming-first**: Use the effectful stream (`Stream.fromSchedule(...)`) directly as the atom source instead of manually syncing into a second atom.
3. **Declarative mutations**: Mutations (`append`, `jump`, etc.) should invalidate the reactive query via `Atom.withReactivity` / `reactivityKeys` rather than writing into a store.
4. **Minimal Component State**: `Timeline.tsx` should consume one atom (Result) and optional derived selectors for UI-only needs (e.g., grouping rows), eliminating local `useState` except for transient UI toggles like “Load More” button while in-flight.

## Target Architecture

```
fetchTimelineEffect ─┐
                     │
Stream.schedule refresh ──────► timelineStreamAtom (Result<TimelineResponse>)
                     │
append/jump fn atoms ┴── (reactivity keys: ["timeline"])

timelineViewAtom = timelineStreamAtom.pipe(
  Atom.withReactivity(["timeline"]),
  Atom.keepAlive
)

Timeline component ──► useAtomValue(timelineViewAtom) → Result.match(...) only.
```

Details:

1. Replace `timelineAtom`/`timelineStreamSyncAtom` with a single `timelineViewAtom` built from either:
   - `httpRuntime.atom(fetchTimelineEffect)` composed with `Atom.refreshOnWindowFocus` + `Atom.keepAlive`, or
   - `httpRuntime.pull(timelineFetchStream, { initialValue })` if we prefer streaming semantics with accumulation.
2. Use `Atom.withReactivity(["timeline"])` so that mutations can invalidate the query, per the patterns documented in Effect Atom’s guide.
3. Provide derived selectors (e.g., `timelineRowsAtom`) that map the Result→UI rows to avoid recomputing grouping logic inside the component.
4. Persisted caching can be left to the backend stream; if we still need localStorage, wrap the Result with `Atom.kvs` at the edge, but only as a read-through cache (no manual writes).

## Implementation Steps

1. **Introduce `timelineQueryAtom`**  
   ```ts
   const timelineQueryAtom = httpRuntime.atom(fetchTimelineEffect).pipe(
     Atom.withReactivity(["timeline"]),
     Atom.keepAlive
   )
   ```
   Optionally wrap with `Atom.refreshOnWindowFocus`.

2. **Convert schedule stream into a refetch trigger**  
   Instead of writing into storage, call `get.refresh(timelineQueryAtom)` when the scheduled effect fires (inside a keepAlive atom or via `Atom.makeRefreshOnSignal`). This keeps refetch logic declarative.

3. **Update mutations** (`appendPlaysAtom`, `jumpToPositionAtom`)  
   - Implement them as `httpRuntime.fn(...)` that call the API, then call `get.refresh(timelineQueryAtom)` or leverage `reactivityKeys: ["timeline"]` so successful mutations retrigger the base query automatically.
   - Remove direct writes into local storage.

4. **Simplify Timeline component**  
   - Replace dual atom consumption with `const timelineResult = useAtomValue(timelineQueryAtom)`.
   - Create derived data within atoms (e.g., `timelineRowsAtom`) if grouping logic should not live inside React render.
   - Maintain only transient UI state (loading button) using existing `useAtomSet` + `promiseExit`.

5. **Remove persistence-specific code**  
   - Delete `timelineAtom` (Atom.kvs), `timelineStreamSyncAtom`, `initialTimelineFetchAtom`, and `syncTimelineToStorage`.
   - Ensure `useAtomValue(timelineQueryAtom)` is the only reactive data source for Timeline UI.

6. **Clean up logging & docs**  
   - Replace ad-hoc console logs with a debug helper attached to the new query atom if still needed.
   - Update `REACTIVE_PATTERNS.md` to document the "reactive query" approach for the timeline.

7. **Testing**  
   - Verify automatic refresh works by pausing/resuming the app and confirming `timelineQueryAtom` updates when the schedule fires or when mutations complete.
   - Run `pnpm check` and end-to-end smoke test the Timeline UI.

This plan yields a single reactive query atom feeding the Timeline component, matching the Effect Atom documentation’s recommended pattern and eliminating the current over-engineered state layering.

## Implementation Notes (Current Status)

- `packages/web/src/atoms/timeline.ts` now exports `timelineAtom`, a `Result<TimelineResponse, Error>` derived directly from the HTTP query. It is `keepAlive`-enabled and refreshed automatically every two minutes via `timelineAutoRefreshAtom`.
- The `Timeline` React component (`packages/web/src/components/Timeline.tsx`) relies solely on `timelineAtom` for data and displays loading/error states with `Result.match`.
- Manual persistence (`Atom.kvs`), sync helpers, and `append/jump` mutations have been removed. Future pagination work should be modeled as separate atoms (e.g., URL param atoms) that the query depends on, keeping the UI declarative.
