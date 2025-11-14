# KEXP Integration

This document describes the integration with the KEXP API for fetching programs and shows data to enrich the timeline with show information.

## Overview

The KEXP integration provides:
- Program information (show formats like "Variety Mix", "World Music", etc.)
- Show details (specific instances with hosts and timeslots)
- Automatic caching with TTL-based invalidation
- Worker-based architecture for non-blocking data fetching
- Show transition markers in the timeline UI

## Architecture

### Components

```
┌─────────────────────────────────────────────────────┐
│                   Main Thread                        │
├─────────────────────────────────────────────────────┤
│  App.tsx                                             │
│    └─ useKexpDataSync() ──────────────┐            │
│                                         │            │
│  Timeline Components                    │            │
│    └─ useAtomValue(showsMapAtom)       │            │
│    └─ useAtomValue(programsMapAtom)    │            │
│                                         ▼            │
│  ┌────────────────────────────────────────┐         │
│  │  KEXP Atoms (kexp-atoms.ts)            │         │
│  │  - programsMapAtom                     │         │
│  │  - showsMapAtom                        │         │
│  │  - showToProgramMapAtom (derived)      │         │
│  │  - loading/error atoms                 │         │
│  └────────────────────────────────────────┘         │
│                    ▲                                 │
│                    │ message events                  │
│  ┌────────────────────────────────────────┐         │
│  │  KexpDataClient (kexp-data-client.ts)  │         │
│  │  - Singleton worker client             │         │
│  │  - Message-based communication         │         │
│  │  - Promise-based API                   │         │
│  └────────────────────────────────────────┘         │
│                    │ postMessage                     │
└────────────────────┼─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│               Web Worker Thread                       │
├─────────────────────────────────────────────────────┤
│  kexp-data-worker.ts                                 │
│    └─ KexpDataService                                │
│          ├─ fetchPrograms() ──┐                     │
│          ├─ fetchShows()      │                     │
│          └─ getShowInfo()     │                     │
│                                ▼                     │
│          ┌─────────────────────────────┐            │
│          │  Cache Strategy             │            │
│          │  1. loadFromCache()         │            │
│          │  2. if valid, return        │            │
│          │  3. else, fetch from API    │            │
│          │  4. saveToCache()           │            │
│          └─────────────────────────────┘            │
│                    │                                 │
│                    ├─ kexp-cache.ts (localStorage)  │
│                    │    - Programs: 24h TTL         │
│                    │    - Shows: 1h TTL             │
│                    │                                 │
│                    └─ kexp-api-service.ts           │
│                         - HTTP requests             │
│                         - Schema validation         │
│                         - Retry logic               │
└─────────────────────────────────────────────────────┘
```

### Data Flow

1. **Initialization** (App mount)
   - `useKexpDataSync()` creates KexpDataClient singleton
   - Subscribes to worker messages
   - Sets loading states to `true`
   - Sends `fetch-programs` and `fetch-shows` requests to worker

2. **Worker Processing**
   - Worker receives request
   - Checks localStorage cache first
   - If cache valid (within TTL), returns cached data immediately
   - If cache miss/expired, fetches from KEXP API
   - Saves fresh data to cache
   - Sends response message to main thread

3. **Main Thread Update**
   - KexpDataClient receives worker message
   - Calls atom update functions (e.g., `updatePrograms()`)
   - Atoms trigger React re-renders
   - Timeline components display show markers

## Key Files

### Main Thread

- **kexp-atoms.ts**: Reactive state management for KEXP data
  - Backing store pattern with version-based invalidation
  - Maps: `programsMapAtom`, `showsMapAtom`
  - Derived: `showToProgramMapAtom`
  - Loading/error atoms for UI feedback

- **kexp-sync.ts**: Hook to sync worker data with atoms
  - Initializes worker on mount
  - Subscribes to worker messages
  - Updates atoms when data arrives
  - Handles error states

