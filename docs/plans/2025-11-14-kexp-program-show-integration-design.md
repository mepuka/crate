# KEXP Program & Show Integration Design

**Date:** 2025-11-14
**Status:** Approved for Implementation
**Scope:** Frontend-only with localStorage caching

## Overview

Integrate KEXP program and show metadata into the Crate frontend to enable subtle visual indicators of show transitions in the timeline. This enhancement adds information density while maintaining the minimal, aesthetic design language.

## Goals

1. Fetch and cache KEXP programs and shows data from the public API
2. Enrich play data with program/show metadata
3. Display subtle visual markers for show transitions in the timeline
4. Maintain non-blocking, reactive data flow using workers
5. Enable future features (filtering, host info, program branding)

## Non-Goals (for MVP)

- Database storage of programs/shows (frontend-only)
- Complete historical show data (fetch recent shows only)
- Host photos and detailed information
- Program filtering or advanced search
- Backfilling existing play records

## Architecture

### Dedicated KEXP Data Worker

Create a new web worker following the established pattern (similar to `album-bar-worker`):

**Components:**
- **Worker**: `packages/web/src/workers/kexp-data-worker.ts`
- **Protocol**: `packages/web/src/workers/kexp-data-worker-protocol.ts`
- **Client**: `packages/web/src/services/kexp-data-client.ts`
- **Schemas**: Reuse `@crate/domain/kexp/schemas` (already defined)

**Rationale:** Clean separation of concerns, follows existing worker pattern, enables background processing without blocking main thread.

### Data Flow

```
App Init
  ↓
Client spawns worker
  ↓
Worker checks localStorage cache
  ↓
[Cache exists] → Emit cached data immediately
  ↓
Background: Fetch from KEXP API
  ↓
Update cache + Emit fresh data
  ↓
Main thread receives updates
  ↓
Atoms update → UI re-renders
```

**Progressive Enhancement:**
- UI starts with basic play data
- Show transition markers appear when KEXP data arrives
- No loading spinners or blocking states

## KEXP API Integration

### Effect Service Implementation

Full Effect service with proper error handling and retry policies:

```typescript
class KexpApiService extends Context.Tag("KexpApiService")<
  KexpApiService,
  {
    readonly fetchPrograms: Effect.Effect<KexpProgramsResponse, NetworkError | ParseError>
    readonly fetchShows: (limit: number) => Effect.Effect<KexpShowsResponse, NetworkError | ParseError>
    readonly fetchShowById: (id: number) => Effect.Effect<KexpShow, NetworkError | ParseError | NotFound>
  }
>() {}
```

**Retry Policy:**
- Exponential backoff starting at 100ms
- Max 3 retries
- Respect HTTP 429 rate limits

### API Endpoints

- **Programs**: `GET https://api.kexp.org/v2/programs/?format=json`
  - Complete dataset (~100 records)
  - No pagination needed

- **Shows**: `GET https://api.kexp.org/v2/shows/?format=json&limit=200`
  - Recent shows (covers 1-2 weeks)
  - Paginated (implement "fetch more" later for infinite scroll)

### Error Handling

- **Network errors**: Retry with backoff, fall back to cache
- **Parse errors**: Log error, return cached data
- **API unavailable**: Continue with stale cache, retry in background

## Data Storage & Caching

### LocalStorage Schema

```typescript
// localStorage keys
const CACHE_KEYS = {
  programs: "kexp:programs",
  shows: "kexp:shows",
  lastUpdate: "kexp:last-update"
}

// Stored as JSON
type CachedPrograms = {
  data: Map<number, KexpProgram>,
  timestamp: string
}

type CachedShows = {
  data: Map<number, KexpShow>,
  timestamp: string
}
```

**Cache Invalidation:**
- Programs: 24 hours (infrequent changes)
- Shows: 1 hour (new shows added regularly)
- Explicit refresh on user action (future)

### Lookup Maps

