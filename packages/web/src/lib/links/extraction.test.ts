/**
 * Link Extraction Tests
 *
 * Testing pure functions for URL extraction, normalization, and categorization
 */

import { describe, it, expect } from "vitest"
import { Chunk, HashMap, Option, pipe } from "effect"
import {
  normalizeUrl,
  getDomain,
  categorizeLink,
  createTypedLink,
  groupByCategory,
  selectFeaturedLink,
  extractLinksFromComment
} from "./extraction"
import { YoutubeLink, SoundCloudLink, KexpLink, GenericLink } from "./models"

describe("normalizeUrl", () => {
  it("adds https protocol to www URLs", () => {
    expect(normalizeUrl("www.youtube.com")).toBe("https://www.youtube.com")
  })

  it("adds https protocol to URLs without protocol", () => {
    expect(normalizeUrl("youtube.com/watch?v=123")).toBe("https://youtube.com/watch?v=123")
  })

  it("preserves existing https protocol", () => {
    expect(normalizeUrl("https://youtube.com")).toBe("https://youtube.com")
  })

  it("preserves existing http protocol", () => {
    expect(normalizeUrl("http://youtube.com")).toBe("http://youtube.com")
  })

  it("trims whitespace", () => {
    expect(normalizeUrl("  youtube.com  ")).toBe("https://youtube.com")
  })
})

describe("getDomain", () => {
  it("extracts domain from https URL", () => {
    expect(getDomain("https://www.youtube.com/watch?v=123")).toBe("youtube.com")
  })

  it("removes www prefix from domain", () => {
    expect(getDomain("https://www.soundcloud.com/track")).toBe("soundcloud.com")
  })

  it("handles URLs without www", () => {
    expect(getDomain("https://kexp.org/blog")).toBe("kexp.org")
  })

  it("returns original URL on parse failure", () => {
    expect(getDomain("not-a-url")).toBe("not-a-url")
  })

  it("lowercases domain", () => {
    expect(getDomain("https://YouTube.COM")).toBe("youtube.com")
  })
})

describe("categorizeLink", () => {
  it("categorizes YouTube as Video", () => {
    expect(categorizeLink("youtube.com")).toBe("Video")
    expect(categorizeLink("youtu.be")).toBe("Video")
  })

  it("categorizes Vimeo as Video", () => {
    expect(categorizeLink("vimeo.com")).toBe("Video")
  })

  it("categorizes SoundCloud as MusicPlatform", () => {
    expect(categorizeLink("soundcloud.com")).toBe("MusicPlatform")
  })

  it("categorizes Bandcamp as MusicPlatform", () => {
    expect(categorizeLink("bandcamp.com")).toBe("MusicPlatform")
  })

  it("categorizes Spotify as MusicPlatform", () => {
    expect(categorizeLink("spotify.com")).toBe("MusicPlatform")
  })

  it("categorizes social media as Social", () => {
    expect(categorizeLink("twitter.com")).toBe("Social")
    expect(categorizeLink("x.com")).toBe("Social")
    expect(categorizeLink("instagram.com")).toBe("Social")
    expect(categorizeLink("facebook.com")).toBe("Social")
  })

  it("categorizes news sites as News", () => {
    expect(categorizeLink("kexp.org")).toBe("News")
    expect(categorizeLink("pitchfork.com")).toBe("News")
    expect(categorizeLink("npr.org")).toBe("News")
    expect(categorizeLink("rollingstone.com")).toBe("News")
  })

  it("categorizes generic domains as Website", () => {
    expect(categorizeLink("example.com")).toBe("Website")
    expect(categorizeLink("test.org")).toBe("Website")
    expect(categorizeLink("site.net")).toBe("Website")
  })

  it("categorizes unknown patterns as Other", () => {
    expect(categorizeLink("localhost")).toBe("Other")
    expect(categorizeLink("192.168.1.1")).toBe("Other")
  })
})

