/**
 * Link Type Configuration
 *
 * Centralized configuration for URL classification and handling.
 * Based on analysis of 810,083 URLs from KEXP DJ comments.
 *
 * @module
 */

// =============================================================================
// Link Type Definitions
// =============================================================================

/**
 * Categories of link types for classification
 */
export type LinkCategory =
  | "video"
  | "music_platform"
  | "music_database"
  | "news_media"
  | "social_media"
  | "url_shortener"
  | "lyrics"
  | "radio"
  | "reference"
  | "ecommerce"
  | "other"

/**
 * Configuration for a link type
 */
export interface LinkTypeConfig {
  /** Unique identifier for this link type */
  readonly type: string
  /** Human-readable display name */
  readonly displayName: string
  /** Category for grouping */
  readonly category: LinkCategory
  /** Domain patterns to match (supports wildcards via .includes()) */
  readonly patterns: readonly string[]
  /** Priority for matching (higher = matched first) */
  readonly priority: number
  /** Whether this source typically has high-quality music content */
  readonly musicRelevance: "high" | "medium" | "low"
  /** Whether links should be fetched for content extraction */
  readonly shouldFetch: boolean
  /** Notes about this link type */
  readonly notes?: string
}

// =============================================================================
// Link Type Registry
// =============================================================================

/**
 * Comprehensive link type configuration
 *
 * Based on KEXP comment link analysis:
 * - YouTube: 103,211 links (12.7%)
 * - kexp.org: 71,862 links (8.9%)
 * - bit.ly: 55,362 links (6.8%)
 * - blog.kexp.org: 50,310 links (6.2%)
 * - youtu.be: 37,921 links (4.7%)
 * - bandcamp.com: 149,398 links (18.4% - via subdomains)
 * - soundcloud.com: 12,605 links
 * - pitchfork.com: 8,457 links
 * - allmusic.com: 6,992 links
 * - discogs.com: 2,142 links
 */
