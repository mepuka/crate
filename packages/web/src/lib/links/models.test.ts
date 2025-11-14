import { describe, it, expect } from "vitest"
import { Schema, Chunk, HashMap, Option } from "effect"
import {
  YoutubeLinkSchema,
  YoutubeLink,
  SoundCloudLinkSchema,
  KexpLinkSchema,
  GenericLinkSchema,
  PlayLinks
} from "./models"

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
      const link1 = new YoutubeLink({
        id: "id-1",
        url: "test.com",
        normalizedUrl: "https://test.com",
        domain: "test.com",
        position: { start: 0, end: 8 },
        videoId: "abc",
        thumbnailUrl: "thumb.jpg"
      })

      const link2 = new YoutubeLink({
        id: "id-1",
        url: "test.com",
        normalizedUrl: "https://test.com",
        domain: "test.com",
        position: { start: 0, end: 8 },
        videoId: "abc",
        thumbnailUrl: "thumb.jpg"
      })

      // Data.TaggedClass provides structural equality
      expect(link1).toEqual(link2)
      // Data.TaggedClass automatically adds _tag
      expect(link1._tag).toBe("Youtube")
    })
  })

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

  describe("PlayLinks", () => {
    it("creates PlayLinks container with links and categorization", () => {
      const link1 = new YoutubeLink({
        id: "yt-1",
        url: "youtube.com/v1",
        normalizedUrl: "https://youtube.com/v1",
        domain: "youtube.com",
        position: { start: 0, end: 10 },
        videoId: "v1",
        thumbnailUrl: "thumb.jpg"
      })

      const playLinks = new PlayLinks({
        playId: 123,
        links: Chunk.of(link1),
        byCategory: HashMap.make(["Youtube", Chunk.of(link1)]),
        featuredLink: Option.some(link1)
      })

      expect(playLinks.playId).toBe(123)
      expect(Chunk.size(playLinks.links)).toBe(1)
      expect(Option.isSome(playLinks.featuredLink)).toBe(true)
    })
  })
})