describe("createTypedLink", () => {
  const baseProps = {
    id: "test-id",
    url: "https://youtube.com/watch?v=abc123",
    normalizedUrl: "https://youtube.com/watch?v=abc123",
    domain: "youtube.com",
    category: "Video",
    position: { start: 0, end: 38 }
  }

  it("creates YoutubeLink from YouTube URL with v parameter", () => {
    const link = createTypedLink(baseProps)
    expect(link._tag).toBe("Youtube")
    if (link._tag === "Youtube") {
      expect(link.videoId).toBe("abc123")
      expect(link.thumbnailUrl).toBe("https://img.youtube.com/vi/abc123/mqdefault.jpg")
    }
  })

  it("creates YoutubeLink from youtu.be short URL", () => {
    const link = createTypedLink({
      ...baseProps,
      url: "https://youtu.be/xyz789",
      normalizedUrl: "https://youtu.be/xyz789",
      domain: "youtu.be"
    })
    expect(link._tag).toBe("Youtube")
    if (link._tag === "Youtube") {
      expect(link.videoId).toBe("xyz789")
    }
  })

  it("creates SoundCloudLink from SoundCloud URL", () => {
    const link = createTypedLink({
      ...baseProps,
      url: "https://soundcloud.com/artist/track-name",
      normalizedUrl: "https://soundcloud.com/artist/track-name",
      domain: "soundcloud.com",
      category: "MusicPlatform"
    })
    expect(link._tag).toBe("SoundCloud")
    if (link._tag === "SoundCloud") {
      expect(link.trackId).toBe("artist/track-name")
      expect(link.permalink).toBe("https://soundcloud.com/artist/track-name")
    }
  })

  it("creates KexpLink from KEXP URL", () => {
    const link = createTypedLink({
      ...baseProps,
      url: "https://kexp.org/article/2024/01/test",
      normalizedUrl: "https://kexp.org/article/2024/01/test",
      domain: "kexp.org",
      category: "News"
    })
    expect(link._tag).toBe("Kexp")
    if (link._tag === "Kexp") {
      expect(link.path).toBe("/article/2024/01/test")
      expect(link.isBlog).toBe(false)
    }
  })

  it("creates KexpLink from blog.kexp.org URL", () => {
    const link = createTypedLink({
      ...baseProps,
      url: "https://blog.kexp.org/2024/01/post",
      normalizedUrl: "https://blog.kexp.org/2024/01/post",
      domain: "blog.kexp.org",
      category: "News"
    })
    expect(link._tag).toBe("Kexp")
    if (link._tag === "Kexp") {
      expect(link.isBlog).toBe(true)
    }
  })

  it("creates GenericLink for unrecognized domains", () => {
    const link = createTypedLink({
      ...baseProps,
      url: "https://example.com/page",
      normalizedUrl: "https://example.com/page",
      domain: "example.com",
      category: "Website"
    })
    expect(link._tag).toBe("Generic")
    if (link._tag === "Generic") {
      expect(link.category).toBe("Website")
    }
  })

  it("creates GenericLink when video ID extraction fails", () => {
    const link = createTypedLink({
      ...baseProps,
      url: "https://youtube.com/invalid",
      normalizedUrl: "https://youtube.com/invalid",
      domain: "youtube.com"
    })
    expect(link._tag).toBe("Generic")
  })
})

