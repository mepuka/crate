# Effect Atom Reactive Patterns

## Overview

This document explains the reactive patterns available with Effect Atom and `@effect/experimental`'s Reactivity service, when to use each pattern, and how they're implemented in the Crate web app.

## Architecture

The web app now includes `@effect/experimental` and configures Reactivity in the HTTP runtime:

```typescript
// lib/http-runtime.ts
import { Reactivity } from "@effect/experimental"

export const httpRuntime = Atom.runtime(
  configuredHttpLayer.pipe(Layer.provide(Reactivity.layer))
)
```

This enables reactive patterns for all atoms created with `httpRuntime`.

## Pattern 1: Manual State Management (Legacy Timeline Implementation)

### When to Use

- **Complex state with mutations**: Infinite scroll, pagination, list append operations
- **Explicit control needed**: Component needs to control when/how state updates
- **State persistence**: localStorage or sessionStorage persistence
- **Optimistic updates**: Immediately show changes before server confirms

### Example: Timeline Atom

```typescript
// Writable atom persisted to localStorage
const persistedTimelineAtom = Atom.kvs({
  runtime: localStorageRuntime,
  key: "timeline-state",
  schema: TimelineState,
  defaultValue: defaultTimelineState
})

export const timelineAtom = persistedTimelineAtom

// Mutation returns new state for component to write
export const appendPlaysAtom = httpRuntime.fn<string>()(
  (cursor, get) => Effect.gen(function* () {
    const currentState = get(persistedTimelineAtom)
    // ... fetch data ...
    return new TimelineState({
      ...currentState,
      plays: [...currentState.plays, ...newPlays] // Append, not replace
    })
  })
)
```

### Component Usage

```typescript
function Timeline() {
  const [state, setState] = useAtom(timelineAtom)
  const appendPlays = useAtomSet(appendPlaysAtom, { mode: "promiseExit" })

  const handleLoadMore = async () => {
    const exit = await appendPlays(state.cursor)
    if (Exit.isSuccess(exit)) {
      setState(exit.value) // Manual write persists to localStorage
    }
  }

  return <div>...</div>
}
```

### Advantages

- ✅ Full control over state updates
- ✅ Can append data without re-fetching
- ✅ Automatic localStorage persistence
- ✅ Optimistic updates possible
- ✅ Component controls timing of updates

### Disadvantages

- ❌ Manual Exit handling in components
- ❌ Manual loading state tracking
- ❌ More boilerplate code
- ❌ No automatic cache invalidation

## Pattern 2: Reactive State Management (Timeline + Simple Queries)

### When to Use

- **Simple queries**: Fetch and display data
- **Auto-refresh needed**: Query should refresh when mutations complete
- **No complex state**: Just display latest data, no pagination/append
- **Cache invalidation**: Mutations should automatically invalidate queries

### Example: Reactive Current Play Atom

```typescript
// Effect to fetch current play
const fetchCurrentPlayEffect = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const response = yield* client.execute(HttpClientRequest.get("/api/plays/current"))
  return yield* HttpClientResponse.schemaBodyJson(PlayResult)(response)
})

// Reactive atom - refetches when "current-play" key invalidated
const currentPlayAtom = httpRuntime.atom(fetchCurrentPlayEffect).pipe(
  Atom.withReactivity(["current-play"]), // Subscribe to reactivity key
  Atom.keepAlive
)

// Mutation that invalidates the atom
const skipPlayAtom = httpRuntime.fn()(
  () => Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    yield* client.execute(HttpClientRequest.post("/api/plays/skip"))
  }),
  { reactivityKeys: ["current-play"] } // Invalidate on success
)
```

### Component Usage

