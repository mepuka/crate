# State Architecture Summary

Quick reference for Crate's effect-atom state management system.

---

## State Philosophy

**URL as Single Source of Truth** → All navigation and data loading driven by URL state

```
URL (searchParams) → Parse → Fetch → Transform → Render
```

---

## Core Atom Categories

### 1. URL State (Source of Truth)

```typescript
// Play IDs in URL: ?plays=123,456,789
const urlPlayIdsAtom = Atom.searchParam("plays", Schema...)

// View mode: ?view=timeline
const urlViewModeAtom = Atom.searchParam("view", Schema...)

// Search query: ?q=radiohead
const urlSearchQueryAtom = Atom.searchParam("q", Schema...)
```

**Benefits**:
- Shareable URLs
- Browser back/forward
- Deep linking
- Bookmarkable states

---

### 2. Viewport State (Scroll & Visibility)

```typescript
// Scroll position (pixels)
const scrollPositionAtom = Atom.state(0)

// Debounced for performance
const debouncedScrollAtom = scrollPositionAtom.pipe(
  Atom.debounce("100 millis")
)

// Calculated visible plays
const visiblePlayIdsAtom = Atom.make((get) => {
  const scroll = get(debouncedScrollAtom)
  const viewport = get(viewportDimensionsAtom)
  // ... calculate visible range
})
```

---

### 3. Data State (API Fetches)

```typescript
// Runtime with services
const runtimeAtom = Atom.runtime(
  Layer.mergeAll(PlaysService.Default, TimelineService.Default)
)

// Fetch plays (effectful)
const playsDataAtom = runtimeAtom.atom(
  Effect.gen(function*() {
    const get = yield* Atom.Context
    const range = get(playsRangeAtom)
    const service = yield* PlaysService
    return yield* service.getPlaysInRange(range)
  })
)

// Returns: Result.Result<FactPlay[], HttpError>
```

---

### 4. Derived State (Transformations)

```typescript
// Parse URL play IDs
const parsedPlayIdsAtom = Atom.make((get) => {
  const maybeIds = get(urlPlayIdsAtom)
  return Option.getOrElse(maybeIds, () => [])
})

// Timeline percentage calculator
const playIdToPercentageAtom = Atom.make((get) => {
  return (playId: number) => (playId / 2_200_000) * 100
})

// Plays as Map for O(1) lookup
const playsMapAtom = Atom.make((get) => {
  const result = get(playsDataAtom)
  if (result._tag !== "Success") return new Map()
  return new Map(result.value.map(p => [p.id, p]))
})
```

---

### 5. Atom Families (Parameterized)

```typescript
// Individual play atom
const playAtomFamily = Atom.family((playId: number) =>
  Atom.make((get) => {
    const map = get(playsMapAtom)
    return map.get(playId)
  })
)

// Play card UI state
const playCardUIAtomFamily = Atom.family((playId: number) =>
  Atom.state({
    isHovered: false,
    isExpanded: false
  })
)

// Usage: playAtomFamily(123) → always same atom instance
```

---

### 6. Persisted State (localStorage/sessionStorage)

```typescript
// Theme in localStorage
const themeAtom = Atom.kvs(
  "theme",
  Schema.Literal("light", "dark", "auto"),
  { defaultValue: "dark" }
)

// Timeline settings
const timelineSettingsAtom = Atom.kvs(
  "timelineSettings",
  Schema.Struct({
    showDensity: Schema.Boolean,
    showMarkers: Schema.Boolean
  }),
  { defaultValue: { showDensity: true, showMarkers: true } }
)
```

---

### 7. Function Atoms (Mutations)

```typescript
// Add play to URL
const addPlayToUrlAtom = runtimeAtom.fn(
  Effect.fnUntraced(function*(playId: number) {
    const get = yield* Atom.Context
    const current = get(parsedPlayIdsAtom)
    const newIds = [...current, playId]
    get.set(urlPlayIdsAtom, Option.some(newIds))
  })
)

// Usage in component:
const addPlay = useAtomSet(addPlayToUrlAtom, { mode: "promiseExit" })
await addPlay(123456)
```

---

## React Hook Patterns

### Read-Only

