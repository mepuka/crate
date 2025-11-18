# Effect Atom Mutable State Pattern

## Problem

When implementing infinite scroll state management with Effect Atom, you need **mutable state** that can be updated from action atoms. The initial attempt used `get.set()` to mutate atoms, but this resulted in type errors because the state atom was created as a **read-only** atom.

## Solution

Effect Atom provides **Writable atoms** that can be mutated via `get.set()`. The key is understanding the different overloads of `Atom.make()`:

### Read-Only Atom (Wrong for Mutable State)

```typescript
// ❌ Creates a READ-ONLY atom - cannot use get.set()
export const myStateAtom = Atom.make(() => initialValue);
```

### Writable Atom (Correct for Mutable State)

```typescript
// ✅ Creates a WRITABLE atom - can use get.set()
export const myStateAtom = Atom.make(initialValue);
```

The difference is **passing the value directly** vs **passing a function**.

## Type Signatures

From Effect Atom source (`Atom.d.ts`):

```typescript
export declare const make: {
  // Effectful atoms (returns Result)
  <A, E>(create: (get: Context) => Effect.Effect<A, E, Scope | AtomRegistry>): Atom<Result.Result<A, E>>;

  // Read-only derived atoms
  <A>(create: (get: Context) => A): Atom<A>;

  // ✅ WRITABLE atom - pass value directly
  <A>(initialValue: A): Writable<A>;
};
```

And the `Context` interface (what you get in action atoms):

```typescript
export interface Context {
  <A>(atom: Atom<A>): A;
  // ✅ set method requires a Writable atom
  set<R, W>(this: Context, atom: Writable<R, W>, value: W): void;
  setSelf<A>(this: Context, a: A): void;
  // ... other methods
}
```

## Complete Pattern for Infinite Scroll

### 1. Define State Interface

```typescript
export interface TimelineInfiniteState {
  readonly pages: ReadonlyArray<TimelinePage>;
  readonly status: "idle" | "loading-initial" | "loading-more" | "error";
  readonly error?: unknown;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
  readonly initialParams: TimelineParams;
  readonly initialMethod: TimelineNavigationMethod;
  readonly totalCount?: number;
  readonly anchorPosition?: {
    readonly pageIndex: number;
    readonly itemIndex: number;
  };
}
```

### 2. Create Initial State

```typescript
const initialInfiniteState: TimelineInfiniteState = {
  pages: [],
  status: "idle",
  hasMore: true,
  initialParams: { limit: 50 },
  initialMethod: "cursor",
};
```

### 3. Create Writable Atom

```typescript
/**
 * Writable atom for infinite scroll state.
 *
 * Pattern: Pass initial value directly to Atom.make() to create Writable<T>
 * This enables mutation via get.set() from action atoms.
 */
export const timelineInfiniteStateAtom = Atom.make(initialInfiniteState);
```

### 4. Create Action Atoms that Mutate State

```typescript
/**
 * Action atom: Load initial timeline page.
 * Uses get.set() to update the writable state atom.
 */
export const loadInitialTimelinePageAtom = TimelineRuntime.fn<void>()(
  (_, get) =>
    Effect.gen(function* () {
      const config = get(timelineInitialConfigAtom);

      // ✅ Update state to loading
      get.set(timelineInfiniteStateAtom, {
        ...initialInfiniteState,
        status: "loading-initial",
        initialParams: config.params,
        initialMethod: config.method,
      });

      // Fetch data
      const result = yield* loadInitialPageEffect(config);

      // ✅ Update state with success
      get.set(timelineInfiniteStateAtom, {
        pages: [{ params: result.params, response: result.response }],
        status: "idle",
        hasMore: result.response.has_more,
        initialParams: result.params,
        initialMethod: result.method,
        ...(result.response.next_cursor && { nextCursor: result.response.next_cursor }),
        ...(result.response.total_count !== null && { totalCount: result.response.total_count }),
      });
    })
);
```

### 5. Create Derived Atoms (Read from Writable Atom)

