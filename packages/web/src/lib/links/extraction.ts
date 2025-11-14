/**
 * Link Extraction - Pure functions for URL extraction and categorization
 *
 * CRITICAL: All functions are pure (no side effects, deterministic)
 * - Use pipe for composable transformations
 * - Use Effect collections (Chunk, HashMap, Option) not arrays/objects
 * - Reference local Effect source before using new APIs
 */

import { Chunk, HashMap, Option, pipe } from "effect"
import { nanoid } from "nanoid"
import {
  PlayLinks,
  ExtractedLink,
  YoutubeLink,
  SoundCloudLink,
  KexpLink,
  GenericLink
} from "./models"

/**
 * URL pattern for extracting links from comment text
 * Matches http(s):// or www. followed by non-whitespace characters
 */
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"{}|\\^`\[\]]+[^\s<>"{}|\\^`\[\].,;:!?]/gi

/**
 * Normalize URL: add protocol if missing, clean trailing punctuation
 * Pure function - same input always produces same output
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
 * Extract domain from URL (remove www prefix, lowercase)
 * Returns original URL string if parsing fails
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

/**
 * Categorize link by domain patterns
 * Returns category string for grouping and priority selection
 */
export function categorizeLink(domain: string): string {
  // Video platforms
  if (domain.includes('youtube.com') || domain.includes('youtu.be') || domain.includes('vimeo.com')) {
    return 'Video'
  }

  // Music platforms
  if (domain.includes('bandcamp.com') || domain.includes('soundcloud.com') ||
      domain.includes('spotify.com') || domain.includes('apple.com/music')) {
    return 'MusicPlatform'
  }

  // Social media
  if (domain.includes('twitter.com') || domain.includes('x.com') ||
      domain.includes('facebook.com') || domain.includes('instagram.com')) {
    return 'Social'
  }

  // News and music journalism
  if (domain.includes('kexp.org') || domain.includes('npr.org') ||
      domain.includes('pitchfork.com') || domain.includes('rollingstone.com')) {
    return 'News'
  }

  // Generic websites with common TLDs
  if (domain.match(/\.(com|org|net|io|co)$/)) {
    return 'Website'
  }

  // Unknown patterns
  return 'Other'
}

/**
 * Extract YouTube video ID from various URL formats
 * Handles: /watch?v=ID, /embed/ID, youtu.be/ID
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([0-9A-Za-z_-]+)/,           // ?v=ID or &v=ID
    /\/embed\/([0-9A-Za-z_-]+)/,         // /embed/ID
    /youtu\.be\/([0-9A-Za-z_-]+)/        // youtu.be/ID
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

/**
 * Extract SoundCloud track ID from URL
 * Uses URL path as ID since SoundCloud uses permalinks
 */
function extractSoundCloudTrackId(url: string): string | null {
  try {
    const path = new URL(url).pathname
    return path.split('/').filter(Boolean).join('/')
  } catch {
    return null
  }
}

/**
 * Create properly typed link based on domain analysis
 * Returns specific link class (YoutubeLink, SoundCloudLink, KexpLink, GenericLink)
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

  // YouTube - extract video ID and create specialized link
  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    const videoId = extractYouTubeVideoId(normalizedUrl)
    if (videoId) {
      return new YoutubeLink({
        ...base,
        videoId,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
      })
    }
  }

  // SoundCloud - extract track ID and permalink
  if (domain.includes('soundcloud.com')) {
    const trackId = extractSoundCloudTrackId(normalizedUrl)
    if (trackId) {
      return new SoundCloudLink({
        ...base,
        trackId,
        permalink: normalizedUrl
      })
    }
  }

  // KEXP - extract path and determine if blog
  if (domain.includes('kexp.org')) {
    const path = new URL(normalizedUrl).pathname
    return new KexpLink({
      ...base,
      path,
      isBlog: domain.startsWith('blog.')
    })
  }

  // Generic fallback - use category from categorizeLink
  return new GenericLink({
    ...base,
    category: base.category as "Social" | "News" | "Website" | "Other"
  })
}

/**
 * Group links by category using HashMap
 * For GenericLink, uses the category field; for others, uses _tag
 */
export function groupByCategory(
  links: Chunk.Chunk<ExtractedLink>
): HashMap.HashMap<string, Chunk.Chunk<ExtractedLink>> {
  return pipe(
    links,
    Chunk.reduce(HashMap.empty<string, Chunk.Chunk<ExtractedLink>>(), (map, link) => {
      const category = link._tag === "Generic" ? link.category : link._tag
      const existing = HashMap.get(map, category)
      const newChunk = pipe(
        existing,
        Option.match({
          onNone: () => Chunk.of(link),
          onSome: (chunk) => Chunk.append(chunk, link)
        })
      )
      return HashMap.set(map, category, newChunk)
    })
  )
}

/**
 * Select featured link for timeline display
 * Priority: Youtube > SoundCloud > Kexp > first link
 */
export function selectFeaturedLink(
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

/**
 * Extract all links from comment and build PlayLinks model
 * Pure function - no side effects, fully deterministic
 *
 * @param playId - ID of the play containing this comment
 * @param comment - Comment text to extract links from
 * @returns PlayLinks model with all extracted links, categorization, and featured link
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

  return new PlayLinks({
    playId,
    links,
    byCategory,
    featuredLink
  })
}
