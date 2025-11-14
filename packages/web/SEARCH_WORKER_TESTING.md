# Search Worker Testing Guide

This guide explains how to test the search worker integration.

## Overview

The search worker is a web worker that offloads search queries and data processing from the main thread. It uses:

- **Effect-TS** for type-safe, composable operations
- **@effect/platform** Worker API for structured communication
- **Schema** for automatic serialization/deserialization
- **effect-atom** for reactive integration with React

## Architecture

```
Main Thread                    Worker Thread
-----------                    -------------
SearchWorkerClient    <--->    search-worker.ts
     |                              |
     v                              v
Atom (searchQueryAtom)         SearchService
     |                         ChunkProcessorService
     v                              |
React Component                TimelineClient
```

## Files Created

### 1. Worker Implementation
- `/Users/pooks/Dev/crate/packages/web/src/workers/search-worker.ts` - Worker entry point
- `/Users/pooks/Dev/crate/packages/web/src/workers/search-worker-protocol.ts` - Message schemas
- `/Users/pooks/Dev/crate/packages/web/src/workers/search-worker-client.ts` - Main thread client

### 2. Atom Integration
- `/Users/pooks/Dev/crate/packages/web/src/atoms/search-worker.ts` - Reactive atoms

### 3. Test Component
- `/Users/pooks/Dev/crate/packages/web/src/components/SearchWorkerTest.tsx` - E2E test UI

### 4. Configuration
- `/Users/pooks/Dev/crate/packages/web/vite.config.ts` - Worker bundling config (updated)

## How to Test

### 1. Start the Development Server

```bash
cd /Users/pooks/Dev/crate/packages/web
npm run dev
```

### 2. Mount the Test Component

Add the test component to your app. For example, in `App.tsx` or a route:

```tsx
import { SearchWorkerTest } from '@/components/SearchWorkerTest'

export function App() {
  return (
    <div>
      <SearchWorkerTest />
    </div>
  )
}
```

### 3. Open Browser DevTools

1. Open Chrome/Firefox DevTools (F12)
2. Go to the **Console** tab
3. Watch for worker logs:
   - `SearchWorkerClient: Initializing worker pool`
   - `Search Worker: Ready`
   - `SearchWorkerClient: Searching for "..."`
   - `SearchWorkerClient: Received N results`

### 4. Test Search Functionality

1. Enter a search query (e.g., "funk soul", "radiohead", "jazz")
2. Click **Search**
3. Observe:
   - Loading state ("Loading...")
   - Results display (top 10 results shown)
   - Result count
   - Each result shows: artist, song, airdate

### 5. Verify Worker Communication

Check the **Network** tab in DevTools:
- Should see worker script load: `search-worker.ts`
- Worker runs in separate thread (check **Sources > Threads**)

## Expected Behavior

### Success Case
1. User enters query
2. Loading state appears
3. Worker executes search via TimelineClient
4. Results appear (Chunk<PlayResult>)
5. UI displays results

### Error Cases

#### No Results
- Query returns empty Chunk
- UI shows "Found 0 results"

#### Network Error
- Worker fails to fetch from API
- UI shows "Error occurred"
- Check console for error details

#### Worker Initialization Error
- Worker fails to load
- Check console for worker errors
- Verify vite.config.ts has worker configuration

## Troubleshooting

### Worker Not Loading

**Symptom:** No worker logs in console

**Fix:**
1. Check vite.config.ts has:
   ```ts
   worker: {
     format: 'es',
     plugins: () => [react()]
   }
   ```
2. Restart dev server
3. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+F5)

### Type Errors

**Symptom:** TypeScript errors in SearchWorkerClient

**Fix:**
1. Run: `npx tsc --noEmit` to see all errors
2. Check imports are correct:
   - `import * as Worker from "@effect/platform/Worker"`
   - `import * as BrowserWorker from "@effect/platform-browser/BrowserWorker"`

### Worker Crashes

**Symptom:** "Unexpected error occurred" message

**Fix:**
1. Check browser console for uncaught exceptions
2. Verify TimelineClient is properly wired in worker
3. Check search-worker.ts layer composition

### No Search Results

**Symptom:** Search completes but shows 0 results

**Fix:**
1. Verify API endpoint is accessible
2. Check API proxy in vite.config.ts:
   ```ts
   server: {
     proxy: {
       '/api': {
         target: 'https://cratemusic.duckdns.org',
         changeOrigin: true,
         rewrite: (path) => path.replace(/^\/api/, '')
       }
     }
   }
   ```
3. Try a known query that should return results

## Integration with Existing Code

### Using in Components

```tsx
import { useAtomValue } from '@effect-atom/atom-react'
import { searchQueryAtom } from '@/atoms/search-worker'

export function MyComponent() {
  const results = useAtomValue(searchQueryAtom("my query"))

  return Result.matchWithWaiting(results, {
    onWaiting: () => <div>Loading...</div>,
    onError: () => <div>Error</div>,
    onDefect: () => <div>Defect</div>,
    onSuccess: (s) => <div>Found {Chunk.size(s.value)} results</div>
  })
}
```

### Using with Effects

```tsx
import { SearchWorkerClient } from '@/workers'

const program = Effect.gen(function* () {
  const client = yield* SearchWorkerClient
  const results = yield* client.search("jazz", { limit: 100 })
  return results
})

// Run with layer
Effect.runPromise(
  program.pipe(Effect.provide(SearchWorkerClient.Default))
)
```

## Next Steps

Once basic testing passes:

1. **Add Concurrency Tests**
   - Multiple simultaneous searches
   - Test worker pool (increase size in SearchWorkerClient)

2. **Add Heavy Data Tests**
   - Large result sets
   - filterByDateRange with many plays
   - sortPlays with large chunks

3. **Add Error Recovery Tests**
   - Network failures
   - Invalid queries
   - Worker restarts

4. **Performance Testing**
   - Measure search time
   - Compare worker vs main thread
   - Profile memory usage

5. **Integration Testing**
   - Use with real Timeline data
   - Combine with other atoms
   - Test reactivity updates

## Success Criteria

- ✅ Worker loads without errors
- ✅ Search queries execute successfully
- ✅ Results display correctly in UI
- ✅ Loading states work properly
- ✅ Errors are handled gracefully
- ✅ Console shows proper log sequence
- ✅ TypeScript compiles without errors
- ✅ No runtime errors in console

## References

- Worker implementation: `packages/web/src/workers/search-worker.ts`
- Effect Source (local): `docs/effect-source/platform-browser/test/Worker.test.ts`
- Effect Patterns: `.claude/skills/effect-patterns-hub/patterns/`
- Atom docs: https://github.com/tim-smart/effect-atom