export const LINK_TYPES: readonly LinkTypeConfig[] = [
  // -------------------------------------------------------------------------
  // Music Platforms (high relevance, should fetch)
  // -------------------------------------------------------------------------
  {
    type: "bandcamp",
    displayName: "Bandcamp",
    category: "music_platform",
    patterns: ["bandcamp.com"],
    priority: 100,
    musicRelevance: "high",
    shouldFetch: true,
    notes: "Artist pages, albums, tracks - excellent for discovering indie music",
  },
  {
    type: "soundcloud",
    displayName: "SoundCloud",
    category: "music_platform",
    patterns: ["soundcloud.com"],
    priority: 100,
    musicRelevance: "high",
    shouldFetch: true,
    notes: "Artist uploads, mixes, DJ sets",
  },
  {
    type: "spotify",
    displayName: "Spotify",
    category: "music_platform",
    patterns: ["spotify.com", "open.spotify.com"],
    priority: 100,
    musicRelevance: "high",
    shouldFetch: false, // Requires auth, limited content
    notes: "Limited metadata available without API",
  },
  {
    type: "apple_music",
    displayName: "Apple Music",
    category: "music_platform",
    patterns: ["music.apple.com", "itunes.apple.com"],
    priority: 100,
    musicRelevance: "high",
    shouldFetch: false,
    notes: "Limited metadata available",
  },
  {
    type: "tidal",
    displayName: "Tidal",
    category: "music_platform",
    patterns: ["tidal.com"],
    priority: 100,
    musicRelevance: "high",
    shouldFetch: false,
  },
  {
    type: "deezer",
    displayName: "Deezer",
    category: "music_platform",
    patterns: ["deezer.com"],
    priority: 100,
    musicRelevance: "high",
    shouldFetch: false,
  },

  // -------------------------------------------------------------------------
  // Video Platforms (don't fetch - video content, not text)
  // -------------------------------------------------------------------------
  {
    type: "youtube",
    displayName: "YouTube",
    category: "video",
    patterns: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
    priority: 95,
    musicRelevance: "high",
    shouldFetch: false,
    notes: "Music videos, live performances - 17% of all links. Video content, not fetchable text.",
  },
  {
    type: "vimeo",
    displayName: "Vimeo",
    category: "video",
    patterns: ["vimeo.com"],
    priority: 95,
    musicRelevance: "medium",
    shouldFetch: false,
    notes: "Video content, not fetchable text",
  },

  // -------------------------------------------------------------------------
  // Music Databases (high relevance for metadata)
  // -------------------------------------------------------------------------
  {
    type: "musicbrainz",
    displayName: "MusicBrainz",
    category: "music_database",
    patterns: ["musicbrainz.org"],
    priority: 100,
    musicRelevance: "high",
    shouldFetch: true,
    notes: "Authoritative music metadata - extract MBIDs",
  },
  {
    type: "discogs",
    displayName: "Discogs",
    category: "music_database",
    patterns: ["discogs.com"],
    priority: 100,
    musicRelevance: "high",
    shouldFetch: true,
    notes: "Release info, credits, vinyl collectors",
  },
  {
    type: "allmusic",
    displayName: "AllMusic",
    category: "music_database",
    patterns: ["allmusic.com"],
    priority: 100,
    musicRelevance: "high",
    shouldFetch: true,
    notes: "Reviews, bios, credits - 6,992 links",
  },
  {
    type: "rateyourmusic",
    displayName: "Rate Your Music",
    category: "music_database",
    patterns: ["rateyourmusic.com"],
    priority: 90,
    musicRelevance: "high",
    shouldFetch: true,
  },

  // -------------------------------------------------------------------------
  // Reference (encyclopedic content)
  // -------------------------------------------------------------------------
  {
    type: "wikipedia",
    displayName: "Wikipedia",
    category: "reference",
    patterns: ["wikipedia.org", "en.wikipedia.org"],
    priority: 90,
    musicRelevance: "medium",
    shouldFetch: true,
    notes: "Artist bios, history, discographies",
  },
  {
    type: "wikidata",
    displayName: "Wikidata",
    category: "reference",
    patterns: ["wikidata.org"],
    priority: 85,
    musicRelevance: "medium",
    shouldFetch: false,
    notes: "Structured data - use APIs instead",
  },

  // -------------------------------------------------------------------------
  // News & Media
  // -------------------------------------------------------------------------
  {
    type: "kexp",
    displayName: "KEXP",
    category: "radio",
    patterns: ["kexp.org", "blog.kexp.org"],
    priority: 100,
    musicRelevance: "high",
    shouldFetch: true,
    notes: "KEXP blog posts, sessions, reviews - 15% of all links",
  },
  {
    type: "pitchfork",
    displayName: "Pitchfork",
    category: "news_media",
    patterns: ["pitchfork.com"],
    priority: 85,
    musicRelevance: "high",
    shouldFetch: true,
    notes: "Reviews, features, news - 8,457 links",
  },
  {
    type: "npr_music",
    displayName: "NPR Music",
    category: "news_media",
    patterns: ["npr.org/music", "npr.org/sections/music"],
    priority: 85,
    musicRelevance: "high",
    shouldFetch: true,
  },
  {
    type: "npr",
    displayName: "NPR",
    category: "news_media",
    patterns: ["npr.org"],
    priority: 80,
    musicRelevance: "medium",
    shouldFetch: true,
    notes: "3,455 links - includes Tiny Desk, etc.",
  },
  {
    type: "rolling_stone",
    displayName: "Rolling Stone",
    category: "news_media",
    patterns: ["rollingstone.com"],
    priority: 85,
    musicRelevance: "high",
    shouldFetch: true,
  },
  {
    type: "stereogum",
    displayName: "Stereogum",
    category: "news_media",
    patterns: ["stereogum.com"],
    priority: 85,
    musicRelevance: "high",
    shouldFetch: true,
    notes: "3,095 links",
  },
  {
    type: "guardian",
    displayName: "The Guardian",
    category: "news_media",
    patterns: ["theguardian.com"],
    priority: 75,
    musicRelevance: "medium",
    shouldFetch: true,
  },
  {
    type: "nytimes",
    displayName: "New York Times",
    category: "news_media",
    patterns: ["nytimes.com"],
    priority: 75,
    musicRelevance: "medium",
    shouldFetch: true,
    notes: "Often paywalled",
  },
  {
    type: "nme",
    displayName: "NME",
    category: "news_media",
    patterns: ["nme.com"],
    priority: 85,
    musicRelevance: "high",
    shouldFetch: true,
  },
  {
    type: "consequence",
    displayName: "Consequence",
    category: "news_media",
    patterns: ["consequence.net", "consequenceofsound.net"],
    priority: 85,
    musicRelevance: "high",
    shouldFetch: true,
  },
  {
    type: "brooklynvegan",
    displayName: "Brooklyn Vegan",
    category: "news_media",
    patterns: ["brooklynvegan.com"],
    priority: 85,
    musicRelevance: "high",
    shouldFetch: true,
  },
  {
    type: "the_quietus",
    displayName: "The Quietus",
    category: "news_media",
    patterns: ["thequietus.com"],
    priority: 85,
    musicRelevance: "high",
    shouldFetch: true,
  },
  {
    type: "aquarium_drunkard",
    displayName: "Aquarium Drunkard",
    category: "news_media",
    patterns: ["aquariumdrunkard.com"],
    priority: 85,
    musicRelevance: "high",
    shouldFetch: true,
  },
  {
    type: "resident_advisor",
    displayName: "Resident Advisor",
    category: "news_media",
    patterns: ["ra.co", "residentadvisor.net"],
    priority: 90,
    musicRelevance: "high",
    shouldFetch: true,
    notes: "Electronic music reviews, artist profiles",
  },

  // -------------------------------------------------------------------------
  // Lyrics
  // -------------------------------------------------------------------------
  {
    type: "genius",
    displayName: "Genius",
    category: "lyrics",
    patterns: ["genius.com"],
    priority: 85,
    musicRelevance: "high",
    shouldFetch: true,
    notes: "Lyrics, annotations - 2,339 links",
  },
  {
    type: "azlyrics",
    displayName: "AZLyrics",
    category: "lyrics",
    patterns: ["azlyrics.com"],
    priority: 80,
    musicRelevance: "medium",
    shouldFetch: false,
    notes: "Heavy ads, limited content value",
  },

  // -------------------------------------------------------------------------
  // Social Media
  // -------------------------------------------------------------------------
  {
    type: "twitter",
    displayName: "Twitter/X",
    category: "social_media",
    patterns: ["twitter.com", "x.com"],
    priority: 70,
    musicRelevance: "low",
    shouldFetch: false,
    notes: "Often requires auth, limited content",
  },
  {
    type: "instagram",
    displayName: "Instagram",
    category: "social_media",
    patterns: ["instagram.com"],
    priority: 70,
    musicRelevance: "low",
    shouldFetch: false,
    notes: "Requires auth",
  },
  {
    type: "facebook",
    displayName: "Facebook",
    category: "social_media",
    patterns: ["facebook.com", "fb.com"],
    priority: 70,
    musicRelevance: "low",
    shouldFetch: false,
    notes: "23,605 links - often event pages, requires auth",
  },
  {
    type: "threads",
    displayName: "Threads",
    category: "social_media",
    patterns: ["threads.net"],
    priority: 70,
    musicRelevance: "low",
    shouldFetch: false,
  },
  {
    type: "bluesky",
    displayName: "Bluesky",
    category: "social_media",
    patterns: ["bsky.app"],
    priority: 70,
    musicRelevance: "low",
    shouldFetch: false,
  },
  {
    type: "mastodon",
    displayName: "Mastodon",
    category: "social_media",
    patterns: ["mastodon.social", "hachyderm.io"],
    priority: 70,
    musicRelevance: "low",
    shouldFetch: false,
  },
  {
    type: "linktree",
    displayName: "Linktree",
    category: "social_media",
    patterns: ["linktr.ee"],
    priority: 75,
    musicRelevance: "medium",
    shouldFetch: true,
    notes: "Artist link aggregators - can discover other links",
  },

  // -------------------------------------------------------------------------
  // URL Shorteners (need expansion)
  // -------------------------------------------------------------------------
  {
    type: "bitly",
    displayName: "Bit.ly",
    category: "url_shortener",
    patterns: ["bit.ly"],
    priority: 50,
    musicRelevance: "low",
    shouldFetch: true, // Need to expand
    notes: "55,362 links - need to expand to get actual destination",
  },
  {
    type: "tinyurl",
    displayName: "TinyURL",
    category: "url_shortener",
    patterns: ["tinyurl.com"],
    priority: 50,
    musicRelevance: "low",
    shouldFetch: true,
    notes: "13,191 links",
  },
  {
    type: "ow_ly",
    displayName: "Ow.ly",
    category: "url_shortener",
    patterns: ["ow.ly"],
    priority: 50,
    musicRelevance: "low",
    shouldFetch: true,
  },
  {
    type: "t_co",
    displayName: "Twitter Short",
    category: "url_shortener",
    patterns: ["t.co"],
    priority: 50,
    musicRelevance: "low",
    shouldFetch: true,
  },
  {
    type: "goo_gl",
    displayName: "Google Short",
    category: "url_shortener",
    patterns: ["goo.gl"],
    priority: 50,
    musicRelevance: "low",
    shouldFetch: false, // Deprecated
    notes: "Google URL shortener deprecated",
  },

  // -------------------------------------------------------------------------
  // E-commerce / Ticketing
  // -------------------------------------------------------------------------
  {
    type: "ticketmaster",
    displayName: "Ticketmaster",
    category: "ecommerce",
    patterns: ["ticketmaster.com"],
    priority: 60,
    musicRelevance: "medium",
    shouldFetch: false,
    notes: "Concert tickets - time-sensitive",
  },
  {
    type: "songkick",
    displayName: "Songkick",
    category: "ecommerce",
    patterns: ["songkick.com"],
    priority: 70,
    musicRelevance: "medium",
    shouldFetch: true,
    notes: "Tour dates, concerts",
  },
  {
    type: "bandsintown",
    displayName: "Bandsintown",
    category: "ecommerce",
    patterns: ["bandsintown.com"],
    priority: 70,
    musicRelevance: "medium",
    shouldFetch: true,
  },
  {
    type: "amazon_music",
    displayName: "Amazon Music",
    category: "ecommerce",
    patterns: ["amazon.com/music", "music.amazon.com"],
    priority: 60,
    musicRelevance: "medium",
    shouldFetch: false,
  },
] as const

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map of domain patterns to link types for fast lookup
 */