- **kexp-data-client.ts**: Worker client singleton
  - Wraps Web Worker API
  - Message-based request/response
  - Promise-based API for convenience
  - 30-second timeout protection

### Worker Thread

- **kexp-data-worker.ts**: Main worker implementation
  - Effect-based service architecture
  - In-memory HashMaps for fast lookups
  - Type-safe message handling with Schema validation

- **kexp-api-service.ts**: HTTP API client
  - Effect HttpClient integration
  - Exponential backoff retry (3 attempts)
  - Schema validation with ParseError handling
  - NetworkError for connection issues

- **kexp-cache.ts**: localStorage caching
  - Programs: 24-hour TTL (static data)
  - Shows: 1-hour TTL (semi-dynamic data)
  - Automatic expiration and cleanup
  - Corruption recovery

## Cache Strategy

### TTL (Time To Live)

```typescript
CACHE_TTL = {
  PROGRAMS: 24 * 60 * 60 * 1000, // 24 hours
  SHOWS: 60 * 60 * 1000           // 1 hour
}
```

**Rationale:**
- Programs change infrequently (new show formats added rarely)
- Shows are more dynamic (schedule updates, new episodes)
- Balance between freshness and API load

### Cache Storage

```typescript
// localStorage keys
"kexp-cache:programs" -> { data: KexpProgram[], timestamp: number }
"kexp-cache:shows"    -> { data: KexpShow[], timestamp: number }
```

### Cache Flow

```
Request
  │
  ├─ Check cache exists?
  │    ├─ No  ──► Fetch from API ──► Save to cache ──► Return
  │    └─ Yes ──► Check timestamp valid?
  │               ├─ Yes ──► Return cached data
  │               └─ No  ──► Clear cache ──► Fetch from API ──► Save ──► Return
```

## Usage

### Basic Usage

The integration is automatic. Simply include the sync hook in your app:

```tsx
import { useKexpDataSync } from '@/atoms/kexp-sync'

function App() {
  // Initialize KEXP data sync (fetches programs and shows)
  useKexpDataSync()

  return <RouterProvider router={router} />
}
```

### Accessing KEXP Data

```tsx
import { useAtomValue } from '@effect-atom/atom-react'
import { programsMapAtom, showsMapAtom } from '@/atoms/kexp-atoms'

function MyComponent() {
  const programs = useAtomValue(programsMapAtom)
  const shows = useAtomValue(showsMapAtom)

  // programs: Map<number, KexpProgram>
  // shows: Map<number, KexpShow>

  const program = programs.get(programId)
  const show = shows.get(showId)

  return (
    <div>
      <h1>{program?.name}</h1>
      <p>{show?.host_names.join(', ')}</p>
    </div>
  )
}
```

### Using Hooks

```tsx
import { useShowInfo, useProgramForShow } from '@/hooks/use-kexp-data'

function ShowCard({ showId }: { showId: number }) {
  // Get both show and program in one call
  const { show, program } = useShowInfo(showId)

  // Or just get the program
  const program = useProgramForShow(showId)

  if (!show) return <div>Loading...</div>

  return (
    <div>
      <h2>{program?.name}</h2>
      <p>Hosts: {show.host_names.join(', ')}</p>
    </div>
  )
}
```

### Show Boundaries

Show boundaries mark where show transitions occur in the timeline:

```tsx
import { useAtomValue } from '@effect-atom/atom-react'
import { playIdToBoundaryMapAtom } from '@/atoms/timeline'

function TimelineItem({ playId }: { playId: number }) {
  const boundaryMap = useAtomValue(playIdToBoundaryMapAtom)
  const boundary = Result.matchWithWaiting(boundaryMap, {
    onWaiting: () => undefined,
    onSuccess: (s) => s.value.get(playId)
  })

  return (
    <>
      {boundary && (
        <ShowTransitionMarker
          timestamp={boundary.timestamp}
          programName={boundary.programName}
          hostNames={boundary.hostNames}
        />
      )}
      <PlayCard playId={playId} />
    </>
  )
}
```

