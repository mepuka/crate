# Link Display Component Design

**Date:** 2025-01-14
**Status:** Design Complete
**Based on:** `docs/comment-links-implementation-report.md`

---

## Overview

Design for displaying links extracted from KEXP DJ comments using Effect-TS patterns, featuring:
- Featured link previews in timeline (minimalist)
- Full categorized link display in details panel
- Unified hover coordination between comment highlights and previews
- Composable, functional programming-based component architecture

**Key Requirements:**
- Schema-validated link types using Effect Schema unions
- Atom.family for per-play memoization
- Data.TaggedClass for structural equality
- Consistent design language across timeline and details contexts
- Hover state coordination via link IDs

---

## Architecture: Layered Abstraction

```
┌─────────────────────────────────────────┐
│ Component Layer                         │
│ - CommentWithLinks (highlight)          │
│ - FeaturedLinkPreview (timeline)        │
│ - LinksByCategory (details)             │
│ - Platform components (Youtube, SC...)  │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ Atom Layer (State Management)           │
│ - playLinksAtom (Atom.family)           │
│ - featuredLinkAtom (derived)            │
│ - linksByCategoryAtom (derived)         │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ Data Layer (Effect Models)              │
│ - Schema.Union link types               │
│ - Data.TaggedClass for equality         │
│ - HashMap for categorization            │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ Utility Layer (Pure Functions)          │
│ - URL extraction & normalization        │
│ - Domain categorization                 │
│ - Metadata extraction                   │
└─────────────────────────────────────────┘
```

---

## Data Layer: Schema-Based Link Types

### Schema Definitions

All link types use Effect Schema for validation and Data.TaggedClass for structural equality.

```typescript
// packages/web/src/lib/links/models.ts
import { Schema, Data, Chunk, HashMap, Option } from "effect"

// Base fields shared by all links
const BaseLinkFields = {
  id: Schema.String,              // nanoid for hover coordination
  url: Schema.String,              // Original URL from comment
  normalizedUrl: Schema.String,    // Cleaned, protocol-added URL
  domain: Schema.String,           // Extracted domain (e.g., "youtube.com")
  position: Schema.Struct({        // Position in comment text
    start: Schema.Number,
    end: Schema.Number
  })
}

// YouTube link with video-specific data
export const YoutubeLinkSchema = Schema.Struct({
  ...BaseLinkFields,
  _tag: Schema.Literal("Youtube"),
  videoId: Schema.String,
  thumbnailUrl: Schema.String      // https://img.youtube.com/vi/{id}/mqdefault.jpg
})

export class YoutubeLink extends Data.TaggedClass("YoutubeLink")<
  Schema.Schema.Type<typeof YoutubeLinkSchema>
> {}

// SoundCloud link with track data
export const SoundCloudLinkSchema = Schema.Struct({
  ...BaseLinkFields,
  _tag: Schema.Literal("SoundCloud"),
  trackId: Schema.String,
  permalink: Schema.String,
  artworkUrl: Schema.optionalWith(Schema.String, { exact: true })
})

export class SoundCloudLink extends Data.TaggedClass("SoundCloudLink")<
  Schema.Schema.Type<typeof SoundCloudLinkSchema>
> {}

// KEXP link (blog, main site)
export const KexpLinkSchema = Schema.Struct({
  ...BaseLinkFields,
  _tag: Schema.Literal("Kexp"),
  path: Schema.String,             // URL path for routing
  isBlog: Schema.Boolean           // blog.kexp.org vs kexp.org
})

export class KexpLink extends Data.TaggedClass("KexpLink")<
  Schema.Schema.Type<typeof KexpLinkSchema>
> {}

// Generic link for other platforms (social, news, websites)
export const GenericLinkSchema = Schema.Struct({
  ...BaseLinkFields,
  _tag: Schema.Literal("Generic"),
  category: Schema.Literal("Social", "News", "Website", "Other"),
  favicon: Schema.optionalWith(Schema.String, { exact: true })
})

export class GenericLink extends Data.TaggedClass("GenericLink")<
  Schema.Schema.Type<typeof GenericLinkSchema>
> {}

// Union of all link types (discriminated by _tag)
export const ExtractedLinkSchema = Schema.Union(
  YoutubeLinkSchema,
  SoundCloudLinkSchema,
  KexpLinkSchema,
  GenericLinkSchema
)

export type ExtractedLink =
  | YoutubeLink
  | SoundCloudLink
  | KexpLink
  | GenericLink
```