```typescript
import { Result, useAtomValue, useAtomSet } from "@effect-atom/atom-react"

function CurrentPlay() {
  const result = useAtomValue(currentPlayAtom) // Result<PlayResult>
  const skipPlay = useAtomSet(skipPlayAtom)

  return Result.match(result, {
    onInitial: () => <div>Loading...</div>,
    onFailure: (error) => <div>Error: {Cause.pretty(error.cause)}</div>,
    onSuccess: ({ value }) => (
      <div>
        <h2>Now Playing: {value.song} - {value.artist}</h2>
        <button onClick={() => skipPlay()}>Skip</button>
        {/* Atom auto-refreshes after skip! */}
      </div>
    )
  })
}
```

### Advantages

- ✅ No manual Exit handling - use Result.match
- ✅ No manual loading state - Result has states
- ✅ Automatic cache invalidation
- ✅ Less component boilerplate
- ✅ Declarative reactivity keys

### Disadvantages

- ❌ Refetches entire dataset (not suitable for append operations)
- ❌ Less control over update timing
- ❌ Can't do optimistic updates easily
- ❌ Not suitable for complex pagination

## Pattern Comparison

| Feature | Manual State | Reactive State |
|---------|-------------|----------------|
| Use Case | Complex state (pagination, infinite scroll) | Simple queries |
| Component Code | More boilerplate | Less boilerplate |
| Cache Invalidation | Manual | Automatic |
| Loading States | Manual useState | Built-in Result states |
| Error Handling | Manual Exit handling | Result.match |
| Optimistic Updates | Easy | Hard |
| Append Operations | Easy | N/A (refetches) |
| localStorage | Built-in with Atom.kvs | Possible but less common |

## Real-World Pattern Selection

### Use Manual State When:

1. **Infinite Scroll / Pagination**
   - Timeline feed
   - Search results with "Load More"
   - Chat history

2. **State Persistence Required**
   - localStorage caching
   - Session recovery
   - Draft state

3. **Complex State Mutations**
   - Reordering items
   - Multi-step forms
   - Optimistic UI updates

### Use Reactive State When:

1. **Simple Data Display**
   - User profile
   - Dashboard stats
   - Settings display

2. **Auto-Refresh Needed**
   - "Now Playing" indicator
   - Live notification count
   - Real-time status

3. **Mutation Triggers Refetch**
   - Create user → refetch user list
   - Update settings → refetch settings
   - Delete item → refetch list

## Reactivity Keys Convention

When using reactive patterns, follow this naming convention:

```typescript
// Entity-based keys
["user"]           // All user-related data
["user", userId]   // Specific user

// Resource-based keys
["timeline"]       // Timeline data
["current-play"]   // Current play data
["notifications"]  // Notification data

// Composite keys for complex relationships
{ user: [userId], posts: [userId] }
```

## Migration Path

If you want to migrate from manual to reactive:

```typescript
// Before: Manual state
const [data, setData] = useAtom(dataAtom)
const fetchMore = useAtomSet(fetchMoreAtom, { mode: "promiseExit" })

const handleFetch = async () => {
  const exit = await fetchMore()
  if (Exit.isSuccess(exit)) setData(exit.value)
}

// After: Reactive state
const data = useAtomValue(dataAtom) // dataAtom has withReactivity
const refetch = useAtomSet(refetchAtom) // refetchAtom has reactivityKeys

const handleRefetch = () => refetch() // Atom auto-updates!
```

## Summary

- **Timeline now uses the Reactive State pattern** via `timelineAtom`, which auto-refreshes and no longer manages manual persistence.
- Manual state remains a viable tool for complex flows (pagination, optimistic updates), but prefer the reactive approach when possible.
- `httpRuntime` includes Reactivity so all atoms can opt-in to automatic invalidation behavior.

## References

- [Effect Atom README - Reactivity Integration](https://github.com/tim-smart/effect-atom?tab=readme-ov-file#integration-with-reactivity-from-effectexperimental)
- [Effect Atom README - RPC Integration](https://github.com/tim-smart/effect-atom?tab=readme-ov-file#effectrpc-integration)
- [@effect/experimental Reactivity docs](https://effect-ts.github.io/effect/docs/guides/experimental/reactivity)
