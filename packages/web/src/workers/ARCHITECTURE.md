# Search Worker Architecture

## Overview

A type-safe web worker implementation using Effect-TS patterns for offloading search queries and chunk timeline processing from the main thread.

## File Structure

```
packages/web/src/workers/
├── README.md                      # User guide and implementation status
├── ARCHITECTURE.md                # This file - architectural overview
├── index.ts                       # Public exports
├── search-worker-protocol.ts      # Typed message protocol
├── search-worker-errors.ts        # Tagged error definitions
├── search-worker.ts               # Worker implementation
├── search-worker-client.ts        # Main thread client API
└── example-usage.ts               # Usage examples
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Main Thread                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────┐        ┌─────────────────────────────┐          │
│  │                │        │  SearchWorkerClient         │          │
│  │  React UI      │───────▶│  (Context.Tag)              │          │
│  │  Components    │        │                             │          │
│  │                │        │  - search()                 │          │
│  │                │        │  - filterByDateRange()      │          │
│  └────────────────┘        │  - sortPlays()              │          │
│                            │  - groupByDate()            │          │
│                            │  - extractPlayIds()         │          │
│                            └──────────────┬──────────────┘          │
│                                           │                          │
│                                           │ Effect.provide()         │
│                                           │                          │
│                            ┌──────────────▼──────────────┐          │
│                            │  SearchWorkerClientLayer    │          │
│                            │  (Layer composition)        │          │
│                            └──────────────┬──────────────┘          │
│                                           │                          │
└───────────────────────────────────────────┼──────────────────────────┘
                                            │
                                            │ postMessage()
                                            │ (typed protocol)
                                            │
┌───────────────────────────────────────────┼──────────────────────────┐
│                          Worker Thread    │                          │
├───────────────────────────────────────────┼──────────────────────────┤
│                                           │                          │
│                            ┌──────────────▼──────────────┐          │
│                            │  BrowserWorkerRunner        │          │
│                            │  (Message handler)          │          │
│                            └──────────────┬──────────────┘          │
│                                           │                          │
│                                           │ dispatch                 │
│                                           │                          │
│                            ┌──────────────▼──────────────┐          │
│                            │  Request Handlers           │          │
│                            │                             │          │
│                            │  - handleSearchRequest      │          │
│                            │  - handleFilterByDateRange  │          │
│                            │  - handleSortPlays          │          │
│                            │  - handleGroupByDate        │          │
│                            │  - handleExtractPlayIds     │          │
│                            └─────────┬───────────┬───────┘          │
│                                      │           │                  │
│                         Effect.gen   │           │  Effect.gen      │
│                                      │           │                  │
│                  ┌───────────────────▼───────┐   │                  │
│                  │  SearchService            │   │                  │
│                  │  (Context.Tag)            │   │                  │
│                  │                           │   │                  │
│                  │  - executeSearch()        │   │                  │
│                  │    • Backend API call     │   │                  │
│                  │    • Vector search        │   │                  │
│                  │    • Retry with Schedule  │   │                  │
│                  └───────────────────────────┘   │                  │
│                                                  │                  │
│                              ┌───────────────────▼────────────┐    │
│                              │  ChunkProcessorService         │    │
│                              │  (Context.Tag)                 │    │
│                              │                                │    │
│                              │  - filterByDateRange()         │    │
│                              │  - sortPlays()                 │    │
│                              │  - groupByDate()               │    │
│                              │  - extractPlayIds()            │    │
│                              │                                │    │
│                              │  Uses timeline-utils:          │    │
│                              │  • sortPlaysByAirdateDesc()    │    │
│                              │  • filterPlaysByDateRange()    │    │
│                              │  • groupPlaysByDate/Week/Month │    │
│                              │  • extractPlayIds()            │    │
│                              └────────────────────────────────┘    │
│                                                                     │
│                            ┌──────────────────────────┐            │
│                            │  WorkerLive              │            │
│                            │  (Layer composition)     │            │
│                            │                          │            │
│                            │  Layer.mergeAll(         │            │
│                            │    SearchServiceLive,    │            │
│                            │    ChunkProcessorLive    │            │
│                            │  )                       │            │
│                            └──────────────────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Message Flow

### 1. Search Request Flow

```
React Component
    │
    │ const results = yield* searchInWorker("query")
    ▼
SearchWorkerClient.search("query")
    │
    │ Encode SearchRequest
    ▼
Worker.execute(SearchRequest)
    │
    │ postMessage({ _tag: "SearchRequest", ... })
    ▼
[Worker Thread]
    │
    ▼
BrowserWorkerRunner receives message
    │
    ▼
handleSearchRequest(request)
    │
    │ yield* SearchService
    ▼
SearchService.executeSearch(query)
    │
    │ • Call backend API
    │ • Filter by threshold
    │ • Limit results
    │ • Retry on failure
    ▼