### Container Model

```typescript
// PlayLinks: Container for all links in a play
export const PlayLinksSchema = Schema.Struct({
  playId: Schema.Number,
  links: Schema.Chunk(ExtractedLinkSchema),        // All extracted links
  byCategory: Schema.HashMap(                       // Grouped for details panel
    Schema.String,
    Schema.Chunk(ExtractedLinkSchema)
  ),
  featuredLink: Schema.OptionFromNullOr(ExtractedLinkSchema) // Priority link for timeline
})

export class PlayLinks extends Data.TaggedClass("PlayLinks")<
  Schema.Schema.Type<typeof PlayLinksSchema>
> {}
```

**Design decisions:**
- `Schema.Union` enables exhaustive type checking in components
- `Data.TaggedClass` provides structural equality for React memoization
- `id` field (nanoid) coordinates hover states between comment and preview
- `position` field enables accurate link highlighting in comment text
- `featuredLink` selection priority: Video > MusicPlatform > others

---

## Utility Layer: Link Extraction

Pure functions for parsing, categorizing, and extracting metadata.

### Main Entry Point

```typescript
// packages/web/src/lib/links/extraction.ts
import { Chunk, HashMap, Option, pipe } from "effect"
import { PlayLinks, ExtractedLink, YoutubeLink, SoundCloudLink, KexpLink, GenericLink } from "./models"
import { nanoid } from "nanoid"

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"{}|\\^`\[\]]+[^\s<>"{}|\\^`\[\].,;:!?]/gi

/**
 * Extract all links from comment and build PlayLinks model.
 * Pure function - no side effects, fully deterministic.
 */
export function extractLinksFromComment(
  playId: number,
  comment: string
): PlayLinks {
  const matches = Array.from(comment.matchAll(new RegExp(URL_PATTERN)))

  const links = pipe(
    matches,
    Chunk.fromIterable,
    Chunk.map((match) => {
      const url = match[0]
      const normalizedUrl = normalizeUrl(url)
      const domain = getDomain(normalizedUrl)
      const category = categorizeLink(domain)

      return createTypedLink({
        id: nanoid(),
        url,
        normalizedUrl,
        domain,
        category,
        position: {
          start: match.index!,
          end: match.index! + url.length
        }
      })
    })
  )

  const byCategory = groupByCategory(links)
  const featuredLink = selectFeaturedLink(links)

  return PlayLinks.make({
    playId,
    links,
    byCategory,
    featuredLink
  })
}
```

### URL Processing

```typescript
/**
 * Normalize URL: add protocol, clean trailing punctuation
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim()

  // Add protocol if missing
  if (normalized.startsWith('www.')) {
    normalized = 'https://' + normalized
  }
  if (!normalized.match(/^https?:\/\//)) {
    normalized = 'https://' + normalized
  }

  return normalized
}

/**
 * Extract domain from URL (remove www prefix)
 */
function getDomain(url: string): string {
  try {
    const parsed = new URL(url)
    let domain = parsed.hostname.toLowerCase()
    if (domain.startsWith('www.')) {
      domain = domain.slice(4)
    }
    return domain
  } catch {
    return url // Fallback if URL parsing fails
  }
}

/**
 * Categorize link by domain patterns
 */
function categorizeLink(domain: string): string {
  if (domain.includes('youtube.com') || domain.includes('youtu.be') || domain.includes('vimeo.com')) {
    return 'Video'
  }

  if (domain.includes('bandcamp.com') || domain.includes('soundcloud.com') ||
      domain.includes('spotify.com') || domain.includes('apple.com/music')) {
    return 'MusicPlatform'
  }

  if (domain.includes('twitter.com') || domain.includes('x.com') ||
      domain.includes('facebook.com') || domain.includes('instagram.com')) {
    return 'Social'
  }

  if (domain.includes('kexp.org') || domain.includes('npr.org') ||
      domain.includes('pitchfork.com') || domain.includes('rollingstone.com')) {
    return 'News'
  }

  if (domain.match(/\.(com|org|net|io|co)$/)) {
    return 'Website'
  }

  return 'Other'
}
```

### Typed Link Creation

```typescript
/**
 * Create properly typed link based on domain analysis.
 * Returns specific link class (YoutubeLink, SoundCloudLink, etc.)
 */
function createTypedLink(base: {
  id: string
  url: string
  normalizedUrl: string
  domain: string
  category: string
  position: { start: number; end: number }
}): ExtractedLink {
  const { normalizedUrl, domain } = base

  // YouTube
  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    const videoId = extractYouTubeVideoId(normalizedUrl)
    if (videoId) {
      return YoutubeLink.make({
        ...base,
        _tag: "Youtube",
        videoId,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
      })
    }
  }

  // SoundCloud
  if (domain.includes('soundcloud.com')) {
    const trackId = extractSoundCloudTrackId(normalizedUrl)
    if (trackId) {
      return SoundCloudLink.make({
        ...base,
        _tag: "SoundCloud",
        trackId,
        permalink: normalizedUrl
      })
    }
  }

  // KEXP
  if (domain.includes('kexp.org')) {
    const path = new URL(normalizedUrl).pathname
    return KexpLink.make({
      ...base,
      _tag: "Kexp",
      path,
      isBlog: domain.startsWith('blog.')
    })
  }

  // Generic fallback
  return GenericLink.make({
    ...base,
    _tag: "Generic",
    category: base.category as "Social" | "News" | "Website" | "Other"
  })
}