describe("groupByCategory", () => {
  it("groups links by category using HashMap", () => {
    const links = Chunk.make(
      new YoutubeLink({
        id: "yt1",
        url: "https://youtube.com/watch?v=abc",
        normalizedUrl: "https://youtube.com/watch?v=abc",
        domain: "youtube.com",
        position: { start: 0, end: 10 },
        videoId: "abc",
        thumbnailUrl: "https://img.youtube.com/vi/abc/mqdefault.jpg"
      }),
      new SoundCloudLink({
        id: "sc1",
        url: "https://soundcloud.com/track",
        normalizedUrl: "https://soundcloud.com/track",
        domain: "soundcloud.com",
        position: { start: 0, end: 10 },
        trackId: "track",
        permalink: "https://soundcloud.com/track"
      }),
      new YoutubeLink({
        id: "yt2",
        url: "https://youtube.com/watch?v=def",
        normalizedUrl: "https://youtube.com/watch?v=def",
        domain: "youtube.com",
        position: { start: 0, end: 10 },
        videoId: "def",
        thumbnailUrl: "https://img.youtube.com/vi/def/mqdefault.jpg"
      })
    )

    const grouped = groupByCategory(links)

    expect(HashMap.size(grouped)).toBe(2)
    expect(HashMap.has(grouped, "Youtube")).toBe(true)
    expect(HashMap.has(grouped, "SoundCloud")).toBe(true)

    const youtubeLinks = pipe(
      HashMap.get(grouped, "Youtube"),
      Option.map(Chunk.size),
      Option.getOrElse(() => 0)
    )
    expect(youtubeLinks).toBe(2)

    const soundcloudLinks = pipe(
      HashMap.get(grouped, "SoundCloud"),
      Option.map(Chunk.size),
      Option.getOrElse(() => 0)
    )
    expect(soundcloudLinks).toBe(1)
  })

  it("groups GenericLink by category field", () => {
    const links = Chunk.make(
      new GenericLink({
        id: "g1",
        url: "https://twitter.com/user",
        normalizedUrl: "https://twitter.com/user",
        domain: "twitter.com",
        position: { start: 0, end: 10 },
        category: "Social"
      }),
      new GenericLink({
        id: "g2",
        url: "https://example.com",
        normalizedUrl: "https://example.com",
        domain: "example.com",
        position: { start: 0, end: 10 },
        category: "Website"
      })
    )

    const grouped = groupByCategory(links)

    expect(HashMap.size(grouped)).toBe(2)
    expect(HashMap.has(grouped, "Social")).toBe(true)
    expect(HashMap.has(grouped, "Website")).toBe(true)
  })

  it("returns empty HashMap for empty links", () => {
    const grouped = groupByCategory(Chunk.empty())
    expect(HashMap.isEmpty(grouped)).toBe(true)
  })
})

describe("selectFeaturedLink", () => {
  it("prioritizes YouTube over other links", () => {
    const links = Chunk.make(
      new GenericLink({
        id: "g1",
        url: "https://example.com",
        normalizedUrl: "https://example.com",
        domain: "example.com",
        position: { start: 0, end: 10 },
        category: "Website"
      }),
      new YoutubeLink({
        id: "yt1",
        url: "https://youtube.com/watch?v=abc",
        normalizedUrl: "https://youtube.com/watch?v=abc",
        domain: "youtube.com",
        position: { start: 0, end: 10 },
        videoId: "abc",
        thumbnailUrl: "https://img.youtube.com/vi/abc/mqdefault.jpg"
      }),
      new SoundCloudLink({
        id: "sc1",
        url: "https://soundcloud.com/track",
        normalizedUrl: "https://soundcloud.com/track",
        domain: "soundcloud.com",
        position: { start: 0, end: 10 },
        trackId: "track",
        permalink: "https://soundcloud.com/track"
      })
    )

    const featured = selectFeaturedLink(links)

    expect(Option.isSome(featured)).toBe(true)
    pipe(
      featured,
      Option.map(link => {
        expect(link._tag).toBe("Youtube")
      })
    )
  })

  it("selects SoundCloud when no YouTube", () => {
    const links = Chunk.make(
      new GenericLink({
        id: "g1",
        url: "https://example.com",
        normalizedUrl: "https://example.com",
        domain: "example.com",
        position: { start: 0, end: 10 },
        category: "Website"
      }),
      new SoundCloudLink({
        id: "sc1",
        url: "https://soundcloud.com/track",
        normalizedUrl: "https://soundcloud.com/track",
        domain: "soundcloud.com",
        position: { start: 0, end: 10 },
        trackId: "track",
        permalink: "https://soundcloud.com/track"
      })
    )

    const featured = selectFeaturedLink(links)

    pipe(
      featured,
      Option.map(link => {
        expect(link._tag).toBe("SoundCloud")
      })
    )
  })

  it("selects KEXP when no YouTube or SoundCloud", () => {
    const links = Chunk.make(
      new GenericLink({
        id: "g1",
        url: "https://example.com",
        normalizedUrl: "https://example.com",
        domain: "example.com",
        position: { start: 0, end: 10 },
        category: "Website"
      }),
      new KexpLink({
        id: "k1",
        url: "https://kexp.org/article",
        normalizedUrl: "https://kexp.org/article",
        domain: "kexp.org",
        position: { start: 0, end: 10 },
        path: "/article",
        isBlog: false
      })
    )

    const featured = selectFeaturedLink(links)

    pipe(
      featured,
      Option.map(link => {
        expect(link._tag).toBe("Kexp")
      })
    )
  })

  it("selects first link when no priority matches", () => {
    const links = Chunk.of(
      new GenericLink({
        id: "g1",
        url: "https://example.com",
        normalizedUrl: "https://example.com",
        domain: "example.com",
        position: { start: 0, end: 10 },
        category: "Website"
      })
    )

    const featured = selectFeaturedLink(links)

    expect(Option.isSome(featured)).toBe(true)
    pipe(
      featured,
      Option.map(link => {
        expect(link._tag).toBe("Generic")
      })
    )
  })

  it("returns None for empty links", () => {
    const featured = selectFeaturedLink(Chunk.empty())
    expect(Option.isNone(featured)).toBe(true)
  })
})