Return Chunk<Play>
    │
    │ postMessage({ _tag: "Success", data: [...] })
    ▼
[Main Thread]
    │
    ▼
Worker.execute resolves
    │
    ▼
SearchWorkerClient.search returns Chunk<Play>
    │
    ▼
React Component renders results
```

### 2. Chunk Processing Flow

```
React Component with Chunk<Play>
    │
    │ const sorted = yield* sortInWorker(chunk, "airdate-desc")
    ▼
SearchWorkerClient.sortPlays(chunk, orderBy)
    │
    │ Serialize chunk (transfer to worker)
    ▼
Worker.execute(SortPlaysRequest)
    │
    │ postMessage({ _tag: "SortPlays", plays: [...], orderBy: "..." })
    ▼
[Worker Thread]
    │
    ▼
handleSortPlays(request)
    │
    │ yield* ChunkProcessorService
    ▼
ChunkProcessorService.sortPlays(plays, orderBy)
    │
    │ Uses timeline-utils
    ▼
sortPlaysByAirdateDesc(plays)
    │
    │ Pure function - sorts Chunk
    ▼
Return sorted Chunk<Play>
    │
    │ postMessage({ _tag: "Success", data: [...] })
    ▼
[Main Thread]
    │
    ▼
SearchWorkerClient.sortPlays returns sorted Chunk<Play>
    │
    ▼
React Component updates with sorted data
```

## Effect Patterns Applied

### 1. Service Pattern
**Files**: `search-worker.ts`, `search-worker-client.ts`

```typescript
// Define service interface
class SearchService extends Context.Tag("SearchService")<
  SearchService,
  { readonly executeSearch: (...) => Effect.Effect<...> }
>() {}

// Implement service
const SearchServiceLive = Layer.succeed(
  SearchService,
  SearchService.of({ executeSearch: (...) => Effect.gen(...) })
)

// Use service
Effect.gen(function* () {
  const service = yield* SearchService
  const result = yield* service.executeSearch(...)
})
```

**Benefits**:
- Clear separation of concerns
- Easy to test with mock layers
- Type-safe dependency injection

### 2. Layer Composition
**Files**: `search-worker.ts`, `search-worker-client.ts`

```typescript
// Combine service layers
const WorkerLive = Layer.mergeAll(
  SearchServiceLive,
  ChunkProcessorServiceLive
)

// Provide to program
Effect.provide(program, WorkerLive)
```

**Benefits**:
- Modular dependency management
- Easy to swap implementations (test vs prod)
- Clear dependency graph

### 3. Tagged Errors
**Files**: `search-worker-errors.ts`

```typescript
// Define error
class SearchError extends Data.TaggedError("SearchError")<{
  readonly query: string
  readonly reason: string
}> {}

// Use in Effect
yield* new SearchError({ query, reason: "Invalid" })