/**
 * Extract YouTube video ID from various URL formats
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:v=|\/)([0-9A-Za-z_-]{11})/,
    /(?:embed\/)([0-9A-Za-z_-]{11})/,
    /(?:youtu\.be\/)([0-9A-Za-z_-]{11})/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

/**
 * Extract SoundCloud track ID from URL
 */
function extractSoundCloudTrackId(url: string): string | null {
  // SoundCloud uses permalinks, use URL path as ID
  try {
    const path = new URL(url).pathname
    return path.split('/').filter(Boolean).join('/')
  } catch {
    return null
  }
}
```

### Categorization & Selection

```typescript
/**
 * Group links by category using HashMap
 */
function groupByCategory(
  links: Chunk.Chunk<ExtractedLink>
): HashMap.HashMap<string, Chunk.Chunk<ExtractedLink>> {
  return pipe(
    links,
    Chunk.reduce(HashMap.empty<string, Chunk.Chunk<ExtractedLink>>(), (map, link) => {
      const category = link._tag === "Generic" ? link.category : link._tag
      return HashMap.modify(map, category, (existing) =>
        Option.match(existing, {
          onNone: () => Chunk.of(link),
          onSome: (chunk) => Chunk.append(chunk, link)
        })
      )
    })
  )
}

/**
 * Select featured link for timeline display.
 * Priority: Youtube > SoundCloud > Kexp > Generic
 */
function selectFeaturedLink(
  links: Chunk.Chunk<ExtractedLink>
): Option.Option<ExtractedLink> {
  // Priority 1: Video (YouTube)
  const video = Chunk.findFirst(links, (l) => l._tag === "Youtube")
  if (Option.isSome(video)) return video

  // Priority 2: Music Platform (SoundCloud)
  const music = Chunk.findFirst(links, (l) => l._tag === "SoundCloud")
  if (Option.isSome(music)) return music

  // Priority 3: KEXP
  const kexp = Chunk.findFirst(links, (l) => l._tag === "Kexp")
  if (Option.isSome(kexp)) return kexp

  // Fallback: First link
  return Chunk.head(links)
}
```

**Design decisions:**
- Pure functions enable easy testing and reasoning
- `pipe` for composable data transformations
- `Chunk` instead of arrays for immutability
- `HashMap` for efficient category grouping
- `Option` for explicit null handling

---

## Atom Layer: State Management

Atoms provide memoized link extraction per play using `Atom.family`.

```typescript
// packages/web/src/atoms/link-atoms.ts
import { Atom } from "@effect-atom/atom"
import { Result, Chunk, HashMap, Option } from "effect"
import { playAtom } from "./timeline"
import { PlayLinks } from "@/lib/links/models"
import { extractLinksFromComment } from "@/lib/links/extraction"

/**
 * Extract links for a specific play.
 *
 * Automatically memoized per playId via Atom.family.
 * Only recomputes when play.comment changes.
 */
