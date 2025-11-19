# Stream Timeline Reactivity Architecture

## Overview

The stream timeline implementation demonstrates a robust reactivity pattern for real-time data updates using Effect-TS primitives. This document describes the complete reactivity flow from stream emission to UI updates.

## Complete Reactivity Flow

### Scenario: New play arrives via stream

**Step-by-step execution:**

1. **Stream emits PlayResult**
   - Timeline pagination stream or Mock SSE stream
   - Emits `PlayResult` objects

2. **TimelineKVS.storePlay() normalizes and stores**
   - Store individual play in KeyValueStore
   - Check if new play (HashSet lookup - O(1))
   - If new: Add to HashSet, prepend to cached chunk, re-sort
   - If existing: Update play in cached chunk (metadata change)
   - Invalidate reactivity keys

3. **Reactivity.invalidate() marks atoms as stale**
   - All atoms with `Atom.withReactivity(["timeline:plays_chunk"])` marked stale
   - Effect Atom runtime tracks invalidations

4. **Component reads atom (useAtomValue)**
   - Effect Atom sees atom is stale
   - Re-executes atom's Effect: `kvs.getPlaysChunk()`
   - Returns fresh `Chunk<PlayResult>` from KVS
   - Wraps in Result.Success

5. **Component converts Result to plain data**
   - `Result.matchWithWaiting()` safely unwraps
   - Converts `Chunk<PlayResult>` to `readonly PlayResult[]`

6. **React re-renders with new data**
   - React efficiently updates DOM

## Key Design Patterns

### 1. Incremental Updates (Performance)

**New implementation (incremental):**
```typescript
// Get current chunk
const currentChunk = yield* playsChunkStore.get("timeline:plays_chunk")

// Add new play and re-sort
const updatedChunk = sortPlaysByAirdateDesc(
  Chunk.prepend(currentChunk, play)
)

// Save updated chunk
yield* playsChunkStore.set("timeline:plays_chunk", updatedChunk)
```

**Performance gain:**
- O(n log n) sort vs O(n²) reconstruction
- No parallel fetching overhead
- Immediate cache availability

### 2. Manual Reactivity Invalidation

We use `Reactivity.invalidate()` because:

**Advantages:**
- Explicit control over when invalidations occur
- Works seamlessly with Effect Atom
- No additional abstraction layers needed
- Clear audit trail (logged invalidations)

### 3. Result-Based Error Handling

Effect Atom wraps all atom values in `Result<A, E>`:

```typescript
const data = Result.matchWithWaiting(result, {
  onWaiting: () => loadingFallback,
  onSuccess: (s) => s.value,
  onError: (e) => { logError(e); return errorFallback; },
  onDefect: (d) => { logDefect(d); return defectFallback; }
})
```

**Benefits:**
- Exhaustive handling (TypeScript enforces all cases)
- No silent failures
- Loading states built-in

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| storePlay (new) | O(n log n) | Prepend + re-sort chunk |
| storePlay (update) | O(n) | Map over chunk to replace |
| getPlaysChunk (cache hit) | O(1) | Read from KVS |
| getPlaysChunk (cache miss) | O(n log n) | Reconstruct + sort |
| HashSet lookup | O(1) | Check if play exists |
| Reactivity invalidation | O(k) | k = number of subscribed atoms |

### Concurrency

- **Storage operations**: Limited concurrency (50)
- **Chunk reconstruction**: Controlled concurrency
- **Stream processing**: Sequential (maintains order)

## Debugging Reactivity Issues

### Common Issues

**1. Plays not appearing in UI**

Debug:
```typescript
// Add logging to storePlay
yield* Effect.log(`[DEBUG] Storing play ${play.id}`)
yield* Effect.log(`[DEBUG] Invalidating reactivity`)

// Add logging to atom
yield* Effect.log(`[DEBUG] Reading chunk from KVS`)
const chunk = yield* kvs.getPlaysChunk()
yield* Effect.log(`[DEBUG] Chunk size: ${Chunk.size(chunk)}`)
```

**2. UI updates slowly (lag)**

Optimize:
- Limit chunk size (pagination, virtual scrolling)
- Use `streamRecentPlaysAtom` for limited display
- Memoize expensive computations

**3. Duplicate plays**

Check HashSet deduplication

## Conclusion

The stream timeline reactivity architecture demonstrates:

- **Robust cache invalidation** via `Reactivity.invalidate()`
- **Efficient incremental updates** (no full reconstruction)
- **Type-safe error handling** via `Result<A, E>`
- **Clear separation of concerns** (streams → KVS → atoms → UI)
- **Excellent performance** (O(1) reads, O(n log n) writes)

The implementation is production-ready and can handle real-time data streams with minimal latency and excellent UX.