```typescript
/**
 * Derived atom: All play IDs from loaded pages.
 * Reads from the writable state atom - automatically reactive.
 */
export const allLoadedPlayIdsAtom = Atom.make((get) => {
  const state = get(timelineInfiniteStateAtom);

  return pipe(
    state.pages,
    Array.flatMap((page) => page.response.results),
    Array.map((play) => play.id),
    Array.dedupe
  );
});
```

### 6. Use in React Components

```typescript
function VirtualizedTimeline() {
  // Read state (reactive)
  const playIds = useAtomValue(allLoadedPlayIdsAtom);
  const loadingState = useAtomValue(timelineLoadingStateAtom);

  // Action atoms (mutations)
  const [, loadMore] = useAtom(loadNextTimelinePageAtom);

  // Mount action on component mount
  useAtomMount(loadInitialTimelinePageAtom);

  return (
    <div>
      {playIds.map(id => <PlayCard key={id} playId={id} />)}
      {loadingState.isLoadingMore && <Spinner />}
      <button onClick={() => loadMore()}>Load More</button>
    </div>
  );
}
```

## Key Patterns

### ✅ DO: Create Writable Atoms for Mutable State

```typescript
// For state that needs mutation
const stateAtom = Atom.make(initialValue);

// Then mutate from action atoms
const actionAtom = runtime.fn<Args>()((args, get) =>
  Effect.gen(function* () {
    get.set(stateAtom, newValue);
  })
);
```

### ✅ DO: Use Derived Atoms for Computed Values

```typescript
// Automatically recomputes when stateAtom changes
const derivedAtom = Atom.make((get) => {
  const state = get(stateAtom);
  return computeValue(state);
});
```

### ❌ DON'T: Try to Write to Read-Only Atoms

```typescript
// ❌ WRONG - creates read-only atom
const atom = Atom.make(() => value);

// ❌ Type error: atom is not Writable
get.set(atom, newValue);
```

### ❌ DON'T: Use React State for Atom-Managed Data

```typescript
// ❌ WRONG - mixing paradigms
const [state, setState] = useState(initialState);
const atomValue = useAtomValue(someAtom);

// ✅ RIGHT - keep all state in atoms
const state = useAtomValue(stateAtom);
const updateState = useAtom(actionAtom);
```

## TypeScript ExactOptionalPropertyTypes

When using `exactOptionalPropertyTypes: true` in TypeScript, optional properties cannot be explicitly set to `undefined`. Use conditional spreading:

```typescript
// ❌ Type error with exactOptionalPropertyTypes
const state: State = {
  required: "value",
  optional: undefined, // Error!
};

// ✅ Conditional spreading
const state: State = {
  required: "value",
  ...(optionalValue && { optional: optionalValue }),
};
```

## Runtime Setup

Action atoms that use services (like HttpClient) need those services in the runtime:

```typescript
export const TimelineRuntime = Atom.runtime(
  Layer.mergeAll(
    Reactivity.layer,
    BrowserKeyValueStore.layerLocalStorage,
    FetchHttpClient.layer,
    TimelineKVS.Default,
    AlbumBarWorkerClient.Default,
    TimelineClient.layer // ✅ Include service layers
  )
);

// Then use in action atoms
export const fetchAtom = TimelineRuntime.fn<void>()(
  (_, get) => Effect.gen(function* () {
    const client = yield* TimelineClient; // ✅ Service available
    // ...
  })
);
```

## References

- **Effect Atom Source**: `/Users/pooks/Dev/crate/node_modules/@effect-atom/atom/dist/dts/Atom.d.ts`
- **Writable Type**: Lines 89-92 (Writable interface)
- **make Overloads**: Lines 158-173 (showing writable vs read-only)
- **Context.set**: Line 113 (requires Writable atom)

## Related Documentation

- `docs/effect-atom-usage-guide.md` - General Effect Atom patterns
- `docs/timeline-atoms-infinite-scroll.md` - Architecture overview
- `.claude/skills/effect-index/SKILL.md` - Effect patterns index