## Loading and Error States

### Loading States

```tsx
import { useAtomValue } from '@effect-atom/atom-react'
import {
  programsLoadingAtom,
  showsLoadingAtom,
  programsErrorAtom,
  showsErrorAtom
} from '@/atoms/kexp-atoms'

function StatusIndicator() {
  const programsLoading = useAtomValue(programsLoadingAtom)
  const showsLoading = useAtomValue(showsLoadingAtom)
  const programsError = useAtomValue(programsErrorAtom)
  const showsError = useAtomValue(showsErrorAtom)

  if (programsLoading || showsLoading) {
    return <Spinner />
  }

  if (programsError || showsError) {
    return <ErrorBanner message={programsError || showsError} />
  }

  return <SuccessIndicator />
}
```

### Error Handling

Errors are handled at multiple levels:

1. **Network Level** (kexp-api-service.ts)
   - Retry with exponential backoff (3 attempts)
   - NetworkError for connection failures
   - ParseError for invalid API responses

2. **Worker Level** (kexp-data-worker.ts)
   - Effect.either to capture errors
   - Structured error messages sent to main thread
   - No worker crashes on API failures

3. **UI Level** (kexp-sync.ts)
   - Sets error atoms when worker reports failures
   - Clears loading states
   - Logs errors to console

## Performance Optimizations

### 1. Worker-Based Architecture

Data fetching happens off the main thread, keeping the UI responsive.

### 2. Efficient Lookups

```typescript
// O(1) lookups with HashMaps (worker) and Maps (main thread)
programsMap: HashMap<number, KexpProgram>
showsMap: HashMap<number, KexpShow>
showToProgramMap: HashMap<number, number>  // show ID -> program ID
```

### 3. Derived Atoms

```typescript
// Computed once, cached until dependencies change
export const showToProgramMapAtom = Atom.make((get) => {
  const shows = get.get(showsMapAtom)
  const programs = get.get(programsMapAtom)
  // Build lookup map...
})
```

### 4. No Duplicate Requests

- Singleton KexpDataClient ensures only one worker instance
- `useKexpDataSync()` with empty deps array runs once per app mount
- Cache prevents redundant API calls

### 5. Cache-First Strategy

- Check localStorage before network
- Instant load from cache (perceived performance)
- Background refresh when cache expires

## Data Types

### KexpProgram

```typescript
interface KexpProgram {
  id: number
  name: string
  description: string
  tags: string
  image_uri: string
  thumbnail_uri: string
}
```

Examples: "Variety Mix", "World Music", "Overnight Electronic", "Audioasis"

### KexpShow

```typescript
interface KexpShow {
  id: number
  program: number              // program ID
  program_name: string
  program_tags: string
  host_names: readonly string[]
  hosts: readonly number[]
  tagline: string
  image_uri: string
}
```

A specific instance of a program with hosts and schedule information.

### ShowBoundary

```typescript
interface ShowBoundary {
  timestamp: Date | string
  showId: number
  programName?: string
  programId?: number
  hostNames?: readonly string[]
}
```

Marks a show transition in the timeline.

## Troubleshooting

### Issue: No show markers appearing

**Check:**
1. Are programs and shows loaded?
   ```typescript
   const programs = useAtomValue(programsMapAtom)
   const shows = useAtomValue(showsMapAtom)
   console.log('Programs:', programs.size)
   console.log('Shows:', shows.size)
   ```

2. Do plays have show IDs?
   ```typescript
   const play = useAtomValue(playAtom(playId))
   console.log('Play show ID:', play?.show)
   ```

3. Is the show ID in the shows map?
   ```typescript
   const show = shows.get(play.show)
   console.log('Show:', show)
   ```

### Issue: Stale data

**Solution:** Clear cache and reload
```typescript
// Clear cache programmatically
localStorage.removeItem('kexp-cache:programs')
localStorage.removeItem('kexp-cache:shows')

// Or use DevTools > Application > localStorage > Clear All
```

