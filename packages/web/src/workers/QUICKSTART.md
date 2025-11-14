# Search Worker - Quick Start Guide

## Installation

No installation needed - worker is part of the web package.

## Basic Usage

### 1. Import the Client

```typescript
import { SearchWorkerClient, SearchWorkerClientLayer } from "@/workers"
import { Effect } from "effect"
```

### 2. Use in an Effect Program

```typescript
const myProgram = Effect.gen(function* () {
  // Get client from context
  const client = yield* SearchWorkerClient

  // Execute search
  const results = yield* client.search("my query", {
    limit: 50,
    threshold: 0.7
  })

  return results
})

// Run with layer
Effect.runPromise(
  myProgram.pipe(Effect.provide(SearchWorkerClientLayer))
)
```

### 3. Use Convenience Functions

```typescript
import { searchInWorker, sortInWorker } from "@/workers"

const program = Effect.gen(function* () {
  const results = yield* searchInWorker("query")
  const sorted = yield* sortInWorker(results, "airdate-desc")
  return sorted
})
```

## Common Operations

### Search

```typescript
const results = yield* client.search("artist name", {
  limit: 100,        // Max results (default: 100)
  threshold: 0.6     // Min similarity (default: 0.5)
})
```

### Filter by Date

```typescript
const filtered = yield* client.filterByDateRange(
  playsChunk,
  new Date("2024-01-01"),
  new Date("2024-12-31")
)
```

### Sort

```typescript
const sorted = yield* client.sortPlays(playsChunk, "airdate-desc")
// Options: "airdate-desc", "airdate-asc", "similarity-desc", "id-desc", "id-asc"
```

### Group by Date

```typescript
const grouped = yield* client.groupByDate(playsChunk, "day")
// Options: "day", "week", "month"
// Returns: Record<string, Chunk<Play>>
```

### Extract Play IDs

```typescript
const ids = yield* client.extractPlayIds(playsChunk, true)
// Second arg: sorted (true = sort by airdate desc)
```

## Error Handling

### Catch All Errors

```typescript
const results = yield* pipe(
  client.search("query"),
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      yield* Effect.logError(`Search failed: ${String(error)}`)
      return Chunk.empty() // Fallback
    })
  )
)
```

### Catch Specific Errors

```typescript
import { SearchError } from "@/workers"

const results = yield* pipe(
  client.search("query"),
  Effect.catchTag("SearchError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`Query "${error.query}" failed: ${error.reason}`)
      return Chunk.empty()
    })
  )
)
```

## Parallel Operations

```typescript
const [results1, results2, sorted] = yield* Effect.all(
  [
    client.search("query1"),
    client.search("query2"),
    client.sortPlays(chunk, "airdate-desc")
  ],
  { concurrency: "unbounded" }
)
```

## Sequential Operations

```typescript
const result = yield* pipe(
  client.search("rock"),
  Effect.flatMap((results) =>
    client.filterByDateRange(results, startDate, endDate)
  ),
  Effect.flatMap((filtered) =>
    client.sortPlays(filtered, "similarity-desc")
  ),
  Effect.flatMap((sorted) =>
    client.extractPlayIds(sorted, false)
  )
)
```

## Timeout

```typescript
const results = yield* pipe(
  client.search("query"),
  Effect.timeout("5 seconds"),
  Effect.flatMap((option) =>
    option._tag === "None"
      ? Effect.succeed(Chunk.empty())
      : Effect.succeed(option.value)
  )
)
```

## Retry

```typescript
const results = yield* pipe(
  client.search("query"),
  Effect.retry({
    times: 3,
    schedule: Effect.Schedule.exponential("100 millis")
  })
)
```

## React Integration

### With @effect-atom

```typescript
import { atom } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react"

const searchResultsAtom = atom((get) =>
  Effect.gen(function* () {
    const client = yield* SearchWorkerClient
    const query = get(searchQueryAtom)
    return yield* client.search(query)
  }).pipe(Effect.provide(SearchWorkerClientLayer))
)

function SearchResults() {
  const results = useAtomValue(searchResultsAtom)

  return Result.matchWithWaiting(results, {
    onWaiting: () => <div>Searching...</div>,
    onSuccess: (chunk) => <div>{Chunk.size(chunk.value)} results</div>,
    onError: (error) => <div>Error: {String(error)}</div>,
    onDefect: (defect) => <div>Defect: {String(defect)}</div>
  })
}
```

## Debugging

### Enable Logging

All worker operations include Effect logging:

```typescript
const program = Effect.gen(function* () {
  yield* Effect.logInfo("Starting search")
  const results = yield* client.search("query")
  yield* Effect.logInfo(`Found ${Chunk.size(results)} results`)
  return results
})
```

View logs in browser console.

## Performance Tips

### ✅ Good Use Cases
- Searching large datasets (1000+ plays)
- Sorting/filtering 500+ items
- Complex date grouping operations
- Network-bound search queries

### ❌ Avoid Worker For
- Small chunks (<100 items)
- Simple operations (extracting IDs from small chunks)
- Operations with large serialization overhead

### Optimize Serialization
- Use `concurrency` parameter to batch operations
- Prefer IDs over full Play objects when possible
- Consider streaming for very large results

## Troubleshooting

### Worker Not Running
- Check browser console for worker errors
- Verify Vite worker config (TODO: not yet implemented)
- Check WorkerSpawnerLive is properly configured

### Type Errors
- Ensure SearchWorkerClientLayer is provided
- Check import paths
- Verify Effect/Chunk types match

### No Results
- Check search query
- Verify backend API is running
- Add logging to debug worker execution

### Slow Performance
- Reduce chunk sizes
- Add concurrency limits
- Consider pagination for large results

## Next Steps

1. **Read Full Docs**: See `README.md` for implementation details
2. **View Examples**: Check `example-usage.ts` for more patterns
3. **Understand Architecture**: Read `ARCHITECTURE.md`
4. **Implement TODOs**: See worker files for implementation tasks

## Quick Reference Card

| Operation | Method | Example |
|-----------|--------|---------|
| Search | `client.search(query, opts)` | `client.search("rock", { limit: 50 })` |
| Filter | `client.filterByDateRange(chunk, start, end)` | `client.filterByDateRange(plays, new Date(), new Date())` |
| Sort | `client.sortPlays(chunk, order)` | `client.sortPlays(plays, "airdate-desc")` |
| Group | `client.groupByDate(chunk, granularity)` | `client.groupByDate(plays, "day")` |
| Extract IDs | `client.extractPlayIds(chunk, sorted)` | `client.extractPlayIds(plays, true)` |

## Common Patterns

### Search with Fallback
```typescript
const results = yield* client.search("query").pipe(
  Effect.catchAll(() => Effect.succeed(Chunk.empty()))
)
```

### Search with Timeout and Retry
```typescript
const results = yield* pipe(
  client.search("query"),
  Effect.timeout("5 seconds"),
  Effect.retry({ times: 3 }),
  Effect.catchAll(() => Effect.succeed(Chunk.empty()))
)
```

### Filter Recent + Sort
```typescript
const recent = yield* pipe(
  client.search("query"),
  Effect.flatMap((results) =>
    client.filterByDateRange(results, last30Days, now)
  ),
  Effect.flatMap((filtered) =>
    client.sortPlays(filtered, "airdate-desc")
  )
)
```

## Help & Support

- **Issues**: File on project tracker
- **Questions**: Ask in team chat
- **Effect Docs**: https://effect.website
- **Patterns**: `.claude/skills/effect-patterns-hub/`