describe("extractLinksFromComment", () => {
  it("extracts and categorizes all links from comment", () => {
    const comment = "Check out https://youtube.com/watch?v=abc123 and https://soundcloud.com/artist/track"

    const result = extractLinksFromComment(123, comment)

    expect(result.playId).toBe(123)
    expect(Chunk.size(result.links)).toBe(2)
    expect(HashMap.size(result.byCategory)).toBeGreaterThan(0)
    expect(Option.isSome(result.featuredLink)).toBe(true)
  })

  it("returns empty PlayLinks for comment with no links", () => {
    const result = extractLinksFromComment(123, "No links here, just text")

    expect(Chunk.isEmpty(result.links)).toBe(true)
    expect(HashMap.isEmpty(result.byCategory)).toBe(true)
    expect(Option.isNone(result.featuredLink)).toBe(true)
  })

  it("correctly positions links in comment text", () => {
    const comment = "Start https://youtube.com/watch?v=123 end"

    const result = extractLinksFromComment(123, comment)

    const link = Chunk.unsafeHead(result.links)
    expect(link.position.start).toBe(6)
    expect(link.position.end).toBeGreaterThan(link.position.start)
  })

  it("extracts multiple links of different types", () => {
    const comment = `
      YouTube: https://youtube.com/watch?v=abc123
      SoundCloud: https://soundcloud.com/artist/track
      KEXP: https://kexp.org/article
      Twitter: https://twitter.com/user
    `

    const result = extractLinksFromComment(456, comment)

    expect(Chunk.size(result.links)).toBe(4)
    expect(HashMap.size(result.byCategory)).toBe(4)
  })

  it("normalizes URLs without protocol", () => {
    const comment = "Check www.youtube.com/watch?v=abc123"

    const result = extractLinksFromComment(123, comment)

    expect(Chunk.size(result.links)).toBe(1)
    const link = Chunk.unsafeHead(result.links)
    expect(link.normalizedUrl).toMatch(/^https:\/\//)
  })

  it("handles URLs at start and end of comment", () => {
    const comment = "https://youtube.com/watch?v=abc middle text https://soundcloud.com/track"

    const result = extractLinksFromComment(123, comment)

    expect(Chunk.size(result.links)).toBe(2)
  })

  it("extracts unique IDs for each link", () => {
    const comment = "https://youtube.com/watch?v=1 https://youtube.com/watch?v=2"

    const result = extractLinksFromComment(123, comment)

    const ids = pipe(
      result.links,
      Chunk.map(link => link.id),
      Chunk.toReadonlyArray
    )

    expect(new Set(ids).size).toBe(2)
  })
})