export const playLinksAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const playResult = get(playAtom(playId))

    return Result.matchWithWaiting(playResult, {
      onWaiting: () => PlayLinks.make({
        playId,
        links: Chunk.empty(),
        byCategory: HashMap.empty(),
        featuredLink: Option.none()
      }),
      onSuccess: (s) => {
        const play = s.value
        if (!play.comment) {
          return PlayLinks.make({
            playId,
            links: Chunk.empty(),
            byCategory: HashMap.empty(),
            featuredLink: Option.none()
          })
        }

        // Extract links using pure utility function
        return extractLinksFromComment(playId, play.comment)
      },
      onError: () => PlayLinks.make({
        playId,
        links: Chunk.empty(),
        byCategory: HashMap.empty(),
        featuredLink: Option.none()
      }),
      onDefect: () => PlayLinks.make({
        playId,
        links: Chunk.empty(),
        byCategory: HashMap.empty(),
        featuredLink: Option.none()
      })
    })
  })
)

/**
 * Get just the featured link for timeline display.
 * Derived from playLinksAtom for performance.
 */
export const featuredLinkAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const playLinks = get(playLinksAtom(playId))
    return playLinks.featuredLink
  })
)

/**
 * Get links grouped by category for details panel.
 */
export const linksByCategoryAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const playLinks = get(playLinksAtom(playId))
    return playLinks.byCategory
  })
)
```

**Design decisions:**
- `Atom` imported from `@effect-atom/atom` (not `effect` core package)
- `get(atom)` API (not `get.get(atom)`) following effect-atom conventions
- `Result.matchWithWaiting` to handle `playAtom` Result (not Option)
- Handles all Result states: onWaiting, onSuccess, onError, onDefect
- `Atom.family` provides automatic memoization per playId
- Reuses existing `playAtom` from timeline atoms (no duplication)
- Derived atoms (`featuredLinkAtom`, `linksByCategoryAtom`) for specific use cases
- Empty `PlayLinks` returned for plays without comments (safe defaults)

---

## Component Layer

### Comment with Highlighted Links

Parses comment text and highlights links with hover coordination.

```typescript
// packages/web/src/components/CommentWithLinks.tsx
import { useState } from "react"
import { useAtomValue } from "@effect-atom/atom-react"
import { Chunk } from "effect"
import { playLinksAtom } from "@/atoms/link-atoms"
import { cn } from "@/lib/utils"

interface CommentWithLinksProps {
  playId: number
  comment: string
  variant?: "timeline" | "details"
}

export function CommentWithLinks({
  playId,
  comment,
  variant = "details"
}: CommentWithLinksProps) {
  const playLinks = useAtomValue(playLinksAtom(playId))
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null)

  // Parse comment into text and link segments
  const segments = parseCommentSegments(comment, playLinks.links)

  return (
    <div className={cn("comment-text", variant === "timeline" && "text-sm")}>
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.content}</span>
        ) : (
          <a
            key={i}
            href={segment.link.normalizedUrl}
            data-link-id={segment.link.id}
            className={cn(
              "link-highlight",
              hoveredLinkId === segment.link.id && "link-active"
            )}
            onMouseEnter={() => setHoveredLinkId(segment.link.id)}
            onMouseLeave={() => setHoveredLinkId(null)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {segment.content}
          </a>
        )
      )}
    </div>
  )
}

/**
 * Parse comment into alternating text and link segments
 */
function parseCommentSegments(
  comment: string,
  links: Chunk.Chunk<ExtractedLink>
): Array<{ type: "text" | "link"; content: string; link?: ExtractedLink }> {
  if (Chunk.isEmpty(links)) {
    return [{ type: "text", content: comment }]
  }

  const segments: Array<{ type: "text" | "link"; content: string; link?: ExtractedLink }> = []
  const sortedLinks = Chunk.toReadonlyArray(links).sort((a, b) => a.position.start - b.position.start)

  let lastIndex = 0

  for (const link of sortedLinks) {
    // Add text before link
    if (link.position.start > lastIndex) {
      segments.push({
        type: "text",
        content: comment.slice(lastIndex, link.position.start)
      })
    }

    // Add link
    segments.push({
      type: "link",
      content: link.url,
      link
    })

    lastIndex = link.position.end
  }

  // Add remaining text
  if (lastIndex < comment.length) {
    segments.push({
      type: "text",
      content: comment.slice(lastIndex)
    })
  }

  return segments
}
```

### Featured Link Preview (Timeline)

Minimalist preview for timeline PlayCard.

```typescript
// packages/web/src/components/FeaturedLinkPreview.tsx
import { useAtomValue } from "@effect-atom/atom-react"
import { Option } from "effect"
import { featuredLinkAtom } from "@/atoms/link-atoms"
import { ExtractedLink } from "@/lib/links/models"