const domainToTypeMap = new Map<string, LinkTypeConfig>()

// Build lookup map (sorted by priority descending)
const sortedTypes = [...LINK_TYPES].sort((a, b) => b.priority - a.priority)
for (const config of sortedTypes) {
  for (const pattern of config.patterns) {
    // Use pattern as key if not already present (first match wins due to priority sort)
    if (!domainToTypeMap.has(pattern)) {
      domainToTypeMap.set(pattern, config)
    }
  }
}

/**
 * Classify a URL by its domain
 *
 * @param url - URL to classify
 * @returns Link type configuration or undefined if no match
 */
export const classifyUrl = (url: string): LinkTypeConfig | undefined => {
  try {
    const hostname = new URL(url).hostname.toLowerCase()

    // Check each pattern (already sorted by priority)
    for (const [pattern, config] of domainToTypeMap) {
      if (hostname.includes(pattern)) {
        return config
      }
    }

    return undefined
  } catch {
    return undefined
  }
}

/**
 * Get link type string for a URL (for backwards compatibility)
 *
 * @param url - URL to classify
 * @returns Link type string or undefined
 */
export const getLinkType = (url: string): string | undefined => {
  return classifyUrl(url)?.type
}

/**
 * Get link category for a URL
 *
 * @param url - URL to classify
 * @returns Link category or "other"
 */
export const getLinkCategory = (url: string): LinkCategory => {
  return classifyUrl(url)?.category ?? "other"
}

/**
 * Check if a URL should be fetched for content extraction
 *
 * @param url - URL to check
 * @returns true if the URL should be fetched
 */
export const shouldFetchUrl = (url: string): boolean => {
  const config = classifyUrl(url)
  return config?.shouldFetch ?? true // Default to fetching unknown URLs
}

/**
 * Check if a URL is a URL shortener that needs expansion
 *
 * @param url - URL to check
 * @returns true if this is a shortened URL
 */
export const isUrlShortener = (url: string): boolean => {
  return classifyUrl(url)?.category === "url_shortener"
}

/**
 * Get all link types for a category
 *
 * @param category - Category to filter by
 * @returns Array of link type configs
 */
export const getLinkTypesByCategory = (
  category: LinkCategory
): readonly LinkTypeConfig[] => {
  return LINK_TYPES.filter((t) => t.category === category)
}

/**
 * Get high music relevance link types
 *
 * @returns Array of link type configs with high music relevance
 */
export const getHighRelevanceLinkTypes = (): readonly LinkTypeConfig[] => {
  return LINK_TYPES.filter((t) => t.musicRelevance === "high")
}