```typescript
function PlayCard({ playId }) {
  const play = useAtomValue(playAtomFamily(playId))
  return <div>{play?.song}</div>
}
```

### Write-Only

```typescript
function ScrollHandler() {
  const setScroll = useAtomSet(scrollPositionAtom)

  const handleScroll = (e) => {
    setScroll(e.target.scrollTop)
  }

  return <div onScroll={handleScroll}>...</div>
}
```

### Read + Write

```typescript
function ThemeToggle() {
  const [theme, setTheme] = useAtom(themeAtom)

  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      Toggle Theme
    </button>
  )
}
```

### Suspense

```typescript
function Timeline() {
  // Suspends until loaded
  const density = useAtomSuspense(timelineDensityAtom)
  return <DensityChart data={density} />
}

// Wrap with Suspense boundary
<Suspense fallback={<Loading />}>
  <Timeline />
</Suspense>
```

### Subscribe

```typescript
function ScrollLogger() {
  useAtomSubscribe(scrollPositionAtom, (position) => {
    console.log('Scroll:', position)
  })
  return null
}
```

---

## Atom Dependency Graph

```
urlPlayIdsAtom (URL: ?plays=1,2,3)
  ↓
parsedPlayIdsAtom (derived)
  ↓
playsRangeAtom (derived: {start, end})
  ↓
playsDataAtom (effectful: fetch from API)
  ↓
playsMapAtom (derived: array → Map)
  ↓
playAtomFamily(id) (family: individual play)

scrollPositionAtom (writable)
  ↓
debouncedScrollAtom (debounced: 100ms)
  ↓
visiblePlayIdsAtom (derived: calculate visible range)
  ↓
Components (render)
```

---

## Performance Patterns

### 1. Debouncing

```typescript
const debouncedAtom = expensiveAtom.pipe(
  Atom.debounce("100 millis")
)
```

### 2. Lazy Loading

```typescript
const lazyAtom = expensiveAtom.pipe(
  Atom.setLazy(true) // Don't compute until subscribed
)
```

### 3. Idle TTL

```typescript
const tempAtom = dataAtom.pipe(
  Atom.setIdleTTL("30 seconds") // Dispose after 30s idle
)
```

### 4. Keep Alive

```typescript
const globalAtom = Atom.make(initialValue).pipe(
  Atom.keepAlive // Never dispose
)
```

### 5. Batch Updates

```typescript
yield* Atom.batch(
  Effect.gen(function*() {
    get.set(atom1, value1)
    get.set(atom2, value2)
    get.set(atom3, value3)
    // All updates trigger single render
  })
)
```

---

## State Flow Examples

### Example 1: Navigate to Plays

```
User clicks "View Plays" button
  ↓
Set urlPlayIdsAtom (URL updates: ?plays=1,2,3)
  ↓
parsedPlayIdsAtom recomputes
  ↓
playsRangeAtom recomputes
  ↓
playsDataAtom refetches (Effect executes)
  ↓
Components re-render with new data
```

### Example 2: Scroll Timeline

```
User scrolls
  ↓
Set scrollPositionAtom (immediate)
  ↓
debouncedScrollAtom updates (after 100ms)
  ↓
visiblePlayIdsAtom recomputes
  ↓
Components re-render (only visible plays)
```

### Example 3: Click Timeline Position

```
User clicks timeline at 50%
  ↓
timelineClickAtom function executes
  ↓
Calculate playId from percentage (derived atom)
  ↓
Add playId to urlPlayIdsAtom
  ↓
Scroll to position (scrollPositionAtom)
  ↓
URL updates + scroll happens
  ↓
Components re-render
```

---

## Key Advantages

### 1. URL-Driven
- **Shareable**: Copy URL = share state
- **Bookmarkable**: Save URL = save state
- **History**: Browser back/forward works

### 2. Type-Safe
- **Effect Schema**: Validate all state
- **TypeScript**: Full type inference
- **No runtime errors**: Schema catches invalid state

### 3. Reactive
- **Automatic**: Dependencies tracked automatically
- **Efficient**: Only recompute what changed
- **Declarative**: Define relationships, not updates