export function FeaturedLinkPreview({ playId }: { playId: number }) {
  const featuredLink = useAtomValue(featuredLinkAtom(playId))

  return Option.match(featuredLink, {
    onNone: () => null,
    onSome: (link) => (
      <div
        className="featured-preview"
        data-link-id={link.id}
      >
        {renderLinkPreview(link)}
      </div>
    )
  })
}

function renderLinkPreview(link: ExtractedLink) {
  // Discriminated union matching
  switch (link._tag) {
    case "Youtube":
      return <YoutubeThumbnail videoId={link.videoId} thumbnail={link.thumbnailUrl} />
    case "SoundCloud":
      return <SoundCloudPreview trackId={link.trackId} />
    case "Kexp":
      return <KexpBadge path={link.path} isBlog={link.isBlog} />
    case "Generic":
      return <GenericLinkBadge domain={link.domain} category={link.category} />
  }
}
```

### Details Panel - Full Link Display

Categorized link display with expand/collapse.

```typescript
// packages/web/src/components/LinksByCategory.tsx
import { useState } from "react"
import { useAtomValue } from "@effect-atom/atom-react"
import { HashMap, Chunk, pipe } from "effect"
import { linksByCategoryAtom } from "@/atoms/link-atoms"
import { ExtractedLink } from "@/lib/links/models"
import { cn } from "@/lib/utils"

export function LinksByCategory({ playId }: { playId: number }) {
  const byCategory = useAtomValue(linksByCategoryAtom(playId))
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null)

  if (HashMap.isEmpty(byCategory)) return null

  return (
    <div className="links-section">
      <h3 className="text-lg font-semibold mb-3">Links</h3>
      {pipe(
        byCategory,
        HashMap.toEntries,
        Array.from,
        (entries) => entries.map(([category, links]) => (
          <CategorySection
            key={category}
            category={category}
            links={links}
            hoveredLinkId={hoveredLinkId}
            onHover={setHoveredLinkId}
          />
        ))
      )}
    </div>
  )
}

interface CategorySectionProps {
  category: string
  links: Chunk.Chunk<ExtractedLink>
  hoveredLinkId: string | null
  onHover: (id: string | null) => void
}

function CategorySection({ category, links, hoveredLinkId, onHover }: CategorySectionProps) {
  const icon = getCategoryIcon(category)
  const count = Chunk.size(links)

  return (
    <div className="category-section mb-4">
      <div className="category-header flex items-center gap-2 mb-2">
        {icon}
        <span className="font-medium">{category}</span>
        <span className="text-muted-foreground text-sm">({count})</span>
      </div>
      <div className="category-links space-y-2">
        {Chunk.toReadonlyArray(links).map((link) => (
          <LinkItem
            key={link.id}
            link={link}
            isHovered={hoveredLinkId === link.id}
            onHover={() => onHover(link.id)}
            onLeave={() => onHover(null)}
          />
        ))}
      </div>
    </div>
  )
}

interface LinkItemProps {
  link: ExtractedLink
  isHovered: boolean
  onHover: () => void
  onLeave: () => void
}

function LinkItem({ link, isHovered, onHover, onLeave }: LinkItemProps) {
  return (
    <a
      href={link.normalizedUrl}
      data-link-id={link.id}
      className={cn(
        "link-item flex items-center gap-3 p-2 rounded hover:bg-accent transition-colors",
        isHovered && "link-active bg-accent"
      )}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      target="_blank"
      rel="noopener noreferrer"
    >
      {renderLinkContent(link)}
    </a>
  )
}

function renderLinkContent(link: ExtractedLink) {
  // Discriminated union matching
  switch (link._tag) {
    case "Youtube":
      return (
        <>
          <img
            src={link.thumbnailUrl}
            alt="YouTube thumbnail"
            className="link-thumbnail w-20 h-14 object-cover rounded"
          />
          <div className="flex-1">
            <div className="font-medium">YouTube Video</div>
            <div className="text-sm text-muted-foreground">{link.videoId}</div>
          </div>
        </>
      )
    case "SoundCloud":
      return (
        <>
          <SoundCloudIcon className="w-6 h-6" />
          <div className="flex-1">
            <div className="font-medium">SoundCloud</div>
            <div className="text-sm text-muted-foreground">{link.domain}</div>
          </div>
        </>
      )
    case "Kexp":
      return (
        <>
          <KexpIcon className="w-6 h-6" />
          <div className="flex-1">
            <div className="font-medium">{link.isBlog ? "KEXP Blog" : "KEXP.org"}</div>
            <div className="text-sm text-muted-foreground">{link.path}</div>
          </div>
        </>
      )
    case "Generic":
      return (
        <>
          <GenericIcon category={link.category} className="w-6 h-6" />
          <div className="flex-1">
            <div className="font-medium">{link.domain}</div>
            <div className="text-sm text-muted-foreground">{link.category}</div>
          </div>
        </>
      )
  }
}