### Issue: Worker errors in console

**Check:**
1. Network connectivity to KEXP API
2. CORS headers (should be fine, KEXP API has CORS enabled)
3. Browser console for specific error messages

**Debug:**
```typescript
// Enable detailed logging in worker
// In kexp-data-worker.ts, Effect logs are visible in console
```

### Issue: Performance degradation

**Check:**
1. Cache hit rate
   ```typescript
   const programsCached = useAtomValue(programsCachedAtom)
   const showsCached = useAtomValue(showsCachedAtom)
   console.log('Programs from cache:', programsCached)
   console.log('Shows from cache:', showsCached)
   ```

2. Number of show boundaries being computed
   ```typescript
   const boundaries = useAtomValue(showBoundariesAtom)
   console.log('Boundaries:', boundaries.length)
   ```

3. Worker status
   - Check browser DevTools > Sources > Workers
   - Ensure worker is running

## API Endpoints

### KEXP API v2

Base URL: `https://api.kexp.org/v2`

**Programs:**
- Endpoint: `/programs/?format=json`
- Method: GET
- Returns: List of all program formats
- Cache: 24 hours

**Shows:**
- Endpoint: `/shows/?format=json&limit={limit}`
- Method: GET
- Params: `limit` (default: 50, max: ~200)
- Returns: Recent show instances with hosts
- Cache: 1 hour

**Rate Limits:**
- None specified by KEXP
- Retry logic prevents excessive requests on failures

## Testing

### Manual Testing

1. Start dev server:
   ```bash
   pnpm --filter @crate/web dev
   ```

2. Open http://localhost:5174/

3. Check browser console for:
   ```
   Worker: Received request
   Worker: Validated request type: fetch-programs
   Worker: Validated request type: fetch-shows
   Programs loaded from cache: N programs (or Cache miss - fetching...)
   Shows loaded from cache: N shows (or Cache miss - fetching...)
   ```

4. Check localStorage:
   - DevTools > Application > localStorage
   - Should see `kexp-cache:programs` and `kexp-cache:shows`

5. Verify show markers in timeline:
   - Look for program names and host names between plays

### Cache Testing

1. **First Load** (cache miss):
   - Clear localStorage
   - Reload page
   - Should see "Cache miss - fetching from network" in console
   - Data fetched from KEXP API

2. **Second Load** (cache hit):
   - Reload page
   - Should see "Programs/Shows loaded from cache" in console
   - Instant load, no API calls

3. **Expired Cache**:
   - Manually edit cache timestamp in localStorage to old value
   - Reload page
   - Should clear expired cache and fetch fresh data

## Future Enhancements

1. **Refresh Button**: Manual cache invalidation UI
2. **Background Refresh**: Periodic updates while app is open
3. **Show Details Modal**: Click show marker for full information
4. **Host Pages**: Link to host-specific timelines
5. **Program Filter**: Filter timeline by program type
6. **Error Boundaries**: Graceful UI degradation on KEXP API failures
7. **Metrics**: Track cache hit rate and API latency

## Related Files

- Main thread:
  - `/packages/web/src/atoms/kexp-atoms.ts`
  - `/packages/web/src/atoms/kexp-sync.ts`
  - `/packages/web/src/hooks/use-kexp-data.ts`
  - `/packages/web/src/services/kexp-data-client.ts`

- Worker thread:
  - `/packages/web/src/workers/kexp-data-worker.ts`
  - `/packages/web/src/workers/kexp-api-service.ts`
  - `/packages/web/src/workers/kexp-cache.ts`
  - `/packages/web/src/workers/kexp-data-worker-protocol.ts`

- UI components:
  - `/packages/web/src/components/ShowTransitionMarker.tsx`
  - `/packages/web/src/components/TimelineItemWithMarker.tsx`

## References

- KEXP API Documentation: https://api.kexp.org/v2/
- Effect Documentation: https://effect.website/
- Effect Atom Documentation: https://github.com/tim-smart/effect-atom
