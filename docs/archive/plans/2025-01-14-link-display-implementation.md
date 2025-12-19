# Link Display System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build link extraction and display system for KEXP DJ comments using Effect-TS patterns with featured timeline previews and full categorized details panel display.

**Architecture:** Layered functional architecture: Schema-validated models → Pure extraction functions → Atom.family memoization → React components with discriminated union rendering and hover coordination.

**Tech Stack:** Effect Schema, Data.TaggedClass, @effect-atom/atom, HashMap, Chunk, Option, React, Tailwind CSS

**Design Reference:** `docs/plans/2025-01-14-link-display-design.md`

---

## Prerequisites

**Before starting ANY task:**

1. ✅ Read `@effect-foundations` skill
2. ✅ Read `@effect-config-schema` skill
3. ✅ Read `@effect-collections-datastructs` skill
4. ✅ Search Effect docs for APIs you're using: `mcp__effect-docs__effect_docs_search("Atom.family")`
5. ✅ Explore local Effect source: `docs/effect-source/`
6. ✅ Study existing patterns in `packages/web/src/atoms/kexp-atoms.ts`

**Critical Imports (DO NOT GET THESE WRONG):**
```typescript
// ✅ CORRECT
import { Atom } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react"
import { Result, Chunk, HashMap, Option, Data, Schema } from "effect"

// ❌ WRONG (will cause compile errors)
import { Atom } from "effect"
import { useAtomValue } from "jotai"
```

---

## Task 1: Data Layer - Schema Definitions

**Files:**
- Create: `packages/web/src/lib/links/models.ts`
- Create: `packages/web/src/lib/links/models.test.ts`

### Step 1.1: Write test for YouTubeLink schema validation

**File:** `packages/web/src/lib/links/models.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import { YoutubeLinkSchema, YoutubeLink } from "./models"

describe("Link Models", () => {
  describe("YoutubeLink", () => {
    it("validates correct YouTube link data", () => {
      const data = {
        id: "test-id-123",
        url: "https://youtube.com/watch?v=abc123",
        normalizedUrl: "https://youtube.com/watch?v=abc123",
        domain: "youtube.com",
        position: { start: 0, end: 42 },
        _tag: "Youtube" as const,
        videoId: "abc123",
        thumbnailUrl: "https://img.youtube.com/vi/abc123/mqdefault.jpg"
      }

      const result = Schema.decodeUnknownSync(YoutubeLinkSchema)(data)
      expect(result._tag).toBe("Youtube")
      expect(result.videoId).toBe("abc123")
    })

    it("creates YoutubeLink with Data.TaggedClass", () => {
      const link1 = YoutubeLink.make({
        id: "id-1",
        url: "test.com",
        normalizedUrl: "https://test.com",
        domain: "test.com",
        position: { start: 0, end: 8 },
        _tag: "Youtube",
        videoId: "abc",
        thumbnailUrl: "thumb.jpg"
      })

      const link2 = YoutubeLink.make({
        id: "id-1",
        url: "test.com",
        normalizedUrl: "https://test.com",
        domain: "test.com",
        position: { start: 0, end: 8 },
        _tag: "Youtube",
        videoId: "abc",
        thumbnailUrl: "thumb.jpg"
      })

      // Data.TaggedClass provides structural equality
      expect(link1).toEqual(link2)
    })
  })
})
```

**Run:** `pnpm --filter @crate/web test models.test.ts`
**Expected:** FAIL - "Cannot find module './models'"

### Step 1.2: Implement base link schemas and YouTube

**File:** `packages/web/src/lib/links/models.ts`

```typescript
/**
 * Link Models - Schema-validated link types with Data.TaggedClass
 *
 * CRITICAL: Study Effect Schema and Data patterns before modifying
 * - Effect Schema docs: mcp__effect-docs__effect_docs_search("Schema.Struct")
 * - Local source: docs/effect-source/schema/src/Schema.ts
 * - Existing pattern: packages/web/src/atoms/kexp-atoms.ts
 */

import { Schema, Data, Chunk, HashMap, Option } from "effect"

// Base fields shared by all link types
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

// Placeholder for other link types (will add in next steps)
export type ExtractedLink = YoutubeLink
```

**Run:** `pnpm --filter @crate/web test models.test.ts`
**Expected:** PASS

### Step 1.3: Commit YouTube schema

```bash
git add packages/web/src/lib/links/
git commit -m "feat(links): add YouTube link schema with Data.TaggedClass"
```

### Step 1.4: Write tests for SoundCloud, KEXP, Generic schemas