function getCategoryIcon(category: string) {
  // Return appropriate icon component based on category
  // Implementation depends on icon library choice
}
```

**Design decisions:**
- `useAtomValue` from `@effect-atom/atom-react` (not jotai)
- `data-link-id` attribute enables CSS-based hover coordination
- Hover state managed locally in each component
- `Option.match` for safe optional value handling
- Discriminated union matching via `_tag` for type-safe rendering
- Chunk.toReadonlyArray for React iteration (React needs arrays)

---

## Hover Coordination Strategy

Links are coordinated across comment text and previews using unique IDs.

### CSS Coordination

```css
/* Base link styles */
.link-highlight {
  color: var(--link-color);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: background-color 0.2s;
}

/* Active state (hovered) */
.link-active {
  background-color: var(--accent-bg);
  outline: 1px solid var(--accent-color);
}

/* Coordinated hover: highlight preview when comment link hovered */
.comment-text .link-highlight[data-link-id]:hover ~ .featured-preview[data-link-id],
.comment-text .link-highlight[data-link-id]:hover ~ .link-item[data-link-id] {
  outline: 2px solid var(--accent-color);
  background-color: var(--accent-bg);
}

/* Reverse: highlight comment link when preview hovered */
.featured-preview[data-link-id]:hover ~ .comment-text .link-highlight[data-link-id],
.link-item[data-link-id]:hover ~ .comment-text .link-highlight[data-link-id] {
  background-color: var(--accent-bg);
  outline: 1px solid var(--accent-color);
}
```

### React State Coordination

Each component manages hover state locally and sets `data-link-id`:

```typescript
const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null)

<a
  data-link-id={link.id}
  onMouseEnter={() => setHoveredLinkId(link.id)}
  onMouseLeave={() => setHoveredLinkId(null)}
>
```

CSS selectors coordinate visuals across components sharing the same `data-link-id`.

---

## File Structure

```
packages/web/src/
├── lib/
│   └── links/
│       ├── models.ts              # Schema definitions, Data.TaggedClass
│       ├── extraction.ts          # Pure extraction functions
│       └── categorization.ts      # Domain mapping, priority logic
│
├── atoms/
│   └── link-atoms.ts              # Atom.family for playLinks, featuredLink, byCategory
│
└── components/
    ├── CommentWithLinks.tsx       # Highlighted comment text
    ├── FeaturedLinkPreview.tsx    # Timeline preview (minimalist)
    ├── LinksByCategory.tsx        # Details panel full display
    └── links/
        ├── YoutubeThumbnail.tsx   # Platform-specific components
        ├── SoundCloudPreview.tsx
        ├── KexpBadge.tsx
        └── GenericLinkBadge.tsx
```

---

## Integration Points

### PlayCard.tsx (Timeline)

Add featured link preview below album art:

```typescript
// packages/web/src/components/PlayCard.tsx
import { FeaturedLinkPreview } from "./FeaturedLinkPreview"

export function PlayCard({ play }: { play: Play }) {
  return (
    <div className="play-card">
      {/* Existing album art */}
      <AlbumArt play={play} />

      {/* Add featured link preview */}
      <FeaturedLinkPreview playId={play.id} />

      {/* Existing play info */}
      <PlayInfo play={play} />
    </div>
  )
}
```

### PlayDetailsPanel.tsx (Details)

Replace comment display and add links section:

```typescript
// packages/web/src/components/PlayDetailsPanel.tsx
import { CommentWithLinks } from "./CommentWithLinks"
import { LinksByCategory } from "./LinksByCategory"

