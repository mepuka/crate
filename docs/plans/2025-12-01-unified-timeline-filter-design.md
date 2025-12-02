# Unified Timeline Filter Design

## Overview

Refactor MBID routes to filter the main timeline in place rather than loading separate pages. Users should feel like they're filtering through the crate in real-time.

## Goals

- Single unified timeline view for all filtering
- URL-based filter state using `Atom.searchParam()`
- Fade & collapse animation (200-300ms) for filter transitions
- Minimal filter chip showing active entity + play count
- Remove separate entity pages/components

## Architecture

### Filter State (URL-synced atoms)

Add to `timeline-url-sync.ts`:

```typescript
// MBID filter params - URL-synced via Atom.searchParam
export const artistMbidAtom = Atom.searchParam("artist_mbid", {
  schema: Schema.String,
})

export const recordingMbidAtom = Atom.searchParam("recording_mbid", {
  schema: Schema.String,
})

export const releaseMbidAtom = Atom.searchParam("release_mbid", {
  schema: Schema.String,
})

export const releaseGroupMbidAtom = Atom.searchParam("release_group_mbid", {
  schema: Schema.String,
})

// Derived: active filter (computed from URL params)
export const activeFilterAtom = Atom.make((get) => {
  const artist = Option.getOrUndefined(get(artistMbidAtom))
  const recording = Option.getOrUndefined(get(recordingMbidAtom))
  const release = Option.getOrUndefined(get(releaseMbidAtom))
  const releaseGroup = Option.getOrUndefined(get(releaseGroupMbidAtom))

  if (artist) return { type: "artist" as const, mbid: artist }
  if (recording) return { type: "recording" as const, mbid: recording }
  if (release) return { type: "release" as const, mbid: release }
  if (releaseGroup) return { type: "release_group" as const, mbid: releaseGroup }
  return null
})
```

Update `timelineParamsAtom` to include MBID params for API calls.

### Animation Flow

```
User clicks artist link
  -> URL updates to /?artist_mbid=xxx
  -> activeFilterAtom updates (URL-synced)
  -> Timeline detects filter change
  -> Trigger fade-out animation (150ms)
  -> Clear timeline state, fetch filtered data
  -> Fade-in new results (150ms)
```

CSS transitions on timeline wrapper:
```css
.timeline-content {
  transition: opacity 150ms ease-out;
}
.timeline-content.transitioning {
  opacity: 0;
}
```

### Filter Chip Component

New `FilterChip.tsx`:

```typescript
function FilterChip() {
  const filter = useAtomValue(activeFilterAtom)
  const metadata = useAtomValue(entityMetadataAtom(filter))

  if (!filter) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5
                    bg-zinc-800/80 rounded-full text-sm">
      <span className="text-zinc-300">{metadata.name}</span>
      <span className="text-zinc-500">·</span>
      <span className="text-zinc-400">{metadata.playCount.toLocaleString()} plays</span>
      <button
        onClick={clearFilter}
        className="ml-1 text-zinc-500 hover:text-zinc-300"
      >
        ×
      </button>
    </div>
  )
}
```

Placement: Above timeline, below header. Fades in/out with filter.

### Route Changes

**Redirects (keep URLs working but redirect to query params):**
- `/artist/$mbid` -> `/?artist_mbid=$mbid`
- `/recording/$mbid` -> `/?recording_mbid=$mbid`
- `/release/$mbid` -> `/?release_mbid=$mbid`
- `/album/$mbid` -> `/?release_group_mbid=$mbid`

**Delete:**
- `EntityPage.tsx`
- `EntityTimeline.tsx`
- `entity-timeline.ts` atoms

**Keep/Adapt:**
- `entity-metadata.ts` - used by FilterChip for name/count
- Main `/` route renders VirtualizedTimeline

### Timeline Atom Changes

Modify `timeline-infinite.ts`:

1. `loadInitialTimelinePageAtom` - read `activeFilterAtom`, include in API params
2. `loadNextTimelinePageAtom` - include current filter in pagination calls
3. Add effect to reset state when filter changes (clear pages, refetch)

### PlayCard Link Behavior

When user clicks artist/album in PlayCard:
- Instead of navigating to `/artist/$mbid`
- Navigate to `/?artist_mbid=$mbid` (same page, adds filter)
- Timeline animates filter transition

## Files to Modify

1. `atoms/timeline-url-sync.ts` - Add MBID atoms, activeFilterAtom
2. `atoms/timeline-infinite.ts` - Filter-aware fetching, reset on change
3. `components/VirtualizedTimeline.tsx` - Transition animation wrapper
4. `components/FilterChip.tsx` - New component
5. `components/PlayCard.tsx` - Update links to use query params
6. `routes/index.tsx` - Add FilterChip above timeline
7. `routes/artist.$mbid.tsx` - Convert to redirect
8. `routes/album.$mbid.tsx` - Convert to redirect
9. `routes/recording.$mbid.tsx` - Convert to redirect
10. `routes/release.$mbid.tsx` - Convert to redirect

## Files to Delete

- `components/EntityPage.tsx`
- `components/EntityTimeline.tsx`
- `atoms/entity-timeline.ts`

## Testing

1. Click artist name -> URL changes, timeline filters with animation
2. Click X on filter chip -> returns to full timeline
3. Browser back button -> returns to previous filter state
4. Direct URL with filter -> loads filtered timeline
5. Pagination works with filter applied
6. Old entity routes redirect correctly