// Handle specifically
program.pipe(
  Effect.catchTag("SearchError", (error) => handleError(error))
)
```

**Benefits**:
- Type-safe error handling
- Pattern matching with catchTag
- Clear error semantics

### 4. Effect.gen for Business Logic
**Files**: `search-worker.ts`, `search-worker-client.ts`, `example-usage.ts`

```typescript
const operation = Effect.gen(function* () {
  const service = yield* MyService
  const result1 = yield* service.op1()
  const result2 = yield* service.op2(result1)
  return result2
})
```

**Benefits**:
- Readable sequential code
- Automatic error propagation
- Type inference

### 5. Retry with Schedule
**Files**: `search-worker.ts`

```typescript
executeSearch(...).pipe(
  Effect.retry(
    Schedule.exponential("100 millis").pipe(
      Schedule.intersect(Schedule.recurs(3))
    )
  )
)
```

**Benefits**:
- Resilient to transient failures
- Configurable retry strategies
- Built-in exponential backoff

### 6. Parallel Execution
**Files**: `example-usage.ts`

```typescript
const [result1, result2, result3] = yield* Effect.all(
  [operation1, operation2, operation3],
  { concurrency: "unbounded" }
)
```

**Benefits**:
- Maximum throughput
- Type-safe results
- Automatic error handling

## Type Safety

### Message Protocol
**File**: `search-worker-protocol.ts`

Uses Effect Schema for runtime validation:

```typescript
class SearchRequest extends Schema.TaggedRequest<SearchRequest>()(
  "SearchRequest",
  {
    failure: Schema.Never,
    success: Schema.Chunk(Schema.Unknown),
    payload: { query: Schema.String, ... }
  }
) {}
```

Benefits:
- Compile-time type safety
- Runtime validation
- Automatic serialization

### Request/Response Mapping
**File**: `search-worker-protocol.ts`

```typescript
export type WorkerResponseMap = {
  SearchRequest: SearchResponse
  FilterByDateRange: FilterByDateRangeResponse
  SortPlays: SortPlaysResponse
  // ...
}
```

Benefits:
- Type-safe request/response correlation
- IDE autocomplete
- Compile-time validation

## Concurrency Model

### Main Thread
- Single SearchWorkerClient instance
- Multiple concurrent requests supported
- Worker manages request queue

### Worker Thread
- Single-threaded (standard web worker)
- Processes requests sequentially
- Can spawn concurrent Effects within a request

### Future: Worker Pool
```typescript
const WorkerPoolLive = Layer.effect(
  SearchWorkerClient,
  WorkerPool.make({
    size: 4, // 4 workers
    concurrency: 10 // 10 concurrent requests per worker
  })
)
```

## Performance Considerations

### What to Offload to Worker
✅ **Good candidates**:
- Search query execution (network I/O)
- Large chunk sorting (CPU intensive)
- Date grouping of 1000+ plays (CPU intensive)
- Complex filtering operations

❌ **Bad candidates**:
- Small chunk operations (<100 items)
- Simple ID extraction
- Operations that serialize poorly

### Memory Management
- Chunk is immutable - creates copies
- Large chunks (>10k items) may impact serialization
- Consider Stream for very large datasets

### Message Serialization
- Structured clone algorithm (fast)
- Can't transfer functions, Symbols, DOM nodes
- Large arrays are copied, not transferred

## Testing Strategy

### Unit Tests
```typescript
// Test services in isolation
describe("ChunkProcessorService", () => {
  it("should sort plays by airdate", () => {
    const program = Effect.gen(function* () {
      const service = yield* ChunkProcessorService
      const result = yield* service.sortPlays(testChunk, "airdate-desc")
      expect(Chunk.size(result)).toBe(5)
    })

    Effect.runPromise(
      program.pipe(Effect.provide(ChunkProcessorServiceLive))
    )
  })
})
```

### Integration Tests
```typescript
// Test worker communication
describe("SearchWorkerClient", () => {
  it("should execute search in worker", () => {
    const program = Effect.gen(function* () {
      const client = yield* SearchWorkerClient
      const result = yield* client.search("test")
      expect(Chunk.size(result)).toBeGreaterThan(0)
    })

    Effect.runPromise(
      program.pipe(Effect.provide(SearchWorkerClientLayer))
    )
  })
})
```

### Mock Layers
```typescript
const MockSearchServiceLive = Layer.succeed(
  SearchService,
  SearchService.of({
    executeSearch: () => Effect.succeed(Chunk.of(mockPlay))
  })
)
```

## Error Handling Strategy

### Expected Errors (Error Channel)
- `SearchError` - Search failed (invalid query, backend error)
- `DateRangeError` - Invalid date range
- `ChunkProcessingError` - Chunk operation failed
- `SerializationError` - Message serialization failed

### Unexpected Errors (Defect Channel)
- Worker crashes
- Out of memory
- Programming errors (bugs)

### Recovery Strategies
1. **Retry** - Transient failures (network issues)
2. **Fallback** - Return empty results on error
3. **Propagate** - Let caller handle error
4. **Log and Continue** - Non-critical errors

## Future Enhancements

### 1. Stream Processing
For very large result sets (>10k items):

```typescript
const results: Stream.Stream<Play, WorkerError> =
  client.searchStream("query")

yield* Stream.runForEach(results, (play) => processPlay(play))
```

### 2. Request Batching
Combine multiple requests into single message:

```typescript
const batch = yield* client.batch([
  { _tag: "Search", query: "q1" },
  { _tag: "Search", query: "q2" },
  { _tag: "Sort", plays, order: "desc" }
])
```

### 3. Worker Pool
Multiple workers for parallel processing:

```typescript
const pool = yield* WorkerPool.make({
  size: 4,
  concurrency: 10
})
```

### 4. Incremental Results
Stream results as they arrive:

```typescript
const results = client.searchIncremental("query")

for await (const batch of results) {
  updateUI(batch)
}
```

## References

- **Effect Workers**: https://effect.website/docs/guides/platform/workers
- **Local Effect Source**: `/Users/pooks/Dev/crate/docs/effect-source/platform-browser/`
- **Effect Patterns**: `.claude/skills/effect-patterns-hub/patterns/`
- **Timeline Utils**: `packages/web/src/lib/timeline-utils.ts`

## Questions & Decisions

### Why Effect for Workers?
- Type-safe message passing
- Structured error handling
- Built-in retry/timeout logic
- Composable operations

### Why Services?
- Clear separation of concerns
- Easy testing with mock layers
- Type-safe dependency injection

### Why Chunk over Array?
- Immutable by design
- Consistent with Effect ecosystem
- Optimized for functional operations

### Why Not Just postMessage?
- No type safety
- Manual serialization
- Error handling complexity
- Hard to test