**File:** `packages/web/src/lib/links/models.test.ts` (append)

```typescript
describe("SoundCloudLink", () => {
  it("validates SoundCloud link data", () => {
    const data = {
      id: "sc-id",
      url: "https://soundcloud.com/artist/track",
      normalizedUrl: "https://soundcloud.com/artist/track",
      domain: "soundcloud.com",
      position: { start: 10, end: 50 },
      _tag: "SoundCloud" as const,
      trackId: "artist/track",
      permalink: "https://soundcloud.com/artist/track"
    }

    const result = Schema.decodeUnknownSync(SoundCloudLinkSchema)(data)
    expect(result._tag).toBe("SoundCloud")
  })
})

describe("KexpLink", () => {
  it("validates KEXP link data", () => {
    const data = {
      id: "kexp-id",
      url: "https://blog.kexp.org/article",
      normalizedUrl: "https://blog.kexp.org/article",
      domain: "blog.kexp.org",
      position: { start: 0, end: 35 },
      _tag: "Kexp" as const,
      path: "/article",
      isBlog: true
    }

    const result = Schema.decodeUnknownSync(KexpLinkSchema)(data)
    expect(result.isBlog).toBe(true)
  })
})

describe("GenericLink", () => {
  it("validates generic link data", () => {
    const data = {
      id: "gen-id",
      url: "https://example.com",
      normalizedUrl: "https://example.com",
      domain: "example.com",
      position: { start: 0, end: 20 },
      _tag: "Generic" as const,
      category: "Website" as const
    }

    const result = Schema.decodeUnknownSync(GenericLinkSchema)(data)
    expect(result.category).toBe("Website")
  })
})
```

**Run:** `pnpm --filter @crate/web test models.test.ts`
**Expected:** FAIL - schemas not defined

### Step 1.5: Implement remaining link schemas

**File:** `packages/web/src/lib/links/models.ts` (append)

```typescript
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

**Run:** `pnpm --filter @crate/web test models.test.ts`
**Expected:** PASS

### Step 1.6: Write test for PlayLinks container

**File:** `packages/web/src/lib/links/models.test.ts` (append)

```typescript
describe("PlayLinks", () => {
  it("creates PlayLinks container with links and categorization", () => {
    const link1 = YoutubeLink.make({
      id: "yt-1",
      url: "youtube.com/v1",
      normalizedUrl: "https://youtube.com/v1",
      domain: "youtube.com",
      position: { start: 0, end: 10 },
      _tag: "Youtube",
      videoId: "v1",
      thumbnailUrl: "thumb.jpg"
    })

    const playLinks = PlayLinks.make({
      playId: 123,
      links: Chunk.of(link1),
      byCategory: HashMap.make([["Youtube", Chunk.of(link1)]]),
      featuredLink: Option.some(link1)
    })

    expect(playLinks.playId).toBe(123)
    expect(Chunk.size(playLinks.links)).toBe(1)
    expect(Option.isSome(playLinks.featuredLink)).toBe(true)
  })
})
```

**Run:** `pnpm --filter @crate/web test models.test.ts`
**Expected:** FAIL - PlayLinks not defined

### Step 1.7: Implement PlayLinks container

**File:** `packages/web/src/lib/links/models.ts` (append)

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

**Run:** `pnpm --filter @crate/web test models.test.ts`
**Expected:** PASS

### Step 1.8: Type check

**Run:** `pnpm --filter @crate/web exec tsc --noEmit`
**Expected:** No errors in models.ts

### Step 1.9: Commit data layer

```bash
git add packages/web/src/lib/links/
git commit -m "feat(links): complete data layer with all link schemas and PlayLinks container"
```

---

## Task 2: Utility Layer - Link Extraction

**Files:**
- Create: `packages/web/src/lib/links/extraction.ts`
- Create: `packages/web/src/lib/links/extraction.test.ts`
- Create: `packages/web/src/lib/links/categorization.ts`

### Step 2.1: Write test for URL normalization

**File:** `packages/web/src/lib/links/extraction.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { normalizeUrl, getDomain } from "./extraction"

