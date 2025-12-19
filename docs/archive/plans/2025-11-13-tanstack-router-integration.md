# TanStack Router Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate TanStack Router with Effect Atom for type-safe routing with play detail route.

**Architecture:** TanStack Router handles route matching and navigation, Effect Atom manages all state (including URL search params). Components read route params via useParams() and pass to atoms for data fetching.

**Tech Stack:** TanStack Router v1.87, Effect Atom v0.4, Effect v3.19, React 18

---

## Task 1: Activate URL Sync Atoms

**Files:**
- Modify: `packages/web/src/atoms/timeline-url-sync-example.ts` → `packages/web/src/atoms/timeline-url-sync.ts`
- Modify: `packages/web/src/components/Timeline.tsx` (if it exists and uses these atoms)

**Step 1: Rename the atom file**

```bash
cd packages/web/src/atoms
git mv timeline-url-sync-example.ts timeline-url-sync.ts
```

Expected: File renamed in git

**Step 2: Verify the file structure**

```bash
cat packages/web/src/atoms/timeline-url-sync.ts | head -20
```

Expected: File shows atom exports (limitAtom, cursorAtom, etc.)

**Step 3: Check for imports of the old filename**

```bash
grep -r "timeline-url-sync-example" packages/web/src
```

Expected: No results (or results we'll fix in next task)

**Step 4: Commit the rename**

```bash
git add -A
git commit -m "refactor: rename timeline-url-sync-example to timeline-url-sync

Activate URL sync atoms for production use.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Create Play Detail Route

**Files:**
- Create: `packages/web/src/routes/play.$id.tsx`
- Read: `packages/web/src/atoms/timeline.ts` (to understand playAtom)

**Step 1: Read the existing playAtom implementation**

```bash
grep -A 10 "export const playAtom" packages/web/src/atoms/timeline.ts
```

Expected: See `Atom.family((id: number) => ...)` pattern

**Step 2: Create play detail route file**

Create `packages/web/src/routes/play.$id.tsx`:

```typescript
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useAtom } from '@effect-atom/atom-react'
import { playAtom } from '@/atoms/timeline'
import { Option } from 'effect'

export const Route = createFileRoute('/play/$id')({
  component: PlayDetailPage,
})

function PlayDetailPage() {
  const { id } = useParams({ from: '/play/$id' })
  const playOption = useAtom(playAtom(Number(id)))

  return (
    <div className="container mx-auto p-6">
      <header className="mb-6">
        <a
          href="/"
          className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
        >
          ← Back to Timeline
        </a>
      </header>

      {Option.match(playOption, {
        onNone: () => (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading play...</p>
          </div>
        ),
        onSome: (play) => (
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold mb-4">
              {play.artist || 'Unknown Artist'}
            </h1>
            <h2 className="text-xl text-gray-700 mb-6">
              {play.song || 'Unknown Song'}
            </h2>

            <dl className="space-y-3">
              {play.album && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Album</dt>
                  <dd className="text-base">{play.album}</dd>
                </div>
              )}

              {play.airdate && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Air Date</dt>
                  <dd className="text-base">{new Date(play.airdate).toLocaleString()}</dd>
                </div>
              )}

              <div>
                <dt className="text-sm font-medium text-gray-500">Play ID</dt>
                <dd className="text-base">{play.id}</dd>
              </div>
            </dl>
          </div>
        ),
      })}
    </div>
  )
}
```

**Step 3: Trigger route tree regeneration**

Start the dev server briefly to trigger TanStack Router plugin:

```bash
timeout 5 pnpm --filter @crate/web dev || true
```

Expected: Vite starts, router plugin generates routeTree.gen.ts

**Step 4: Verify route tree was generated**

```bash
grep "play/\$id" packages/web/src/routeTree.gen.ts
```

Expected: See play route in generated tree

**Step 5: Typecheck the new route**

```bash
pnpm --filter @crate/web check
```

Expected: No type errors

**Step 6: Commit the play detail route**

```bash
git add packages/web/src/routes/play.$id.tsx packages/web/src/routeTree.gen.ts
git commit -m "feat: add play detail route

Create /play/:id route using TanStack Router.
- Uses useParams to extract id from URL
- Fetches play data via existing playAtom(id)
- Displays play details with back link to timeline

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Add Navigation Links to Timeline

**Files:**
- Modify: `packages/web/src/components/Timeline.tsx` (or the component that renders play items)
- Read: `packages/web/src/components/` (to find the right component)

**Step 1: Find the component that renders play items**