Build efficient lookup structures in worker:

```typescript
// showId → Show
const showsMap = new Map<number, KexpShow>()

// programId → Program
const programsMap = new Map<number, KexpProgram>()

// Derived: showId → Program (via show.program)
const showToProgramMap = new Map<number, KexpProgram>()
```

## Worker Protocol

### Message Types

**Requests (Main → Worker):**
```typescript
const FetchProgramsRequest = Schema.Struct({
  type: Schema.Literal("fetch-programs")
})

const FetchShowsRequest = Schema.Struct({
  type: Schema.Literal("fetch-shows"),
  limit: Schema.Number
})

const GetShowInfoRequest = Schema.Struct({
  type: Schema.Literal("get-show-info"),
  showId: Schema.Number
})
```

**Responses (Worker → Main):**
```typescript
const ProgramsData = Schema.Struct({
  type: Schema.Literal("programs-data"),
  programs: Schema.Array(KexpProgram),
  cached: Schema.Boolean
})

const ShowsData = Schema.Struct({
  type: Schema.Literal("shows-data"),
  shows: Schema.Array(KexpShow),
  cached: Schema.Boolean
})

const ShowInfo = Schema.Struct({
  type: Schema.Literal("show-info"),
  show: Schema.NullOr(KexpShow),
  program: Schema.NullOr(KexpProgram)
})
```

## Data Enrichment

### Play Enrichment Strategy

Enrich play objects with show/program metadata when rendering:

```typescript
type EnrichedPlay = Play & {
  show_info?: KexpShow,
  program_info?: KexpProgram
}

const enrichPlay = (
  play: Play,
  showsMap: Map<number, KexpShow>,
  programsMap: Map<number, KexpProgram>
): EnrichedPlay => ({
  ...play,
  show_info: showsMap.get(play.show),
  program_info: play.show
    ? programsMap.get(showsMap.get(play.show)?.program)
    : undefined
})
```

**When to Enrich:**
- In worker before posting to main thread, OR
- In main thread when combining play data with KEXP atoms
- Decision: Main thread enrichment (simpler, more flexible)

## Reactive State Management

### Composable Atom Pattern

```typescript
// Base atoms (raw data stores)
const programsAtom = atom<Map<number, KexpProgram>>(new Map())
const showsAtom = atom<Map<number, KexpShow>>(new Map())

// Derived atoms (computed values)
const showTransitionsAtom = atom((get) => {
  const shows = get(showsAtom)
  return computeShowTransitions(shows)
})

// Composable hooks
export const useShowInfo = (showId: number) => {
  const [shows] = useAtom(showsAtom)
  const [programs] = useAtom(programsAtom)

  return createMemo(() => {
    const show = shows().get(showId)
    const program = show ? programs().get(show.program) : undefined
    return { show, program }
  })
}

export const useProgramForShow = (showId: number) => {
  const { program } = useShowInfo(showId)
  return program
}
```

**Benefits:**
- Components subscribe only to data they need
- Fine-grained reactivity (only re-render affected components)
- Composable patterns enable feature iteration
- Type-safe access to program/show metadata

## UI Integration

### Show Transition Detection

Compute show boundaries from play timeline:

```typescript
const showBoundaries = createMemo(() => {
  const plays = playsAtom()
  const shows = showsAtom()

  return plays.reduce((boundaries, play, idx) => {
    const prevPlay = plays[idx - 1]
    const isNewShow = !prevPlay || prevPlay.show !== play.show

    if (isNewShow) {
      const showInfo = shows.get(play.show)
      boundaries.push({
        timestamp: play.airdate,
        showId: play.show,
        programName: showInfo?.program_name,
        programId: showInfo?.program,
        hostNames: showInfo?.host_names
      })
    }
    return boundaries
  }, [])
})
```

### Visual Elements (Minimal & Subtle)

**1. Show Transition Marker**
- Thin vertical line at show boundary
- Subtle opacity to maintain clean aesthetic
- Optional: minimal badge with program name

