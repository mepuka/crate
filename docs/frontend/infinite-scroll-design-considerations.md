# Infinite Scroll Design Considerations

**Author:** Design Review
**Date:** 2025-11-16
**Status:** Design Analysis
**Related Docs:** `infinite-scroll-timeline-architecture.md`, `FRONTEND_DESIGN.md`

---

## Executive Summary

This document analyzes design considerations, trade-offs, and architectural decisions for implementing infinite scrolling in an Effect-first web application. It examines the unique challenges posed by our dual-source data model (real-time push updates + historical pull pagination) and provides guidance for building a robust, performant infinite scroll experience.

**Key Insight:** Our timeline requires a **hybrid push-pull architecture** where new items arrive via background service (push) while historical items load on-demand (pull). This is fundamentally different from traditional infinite scroll implementations.

---

## Table of Contents

1. [Context & Requirements](#context--requirements)
2. [Core Design Patterns](#core-design-patterns)
3. [State Management Architecture](#state-management-architecture)
4. [Data Flow Models](#data-flow-models)
5. [Performance Considerations](#performance-considerations)
6. [User Experience Design](#user-experience-design)
7. [Edge Cases & Error Handling](#edge-cases--error-handling)
8. [Alternative Approaches](#alternative-approaches)
9. [Recommendations](#recommendations)

---

## Context & Requirements

### Current System

- **Backend API:** Cursor-based pagination with `before` parameter
- **Data Source:** KEXP play history (continuously growing dataset)
- **Update Frequency:** Background service fetches latest 200 plays every 100 seconds
- **Storage:** LocalStorage via `TimelineKVS` with Effect data structures
- **State:** Effect Atom with reactive invalidation patterns

### Functional Requirements

1. **Infinite Scroll Down:** Load older plays as user scrolls toward bottom
2. **Real-time Updates:** Display new plays as they're fetched by background service
3. **Gap Detection:** Identify and fill missing data between sessions
4. **Persistent State:** Restore scroll position and loaded data across page refreshes
5. **Performance:** Maintain 60 FPS with thousands of items loaded

### Non-Functional Requirements

- **Initial Load:** < 1 second to display first page
- **Pagination Latency:** < 500ms perceived delay for subsequent pages
- **Memory Usage:** Bounded growth (virtual scrolling required)
- **Battery Life:** Minimal background CPU/GPU usage
- **Reliability:** Graceful degradation on network failures

---

## Core Design Patterns

### 1. Push vs. Pull Architecture

#### Traditional Infinite Scroll (Pull-Only)
```
User scrolls → Trigger load → API request → Append data → Render
```

**Pros:**
- Simple mental model
- Predictable data flow
- Easy to implement

**Cons:**
- Misses real-time updates
- Requires polling for new items
- Stale data between loads

#### Background Push (Our Current System)
```
Background service → Fetch latest → Update KVS → Invalidate atoms → Components re-render
```

**Pros:**
- Real-time updates without user action
- Efficient (100-second intervals)
- Shared across tabs via localStorage

**Cons:**
- Only fetches latest 200 plays
- No historical pagination
- Doesn't scale to full dataset

#### **Hybrid Push-Pull (Recommended)**
```
┌─ Background Push ─┐         ┌─ User-Initiated Pull ─┐
│                    │         │                        │
│  Latest 200 plays  │         │  Historical pagination │
│  Every 100 seconds │         │  On scroll trigger     │
│  Prepend to list   │         │  Append to list        │
└────────────────────┘         └────────────────────────┘
           │                              │
           └──────────┬───────────────────┘
                      ↓
           Unified Timeline State
```

**Key Design Decision:**
> We must maintain TWO data ingestion paths that merge into a single ordered timeline. The background service owns the "head" (newest items), while pagination owns the "tail" (historical items).

---

### 2. Cursor Management Strategies

#### Option A: Single Cursor (Simple)
```typescript
const cursorAtom = atom<string | null>(null)
```

**Behavior:**
- Cursor advances as user scrolls down
- Background service always fetches latest (no cursor)
- Simple but doesn't handle gaps well

**Trade-offs:**
- ✅ Easy to implement
- ✅ Minimal state
- ❌ Can't fill gaps between sessions
- ❌ Assumes continuous scrolling

#### Option B: Dual Cursors (Gap-Aware)
```typescript
const oldestCursorAtom = atom<string | null>(null) // For scrolling down
const newestTimestampAtom = atom<number>(Date.now()) // For gap detection
```

**Behavior:**
- `oldestCursor`: Used for pagination (load older)
- `newestTimestamp`: Tracks our newest item for gap detection
- Background service compares its results to `newestTimestamp`

**Trade-offs:**
- ✅ Handles gaps automatically
- ✅ Survives page refreshes
- ❌ More complex state management
- ❌ Requires timestamp comparison logic

#### **Recommendation: Option B (Dual Cursors)**

**Rationale:** Users often leave the app open for hours, close tabs, or experience network issues. We need robust gap detection to maintain timeline continuity.

---

### 3. State Ownership Models

#### Centralized State (Recommended)
```typescript
// Single source of truth
const playIdsListAtom = atomWithStorage<number[]>('timeline:playIds', [])

// Derived atoms
const visiblePlayIdsAtom = atom((get) => {
  const allIds = get(playIdsListAtom)
  const range = get(visibleRangeAtom)
  return allIds.slice(range.start, range.end)
})
```

**Pros:**
- Single source of truth
- Easy to reason about
- Atomic updates
- Persistence-friendly

**Cons:**
- Requires discipline to avoid accidental mutations
- Full list in memory (mitigated by virtualization)

#### Distributed State (Alternative)
```typescript
// Multiple state slices
const topPlayIdsAtom = atom<number[]>([]) // From background service
const bottomPlayIdsAtom = atom<number[]>([]) // From pagination
const mergedPlayIdsAtom = atom((get) =>
  [...get(topPlayIdsAtom), ...get(bottomPlayIdsAtom)]
)
```

**Pros:**
- Clear ownership boundaries
- Easier to debug data sources

**Cons:**
- Merge complexity
- Duplicate detection required
- Harder to persist

**Decision:** **Centralized state** with clear mutation points (background service and pagination handler).

---

## State Management Architecture

### Effect Atom Patterns for Infinite Scroll

#### 1. Manual State Atoms (Writable)

Unlike typical derived atoms, infinite scroll requires **writable state** for the play ID list:

```typescript
import { atomWithStorage } from '@effect-atom/atom-react/storage'

// Writable atom with localStorage persistence
export const playIdsListAtom = atomWithStorage<number[]>(
  'timeline:playIds',
  [],
  {
    runtime: TimelineRuntime,
    // Custom merge strategy for atomic updates
    merge: (stored, incoming) => {
      const set = new Set([...stored, ...incoming])
      return Array.from(set).sort((a, b) => b - a) // Newest first
    }
  }
)
```

**Design Notes:**
- **Persistence:** Restores timeline state across sessions
- **Merge Strategy:** Handles concurrent updates from push/pull sources
- **Ordering:** Newest-first (descending) matches API response order
- **Deduplication:** Set ensures no duplicates from overlapping fetches

#### 2. Cursor State

```typescript
export const paginationCursorAtom = atomWithStorage<string | null>(
  'timeline:cursor',
  null,
  { runtime: TimelineRuntime }
)

export const hasMorePlaysAtom = atom<boolean>(true)

export const newestPlayTimestampAtom = atom<number>((get) => {
  const playIds = get(playIdsListAtom)
  if (playIds.length === 0) return Date.now()

  const newestPlay = get(playAtom(playIds[0]))
  return Result.match(newestPlay, {
    onSuccess: (play) => play.value.airdate.getTime(),
    onFailure: () => Date.now()
  })
})
```

**Design Rationale:**
- **Cursor Persistence:** Allows resuming pagination after page refresh
- **hasMore Flag:** Prevents unnecessary API calls when data exhausted
- **Timestamp Tracking:** Enables gap detection algorithm

#### 3. Loading State Management

```typescript
export const paginationStateAtom = atom<{
  loading: boolean
  error: Error | null
  lastLoadTime: number
}>({
  loading: false,
  error: null,
  lastLoadTime: 0
})
```

**States:**
- **Idle:** `loading: false, error: null`
- **Loading:** `loading: true, error: null`
- **Error:** `loading: false, error: Error`
- **Success:** `loading: false, error: null, lastLoadTime: updated`

**UX Implications:**
- Show spinner only if `loading && playIds.length === 0` (first load)
- Show inline loader if `loading && playIds.length > 0` (pagination)
- Display error toast, don't block UI

---

### 4. Scroll Trigger Atoms

```typescript
export const scrollPositionAtom = atom<{
  scrollY: number
  viewportHeight: number
  documentHeight: number
}>({
  scrollY: 0,
  viewportHeight: 0,
  documentHeight: 0
})

export const scrollPercentageAtom = atom((get) => {
  const { scrollY, viewportHeight, documentHeight } = get(scrollPositionAtom)
  const scrollableHeight = documentHeight - viewportHeight
  return scrollableHeight > 0 ? (scrollY / scrollableHeight) * 100 : 0
})

export const shouldLoadMoreAtom = atom((get) => {
  const percentage = get(scrollPercentageAtom)
  const { loading } = get(paginationStateAtom)
  const hasMore = get(hasMorePlaysAtom)

  return percentage > 80 && !loading && hasMore
})
```

**Design Considerations:**

1. **Trigger Threshold:** 80% scroll depth
   - **Too Early (50%):** Loads too aggressively, wastes bandwidth
   - **Too Late (95%):** User sees loading state, feels janky
   - **80%:** Optimal balance, loads before user reaches end

2. **Debouncing:** Required to prevent rapid-fire loads
   ```typescript
   useEffect(() => {
     if (shouldLoad) {
       const timeout = setTimeout(() => loadMore(), 150)
       return () => clearTimeout(timeout)
     }
   }, [shouldLoad])
   ```

3. **Guard Clauses:** Prevent duplicate loads
   - Check `loading` state
   - Check `hasMore` flag
   - Verify cursor exists

---

## Data Flow Models

### 1. Initial Page Load

```
┌─────────────────────────────────────────────────────────┐
│ 1. Component Mounts                                     │
│    ↓                                                     │
│ 2. Check localStorage for playIds                       │
│    ├─ Found: Restore state, display cached data         │
│    └─ Not Found: Show skeleton loaders                  │
│    ↓                                                     │
│ 3. Fetch Latest 200 (API: /plays)                       │
│    ↓                                                     │
│ 4. Store in TimelineKVS                                 │
│    ↓                                                     │
│ 5. Update playIdsListAtom                               │
│    ↓                                                     │
│ 6. Render Timeline                                      │
│    ↓                                                     │
│ 7. Start Background Service (100s interval)             │
└─────────────────────────────────────────────────────────┘
```

**Key Decision Points:**

- **Should we show cached data immediately?**
  - ✅ Yes: Instant perceived load time
  - Refresh in background to show latest
  - Display "Updating..." indicator during refresh

- **Should initial load fetch with cursor?**
  - ❌ No: First load always fetches latest 200 without cursor
  - Cursor starts after user scrolls past initial set
  - Simplifies initialization logic

---

### 2. Background Push Updates

```
┌─────────────────────────────────────────────────────────┐
│ Background Service Timer (every 100s)                   │
│    ↓                                                     │
│ Fetch Latest 200 plays                                  │
│    ↓                                                     │
│ Compare with newestPlayTimestampAtom                    │
│    ├─ No new plays: Skip update                         │
│    ├─ New plays (contiguous): Prepend to list           │
│    └─ Gap detected: Trigger gap-fill algorithm          │
│         ↓                                                │
│         Fetch plays with since=newestTimestamp          │
│         ↓                                                │
│         Insert gap plays in correct order               │
│    ↓                                                     │
│ Update TimelineKVS                                      │
│    ↓                                                     │
│ Invalidate Reactivity keys                              │
│    ↓                                                     │
│ Atoms re-read from KVS                                  │
│    ↓                                                     │
│ Components re-render with new plays                     │
└─────────────────────────────────────────────────────────┘
```

**Design Challenge: Gap Detection**

**Scenario:** User leaves tab open overnight, KEXP airs 2000 plays. Background service's 200-play fetch misses 1800 plays.

**Algorithm:**
```typescript
function detectGap(latestFromAPI: Play[], currentNewest: Play): Gap | null {
  const apiOldest = latestFromAPI[latestFromAPI.length - 1]
  const timeDiff = currentNewest.airdate.getTime() - apiOldest.airdate.getTime()

  // Plays air roughly every 3-5 minutes
  const expectedPlaysInGap = Math.floor(timeDiff / (4 * 60 * 1000))
  const actualPlaysInAPI = latestFromAPI.length

  if (expectedPlaysInGap > actualPlaysInAPI * 1.5) {
    return {
      since: apiOldest.airdate,
      until: currentNewest.airdate,
      estimatedMissing: expectedPlaysInGap - actualPlaysInAPI
    }
  }
  return null
}
```

**Gap-Filling Strategy:**
1. Detect gap using time-based heuristic
2. Fetch plays with `since` parameter
3. Insert in chronological order
4. Mark gap as "filled" in state to avoid refetching

---

### 3. User-Initiated Pagination (Pull)

```
┌─────────────────────────────────────────────────────────┐
│ User scrolls past 80% threshold                         │
│    ↓                                                     │
│ shouldLoadMoreAtom becomes true                         │
│    ↓                                                     │
│ Debounce (150ms)                                        │
│    ↓                                                     │
│ Check guards (loading, hasMore, cursor)                 │
│    ↓                                                     │
│ Set paginationStateAtom.loading = true                  │
│    ↓                                                     │
│ Fetch /plays?before={cursor}&limit=50                   │
│    ↓                                                     │
│ Receive response                                        │
│    ├─ Success:                                          │
│    │   ├─ Append play IDs to playIdsListAtom            │
│    │   ├─ Update cursor from response                   │
│    │   ├─ Set hasMore based on response.hasMore         │
│    │   └─ Set loading = false                           │
│    └─ Error:                                            │
│        ├─ Set paginationStateAtom.error                 │
│        ├─ Keep cursor (allow retry)                     │
│        └─ Set loading = false                           │
│    ↓                                                     │
│ Store new plays in TimelineKVS                          │
│    ↓                                                     │
│ Components re-render with expanded list                 │
└─────────────────────────────────────────────────────────┘
```

**Key Decisions:**

1. **Page Size:** 50 plays per pagination request
   - **Smaller (20):** More requests, smoother scroll
   - **Larger (100):** Fewer requests, longer wait
   - **50:** Balanced (typical play duration 3-5min, ~3 hours of history)

2. **Append Strategy:**
   - **Immediate:** Append as soon as response arrives
   - **Deduplication:** Filter out any IDs already in list
   - **Sorting:** Maintain descending order

3. **Retry Logic:**
   - **On Error:** Keep cursor, allow manual retry
   - **Exponential Backoff:** 1s, 2s, 4s for transient errors
   - **Max Retries:** 3 attempts before showing error state

---

## Performance Considerations

### 1. Virtual Scrolling

**Problem:** Rendering 10,000 DOM nodes kills performance

**Solution:** TanStack Virtual - only render visible items + buffer

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

const virtualizer = useVirtualizer({
  count: playIds.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 200, // Estimated play card height
  overscan: 5 // Render 5 extra items above/below viewport
})

// Only render visible items
virtualizer.getVirtualItems().map((virtualItem) => {
  const playId = playIds[virtualItem.index]
  return <PlayCard key={playId} playId={playId} />
})
```

**Performance Impact:**
- **Before:** O(n) DOM nodes, 10,000 plays = 10,000 nodes = browser crash
- **After:** O(viewport), ~20 visible nodes regardless of total count
- **FPS:** Maintains 60 FPS even with 100,000+ items

**Trade-offs:**
- ✅ Constant memory usage
- ✅ Instant scroll performance
- ❌ Requires accurate height estimation
- ❌ Adds library dependency

---

### 2. Memoization Strategy

**Problem:** Every scroll event triggers re-renders

**Solution:** Strategic memoization with Effect Atom

```typescript
// ❌ BAD: Recomputes on every scroll
const visiblePlays = playIds.slice(startIndex, endIndex).map(id => getPlay(id))

// ✅ GOOD: Memoized with atom families
export const playAtom = atomFamily((id: number) =>
  TimelineRuntime.atom((get) =>
    pipe(
      TimelineKVS,
      Effect.flatMap(kvs => kvs.getPlay(id)),
      Effect.map(Option.getOrThrow)
    )
  )
)

// Each play memoized individually
const play = useAtomValue(playAtom(id))
```

**Memoization Levels:**
1. **Atom Family:** Each play memoized by ID
2. **Visible Range:** Only recompute when scroll crosses item boundary
3. **Component Memo:** `React.memo(PlayCard)` prevents re-render if props unchanged

**Performance Gains:**
- Scroll event → range calculation (cheap)
- If range unchanged → no component updates
- If range changed → only new items render

---

### 3. Data Structure Optimization

**Problem:** Array operations for large lists are slow

**Current Approach:**
```typescript
// TimelineKVS stores plays in localStorage as JSON
const plays = Chunk.fromIterable(playArray)
const playSet = HashSet.fromIterable(playIds)
```

**Performance Analysis:**

| Operation | Array | Chunk | HashSet |
|-----------|-------|-------|---------|
| Append | O(1) | O(1) | O(1) |
| Prepend | O(n) | O(1) | O(1) |
| Lookup | O(n) | O(n) | O(1) |
| Dedup | O(n²) | O(n²) | O(n) |
| Sort | O(n log n) | O(n log n) | N/A |

**Recommendation:**
- **Play IDs List:** Array (needs sorting, index access)
- **Deduplication:** Convert to HashSet, perform ops, convert back
- **Lookup:** Use `playIdToBoundaryMapAtom` (HashMap) for O(1) access

```typescript
function appendPlaysUnique(existing: number[], incoming: number[]): number[] {
  const existingSet = HashSet.fromIterable(existing)
  const newPlays = incoming.filter(id => !HashSet.has(existingSet, id))
  return [...existing, ...newPlays]
}
```

---

### 4. Network Optimization

**Batching Requests:**
```typescript
// ❌ BAD: Fetch plays one-by-one
playIds.forEach(id => fetchPlay(id))

// ✅ GOOD: Fetch in single request
const plays = await TimelineClient.getPlays({ ids: playIds })
```

**Caching Strategy:**
- **API Level:** Background service provides 200-play cache
- **KVS Level:** localStorage persists all loaded plays
- **Atom Level:** Effect.cached prevents redundant computation

**Prefetching:**
```typescript
// When scroll reaches 70%, start prefetching next page
if (scrollPercentage > 70 && !prefetching) {
  prefetchNextPage()
}
```

**Trade-offs:**
- ✅ Reduces perceived latency
- ❌ Wastes bandwidth if user stops scrolling
- **Decision:** Prefetch only if user has scrolled consistently for 2+ seconds

---

## User Experience Design

### 1. Loading States

**States to Design For:**

| State | Condition | UI Treatment |
|-------|-----------|--------------|
| Initial Load | No cached data | Full-page skeleton |
| Cached Data + Refresh | Has cached, fetching latest | Timeline visible, subtle refresh indicator |
| Paginating | Loading next page | Inline spinner at bottom |
| Error (Network) | API request failed | Toast notification + retry button |
| Error (Transient) | Temporary failure | Auto-retry with exponential backoff |
| End of Data | No more historical plays | "You've reached the beginning" message |

**Example: Inline Pagination Loader**
```tsx
{isLoadingMore && (
  <div className="flex items-center justify-center py-4">
    <Spinner size="sm" />
    <span className="ml-2 text-muted">Loading older plays...</span>
  </div>
)}
```

---

### 2. Scroll Restoration

**Problem:** User refreshes page, loses scroll position

**Solution:** Persist and restore scroll state

```typescript
const scrollPositionStorage = atomWithStorage<{
  playId: number // Which play was at top of viewport
  offset: number // Pixel offset from that play
}>('timeline:scrollPosition', null)

// On unmount
useEffect(() => {
  return () => {
    const topPlayId = getTopVisiblePlayId()
    const offset = getScrollOffset()
    set(scrollPositionStorage, { playId: topPlayId, offset })
  }
}, [])

// On mount
useEffect(() => {
  const saved = get(scrollPositionStorage)
  if (saved) {
    const element = document.getElementById(`play-${saved.playId}`)
    element?.scrollIntoView()
    window.scrollBy(0, saved.offset)
  }
}, [])
```

**Trade-offs:**
- ✅ Preserves context across refreshes
- ❌ Requires play IDs to be stable
- ❌ Can feel disorienting if user expects to start at top

**Recommendation:** Only restore if refresh happened < 5 minutes ago

---

### 3. New Item Notifications

**Problem:** Background service adds new plays while user scrolled down

**Options:**

**A. Auto-Scroll to Top (Disruptive)**
```typescript
// ❌ Jarring for users
if (newPlaysAdded) {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
```

**B. Sticky Notification (Recommended)**
```tsx
{newPlaysCount > 0 && (
  <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
    <Button onClick={() => scrollToTop()}>
      {newPlaysCount} new plays
    </Button>
  </div>
)}
```

**C. Live Updates (Only if Scrolled to Top)**
```typescript
const isAtTop = scrollY < 100

if (isAtTop) {
  // Prepend new plays, shift everything down naturally
  playIds.unshift(...newPlayIds)
} else {
  // Show notification, don't disrupt
  setNewPlaysCount(count => count + newPlayIds.length)
}
```

**Recommendation:** Option C - conditional auto-update

---

### 4. Error Recovery UX

**Network Error Handling:**

```tsx
const ErrorBoundary = ({ error, retry }) => (
  <div className="p-4 border border-red-200 bg-red-50 rounded">
    <p className="text-red-800">Failed to load plays</p>
    <p className="text-sm text-red-600">{error.message}</p>
    <Button onClick={retry} className="mt-2">
      Try Again
    </Button>
  </div>
)
```

**Transient Error Strategy:**
1. **First Failure:** Silent retry after 1s
2. **Second Failure:** Show toast, retry after 2s
3. **Third Failure:** Show error UI with manual retry button

**Graceful Degradation:**
- If pagination fails, user can still view cached plays
- If background service fails, manual refresh still works
- If localStorage full, fall back to in-memory state

---

## Edge Cases & Error Handling

### 1. Duplicate Play IDs

**Cause:** Overlapping fetches from background service and pagination

**Prevention:**
```typescript
function mergePlays(existing: number[], incoming: number[]): number[] {
  const set = new Set(existing)
  const newIds = incoming.filter(id => !set.has(id))
  return [...existing, ...newIds].sort((a, b) => b - a)
}
```

**Detection:**
```typescript
// Validate no duplicates in state
if (new Set(playIds).size !== playIds.length) {
  console.error('Duplicate play IDs detected')
  Sentry.captureMessage('Timeline state corruption: duplicates')
}
```

---

### 2. Out-of-Order Play IDs

**Cause:** Background service prepends while pagination appends

**Solution:** Always re-sort after merge

```typescript
const playIdsListAtom = atom<number[]>({
  get: (get) => get(rawPlayIdsAtom),
  set: (get, set, incoming: number[]) => {
    const existing = get(rawPlayIdsAtom)
    const merged = mergePlays(existing, incoming)
    const sorted = merged.sort((a, b) => b - a) // Newest first
    set(rawPlayIdsAtom, sorted)
  }
})
```

---

### 3. Gap Overflow

**Scenario:** User offline for 7 days, 10,000 plays missed

**Problem:** Fetching 10,000 plays in one request crashes browser

**Solution: Chunked Gap Filling**
```typescript
async function fillGap(since: Date, until: Date) {
  const chunkSize = 200
  const chunks = estimateChunks(since, until, chunkSize)

  for (const chunk of chunks) {
    await fetchPlays({ since: chunk.start, before: chunk.end })
    await delay(500) // Rate limiting
  }
}
```

**Trade-offs:**
- ✅ Prevents memory overflow
- ❌ Takes longer to fill large gaps
- **Optimization:** Show progress bar during gap fill

---

### 4. localStorage Quota Exceeded

**Problem:** localStorage limited to ~5-10MB, storing 50,000 plays exceeds quota

**Solutions:**

**A. LRU Eviction**
```typescript
const MAX_PLAYS_IN_STORAGE = 5000

function evictOldPlays(plays: Play[]): Play[] {
  return plays.slice(0, MAX_PLAYS_IN_STORAGE) // Keep newest 5000
}
```

**B. IndexedDB Migration**
```typescript
// Fallback to IndexedDB for larger datasets
if (localStorageQuotaExceeded) {
  migrateToIndexedDB()
}
```

**C. Lazy Loading Play Details**
```typescript
// Store only play IDs in localStorage
// Fetch full play details on-demand from API
const playIds = JSON.parse(localStorage.getItem('playIds')) // Small
const play = await fetchPlay(id) // On-demand
```

**Recommendation:** Combination of A + C
- Store max 5000 play IDs in localStorage
- Cache full play objects in memory only
- Fetch details on-demand if not in memory

---

### 5. Race Conditions

**Scenario:** User scrolls rapidly, triggers 3 pagination requests

**Problem:** Responses arrive out-of-order, corrupting state

**Solution: Request Cancellation**
```typescript
let currentRequest: AbortController | null = null

async function loadMore() {
  // Cancel previous request
  if (currentRequest) {
    currentRequest.abort()
  }

  currentRequest = new AbortController()

  try {
    const plays = await fetchPlays({
      signal: currentRequest.signal
    })
    appendPlays(plays)
  } catch (err) {
    if (err.name === 'AbortError') return // Ignore cancelled requests
    throw err
  }
}
```

**Alternative: Request Queuing**
```typescript
const requestQueue = new Queue()

async function loadMore() {
  await requestQueue.enqueue(async () => {
    const plays = await fetchPlays()
    appendPlays(plays)
  })
}
```

**Recommendation:** Cancellation for user-initiated actions, queuing for background service

---

## Alternative Approaches

### 1. Server-Sent Events (SSE) for Real-Time Updates

**Instead of:** Background polling every 100 seconds

**Use:** SSE stream for instant play notifications

```typescript
const eventSource = new EventSource('/api/plays/stream')

eventSource.onmessage = (event) => {
  const newPlay = JSON.parse(event.data)
  prependPlay(newPlay)
}
```

**Pros:**
- Real-time updates (no 100s delay)
- Lower server load (persistent connection)
- Battery-efficient (no polling)

**Cons:**
- Requires server support
- Complex reconnection logic
- Not supported in all browsers

**Verdict:** Worth considering for future enhancement

---

### 2. Windowed Virtualization (react-window)

**Alternative to:** TanStack Virtual

**Comparison:**

| Feature | TanStack Virtual | react-window |
|---------|-----------------|--------------|
| Dynamic Heights | ✅ Excellent | ⚠️ Limited |
| API Complexity | Simple | Simpler |
| Bundle Size | 12KB | 7KB |
| Active Maintenance | ✅ Active | ⚠️ Maintenance mode |

**Verdict:** Stick with TanStack Virtual (dynamic heights critical for play cards)

---

### 3. GraphQL with Relay-Style Pagination

**Instead of:** REST API with cursor pagination

**Use:** GraphQL with connections

```graphql
query Timeline($cursor: String) {
  plays(first: 50, after: $cursor) {
    edges {
      node { id, artist, song, airdate }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**Pros:**
- Standardized pagination pattern
- Built-in cursor management
- Type-safe with codegen

**Cons:**
- Requires GraphQL server
- Overkill for simple use case
- Additional complexity

**Verdict:** Not justified for current scope, REST is sufficient

---

## Recommendations

### Priority 1: Core Implementation

1. **Adopt Dual-Cursor Model**
   - Implement `oldestCursorAtom` and `newestTimestampAtom`
   - Build gap detection algorithm
   - Test with overnight scenarios

2. **Implement Centralized State**
   - Use `atomWithStorage` for `playIdsListAtom`
   - Add atomic merge logic for push/pull sources
   - Persist cursor state

3. **Integrate TanStack Virtual**
   - Wrap Timeline in virtualizer
   - Implement `estimateSize` with fallback measurement
   - Add overscan for smooth scrolling

---

### Priority 2: Performance & UX

4. **Build Scroll Trigger System**
   - Implement `shouldLoadMoreAtom` with 80% threshold
   - Add debouncing (150ms)
   - Create loading states

5. **Design Error Handling**
   - Implement retry logic with exponential backoff
   - Build error UI components
   - Add Sentry integration for monitoring

6. **localStorage Management**
   - Implement LRU eviction (5000 play limit)
   - Add quota monitoring
   - Plan IndexedDB migration path

---

### Priority 3: Polish & Optimization

7. **Scroll Position Restoration**
   - Save scroll state on unmount
   - Restore within 5-minute window
   - Handle missing plays gracefully

8. **New Play Notifications**
   - Implement conditional auto-update
   - Build sticky notification UI
   - Add "scroll to top" action

9. **Prefetching Strategy**
   - Prefetch at 70% if consistent scroll detected
   - Cancel prefetch on scroll stop
   - Measure bandwidth impact

---

### Metrics to Track

**Performance:**
- FPS during scroll (target: 60)
- Time to first paint (target: < 1s)
- Memory usage over time (target: < 200MB)

**User Behavior:**
- Average scroll depth
- Pagination trigger frequency
- Gap detection occurrence rate

**Reliability:**
- API error rate by endpoint
- localStorage quota errors
- State corruption incidents

---

## Conclusion

Infinite scroll in an Effect-first architecture requires careful balance between:
- **Real-time push updates** (background service)
- **On-demand pull pagination** (user scrolling)
- **Performance constraints** (virtual scrolling, memoization)
- **User experience** (loading states, error handling)

The recommended hybrid push-pull architecture leverages Effect Atom's strengths while addressing the unique challenges of a continuously growing timeline.

**Key Success Factors:**
1. Dual-cursor gap detection prevents data loss
2. Virtual scrolling ensures performance at scale
3. Atomic state management prevents race conditions
4. Graceful error handling maintains user trust

**Next Steps:**
1. Review this document with team
2. Prototype core atoms and data flow
3. Build TanStack Virtual integration
4. Implement gap detection algorithm
5. User testing with realistic scenarios

---

**Related Documents:**
- [Infinite Scroll Timeline Architecture](./infinite-scroll-timeline-architecture.md) - Implementation details
- [Frontend Design](../FRONTEND_DESIGN.md) - Overall architecture
- [Performance Improvements](./PERFORMANCE_IMPROVEMENTS.md) - Optimization strategies