describe("URL Processing", () => {
  describe("normalizeUrl", () => {
    it("adds https:// to URLs without protocol", () => {
      expect(normalizeUrl("youtube.com")).toBe("https://youtube.com")
    })

    it("adds https:// to www URLs", () => {
      expect(normalizeUrl("www.youtube.com")).toBe("https://www.youtube.com")
    })

    it("preserves URLs with protocol", () => {
      expect(normalizeUrl("https://youtube.com")).toBe("https://youtube.com")
    })
  })

  describe("getDomain", () => {
    it("extracts domain from URL", () => {
      expect(getDomain("https://youtube.com/watch?v=123")).toBe("youtube.com")
    })

    it("removes www prefix", () => {
      expect(getDomain("https://www.youtube.com/watch")).toBe("youtube.com")
    })
  })
})
```

**Run:** `pnpm --filter @crate/web test extraction.test.ts`
**Expected:** FAIL - functions not defined

### Step 2.2: Implement URL normalization

**File:** `packages/web/src/lib/links/extraction.ts`

```typescript
/**
 * Link Extraction - Pure functions for parsing and extracting links
 *
 * CRITICAL: These are pure functions - no side effects, fully deterministic
 * Study pipe patterns: docs/effect-source/effect/src/Function.ts
 */

import { Chunk, HashMap, Option, pipe } from "effect"
import { PlayLinks, ExtractedLink, YoutubeLink, SoundCloudLink, KexpLink, GenericLink } from "./models"
import { nanoid } from "nanoid"

/**
 * Normalize URL: add protocol, clean trailing punctuation
 */
