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
      const link1 = new YoutubeLink({
        id: "id-1",
        url: "test.com",
        normalizedUrl: "https://test.com",
        domain: "test.com",
        position: { start: 0, end: 8 },
        _tag: "Youtube",
        videoId: "abc",
        thumbnailUrl: "thumb.jpg"
      })

      const link2 = new YoutubeLink({
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