**2. Program Color Accent (Future)**
- Extract dominant color from program image
- Apply as very subtle background tint
- Smooth gradient transitions between shows

**3. Timeline Markers**
```tsx
<For each={showBoundaries()}>
  {(boundary) => (
    <div class="show-transition" data-show-id={boundary.showId}>
      <div class="transition-line" />
      <span class="program-badge">{boundary.programName}</span>
    </div>
  )}
</For>
```

**Styling Approach:**
- CSS variables for program-specific colors
- Opacity-based layering (0.05-0.1 alpha)
- Smooth transitions when data arrives
- Mobile-responsive marker sizing

## Implementation Phases

### Phase 1: Foundation (MVP)
1. Create worker + protocol + client boilerplate
2. Implement KEXP API Effect service in worker
3. Add localStorage cache layer
4. Build programs/shows atoms in main thread
5. Wire worker messages to update atoms

### Phase 2: Enrichment
1. Implement show transition detection
2. Create composable hooks (useShowInfo, useProgramForShow)
3. Add enrichment to play rendering pipeline
4. Test with real KEXP API data

### Phase 3: Visual Integration
1. Add show transition markers to timeline
2. Style markers (minimal, subtle)
3. Add program name badges
4. Polish animations and transitions

### Phase 4: Polish & Performance
1. Implement cache expiry logic
2. Add background refresh strategy
3. Optimize lookup map performance
4. Add error boundaries and fallback UI

### Future Enhancements (Post-MVP)
- Infinite scroll pagination for shows
- Host photos and information
- Program filtering and search
- Program color extraction and theming
- Detailed program pages
- Show schedule visualization

## Technical Considerations

### Worker Context Limitations

Web workers cannot directly access:
- DOM
- LocalStorage (need to proxy via main thread)
- Some browser APIs

**Solution:** Use shared worker or proxy localStorage access through main thread messages.

**Decision:** Proxy approach for MVP (simpler), migrate to shared worker if needed.

### Performance Targets

- Initial cache read: <10ms
- KEXP API fetch: <500ms (network dependent)
- Show boundary computation: <50ms for 1000 plays
- Atom updates: <16ms (60fps UI)

### Bundle Size Impact

- Effect schemas already in bundle (no cost)
- Worker code: ~10-15kb minified
- KEXP data: ~50-100kb JSON (cached, not in bundle)

**Total impact:** ~15kb to main bundle

## Dependencies

**Existing:**
- Effect-TS (already in project)
- @crate/domain/kexp/schemas (already defined)
- Solid.js + jotai-like atoms (established pattern)
- Worker infrastructure (established pattern)

**New:**
- None (use existing infrastructure)

## Risks & Mitigations

### Risk: KEXP API Downtime
**Mitigation:** Cache-first strategy, graceful degradation, stale data acceptable

### Risk: Cache Corruption
**Mitigation:** Schema validation on cache reads, clear cache on error

### Risk: Performance on Large Datasets
**Mitigation:** Pagination, virtual scrolling, lazy enrichment

### Risk: Worker Communication Overhead
**Mitigation:** Batch messages, optimize serialization, use Transfer objects for large data

## Success Metrics

- Show transition markers visible in timeline
- No UI blocking or jank during data load
- Cache hit rate >80% on repeat visits
- KEXP API call volume <100/day per user
- Bundle size increase <20kb

## References

- KEXP API Docs: https://api.kexp.org/v2/?format=api
- KEXP Programs: https://api.kexp.org/v2/programs/?format=api
- Python Models: `faiss-search-api/app/kexp_models.py`
- TypeScript Schemas: `packages/server/src/kexp/schemas.ts`
- Existing Worker Pattern: `packages/web/src/workers/album-bar-worker.ts`

---

**Next Steps:**
1. Create git worktree for isolated development
2. Generate detailed implementation plan
3. Begin Phase 1: Foundation