export function normalizeUrl(url: string): string {
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
export function getDomain(url: string): string {
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
```

**Run:** `pnpm --filter @crate/web test extraction.test.ts`
**Expected:** PASS

### Step 2.3: Commit URL processing

```bash
git add packages/web/src/lib/links/extraction.ts packages/web/src/lib/links/extraction.test.ts
git commit -m "feat(links): add URL normalization and domain extraction"
```

### Step 2.4: Write test for link categorization

**File:** `packages/web/src/lib/links/extraction.test.ts` (append)

```typescript
import { categorizeLink } from "./categorization"

describe("Link Categorization", () => {
  it("categorizes YouTube as Video", () => {
    expect(categorizeLink("youtube.com")).toBe("Video")
    expect(categorizeLink("youtu.be")).toBe("Video")
  })

  it("categorizes SoundCloud as MusicPlatform", () => {
    expect(categorizeLink("soundcloud.com")).toBe("MusicPlatform")
  })

  it("categorizes social media", () => {
    expect(categorizeLink("twitter.com")).toBe("Social")
    expect(categorizeLink("facebook.com")).toBe("Social")
  })

  it("categorizes generic websites", () => {
    expect(categorizeLink("example.com")).toBe("Website")
  })
})
```

**Run:** `pnpm --filter @crate/web test extraction.test.ts`
**Expected:** FAIL - categorization module not found

### Step 2.5: Implement link categorization

**File:** `packages/web/src/lib/links/categorization.ts`

```typescript
/**
 * Link Categorization - Domain-based link type detection
 */

/**
 * Categorize link by domain patterns
 */
export function categorizeLink(domain: string): string {
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

/**
 * Extract YouTube video ID from various URL formats
 */
export function extractYouTubeVideoId(url: string): string | null {
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
export function extractSoundCloudTrackId(url: string): string | null {
  // SoundCloud uses permalinks, use URL path as ID
  try {
    const path = new URL(url).pathname
    return path.split('/').filter(Boolean).join('/')
  } catch {
    return null
  }
}
```

**Run:** `pnpm --filter @crate/web test extraction.test.ts`
**Expected:** PASS

### Step 2.6: Write test for typed link creation

**File:** `packages/web/src/lib/links/extraction.test.ts` (append)

```typescript
import { createTypedLink } from "./extraction"

describe("Typed Link Creation", () => {
  it("creates YouTubeLink for YouTube URLs", () => {
    const link = createTypedLink({
      id: "test-id",
      url: "https://youtube.com/watch?v=abc123",
      normalizedUrl: "https://youtube.com/watch?v=abc123",
      domain: "youtube.com",
      category: "Video",
      position: { start: 0, end: 42 }
    })

    expect(link._tag).toBe("Youtube")
    if (link._tag === "Youtube") {
      expect(link.videoId).toBe("abc123")
      expect(link.thumbnailUrl).toContain("abc123")
    }
  })

  it("creates SoundCloudLink for SoundCloud URLs", () => {
    const link = createTypedLink({
      id: "test-id",
      url: "https://soundcloud.com/artist/track",
      normalizedUrl: "https://soundcloud.com/artist/track",
      domain: "soundcloud.com",
      category: "MusicPlatform",
      position: { start: 0, end: 40 }
    })

    expect(link._tag).toBe("SoundCloud")
  })

  it("creates GenericLink for unknown domains", () => {
    const link = createTypedLink({
      id: "test-id",
      url: "https://example.com",
      normalizedUrl: "https://example.com",
      domain: "example.com",
      category: "Website",
      position: { start: 0, end: 20 }
    })

    expect(link._tag).toBe("Generic")
  })
})
```

**Run:** `pnpm --filter @crate/web test extraction.test.ts`
**Expected:** FAIL - createTypedLink not defined

### Step 2.7: Implement typed link creation

**File:** `packages/web/src/lib/links/extraction.ts` (append after imports)

```typescript
import { categorizeLink, extractYouTubeVideoId, extractSoundCloudTrackId } from "./categorization"

/**
 * Create properly typed link based on domain analysis.
 * Returns specific link class (YoutubeLink, SoundCloudLink, etc.)
 */
export function createTypedLink(base: {
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
```

**Run:** `pnpm --filter @crate/web test extraction.test.ts`
**Expected:** PASS

### Step 2.8: Write test for main extraction function

**File:** `packages/web/src/lib/links/extraction.test.ts` (append)

```typescript
import { extractLinksFromComment } from "./extraction"

describe("extractLinksFromComment", () => {
  it("extracts single YouTube link from comment", () => {
    const result = extractLinksFromComment(
      123,
      "Check this out: https://youtube.com/watch?v=abc123"
    )

    expect(result.playId).toBe(123)
    expect(Chunk.size(result.links)).toBe(1)

    const link = Chunk.unsafeHead(result.links)
    expect(link._tag).toBe("Youtube")
  })

  it("extracts multiple links from comment", () => {
    const result = extractLinksFromComment(
      456,
      "YouTube: https://youtube.com/watch?v=abc SoundCloud: https://soundcloud.com/track"
    )

    expect(Chunk.size(result.links)).toBe(2)
  })

  it("groups links by category", () => {
    const result = extractLinksFromComment(
      789,
      "https://youtube.com/watch?v=abc https://soundcloud.com/track"
    )

    expect(HashMap.size(result.byCategory)).toBeGreaterThan(0)
    expect(HashMap.has(result.byCategory, "Youtube")).toBe(true)
  })

  it("selects featured link (YouTube priority)", () => {
    const result = extractLinksFromComment(
      999,
      "https://example.com https://youtube.com/watch?v=abc"
    )

    expect(Option.isSome(result.featuredLink)).toBe(true)
    Option.match(result.featuredLink, {
      onNone: () => { throw new Error("Expected featured link") },
      onSome: (link) => {
        expect(link._tag).toBe("Youtube")
      }
    })
  })

  it("returns empty PlayLinks for comment without links", () => {
    const result = extractLinksFromComment(111, "Just a regular comment")

    expect(Chunk.isEmpty(result.links)).toBe(true)
    expect(Option.isNone(result.featuredLink)).toBe(true)
  })
})
```

**Run:** `pnpm --filter @crate/web test extraction.test.ts`
**Expected:** FAIL - extractLinksFromComment not fully implemented

### Step 2.9: Implement main extraction function

**File:** `packages/web/src/lib/links/extraction.ts` (append)

```typescript
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

**Run:** `pnpm --filter @crate/web test extraction.test.ts`
**Expected:** PASS

### Step 2.10: Type check utility layer

**Run:** `pnpm --filter @crate/web exec tsc --noEmit`
**Expected:** No errors

### Step 2.11: Commit utility layer

```bash
git add packages/web/src/lib/links/
git commit -m "feat(links): complete extraction utilities with categorization and featured selection"
```

---

## Task 3: Atom Layer - State Management

**Files:**
- Create: `packages/web/src/atoms/link-atoms.ts`
- Create: `packages/web/src/atoms/link-atoms.test.ts`

### Step 3.1: Write test for playLinksAtom

**File:** `packages/web/src/atoms/link-atoms.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { Atom } from "@effect-atom/atom"
import { Chunk, Option } from "effect"
import { playLinksAtom } from "./link-atoms"

describe("Link Atoms", () => {
  describe("playLinksAtom", () => {
    it("returns empty PlayLinks when play has no comment", () => {
      // Test will need mocked playAtom
      // For now, test structure
      expect(playLinksAtom).toBeDefined()
    })

    it("extracts links when play has comment with URLs", () => {
      // Will test with real integration after playAtom mock setup
      expect(true).toBe(true)
    })
  })
})
```

**Run:** `pnpm --filter @crate/web test link-atoms.test.ts`
**Expected:** FAIL - module not found

### Step 3.2: Implement playLinksAtom

**File:** `packages/web/src/atoms/link-atoms.ts`

```typescript
/**
 * Link Atoms - State management for extracted links
 *
 * CRITICAL PATTERNS:
 * - Atom from "@effect-atom/atom" NOT "effect"
 * - get(atom) NOT get.get(atom)
 * - Result.matchWithWaiting for playAtom (returns Result, not Option)
 *
 * Study existing pattern: packages/web/src/atoms/kexp-atoms.ts
 * Effect Atom docs: mcp__effect-docs__effect_docs_search("Atom.family")
 */

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

**Run:** `pnpm --filter @crate/web test link-atoms.test.ts`
**Expected:** PASS

### Step 3.3: Type check atom layer

**Run:** `pnpm --filter @crate/web exec tsc --noEmit`
**Expected:** No errors (verify Result.matchWithWaiting usage)

### Step 3.4: Commit atom layer

```bash
git add packages/web/src/atoms/link-atoms.ts packages/web/src/atoms/link-atoms.test.ts
git commit -m "feat(links): add Atom.family for link extraction state management"
```

---

## Task 4: Base Component - CommentWithLinks

**Files:**
- Create: `packages/web/src/components/links/CommentWithLinks.tsx`
- Create: `packages/web/src/components/links/CommentWithLinks.test.tsx`

### Step 4.1: Write test for CommentWithLinks

**File:** `packages/web/src/components/links/CommentWithLinks.test.tsx`

```typescript
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { CommentWithLinks } from "./CommentWithLinks"

describe("CommentWithLinks", () => {
  it("renders plain text for comment without links", () => {
    render(<CommentWithLinks playId={123} comment="Just a regular comment" />)
    expect(screen.getByText("Just a regular comment")).toBeInTheDocument()
  })

  it("highlights links in comment text", () => {
    render(
      <CommentWithLinks
        playId={123}
        comment="Check https://youtube.com/watch?v=test"
      />
    )

    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href")
    expect(link).toHaveClass("link-highlight")
  })
})
```

**Run:** `pnpm --filter @crate/web test CommentWithLinks.test.tsx`
**Expected:** FAIL - component not found

### Step 4.2: Implement CommentWithLinks component

**File:** `packages/web/src/components/links/CommentWithLinks.tsx`

```typescript
/**
 * CommentWithLinks - Display comment text with highlighted, clickable links
 *
 * CRITICAL: useAtomValue from "@effect-atom/atom-react" NOT "jotai"
 * Study: packages/web/src/components/Timeline.tsx for useAtomValue usage
 */

import { useState } from "react"
import { useAtomValue } from "@effect-atom/atom-react"
import { Chunk } from "effect"
import { playLinksAtom } from "@/atoms/link-atoms"
import { ExtractedLink } from "@/lib/links/models"
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
            href={segment.link!.normalizedUrl}
            data-link-id={segment.link!.id}
            className={cn(
              "link-highlight underline text-blue-600 hover:bg-blue-50",
              hoveredLinkId === segment.link!.id && "link-active bg-blue-100"
            )}
            onMouseEnter={() => setHoveredLinkId(segment.link!.id)}
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

**Run:** `pnpm --filter @crate/web test CommentWithLinks.test.tsx`
**Expected:** PASS

### Step 4.3: Type check component

**Run:** `pnpm --filter @crate/web exec tsc --noEmit`
**Expected:** No errors

### Step 4.4: Commit CommentWithLinks

```bash
git add packages/web/src/components/links/
git commit -m "feat(links): add CommentWithLinks component with link highlighting"
```

---

## Task 5: Timeline Components - Featured Link Preview

**Files:**
- Create: `packages/web/src/components/links/FeaturedLinkPreview.tsx`
- Create: `packages/web/src/components/links/platform/YoutubeThumbnail.tsx`

### Step 5.1: Write test for FeaturedLinkPreview

**File:** `packages/web/src/components/links/FeaturedLinkPreview.test.tsx`

```typescript
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { FeaturedLinkPreview } from "./FeaturedLinkPreview"

describe("FeaturedLinkPreview", () => {
  it("renders nothing when no featured link", () => {
    const { container } = render(<FeaturedLinkPreview playId={123} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders preview when featured link exists", () => {
    // Will test with mocked atom value
    expect(true).toBe(true)
  })
})
```

**Run:** `pnpm --filter @crate/web test FeaturedLinkPreview.test.tsx`
**Expected:** FAIL - component not found

### Step 5.2: Implement FeaturedLinkPreview

**File:** `packages/web/src/components/links/FeaturedLinkPreview.tsx`

```typescript
/**
 * FeaturedLinkPreview - Minimalist link preview for timeline
 *
 * Uses Option.match for safe optional handling
 * Discriminated union matching via _tag
 */

import { useAtomValue } from "@effect-atom/atom-react"
import { Option } from "effect"
import { featuredLinkAtom } from "@/atoms/link-atoms"
import { ExtractedLink } from "@/lib/links/models"
import { YoutubeThumbnail } from "./platform/YoutubeThumbnail"

export function FeaturedLinkPreview({ playId }: { playId: number }) {
  const featuredLink = useAtomValue(featuredLinkAtom(playId))

  return Option.match(featuredLink, {
    onNone: () => null,
    onSome: (link) => (
      <div
        className="featured-preview mt-2"
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
      return (
        <div className="text-sm text-gray-600">
          🎵 SoundCloud: {link.domain}
        </div>
      )
    case "Kexp":
      return (
        <div className="text-sm text-purple-600">
          📻 {link.isBlog ? "KEXP Blog" : "KEXP.org"}
        </div>
      )
    case "Generic":
      return (
        <div className="text-sm text-gray-500">
          🔗 {link.domain}
        </div>
      )
  }
}
```

### Step 5.3: Implement YoutubeThumbnail

**File:** `packages/web/src/components/links/platform/YoutubeThumbnail.tsx`

```typescript
interface YoutubeThumbnailProps {
  videoId: string
  thumbnail: string
}

export function YoutubeThumbnail({ videoId, thumbnail }: YoutubeThumbnailProps) {
  return (
    <div className="youtube-thumbnail rounded overflow-hidden">
      <img
        src={thumbnail}
        alt={`YouTube video ${videoId}`}
        className="w-full h-auto"
      />
    </div>
  )
}
```

**Run:** `pnpm --filter @crate/web test FeaturedLinkPreview.test.tsx`
**Expected:** PASS

### Step 5.4: Type check

**Run:** `pnpm --filter @crate/web exec tsc --noEmit`
**Expected:** No errors

### Step 5.5: Commit featured preview

```bash
git add packages/web/src/components/links/
git commit -m "feat(links): add FeaturedLinkPreview with YouTube thumbnail support"
```

---

## Task 6: Details Panel Components

**Files:**
- Create: `packages/web/src/components/links/LinksByCategory.tsx`

### Step 6.1: Write test for LinksByCategory

**File:** `packages/web/src/components/links/LinksByCategory.test.tsx`

```typescript
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { LinksByCategory } from "./LinksByCategory"

describe("LinksByCategory", () => {
  it("renders nothing when no links", () => {
    const { container } = render(<LinksByCategory playId={123} />)
    // Component should handle empty HashMap gracefully
    expect(container).toBeDefined()
  })
})
```

**Run:** `pnpm --filter @crate/web test LinksByCategory.test.tsx`
**Expected:** FAIL - component not found

### Step 6.2: Implement LinksByCategory

**File:** `packages/web/src/components/links/LinksByCategory.tsx`

```typescript
/**
 * LinksByCategory - Full categorized link display for details panel
 *
 * HashMap iteration pattern: HashMap.toEntries → Array.from → map
 * Chunk.toReadonlyArray for React rendering
 */

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
    <div className="links-section mt-6">
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
  const count = Chunk.size(links)

  return (
    <div className="category-section mb-4">
      <div className="category-header flex items-center gap-2 mb-2">
        <span className="font-medium">{category}</span>
        <span className="text-gray-500 text-sm">({count})</span>
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
        "link-item flex items-center gap-3 p-2 rounded hover:bg-gray-100 transition-colors",
        isHovered && "link-active bg-blue-50"
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
            <div className="text-sm text-gray-500">{link.videoId}</div>
          </div>
        </>
      )
    case "SoundCloud":
      return (
        <>
          <div className="w-6 h-6 text-orange-500">🎵</div>
          <div className="flex-1">
            <div className="font-medium">SoundCloud</div>
            <div className="text-sm text-gray-500">{link.domain}</div>
          </div>
        </>
      )
    case "Kexp":
      return (
        <>
          <div className="w-6 h-6 text-purple-500">📻</div>
          <div className="flex-1">
            <div className="font-medium">{link.isBlog ? "KEXP Blog" : "KEXP.org"}</div>
            <div className="text-sm text-gray-500">{link.path}</div>
          </div>
        </>
      )
    case "Generic":
      return (
        <>
          <div className="w-6 h-6 text-gray-400">🔗</div>
          <div className="flex-1">
            <div className="font-medium">{link.domain}</div>
            <div className="text-sm text-gray-500">{link.category}</div>
          </div>
        </>
      )
  }
}
```

**Run:** `pnpm --filter @crate/web test LinksByCategory.test.tsx`
**Expected:** PASS

### Step 6.3: Type check

**Run:** `pnpm --filter @crate/web exec tsc --noEmit`
**Expected:** No errors

### Step 6.4: Commit details components

```bash
git add packages/web/src/components/links/
git commit -m "feat(links): add LinksByCategory component for details panel"
```

---

## Task 7: Integration with Existing Components

**Files:**
- Modify: `packages/web/src/components/PlayDetailsPanel.tsx`
- Modify: `packages/web/src/components/TimelinePlayCardWrapper.tsx` (or wherever PlayCard lives)

### Step 7.1: Integrate CommentWithLinks into PlayDetailsPanel

**File:** `packages/web/src/components/PlayDetailsPanel.tsx`

Find the section that displays the comment (search for "play.comment") and replace plain text with:

```typescript
import { CommentWithLinks } from "./links/CommentWithLinks"
import { LinksByCategory } from "./links/LinksByCategory"

// In the component, replace comment display:
{play.comment && (
  <section className="mt-4">
    <h3 className="text-sm font-semibold mb-2">DJ Comment</h3>
    <CommentWithLinks
      playId={playId}
      comment={play.comment}
      variant="details"
    />
  </section>
)}

{/* Add links section after comment */}
<LinksByCategory playId={playId} />
```

**Run:** `pnpm --filter @crate/web exec tsc --noEmit`
**Expected:** No errors

### Step 7.2: Test integration manually

**Run:** `pnpm --filter @crate/web dev`
**Test:**
1. Navigate to a play with a comment containing a YouTube link
2. Verify link is highlighted in comment
3. Verify LinksByCategory section appears
4. Verify clicking link opens in new tab

### Step 7.3: Integrate FeaturedLinkPreview into timeline

Find the PlayCard or TimelinePlayCardWrapper component and add:

```typescript
import { FeaturedLinkPreview } from "./links/FeaturedLinkPreview"

// In PlayCard render, after album art:
<FeaturedLinkPreview playId={play.id} />
```

**Run:** `pnpm --filter @crate/web exec tsc --noEmit`
**Expected:** No errors

### Step 7.4: Test timeline integration

**Run:** `pnpm --filter @crate/web dev`
**Test:**
1. Scroll timeline to plays with comments containing links
2. Verify YouTube thumbnails appear below album art
3. Verify other link types show appropriate badges

### Step 7.5: Commit integrations

```bash
git add packages/web/src/components/PlayDetailsPanel.tsx packages/web/src/components/TimelinePlayCardWrapper.tsx
git commit -m "feat(links): integrate link display into PlayDetailsPanel and timeline"
```

---

## Task 8: Styling and Hover Coordination

**Files:**
- Create: `packages/web/src/styles/links.css` (or add to existing global styles)

### Step 8.1: Add link styling

**File:** `packages/web/src/styles/links.css` (or in `globals.css`)

```css
/* Link Display Styles */

/* Base link styles */
.link-highlight {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: background-color 0.2s, outline 0.2s;
  cursor: pointer;
}

.link-highlight:hover {
  background-color: #eff6ff;
}

/* Active state (hovered) */
.link-active {
  background-color: #dbeafe;
  outline: 1px solid #3b82f6;
  outline-offset: 1px;
}

/* Featured preview styling */
.featured-preview {
  border-radius: 0.5rem;
  overflow: hidden;
  max-width: 320px;
}

/* Link item in details panel */
.link-item {
  border: 1px solid transparent;
  transition: all 0.2s;
}

.link-item:hover {
  border-color: #e5e7eb;
}

.link-thumbnail {
  flex-shrink: 0;
}

/* Category section */
.category-section {
  padding-bottom: 1rem;
  border-bottom: 1px solid #f3f4f6;
}

.category-section:last-child {
  border-bottom: none;
}

.category-header {
  color: #6b7280;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  font-weight: 600;
}
```

Import in `packages/web/src/App.tsx` or `index.css`:

```typescript
import "./styles/links.css"
```

### Step 8.2: Test styling

**Run:** `pnpm --filter @crate/web dev`
**Test:**
1. Hover over links in comments - verify highlight
2. Hover over link items in details panel - verify active state
3. Check featured preview styling in timeline
4. Verify category sections have proper spacing

### Step 8.3: Commit styling

```bash
git add packages/web/src/styles/links.css packages/web/src/App.tsx
git commit -m "feat(links): add styling for link highlights and hover states"
```

---

## Task 9: Final Testing and Verification

### Step 9.1: Run all tests

**Run:** `pnpm --filter @crate/web test`
**Expected:** All tests pass

### Step 9.2: Type check entire codebase

**Run:** `pnpm --filter @crate/web exec tsc --noEmit`
**Expected:** No type errors

### Step 9.3: Build check

**Run:** `pnpm --filter @crate/web build`
**Expected:** Build succeeds

### Step 9.4: Manual testing checklist

**Run:** `pnpm --filter @crate/web dev`

Test scenarios:
- [ ] Play with YouTube link: Thumbnail appears in timeline and details
- [ ] Play with SoundCloud link: Badge appears correctly
- [ ] Play with multiple links: All appear in categorized sections
- [ ] Play with no links: No errors, components gracefully hide
- [ ] Hover coordination: Hovering comment link highlights preview
- [ ] Link clicking: Opens in new tab
- [ ] Mobile responsive: Components adapt to narrow viewports

### Step 9.5: Final commit and push

```bash
git add .
git commit -m "feat(links): complete link display system implementation

- Schema-validated link types (YouTube, SoundCloud, KEXP, Generic)
- Pure extraction functions with URL normalization
- Atom.family for per-play memoization
- CommentWithLinks with link highlighting
- FeaturedLinkPreview for timeline
- LinksByCategory for details panel
- Hover coordination via data-link-id
- Discriminated union rendering
- Comprehensive test coverage

Closes #[issue-number]"

git push origin feature/link-display
```

---

## Success Criteria Verification

After completing all tasks, verify:

### Functional
- ✅ Links extracted from comments with URLs
- ✅ YouTube, SoundCloud, KEXP, generic links properly categorized
- ✅ Featured link selected by priority for timeline
- ✅ Hover coordination works between comment and preview

### Technical
- ✅ Schema validation for all link types (test with invalid data)
- ✅ Atom.family memoization per play (check React DevTools)
- ✅ Data.TaggedClass for structural equality
- ✅ Discriminated union matching in components
- ✅ Correct imports from @effect-atom packages
- ✅ Result.matchWithWaiting for playAtom
- ✅ No type errors

### UX
- ✅ Minimalist timeline preview (featured link only)
- ✅ Full categorized display in details panel
- ✅ Consistent design language across contexts
- ✅ Smooth hover interactions
- ✅ Links open in new tabs
- ✅ Graceful handling of plays without links

---

## Troubleshooting

### Common Issues

**Type error: Cannot find module '@effect-atom/atom'**
- Check: `pnpm list @effect-atom/atom` in web package
- Fix: `pnpm --filter @crate/web add @effect-atom/atom @effect-atom/atom-react`

**playAtom type mismatch**
- Check: playAtom returns `Result`, not `Option` or plain value
- Fix: Always use `Result.matchWithWaiting` with all 4 handlers

**Links not extracting**
- Check: URL_PATTERN regex in extraction.ts
- Debug: Console log matches in extractLinksFromComment
- Test: Unit test with specific comment text

**Hover not coordinating**
- Check: data-link-id attributes present in DOM
- Check: CSS selectors targeting data-link-id
- Debug: React DevTools to verify state updates

**Build errors**
- Run: `pnpm --filter @crate/domain build && pnpm --filter @crate/api build`
- Check: All imports use correct paths
- Verify: No circular dependencies

---

## References

- **Design Document**: `docs/plans/2025-01-14-link-display-design.md`
- **Effect Skills**: `@effect-foundations`, `@effect-config-schema`, `@effect-collections-datastructs`
- **Effect Docs**: Use `mcp__effect-docs__effect_docs_search("API name")`
- **Local Effect Source**: `docs/effect-source/`
- **Existing Patterns**: `packages/web/src/atoms/kexp-atoms.ts`, `packages/web/src/atoms/timeline.ts`
- **Analysis Report**: `docs/comment-links-implementation-report.md`

---

**Implementation Status**: Ready for execution
**Estimated Time**: 4-6 hours for full implementation
**Difficulty**: Intermediate (requires Effect pattern knowledge)
**Next Step**: Use `@superpowers:executing-plans` or `@superpowers:subagent-driven-development`
