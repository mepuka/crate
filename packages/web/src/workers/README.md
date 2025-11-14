# Search Worker

Web Worker implementation for handling search queries and chunk timeline processing using Effect patterns.

## Architecture Overview

```
Main Thread                    Worker Thread
-----------                    -------------
React UI                       SearchService
  |                              - Search execution
  V                              - Retry logic
SearchWorkerClient    <--->    ChunkProcessorService
  |                              - Sorting
  | (typed messages)             - Filtering
  V                              - Grouping
BrowserWorker                  WorkerRunner
  |                              |
  +--- postMessage() ----------->+
  |                              |
  +<-- onmessage() --------------+
```

## Files

- **search-worker-protocol.ts** - Typed message protocol (requests/responses)
- **search-worker-errors.ts** - TaggedError types for expected errors
- **search-worker.ts** - Worker implementation with services
- **search-worker-client.ts** - Main thread client API
- **index.ts** - Public exports

## Effect Patterns Used

### 1. Services and Layers
**Pattern**: `model-dependencies-as-services.mdx`, `understand-layers-for-dependency-injection.mdx`

```typescript
// Define service interface
class SearchService extends Context.Tag("SearchService")<...> {}

// Implement service
const SearchServiceLive = Layer.succeed(SearchService, ...)

// Provide to program
Effect.provide(program, SearchServiceLive)
```

### 2. Tagged Errors
**Pattern**: `handle-errors-with-catch.mdx`, `pattern-catchtag.mdx`

```typescript
// Define error
class SearchError extends Data.TaggedError("SearchError")<{...}> {}

// Throw in Effect
yield* new SearchError({ query, reason })

// Catch specific error
program.pipe(
  Effect.catchTag("SearchError", (error) => handleError(error))
)
```

### 3. Effect.gen for Business Logic
**Pattern**: `use-gen-for-business-logic.mdx`

```typescript
const handleSearch = (request: SearchRequest) =>
  Effect.gen(function* () {
    const service = yield* SearchService
    const results = yield* service.executeSearch(...)
    return results
  })
```

### 4. Retry with Schedule
**Pattern**: `retry-based-on-specific-errors.mdx`

```typescript
executeSearch(...).pipe(
  Effect.retry(
    Schedule.exponential("100 millis").pipe(
      Schedule.intersect(Schedule.recurs(3))
    )
  )
)
```

### 5. Worker Communication
**Pattern**: Effect platform Worker API from local source

Uses Effect's `@effect/platform-browser` for structured worker communication:
- `BrowserWorker` - Main thread worker manager
- `BrowserWorkerRunner` - Worker thread runner
- Typed request/response protocol
- Automatic serialization/deserialization

## Usage

### Main Thread

```typescript
import { Effect } from "effect"
import { SearchWorkerClient, SearchWorkerClientLayer, searchInWorker } from "@/workers"

// Option 1: Using the service directly
const program = Effect.gen(function* () {
  const client = yield* SearchWorkerClient
  const results = yield* client.search("my query", { limit: 50 })
  return results
})

Effect.runPromise(
  program.pipe(Effect.provide(SearchWorkerClientLayer))
)

// Option 2: Using convenience functions
const search = searchInWorker("my query", { limit: 50 })

Effect.runPromise(
  search.pipe(Effect.provide(SearchWorkerClientLayer))
)
```

### Available Operations

```typescript
// Search
const results = yield* client.search("artist name", {
  limit: 100,
  threshold: 0.7
})

// Filter by date range
const filtered = yield* client.filterByDateRange(
  playsChunk,
  new Date("2024-01-01"),
  new Date("2024-01-31")
)

// Sort plays
const sorted = yield* client.sortPlays(playsChunk, "airdate-desc")

// Group by date
const grouped = yield* client.groupByDate(playsChunk, "day")

// Extract play IDs
const ids = yield* client.extractPlayIds(playsChunk, true)
```

## Implementation Status

### ✅ Completed (Scaffold)
- Typed message protocol with Schema
- Service architecture (SearchService, ChunkProcessorService)
- Error types with TaggedError
- Layer composition
- Client API structure
- Worker entry point

### ⏳ TODO: Critical Path

1. **Worker Instantiation** (PRIORITY 1)
   - Create Worker with Vite: `new Worker(new URL('./search-worker.ts', import.meta.url), { type: 'module' })`
   - Implement WorkerSpawnerLive
   - Wire up BrowserWorker.layer

2. **Message Passing** (PRIORITY 2)
   - Implement WorkerRunner.make with request handler
   - Add Schema encode/decode for all message types
   - Handle Chunk and HashMap serialization

3. **Search Implementation** (PRIORITY 3)
   - Implement SearchService.executeSearch
   - Add backend API client or local search
   - Handle search results properly

4. **Testing** (PRIORITY 4)
   - Unit tests for services
   - Mock worker for client tests
   - Integration tests with real worker

### 🔧 Optional Enhancements
- Worker pooling for concurrent requests
- Request batching optimization
- Memory management for large chunks
- Telemetry and monitoring
- Stream processing for large result sets

## Effect Source References

Based on local Effect source at `docs/effect-source/`:

- **Worker API**: `docs/effect-source/platform/src/Worker.ts`
- **WorkerRunner**: `docs/effect-source/platform/src/WorkerRunner.ts`
- **BrowserWorker**: `docs/effect-source/platform-browser/src/BrowserWorker.ts`
- **BrowserWorkerRunner**: `docs/effect-source/platform-browser/src/BrowserWorkerRunner.ts`

## Key Design Decisions

1. **Why Services?**
   - Encapsulates business logic separate from message handling
   - Easy to test with mock layers
   - Clear dependency boundaries

2. **Why TaggedErrors?**
   - Type-safe error handling
   - Pattern matching with catchTag
   - Clear error semantics (expected vs unexpected)

3. **Why Schema for Messages?**
   - Automatic serialization/validation
   - Type safety across thread boundary
   - Runtime type checking

4. **Why Chunk instead of Array?**
   - Consistent with Effect ecosystem
   - Immutable by design
   - Optimized for functional operations

## Common Patterns

### Adding a New Operation

1. Define request/response in `search-worker-protocol.ts`:
```typescript
export class MyRequest extends Schema.TaggedRequest<MyRequest>()(
  "MyRequest",
  {
    failure: Schema.Never,
    success: MyResponseSchema,
    payload: { ... }
  }
) {}
```

2. Add handler in `search-worker.ts`:
```typescript
const handleMyRequest = (request: MyRequest) =>
  Effect.gen(function* () {
    // Implementation
  })
```

3. Add to client in `search-worker-client.ts`:
```typescript
myOperation: (params) =>
  Effect.gen(function* () {
    const client = yield* SearchWorkerClient
    return yield* client.executeRequest(...)
  })
```

### Error Handling

```typescript
// In worker
yield* new SearchError({ query, reason: "Invalid query" })

// In client
client.search(query).pipe(
  Effect.catchTag("SearchError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`Search failed: ${error.reason}`)
      return Chunk.empty() // Fallback
    })
  )
)
```

## Next Steps

See TODO comments in each file for specific implementation tasks. Start with:

1. Get worker instantiation working (see `search-worker-client.ts`)
2. Implement basic message passing (see `search-worker.ts`)
3. Add one working operation end-to-end (suggest `sortPlays` as simplest)
4. Expand to other operations
5. Add comprehensive tests

## Resources

- Effect Workers Guide: https://effect.website/docs/guides/platform/workers
- Local Effect source: `docs/effect-source/platform-browser/`
- Effect Patterns: `.claude/skills/effect-patterns-hub/patterns/`