### 4. Composable
- **Layers**: Services compose with Layers
- **Atoms**: Atoms compose with `get`
- **Effects**: Effects compose with `Effect.gen`

### 5. Testable
- **Mock atoms**: Replace with test values
- **Mock services**: Replace with test layers
- **Deterministic**: No hidden state

---

## Common Patterns

### Pattern: URL → API → UI

```typescript
// 1. URL state
const urlIdAtom = Atom.searchParam("id", Schema.Number)

// 2. Fetch data
const dataAtom = runtimeAtom.atom(
  Effect.gen(function*() {
    const id = (yield* Atom.Context)(urlIdAtom)
    const service = yield* DataService
    return yield* service.getById(id)
  })
)

// 3. Render
function Component() {
  const data = useAtomSuspense(dataAtom)
  return <div>{data.name}</div>
}
```

### Pattern: Infinite Scroll

```typescript
// Pull-based pagination
const pullAtom = Atom.pull(
  Stream.paginateChunkEffect(
    { offset: 0, limit: 20 },
    ({ offset, limit }) =>
      fetchPage(offset, limit).pipe(
        Effect.map(items => [
          Chunk.fromIterable(items),
          items.length === limit
            ? Option.some({ offset: offset + limit, limit })
            : Option.none()
        ])
      )
  )
)

// Component
function InfiniteList() {
  const [result, loadMore] = useAtom(pullAtom)

  return (
    <div>
      {result.items.map(item => <Item key={item.id} item={item} />)}
      {!result.done && (
        <button onClick={loadMore}>Load More</button>
      )}
    </div>
  )
}
```

### Pattern: Optimistic Updates

```typescript
const optimisticAtom = Atom.optimisticFn(
  // Reducer: immediate UI update
  (state, newItem) => [...state, newItem],
  // Async: actual API call
  runtimeAtom.fn(
    Effect.fnUntraced(function*(item) {
      const service = yield* ItemService
      return yield* service.create(item)
    })
  )
)

function AddItemButton() {
  const [items, addItem] = useAtom(optimisticAtom)

  const handleClick = async () => {
    await addItem(newItem) // UI updates immediately, API call in background
  }

  return <button onClick={handleClick}>Add</button>
}
```

---

## File Structure

```
packages/frontend/
  src/
    atoms/
      url.ts              # URL state atoms (searchParam)
      viewport.ts         # Scroll, dimensions
      plays.ts            # Plays data atoms
      timeline.ts         # Timeline-specific atoms
      ui.ts               # UI state (modals, etc.)
      preferences.ts      # Theme, settings (kvs)
      runtime.ts          # AtomRuntime setup
    hooks/
      usePlayData.ts      # Custom hooks wrapping atoms
      useTimeline.ts
      useVirtualScroll.ts
    components/
      Timeline/
        Timeline.tsx
        TimelineAtoms.ts  # Component-local atoms
      PlayCard/
        PlayCard.tsx
        PlayCardAtoms.ts
    services/
      PlaysService.ts     # Effect services
      TimelineService.ts
```

---

## Quick Start

### 1. Install

```bash
npm install @effect-atom/atom @effect-atom/atom-react effect
```

### 2. Create Runtime

```typescript
// atoms/runtime.ts
import { Atom } from "@effect-atom/atom"
import { Layer } from "effect"

export const runtimeAtom = Atom.runtime(
  Layer.mergeAll(
    PlaysService.Default,
    TimelineService.Default
  )
)
```

### 3. Define Atoms

```typescript
// atoms/plays.ts
export const urlPlayIdsAtom = Atom.searchParam("plays", Schema...)
export const playsDataAtom = runtimeAtom.atom(/* Effect */)
```

### 4. Use in Components

```typescript
// components/PlaysList.tsx
import { useAtomValue } from "@effect-atom/atom-react"

function PlaysList() {
  const plays = useAtomValue(playsDataAtom)
  return <div>{/* render */}</div>
}
```

---

## References

- **effect-atom**: https://github.com/tim-smart/effect-atom
- **Effect**: https://effect.website/
- **Full Architecture**: See `effect-atom-state-architecture.md`
- **CSS Patterns**: See `advanced-css-patterns-research.md`
