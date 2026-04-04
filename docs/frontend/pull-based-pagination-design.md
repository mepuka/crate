# Pull-Based Pagination Design Patterns

**Author:** Design Review
**Date:** 2025-11-16
**Status:** Design Analysis
**Related Docs:** `infinite-scroll-design-considerations.md`, `FRONTEND_DESIGN.md`

---

## Executive Summary

This document explores pull-based pagination patterns for infinite scrolling interfaces, analyzing different pagination strategies, their trade-offs, and integration with Effect-TS patterns. It provides guidance for choosing the right pagination approach and implementing it robustly in an Effect-first architecture.

**Key Insight:** Pull-based pagination shifts control to the client, enabling better user experience, offline support, and performance optimization. However, it requires careful API design and state management to handle edge cases reliably.

---

## Table of Contents

1. [Pull vs. Push Paradigms](#pull-vs-push-paradigms)
2. [Pagination Strategies](#pagination-strategies)
3. [API Design Patterns](#api-design-patterns)
4. [Client-Side State Management](#client-side-state-management)
5. [Effect Integration Patterns](#effect-integration-patterns)
6. [Performance Optimization](#performance-optimization)
7. [Error Handling & Resilience](#error-handling--resilience)
8. [Testing Strategies](#testing-strategies)
9. [Migration Paths](#migration-paths)

---

## Pull vs. Push Paradigms

### Push-Based (Server-Driven)

**Model:** Server sends data to client proactively

```typescript
// WebSocket or SSE
socket.on('newPlay', (play) => {
  displayPlay(play)
})
```

**Characteristics:**
- Server decides when to send data
- Client passively receives
- Real-time updates
- Persistent connection required

**Use Cases:**
- Chat applications
- Live sports scores
- Stock tickers
- Collaborative editing

**Trade-offs:**
- ✅ Zero latency for updates
- ✅ No polling overhead
- ❌ Requires persistent connection
- ❌ Complex reconnection logic
- ❌ Difficult to paginate historical data

---

### Pull-Based (Client-Driven)

**Model:** Client requests data on-demand

```typescript
// HTTP request
const plays = await fetchPlays({ limit: 50, cursor: 'abc123' })
```

**Characteristics:**
- Client decides when to fetch data
- Server responds to requests
- Stateless HTTP requests
- Request/response cycle

**Use Cases:**
- **Infinite scroll** (our use case)
- Search results
- Feed browsing
- Historical data exploration

**Trade-offs:**
- ✅ Simple to implement
- ✅ Works offline (with cache)
- ✅ Fine-grained control
- ✅ Efficient for historical data
- ❌ Delayed updates (polling required)
- ❌ More client-side state management

---

### Hybrid Push-Pull (Recommended for Our Use Case)

**Model:** Combine both paradigms

```typescript
// Pull: User-initiated pagination
const olderPlays = await fetchPlays({ before: cursor })

// Push: Background service polls for new plays
setInterval(async () => {
  const latestPlays = await fetchLatestPlays()
  prependToTimeline(latestPlays)
}, 100_000)
```

**Why Hybrid?**
- **Historical Data:** Pull-based pagination for scrolling back in time
- **Real-Time Updates:** Background polling for latest plays
- **Best of Both Worlds:** Real-time feel with simple HTTP

**Our Architecture:**
```
┌──────────────────────────────────────────────────┐
│  PULL (User Scrolling Down)                      │
│  ─────────────────────────                       │
│  • Triggered at 80% scroll                       │
│  • Fetches 50 plays before cursor                │
│  • Appends to bottom of list                     │
└──────────────────────────────────────────────────┘
                        +
┌──────────────────────────────────────────────────┐
│  PUSH-LIKE (Background Service)                  │
│  ───────────────────────────────                 │
│  • Polls every 100 seconds                       │
│  • Fetches latest 200 plays                      │
│  • Prepends to top of list                       │
└──────────────────────────────────────────────────┘
```

---

## Pagination Strategies

### 1. Offset-Based Pagination

**API Design:**
```http
GET /api/plays?offset=0&limit=50    # Page 1
GET /api/plays?offset=50&limit=50   # Page 2
GET /api/plays?offset=100&limit=50  # Page 3
```

**Server Implementation:**
```sql
SELECT * FROM plays
ORDER BY airdate DESC
LIMIT 50 OFFSET 100
```

**Pros:**
- ✅ Simple to understand
- ✅ Easy to implement
- ✅ Supports random page access
- ✅ Familiar SQL pattern

**Cons:**
- ❌ **Performance degrades with large offsets** (OFFSET 10000 is slow)
- ❌ **Duplicate/missing items** if data changes between requests
- ❌ Inefficient for databases (scans all previous rows)

**Example Problem:**
```
Request 1: offset=0, limit=50  → Returns plays 1-50
[New play inserted at position 1]
Request 2: offset=50, limit=50 → Returns plays 51-100
                                 ❌ Play #50 appears in both requests!
```

**Verdict:** ❌ **Not recommended for our use case**
- KEXP plays continuously grow (large offsets inevitable)
- Real-time inserts cause duplicate/missing data
- Performance issues at scale

---

### 2. Cursor-Based Pagination (Recommended)

**API Design:**
```http
GET /api/plays?limit=50                     # First page (no cursor)
GET /api/plays?limit=50&before=eyJpZCI6MTJ9 # Next page (cursor from previous)
```

**Response Format:**
```json
{
  "plays": [
    { "id": 12, "artist": "Radiohead", "airdate": "2025-11-16T10:00:00Z" }
  ],
  "cursor": "eyJpZCI6MTJ9",
  "hasMore": true
}
```

**Cursor Encoding:**
```typescript
// Encode cursor
const cursor = btoa(JSON.stringify({ id: 12, airdate: "2025-11-16T10:00:00Z" }))
// "eyJpZCI6MTIsImFpcmRhdGUiOiIyMDI1LTExLTE2VDEwOjAwOjAwWiJ9"

// Decode cursor
const decoded = JSON.parse(atob(cursor))
// { id: 12, airdate: "2025-11-16T10:00:00Z" }
```

**Server Implementation:**
```sql
-- First page (no cursor)
SELECT * FROM plays
ORDER BY airdate DESC, id DESC
LIMIT 50

-- Subsequent pages (with cursor)
SELECT * FROM plays
WHERE (airdate, id) < ('2025-11-16T10:00:00Z', 12)
ORDER BY airdate DESC, id DESC
LIMIT 50
```

**Key Insight:** Use composite cursor `(airdate, id)` to handle plays with same timestamp

**Pros:**
- ✅ **Consistent performance** (no OFFSET, uses index)
- ✅ **No duplicates/missing items** (stable pagination)
- ✅ Works with inserts/deletes
- ✅ Opaque cursor hides implementation

**Cons:**
- ❌ Can't jump to specific page (sequential only)
- ❌ Requires client to track cursor
- ❌ More complex SQL queries

**Why Cursor-Based Wins:**

| Scenario | Offset-Based | Cursor-Based |
|----------|--------------|--------------|
| Fetch page 1000 | OFFSET 50000 (slow) | WHERE id < X (fast) |
| New play inserted | Duplicates/missing | Consistent |
| Database scale | O(n) scan | O(log n) index seek |
| Infinite scroll | Poor UX | Excellent UX |

**Verdict:** ✅ **Best choice for our use case**

---

### 3. Keyset Pagination (Variant of Cursor)

**API Design:**
```http
GET /api/plays?limit=50&since_id=100&max_id=50
```

**Difference from Cursor:**
- Uses explicit keys (IDs) instead of opaque cursors
- More transparent (easier to debug)
- Less flexible (tied to ID structure)

**Example (Twitter-style):**
```typescript
// Fetch newer plays
const newer = await fetchPlays({ since_id: 100, limit: 50 })

// Fetch older plays
const older = await fetchPlays({ max_id: 50, limit: 50 })
```

**Pros:**
- ✅ Transparent pagination (visible in URL)
- ✅ Easy to bookmark specific positions
- ✅ Simple to implement

**Cons:**
- ❌ Exposes internal IDs
- ❌ Less flexible than opaque cursors
- ❌ Harder to change schema later

**Verdict:** ⚠️ **Alternative to cursor-based, but less flexible**

---

### 4. Time-Based Pagination

**API Design:**
```http
GET /api/plays?before=2025-11-16T10:00:00Z&limit=50
GET /api/plays?after=2025-11-15T10:00:00Z&limit=50
```

**Server Implementation:**
```sql
SELECT * FROM plays
WHERE airdate < '2025-11-16T10:00:00Z'
ORDER BY airdate DESC
LIMIT 50
```

**Pros:**
- ✅ Intuitive for time-series data
- ✅ Easy to implement gap detection
- ✅ Bookmarkable URLs

**Cons:**
- ❌ **Duplicates if multiple plays at same timestamp**
- ❌ Requires timestamp index
- ❌ Timezone complexities

**Problem Example:**
```
3 plays at 2025-11-16T10:00:00Z:
- Play A (id: 10)
- Play B (id: 11)
- Play C (id: 12)

Request 1: before=2025-11-16T10:01:00Z, limit=2
Returns: [Play C, Play B]

Request 2: before=2025-11-16T10:00:00Z, limit=2
Returns: [Play A, Play X (from 09:59:00)]

❌ Play A missing from pagination!
```

**Solution:** Combine timestamp + ID (becomes cursor-based)

**Verdict:** ⚠️ **Use only with composite cursor (timestamp, id)**

---

### Comparison Matrix

| Strategy | Performance | Consistency | Complexity | Use Case |
|----------|-------------|-------------|------------|----------|
| **Offset** | ❌ Poor (large offsets) | ❌ Duplicates/gaps | ✅ Simple | Small, static datasets |
| **Cursor** | ✅ Excellent | ✅ Stable | ⚠️ Moderate | Infinite scroll, feeds |
| **Keyset** | ✅ Excellent | ✅ Stable | ⚠️ Moderate | Twitter-style timelines |
| **Time** | ✅ Good | ❌ Duplicate timestamps | ✅ Simple | Logs, events (with ID tie-breaker) |

**Our Choice:** **Cursor-based with composite (airdate, id)**

---

## API Design Patterns

### Recommended API Contract

**Endpoint:**
```
GET /api/plays
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Number of plays to return (default: 50, max: 200) |
| `before` | string | No | Cursor for fetching older plays |
| `after` | string | No | Cursor for fetching newer plays (gap filling) |
| `since` | ISO8601 | No | Fetch plays after this timestamp (gap detection) |

**Response Schema:**
```typescript
type PlaysResponse = {
  plays: Play[]
  cursor: string | null  // Cursor for next page (null if no more data)
  hasMore: boolean       // Whether more data exists
  metadata?: {
    total?: number       // Optional: total count (expensive to compute)
    oldestTimestamp: string
    newestTimestamp: string
  }
}
```

**Example Responses:**

**First Page (Initial Load):**
```json
{
  "plays": [
    { "id": 100, "artist": "Radiohead", "airdate": "2025-11-16T10:00:00Z" },
    { "id": 99, "artist": "Björk", "airdate": "2025-11-16T09:55:00Z" }
  ],
  "cursor": "eyJpZCI6OTksImFpcmRhdGUiOiIyMDI1LTExLTE2VDA5OjU1OjAwWiJ9",
  "hasMore": true,
  "metadata": {
    "oldestTimestamp": "2025-11-16T09:55:00Z",
    "newestTimestamp": "2025-11-16T10:00:00Z"
  }
}
```

**Next Page (Pagination):**
```http
GET /api/plays?limit=50&before=eyJpZCI6OTksImFpcmRhdGUiOiIyMDI1LTExLTE2VDA5OjU1OjAwWiJ9
```

**Gap Filling:**
```http
GET /api/plays?since=2025-11-15T10:00:00Z
```

---

### Cursor Design

**Opaque vs. Transparent:**

**Opaque (Recommended):**
```typescript
// Base64-encoded JSON
const cursor = btoa(JSON.stringify({ id: 99, airdate: "2025-11-16T09:55:00Z" }))
// "eyJpZCI6OTksImFpcmRhdGUiOiIyMDI1LTExLTE2VDA5OjU1OjAwWiJ9"
```

**Pros:**
- ✅ Hides implementation details
- ✅ Can change schema without breaking clients
- ✅ Can include additional metadata (version, flags)

**Cons:**
- ❌ Harder to debug
- ❌ Can't hand-craft URLs

**Transparent:**
```typescript
// Plain JSON or simple ID
const cursor = "99"
```

**Pros:**
- ✅ Easy to debug
- ✅ Simple URL manipulation

**Cons:**
- ❌ Exposes schema
- ❌ Hard to evolve

**Recommendation:** **Opaque Base64-encoded JSON** with versioning

**Versioned Cursor Example:**
```typescript
type Cursor = {
  v: 1  // Version (allows schema evolution)
  id: number
  airdate: string
  // Future: add sharding info, filters, etc.
}

function encodeCursor(cursor: Cursor): string {
  return btoa(JSON.stringify(cursor))
}

function decodeCursor(encoded: string): Cursor {
  const decoded = JSON.parse(atob(encoded))

  // Handle version migrations
  if (decoded.v === 1) return decoded
  if (decoded.v === 2) return migrateV2ToV1(decoded)

  throw new Error(`Unsupported cursor version: ${decoded.v}`)
}
```

---

### Error Responses

**Invalid Cursor:**
```json
{
  "error": "INVALID_CURSOR",
  "message": "The provided cursor is invalid or expired",
  "code": 400
}
```

**Recommendation:** Return empty result instead of error
```json
{
  "plays": [],
  "cursor": null,
  "hasMore": false
}
```

**Rate Limiting:**
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Retry after 60 seconds.",
  "retryAfter": 60,
  "code": 429
}
```

**Server Error:**
```json
{
  "error": "INTERNAL_SERVER_ERROR",
  "message": "An unexpected error occurred",
  "requestId": "abc-123-def",
  "code": 500
}
```

---

## Client-Side State Management

### State Architecture for Pull-Based Pagination

**Core State Atoms:**

```typescript
import { atom, atomWithStorage } from '@effect-atom/atom-react'
import { TimelineRuntime } from '../lib/http-runtime'

// 1. Persistent play IDs list
export const playIdsListAtom = atomWithStorage<number[]>(
  'timeline:playIds',
  [],
  { runtime: TimelineRuntime }
)

// 2. Pagination cursor
export const paginationCursorAtom = atomWithStorage<string | null>(
  'timeline:cursor',
  null,
  { runtime: TimelineRuntime }
)

// 3. Loading state
export const paginationStateAtom = atom<{
  loading: boolean
  error: Error | null
  lastFetch: number
}>({
  loading: false,
  error: null,
  lastFetch: 0
})

// 4. Metadata tracking
export const hasMorePlaysAtom = atomWithStorage<boolean>(
  'timeline:hasMore',
  true,
  { runtime: TimelineRuntime }
)
```

---

### Pull Operation Implementation

**Effect-Based Fetch:**

```typescript
import { Effect, pipe } from 'effect'
import { TimelineClient } from '../lib/http-runtime'
import { FetchError } from '../lib/errors'

export const fetchOlderPlaysEffect = (cursor: string | null, limit: number = 50) =>
  pipe(
    TimelineClient,
    Effect.flatMap(client =>
      client.getPlays({ before: cursor, limit })
    ),
    Effect.tap(response =>
      Effect.logInfo(`Fetched ${response.plays.length} older plays`)
    ),
    Effect.tapError(error =>
      Effect.logError(`Failed to fetch older plays: ${error}`)
    ),
    Effect.catchTag('FetchError', (error) =>
      Effect.fail(Data.TaggedError('PaginationError', {
        message: 'Failed to load older plays',
        cause: error
      }))
    )
  )
```

**Atom Integration:**

```typescript
export const loadOlderPlaysAtom = TimelineRuntime.atom((get) =>
  pipe(
    Effect.all([
      Effect.succeed(get(paginationCursorAtom)),
      Effect.succeed(get(playIdsListAtom))
    ]),
    Effect.flatMap(([cursor, existingIds]) =>
      fetchOlderPlaysEffect(cursor, 50)
    ),
    Effect.tap(response => Effect.sync(() => {
      // Update state atoms
      const existingIds = get(playIdsListAtom)
      const newIds = response.plays.map(p => p.id)

      // Dedup and append
      const deduped = newIds.filter(id => !existingIds.includes(id))
      set(playIdsListAtom, [...existingIds, ...deduped])

      // Update cursor and hasMore flag
      set(paginationCursorAtom, response.cursor)
      set(hasMorePlaysAtom, response.hasMore)

      // Store plays in KVS
      return TimelineKVS.pipe(
        Effect.flatMap(kvs => kvs.storePlays(response.plays))
      )
    }))
  )
)
```

**Component Usage:**

```tsx
import { useAtomValue, useSetAtom } from '@effect-atom/atom-react'

function Timeline() {
  const playIds = useAtomValue(playIdsListAtom)
  const { loading, error } = useAtomValue(paginationStateAtom)
  const hasMore = useAtomValue(hasMorePlaysAtom)
  const loadMore = useSetAtom(loadOlderPlaysAtom)

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    const scrollPercentage = (scrollTop / (scrollHeight - clientHeight)) * 100

    if (scrollPercentage > 80 && !loading && hasMore) {
      loadMore()
    }
  }

  return (
    <div onScroll={handleScroll}>
      {playIds.map(id => <PlayCard key={id} playId={id} />)}
      {loading && <Spinner />}
      {error && <ErrorMessage error={error} />}
      {!hasMore && <EndOfTimeline />}
    </div>
  )
}
```

---

### Deduplication Strategy

**Problem:** Background service and pagination may return overlapping plays

**Solution: Set-Based Deduplication**

```typescript
function mergePlayIds(existing: number[], incoming: number[]): number[] {
  const existingSet = new Set(existing)
  const newIds = incoming.filter(id => !existingSet.has(id))

  // Maintain sort order (newest first)
  return [...existing, ...newIds].sort((a, b) => b - a)
}
```

**Effect-TS Approach:**

```typescript
import { HashSet, Chunk } from 'effect'

function mergePlayIdsEffect(
  existing: Chunk.Chunk<number>,
  incoming: Chunk.Chunk<number>
) {
  return pipe(
    // Convert to HashSet for O(1) lookups
    HashSet.fromIterable(existing),

    // Filter incoming to only new IDs
    existingSet => Chunk.filter(incoming, id =>
      !HashSet.has(existingSet, id)
    ),

    // Combine and sort
    newIds => Chunk.appendAll(existing, newIds),
    Chunk.sort((a, b) => b - a)  // Newest first
  )
}
```

---

### Cursor Persistence

**Problem:** User refreshes page, loses pagination progress

**Solution: Persist cursor in localStorage**

```typescript
export const paginationCursorAtom = atomWithStorage<string | null>(
  'timeline:cursor',
  null,
  {
    runtime: TimelineRuntime,

    // Custom serialization
    serialize: (cursor) => cursor ? btoa(cursor) : null,
    deserialize: (stored) => stored ? atob(stored) : null,

    // Versioning
    version: 1,
    migrate: (stored, version) => {
      if (version === 0) {
        // Migration logic for old cursor format
        return convertOldCursor(stored)
      }
      return stored
    }
  }
)
```

**Expiration Strategy:**

```typescript
type StoredCursor = {
  cursor: string
  timestamp: number
}

export const paginationCursorAtom = atomWithStorage<StoredCursor | null>(
  'timeline:cursor',
  null,
  {
    runtime: TimelineRuntime,

    // Only restore if < 24 hours old
    deserialize: (stored) => {
      if (!stored) return null

      const parsed: StoredCursor = JSON.parse(stored)
      const age = Date.now() - parsed.timestamp

      if (age > 24 * 60 * 60 * 1000) {
        return null  // Cursor expired
      }

      return parsed.cursor
    }
  }
)
```

---

## Effect Integration Patterns

### 1. Effect.cached for Request Deduplication

**Problem:** Multiple components trigger same pagination request

**Solution:**

```typescript
import { Effect, Duration } from 'effect'

// Cache fetch for 5 seconds
const cachedFetchOlderPlays = Effect.cached(
  fetchOlderPlaysEffect,
  Duration.seconds(5)
)

// Multiple calls within 5s return same result
const plays1 = await Effect.runPromise(cachedFetchOlderPlays)
const plays2 = await Effect.runPromise(cachedFetchOlderPlays)  // Cached, no network request
```

**Trade-offs:**
- ✅ Prevents duplicate requests
- ✅ Improves performance
- ❌ May return stale data
- ❌ Requires cache invalidation strategy

---

### 2. Effect.retry for Resilience

**Network failures are common in pagination:**

```typescript
import { Effect, Schedule } from 'effect'

const fetchWithRetry = pipe(
  fetchOlderPlaysEffect(cursor),

  // Retry up to 3 times with exponential backoff
  Effect.retry(
    Schedule.exponential(Duration.seconds(1)).pipe(
      Schedule.compose(Schedule.recurs(3))
    )
  ),

  // Log retries
  Effect.tap(() =>
    Effect.logWarning('Retrying pagination request')
  )
)
```

**Retry Strategy:**

| Attempt | Delay | Total Wait |
|---------|-------|------------|
| 1 | 0s | 0s |
| 2 | 1s | 1s |
| 3 | 2s | 3s |
| 4 | 4s | 7s |

---

### 3. Effect.race for Timeout Handling

**Problem:** Slow API responses block UI

**Solution:**

```typescript
import { Effect, Duration } from 'effect'

const fetchWithTimeout = Effect.race(
  fetchOlderPlaysEffect(cursor),
  Effect.fail('Timeout').pipe(Effect.delay(Duration.seconds(10)))
)

// If fetch takes > 10s, returns timeout error
```

**UX Pattern:**
```typescript
const result = await Effect.runPromise(
  fetchWithTimeout.pipe(
    Effect.catchTag('Timeout', () =>
      Effect.succeed({ plays: [], cursor: null, hasMore: true })
    )
  )
)

// Show cached data + "Still loading..." message
```

---

### 4. Effect.forEach with Concurrency

**Batch Fetching Multiple Pages:**

```typescript
import { Effect, Chunk } from 'effect'

// Fetch 5 pages concurrently
const cursors = ['cursor1', 'cursor2', 'cursor3', 'cursor4', 'cursor5']

const allPages = pipe(
  Chunk.fromIterable(cursors),

  Effect.forEach(cursor =>
    fetchOlderPlaysEffect(cursor),
    { concurrency: 3 }  // Max 3 concurrent requests
  ),

  Effect.map(results =>
    Chunk.flatten(results.map(r => r.plays))
  )
)
```

**Use Case:** Gap filling when many pages missing

---

### 5. Effect.queue for Request Queuing

**Problem:** User scrolls rapidly, triggers many requests

**Solution: Request Queue**

```typescript
import { Effect, Queue } from 'effect'

const createPaginationQueue = Effect.gen(function* (_) {
  const queue = yield* _(Queue.unbounded<string>())

  // Worker that processes queue
  const worker = pipe(
    Queue.take(queue),
    Effect.flatMap(cursor => fetchOlderPlaysEffect(cursor)),
    Effect.repeat(Schedule.forever)
  )

  yield* _(Effect.fork(worker))

  return {
    enqueue: (cursor: string) => Queue.offer(queue, cursor)
  }
})

// Usage
const paginationQueue = await Effect.runPromise(createPaginationQueue)

// Multiple rapid calls queued, processed sequentially
paginationQueue.enqueue('cursor1')
paginationQueue.enqueue('cursor2')
paginationQueue.enqueue('cursor3')
```

---

## Performance Optimization

### 1. Request Batching

**Combine multiple small requests into one:**

```typescript
// ❌ BAD: 5 separate requests
for (const cursor of cursors) {
  await fetchPlays({ before: cursor, limit: 10 })
}

// ✅ GOOD: Single request with larger limit
await fetchPlays({ before: cursors[0], limit: 50 })
```

---

### 2. Predictive Prefetching

**Start loading next page before user scrolls:**

```typescript
const shouldPrefetchAtom = atom((get) => {
  const scrollPercentage = get(scrollPercentageAtom)
  const loading = get(paginationStateAtom).loading
  const prefetched = get(prefetchedAtom)

  return scrollPercentage > 70 && !loading && !prefetched
})

// Prefetch when 70% scrolled (before 80% trigger)
useEffect(() => {
  if (shouldPrefetch) {
    prefetchNextPage()
    setPrefetched(true)
  }
}, [shouldPrefetch])
```

**Performance Impact:**
- User reaches 80% threshold
- Next page already loaded
- Zero perceived latency

---

### 3. Incremental Rendering

**Don't block UI while processing large responses:**

```typescript
async function appendPlaysIncremental(plays: Play[]) {
  const chunks = chunkArray(plays, 10)

  for (const chunk of chunks) {
    appendToTimeline(chunk)
    await nextTick()  // Yield to browser
  }
}

// Renders 10 plays at a time, keeps UI responsive
```

---

### 4. Virtual Scrolling Integration

**TanStack Virtual with pagination:**

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

function VirtualTimeline() {
  const playIds = useAtomValue(playIdsListAtom)
  const loadMore = useSetAtom(loadOlderPlaysAtom)

  const virtualizer = useVirtualizer({
    count: playIds.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 5,

    // Load more when scrolled near end
    onScroll: (offset) => {
      const scrollPercentage = offset / virtualizer.getTotalSize()
      if (scrollPercentage > 0.8) {
        loadMore()
      }
    }
  })

  return (
    <div ref={scrollRef} style={{ height: '100vh', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(item => (
          <PlayCard
            key={playIds[item.index]}
            playId={playIds[item.index]}
            style={{
              position: 'absolute',
              top: item.start,
              height: item.size
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

---

## Error Handling & Resilience

### Client-Side Error Taxonomy

**1. Network Errors**
- DNS failure
- Connection timeout
- No internet connection

**Strategy:** Retry with exponential backoff

```typescript
Effect.retry(
  Schedule.exponential(Duration.seconds(1)).pipe(
    Schedule.recurs(3)
  )
)
```

---

**2. Server Errors (5xx)**
- 500 Internal Server Error
- 503 Service Unavailable

**Strategy:** Retry with backoff + show error after retries exhausted

```typescript
pipe(
  fetchOlderPlaysEffect,
  Effect.retry(Schedule.exponential(Duration.seconds(2))),
  Effect.catchAll(() =>
    Effect.succeed({ plays: [], cursor: null, hasMore: false })
  ),
  Effect.tap(() =>
    Effect.sync(() => {
      toast.error('Unable to load more plays. Please try again later.')
    })
  )
)
```

---

**3. Client Errors (4xx)**
- 400 Bad Request (invalid cursor)
- 404 Not Found
- 429 Rate Limit

**Strategy:** Don't retry, show specific error

```typescript
Effect.catchTag('BadRequest', (error) =>
  Effect.sync(() => {
    // Invalid cursor, reset pagination
    set(paginationCursorAtom, null)
    set(hasMorePlaysAtom, false)
    toast.error('Pagination error. Timeline reset.')
  })
)

Effect.catchTag('RateLimitExceeded', (error) =>
  Effect.sync(() => {
    const retryAfter = error.retryAfter || 60
    toast.error(`Rate limited. Retry in ${retryAfter}s`)

    // Disable loading for retry period
    setTimeout(() => {
      set(paginationStateAtom, { loading: false, error: null })
    }, retryAfter * 1000)
  })
)
```

---

### Graceful Degradation

**Offline Support:**

```typescript
const fetchOrUseCached = pipe(
  fetchOlderPlaysEffect(cursor),

  // If network fails, use cached data
  Effect.catchAll(() =>
    pipe(
      TimelineKVS,
      Effect.flatMap(kvs => kvs.getCachedPlays(cursor, 50)),
      Effect.map(plays => ({
        plays,
        cursor: null,
        hasMore: false,
        fromCache: true
      }))
    )
  )
)
```

**Partial Results:**

```typescript
// If some plays fail to load, show what we have
Effect.catchSome(error => {
  if (error.partialResults) {
    return Effect.succeed({
      plays: error.partialResults,
      cursor: error.cursor,
      hasMore: true,
      warning: 'Some plays failed to load'
    })
  }
  return Effect.fail(error)
})
```

---

## Testing Strategies

### Unit Tests

**Test Cursor Encoding/Decoding:**
```typescript
import { describe, it, expect } from 'vitest'

describe('Cursor', () => {
  it('should encode and decode cursor', () => {
    const cursor = { id: 100, airdate: '2025-11-16T10:00:00Z' }
    const encoded = encodeCursor(cursor)
    const decoded = decodeCursor(encoded)

    expect(decoded).toEqual(cursor)
  })

  it('should handle invalid cursor gracefully', () => {
    const result = decodeCursor('invalid-base64')
    expect(result).toBeNull()
  })
})
```

---

### Integration Tests

**Test Pagination Flow:**
```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { useAtomValue, useSetAtom } from '@effect-atom/atom-react'

describe('Pagination', () => {
  it('should load more plays on scroll', async () => {
    const { result } = renderHook(() => ({
      playIds: useAtomValue(playIdsListAtom),
      loadMore: useSetAtom(loadOlderPlaysAtom)
    }))

    expect(result.current.playIds).toHaveLength(0)

    // Trigger load
    await result.current.loadMore()

    await waitFor(() => {
      expect(result.current.playIds.length).toBeGreaterThan(0)
    })
  })

  it('should stop loading when hasMore is false', async () => {
    // Mock API to return hasMore: false
    mockAPI.getPlays.mockResolvedValue({
      plays: [],
      cursor: null,
      hasMore: false
    })

    const { result } = renderHook(() => useAtomValue(hasMorePlaysAtom))

    await waitFor(() => {
      expect(result.current).toBe(false)
    })
  })
})
```

---

### Effect Tests

**Test with Mock Services:**
```typescript
import { Effect, Layer } from 'effect'
import { describe, it } from '@effect/vitest'

describe('fetchOlderPlaysEffect', () => {
  it.effect('should fetch plays successfully', () =>
    Effect.gen(function* (_) {
      const result = yield* _(fetchOlderPlaysEffect(null, 50))

      expect(result.plays.length).toBeLessThanOrEqual(50)
      expect(result.hasMore).toBeDefined()
    }).pipe(
      Effect.provide(TestTimelineClient)
    )
  )

  it.effect('should retry on network error', () =>
    Effect.gen(function* (_) {
      let attempts = 0

      const failingClient = Layer.succeed(TimelineClient, {
        getPlays: () => Effect.sync(() => {
          attempts++
          if (attempts < 3) throw new Error('Network error')
          return { plays: [], cursor: null, hasMore: false }
        })
      })

      yield* _(fetchOlderPlaysEffect(null, 50))

      expect(attempts).toBe(3)
    }).pipe(
      Effect.provide(failingClient)
    )
  )
})
```

---

## Migration Paths

### From Offset-Based to Cursor-Based

**Phase 1: Dual-Mode API**
```typescript
// Support both old and new clients
GET /api/plays?offset=50&limit=50  // Old (offset)
GET /api/plays?cursor=abc&limit=50 // New (cursor)
```

**Phase 2: Deprecation**
```json
// Add deprecation warning
{
  "plays": [...],
  "warning": "Offset-based pagination is deprecated. Use cursor-based pagination."
}
```

**Phase 3: Migration**
```typescript
// Client migration
if (supportsModernAPI) {
  fetchWithCursor()
} else {
  fetchWithOffset()
}
```

**Phase 4: Sunset**
- Remove offset support after 6 months
- Return 410 Gone for offset requests

---

### From Polling to SSE

**Future Enhancement:**

```typescript
// Hybrid: SSE for real-time, pagination for history
const eventSource = new EventSource('/api/plays/stream')

eventSource.onmessage = (event) => {
  const newPlay = JSON.parse(event.data)
  prependToTimeline(newPlay)
}

// Pagination still works for scrolling back
const olderPlays = await fetchPlays({ before: cursor })
```

---

## Conclusion

Pull-based pagination is the optimal choice for our infinite scroll timeline because:

1. **Cursor-based pagination** provides consistent performance at scale
2. **Effect-TS integration** enables robust error handling and retry logic
3. **Client-side state management** with Effect Atom ensures reactive updates
4. **Virtual scrolling** maintains performance with unlimited data
5. **Hybrid push-pull** combines real-time feel with historical access

**Key Takeaways:**
- Use opaque cursors with versioning for flexibility
- Implement dual-source deduplication (push + pull)
- Leverage Effect patterns for resilience (retry, cache, queue)
- Test pagination edge cases thoroughly
- Monitor performance metrics (FPS, memory, network)

**Next Steps:**
1. Implement cursor-based API endpoint
2. Build Effect atoms for pagination state
3. Integrate TanStack Virtual
4. Add comprehensive error handling
5. Test with realistic data volumes

---

**Related Documents:**
- [Infinite Scroll Design Considerations](./infinite-scroll-design-considerations.md)
- [Infinite Scroll Timeline Architecture](./infinite-scroll-timeline-architecture.md)
- [Frontend Design](../FRONTEND_DESIGN.md)
- [Effect Atom Usage Guide](../effect-atom-usage-guide.md)
