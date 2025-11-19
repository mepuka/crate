# Bug Fixes Summary - November 16, 2025

## Issue: Album Bar Worker Missing Encoding Step

### Problem
Runtime error in album bar worker:
```
ParseError: DateFromString
Expected string, actual 2025-11-16T18:02:25.000Z
```

### Root Cause
Worker was returning unencoded objects with Date instances instead of encoding them for postMessage:
- **Worker received**: Encoded PlayResult (Date → string via schema decode)
- **Worker processed**: Created AlbumArtworkData objects with Date instances
- **Worker returned**: Raw objects WITHOUT encoding
- **Schema expected**: Encoded format (Date → string) for postMessage serialization

### Solution
Added `Schema.encode()` step before returning results, matching the pattern in search-worker:

```typescript
// Before (album-bar-worker.ts)
const handleRequest = (request: WorkerRequest) =>
  Match.type<WorkerRequest>().pipe(
    Match.tag("LoadAlbumArtwork", (r) =>
      Effect.gen(function* () {
        // ... decode, process ...
        return yield* service.processArtwork(plays, r.maxCount);  // ❌ Missing encode
      })
    ),

// After
const handleRequest = (request: WorkerRequest) =>
  Match.type<WorkerRequest>().pipe(
    Match.tag("LoadAlbumArtwork", (r) =>
      Effect.gen(function* () {
        // ... decode, process ...
        const artwork = yield* service.processArtwork(plays, r.maxCount);

        // ✅ Encode results for postMessage serialization
        return yield* Effect.forEach(
          artwork,
          (item) => Schema.encode(AlbumArtworkData)(item).pipe(Effect.orDie),
          { concurrency: 50 }
        );
      })
    ),
```

### Files Changed
1. `/Users/pooks/Dev/crate/packages/web/src/workers/album-bar-worker.ts` (lines 143-151)
   - Added encoding step
   - Changed concurrency from "unbounded" to 50

### Verification
- ✅ TypeScript compilation: No errors
- ✅ Pattern matches: search-worker.ts (lines 104-110, 278-280, 292-294)
- ✅ Worker communication: Properly encodes Date → string for postMessage

## Context

This fix was discovered during infinite scroll implementation testing. The album bar worker was processing data correctly but wasn't encoding the results before sending them back through postMessage, causing schema validation errors.

### Pattern Learned

**Effect Worker Serialization Pattern:**

All workers using `makePoolSerialized` must follow this pattern:

1. **Decode** incoming data: `Schema.decodeUnknown(Schema)(data)`
2. **Process** with typed objects (Date, etc.)
3. **Encode** before returning: `Schema.encode(Schema)(result)`

This ensures proper serialization across the postMessage boundary:
- Incoming: string → Date (decode)
- Processing: Date objects
- Outgoing: Date → string (encode)

Without the encode step, postMessage receives objects with Date instances, but the schema expects the encoded string format.