export function PlayDetailsPanel({ playId }: { playId: number }) {
  const play = useAtomValue(playAtom(playId))

  return Option.match(play, {
    onNone: () => null,
    onSome: (p) => (
      <div className="play-details-panel">
        {/* Existing sections */}

        {/* Replace plain comment with highlighted version */}
        {p.comment && (
          <section>
            <h3>DJ Comment</h3>
            <CommentWithLinks
              playId={playId}
              comment={p.comment}
              variant="details"
            />
          </section>
        )}

        {/* Add links section */}
        <LinksByCategory playId={playId} />
      </div>
    )
  })
}
```

---

## Effect Patterns Used

### Schema Validation
```typescript
export const YoutubeLinkSchema = Schema.Struct({
  _tag: Schema.Literal("Youtube"),
  videoId: Schema.String,
  // ...
})
```
Runtime validation, TypeScript inference, discriminated unions.

### Data.TaggedClass
```typescript
export class YoutubeLink extends Data.TaggedClass("YoutubeLink")<
  Schema.Schema.Type<typeof YoutubeLinkSchema>
> {}
```
Structural equality, immutability, React memoization support.

### Atom.family
```typescript
export const playLinksAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    // Automatic memoization per playId
  })
)
```
Per-parameter memoization, reactive updates.

### HashMap & Chunk
```typescript
const byCategory = groupByCategory(links) // HashMap<string, Chunk<Link>>
```
Immutable collections, efficient operations.

### Option
```typescript
return Option.match(featuredLink, {
  onNone: () => null,
  onSome: (link) => <Preview link={link} />
})
```
Explicit null handling, no undefined.

### Pipe
```typescript
pipe(
  links,
  Chunk.map(transform),
  Chunk.filter(predicate)
)
```
Composable transformations, data-first style.

---

## Testing Strategy

### Unit Tests (Utilities)

```typescript
// extraction.test.ts
describe("extractLinksFromComment", () => {
  it("extracts YouTube links with video ID", () => {
    const result = extractLinksFromComment(
      123,
      "Check this out: https://youtube.com/watch?v=abc123"
    )

    expect(Chunk.size(result.links)).toBe(1)
    const link = Chunk.unsafeHead(result.links)
    expect(link._tag).toBe("Youtube")
    if (link._tag === "Youtube") {
      expect(link.videoId).toBe("abc123")
    }
  })

  it("groups links by category", () => {
    const result = extractLinksFromComment(
      123,
      "https://youtube.com/watch?v=abc https://soundcloud.com/track"
    )

    expect(HashMap.size(result.byCategory)).toBe(2)
    expect(HashMap.has(result.byCategory, "Youtube")).toBe(true)
    expect(HashMap.has(result.byCategory, "SoundCloud")).toBe(true)
  })
})
```

### Component Tests

```typescript
// CommentWithLinks.test.tsx
describe("CommentWithLinks", () => {
  it("highlights links in comment text", () => {
    render(<CommentWithLinks playId={123} comment="Check https://youtube.com" />)

    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", "https://youtube.com")
    expect(link).toHaveClass("link-highlight")
  })

  it("coordinates hover state via data-link-id", () => {
    render(<CommentWithLinks playId={123} comment="https://youtube.com" />)

    const link = screen.getByRole("link")
    const linkId = link.getAttribute("data-link-id")

    expect(linkId).toBeTruthy()

    fireEvent.mouseEnter(link)
    expect(link).toHaveClass("link-active")
  })
})
```

---

## Performance Considerations

### Memoization
- `Atom.family` memoizes extraction per playId
- Links only recomputed when `play.comment` changes
- React components use `data-link-id` to avoid prop drilling

### Chunking
- `Chunk` operations are lazy where possible
- Grouping by category happens once per play
- `toReadonlyArray` only called for React rendering

### Featured Link Selection
- Priority-based selection stops at first match
- No need to evaluate all links for timeline preview

---

## Future Enhancements

### Phase 2 (Optional)
1. **Link validation**: Validate URLs on hover, show status indicator
2. **Preview thumbnails**: Fetch OpenGraph metadata for generic links
3. **Inline embeds**: YouTube iframe embeds in details panel
4. **Link analytics**: Track which links users click
5. **Search by link**: Enable filtering timeline by link domain/category

### Database Storage (If Needed)
If on-the-fly extraction becomes a bottleneck:
- Pre-extract links during play ingestion
- Store in `comment_links` table with foreign key to plays
- Index by domain, category for fast search

Current approach (on-the-fly) is recommended until performance issues observed.

---

## Success Criteria

### Functional
- ✅ Links extracted from 62%+ of comments
- ✅ YouTube, SoundCloud, KEXP, generic links properly categorized
- ✅ Featured link selected by priority for timeline
- ✅ Hover coordination works between comment and preview

### Technical
- ✅ Schema validation for all link types
- ✅ Atom.family memoization per play
- ✅ Data.TaggedClass for structural equality
- ✅ Discriminated union matching in components

### UX
- ✅ Minimalist timeline preview (featured link only)
- ✅ Full categorized display in details panel
- ✅ Consistent design language across contexts
- ✅ Smooth hover interactions

---

## CRITICAL: Implementation Requirements

**⚠️ MANDATORY: Before writing any code, implementors MUST:**

### 1. Reference Effect Documentation Extensively

Use the `mcp__effect-docs` tools to search Effect documentation:
- **Before using Atom API**: Search "Atom.family", "Atom.make", "@effect-atom/atom"
- **Before using Result**: Search "Result.matchWithWaiting", "Result patterns"
- **Before using Schema**: Search "Schema.Union", "Schema.Struct", "Data.TaggedClass"
- **Before using HashMap/Chunk**: Search collection APIs and patterns

```bash
# Example searches during implementation
mcp__effect-docs__effect_docs_search("Atom.family")
mcp__effect-docs__get_effect_doc("@effect-atom/atom")
```

### 2. Explore Local Effect Source Code

This repo has the **full Effect source** symlinked at `docs/effect-source/`:

```bash
# Search for Atom patterns in effect-atom
grep -r "Atom.family" docs/effect-source/experimental/src/