```bash
grep -r "playAtom\|PlayItem\|play\.artist\|play\.song" packages/web/src/components --include="*.tsx" -l
```

Expected: Find the component file that renders individual plays

**Step 2: Read the current play item rendering**

```bash
# Adjust path based on Step 1 results
cat packages/web/src/components/[ComponentName].tsx
```

Expected: See how plays are currently rendered

**Step 3: Import Link from TanStack Router**

Add to imports section:

```typescript
import { Link } from '@tanstack/react-router'
```

**Step 4: Wrap play items with Link**

Replace clickable play elements with:

```typescript
<Link
  to="/play/$id"
  params={{ id: play.id }}
  className="block hover:bg-gray-50 transition-colors"
>
  {/* existing play content */}
</Link>
```

Note: Preserve existing className and structure, just wrap with Link

**Step 5: Test navigation in browser**

```bash
pnpm --filter @crate/web dev
```

Then manually:
1. Open http://localhost:5173
2. Click a play in the timeline
3. Verify URL changes to /play/123
4. Verify play detail page loads
5. Click "Back to Timeline"
6. Verify return to /

Expected: Navigation works, URL updates, browser back/forward work

**Step 6: Verify typecheck still passes**

```bash
pnpm --filter @crate/web check
```

Expected: No type errors

**Step 7: Commit the navigation links**

```bash
git add packages/web/src/components/[ComponentName].tsx
git commit -m "feat: add navigation links to play detail

Replace click handlers with TanStack Router Link components.
- Type-safe navigation to /play/:id
- Preserves browser history
- Back button works correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Improve Back Link with Search Param Preservation

**Files:**
- Modify: `packages/web/src/routes/play.$id.tsx`

**Step 1: Update back link to preserve search params**

Replace the `<a href="/">` in PlayDetailPage with:

```typescript
import { Link } from '@tanstack/react-router'

// In JSX:
<Link
  to="/"
  search={(prev) => prev}
  className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
>
  ← Back to Timeline
</Link>
```

**Step 2: Test search param preservation**

```bash
pnpm --filter @crate/web dev
```

Then manually:
1. Open http://localhost:5173/?cursor=test&limit=25
2. Click a play
3. Click "Back to Timeline"
4. Verify URL is /?cursor=test&limit=25 (params preserved)

Expected: Search params maintained across navigation

**Step 3: Verify typecheck**

```bash
pnpm --filter @crate/web check
```

Expected: No type errors

**Step 4: Commit the improvement**

```bash
git add packages/web/src/routes/play.$id.tsx
git commit -m "fix: preserve search params when navigating back to timeline

Use search={(prev) => prev} to maintain cursor, limit, and other
timeline URL params when returning from play detail page.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Final Verification and Documentation

**Files:**
- Read: All modified files for final review

**Step 1: Run full typecheck**

```bash
pnpm --filter @crate/web check
```

Expected: No type errors

**Step 2: Test complete user flow**

Start dev server and test:
```bash
pnpm --filter @crate/web dev
```

Manual testing:
1. Navigate to timeline
2. Add search params (?limit=100)
3. Click a play item
4. Verify play detail loads
5. Verify URL is /play/123
6. Click back link
7. Verify timeline loads with params preserved
8. Use browser back button
9. Verify navigation history works

Expected: All navigation smooth, no console errors

**Step 3: Review git log**

```bash
git log --oneline -5
```

Expected: See 5 commits:
1. Rename atoms file
2. Add play detail route
3. Add navigation links
4. Preserve search params
5. (this verification commit if needed)

**Step 4: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore: final cleanup for router integration

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Success Criteria

- [ ] TanStack Router integrated with Effect Atom
- [ ] Play detail route (/play/:id) working
- [ ] Navigation from timeline to play detail
- [ ] Back navigation preserves search params
- [ ] Type safety maintained (pnpm check passes)
- [ ] No console errors in browser
- [ ] Browser back/forward buttons work
- [ ] 4-5 atomic commits with clear messages

---

## Notes

- **Effect Atom owns URL state:** Search params managed by `Atom.searchParam()`, route params from `useParams()` passed to atoms
- **Type safety:** Router validates routes at compile time, Effect Schema validates search params at runtime
- **Minimal changes:** Existing Timeline atom logic unchanged, just adding routing layer
- **Browser integration:** Full history API support, shareable URLs with state

---

## Related Documentation

- TanStack Router: https://tanstack.com/router/latest
- Effect Atom: https://github.com/tim-smart/effect-atom
- Design doc: `docs/plans/2025-11-13-tanstack-router-integration-design.md`
