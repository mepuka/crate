# TanStack Router + Effect Atom Integration Design

**Date:** 2025-11-13
**Status:** Approved for implementation

## Overview

Integrate TanStack Router with Effect Atom for type-safe routing while maintaining Effect Atom as the single source of truth for all application state, including URL state.

## Goals

- Add proper routing with URL state management
- Create play detail route (`/play/:id`)
- Maintain Effect Atom for all frontend state
- Keep type safety with Effect Schema for URL params
- Minimal changes to existing Timeline implementation

## Architecture

### Separation of Concerns

**TanStack Router responsibilities:**
- Route matching and navigation
- Extracting path parameters (`:id`)
- Type-safe route definitions
- Code splitting by route

**Effect Atom responsibilities:**
- All application state management
- URL search params (`?cursor=xyz&limit=50`) via `Atom.searchParam()`
- Data fetching and caching via `Atom.runtime()` and `Atom.family()`
- Type validation with Effect Schema

**Component responsibilities:**
- Read route params with `useParams()`
- Manage state via atoms with `useAtom()`
- Pass route params to atoms for data fetching

### URL State Types

**Search params** (owned by atoms):
```
?cursor=eyJpZCI6MTIzfQ==&limit=50&since=2025-11-13T12:00:00Z
```
- Managed by `Atom.searchParam()` with Effect Schema validation
- Automatic bidirectional sync with URL
- Examples: cursor, limit, since, until, percentage, anchor_id

**Route params** (extracted by router):
```
/play/12345
```
- Extracted by router via `useParams()`
- Passed to atoms for data fetching
- Examples: play id

## Route Structure

```
/                    → Timeline page (uses search param atoms)
/play/:id            → Play detail page (uses route param + atom family)
```

### File Organization

```
packages/web/src/routes/
├── __root.tsx                 # Root layout (existing)
├── index.tsx                  # Timeline page at / (existing)
└── play.$id.tsx               # Play detail at /play/:id (new)

packages/web/src/atoms/
├── timeline-url-sync.ts       # Search param atoms (rename from -example)
├── timeline.ts                # Timeline data atoms (existing)
└── play-detail.ts             # Play detail atoms (new, if needed)
```

## Implementation Details

### Play Detail Route

```typescript
// packages/web/src/routes/play.$id.tsx
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useAtom } from '@effect-atom/atom-react'
import { playAtom } from '@/atoms/timeline'

export const Route = createFileRoute('/play/$id')({
  component: PlayDetailPage,
})

function PlayDetailPage() {
  const { id } = useParams({ from: '/play/$id' })
  const play = useAtom(playAtom(Number(id)))

  // Render play details
  return <div>{/* play UI */}</div>
}
```

### Navigation Pattern

**From Timeline to Play Detail:**
```typescript
import { Link } from '@tanstack/react-router'

function PlayItem({ play }) {
  return (
    <Link
      to="/play/$id"
      params={{ id: play.id }}
      className="play-link"
    >
      {play.artist} - {play.title}
    </Link>
  )
}
```

**Back to Timeline (preserving search params):**
```typescript
<Link to="/" search={(prev) => prev}>
  ← Back to Timeline
</Link>
```

### Existing Timeline Page

No changes needed to route file:
```typescript
// packages/web/src/routes/index.tsx (existing)
export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return <Timeline />  // Timeline uses search param atoms internally
}
```

The Timeline component internally uses atoms from `timeline-url-sync.ts` for URL state.

## Type Safety

### Router Type Safety
- TanStack Router auto-generates types for route params
- Compile-time errors for invalid routes or missing params
- Type-safe `Link` component requires correct params

### Atom Type Safety
- Effect Schema validates search params at runtime
- `Atom.searchParam()` uses `Schema.NumberFromString`, `Schema.String`, etc.
- `Atom.family()` provides type-safe parameterized atoms

## Migration Steps

1. **Rename atom file:**
   - `timeline-url-sync-example.ts` → `timeline-url-sync.ts`
   - Update imports in Timeline component

2. **Create play detail route:**
   - Add `packages/web/src/routes/play.$id.tsx`
   - Implement PlayDetailPage component using existing `playAtom()`

3. **Update Timeline component:**
   - Replace hardcoded links/clicks with `<Link to="/play/$id">`
   - Ensure search params are preserved

4. **Regenerate route tree:**
   - TanStack Router plugin will auto-update `routeTree.gen.ts`

## Benefits

1. **Clean separation:** Router handles routing, atoms handle state
2. **Type safety:** Compile-time route validation + runtime param validation
3. **Consistent API:** All reactive state through atoms
4. **Minimal changes:** Existing atom patterns work as-is
5. **No sync complexity:** No bidirectional sync between router and atoms needed

## Trade-offs

**Chosen approach:** Effect Atom as single source of truth for URL state

**Alternative considered:** Router search params as source of truth
- Would require syncing router state with atoms
- Would duplicate validation logic
- Rejected in favor of simpler atom-based approach

## Future Considerations

- Additional routes (settings, search, etc.) follow same pattern
- SSR/SSG could use router loaders + atoms together later
- Scroll restoration could be handled by router
- Route-based code splitting automatic with file-based routes