# Find Result.matchWithWaiting usage
grep -r "matchWithWaiting" docs/effect-source/effect/src/

# Study Schema.Union examples
grep -r "Schema.Union" docs/effect-source/schema/src/

# Check HashMap operations
grep -r "HashMap.modify" docs/effect-source/effect/src/
```

**ALWAYS search Effect source before implementing patterns** - seeing actual implementations prevents API misuse.

### 3. Critical Import Paths

**WRONG:**
```typescript
import { Atom } from "effect" // ❌ Atom not in effect core
import { useAtomValue } from "jotai" // ❌ Wrong library
```

**CORRECT:**
```typescript
import { Atom } from "@effect-atom/atom" // ✅ Correct package
import { useAtomValue } from "@effect-atom/atom-react" // ✅ For React hooks
import { Result, Chunk, HashMap, Option } from "effect" // ✅ Core utilities
```

### 4. Critical API Patterns

**WRONG:**
```typescript
const value = get.get(someAtom) // ❌ Not effect-atom API
const play = get(playAtom(id)) // ❌ playAtom returns Result, not value
```

**CORRECT:**
```typescript
const value = get(someAtom) // ✅ Callable getter, not .get()
const playResult = get(playAtom(id)) // ✅ playAtom returns Result
Result.matchWithWaiting(playResult, { // ✅ Handle Result properly
  onWaiting: () => /* ... */,
  onSuccess: (s) => /* s.value has Play */,
  onError: () => /* ... */,
  onDefect: () => /* ... */
})
```

### 5. Existing Codebase Reference

Study these existing implementations before writing code:
- `packages/web/src/atoms/timeline.ts` - Atom.family usage, Result patterns
- `packages/web/src/atoms/kexp-atoms.ts` - Schema, Data.TaggedClass, HashMap
- `packages/web/src/lib/http-runtime.ts` - TimelineRuntime composition
- `packages/web/src/components/Timeline.tsx` - useAtomValue from @effect-atom/atom-react

### 6. Type Safety Verification

Run type check frequently during development:
```bash
pnpm --filter @crate/web exec tsc --noEmit
```

**Do not proceed** if types don't compile - Effect patterns are type-driven.

### 7. Effect Skills

Reference effect-* skills during implementation:
- `effect-foundations` - Core Effect patterns
- `effect-config-schema` - Schema validation
- `effect-collections-datastructs` - HashMap, Chunk, Data.TaggedClass
- `effect-layers-services` - Layer composition (if extending runtime)

**Implementation without following these requirements will result in compile-time errors and runtime failures.**

---

## References

- **Analysis Report**: `docs/comment-links-implementation-report.md`
- **Effect Docs**: https://effect.website
- **effect-atom**: https://github.com/tim-smart/effect-atom
- **Effect Source (Local)**: `docs/effect-source/` (symlinked to Effect monorepo)
- **Existing Atoms**: `packages/web/src/atoms/timeline.ts`
- **Play Schema**: `packages/api/src/schemas/Play.ts`

---

**Design Status:** Complete and validated with correct Effect/effect-atom patterns
**Ready for Implementation:** Yes (with mandatory documentation/source review)
**Next Step:** Create worktree and implementation plan
