/**
 * Link Atoms Tests
 *
 * Tests for link extraction atom behavior, following patterns from:
 * - packages/web/src/atoms/kexp-atoms.ts (Result.matchWithWaiting)
 * - packages/web/src/atoms/timeline.ts (playAtom usage)
 */

import { describe, it, expect } from "vitest"
import { Chunk, HashMap, Option } from "effect"
import { playLinksAtom, featuredLinkAtom, linksByCategoryAtom } from "./link-atoms"
import { PlayLinks, YoutubeLink } from "@/lib/links/models"

describe("playLinksAtom", () => {
  it("should be defined as an Atom.family", () => {
    // Test that playLinksAtom is a function (Atom.family returns function)
    expect(typeof playLinksAtom).toBe("function")
  })

  it("should return an atom when called with playId", () => {
    const atom = playLinksAtom(123)
    expect(atom).toBeDefined()
  })
})

describe("featuredLinkAtom", () => {
  it("should be defined as an Atom.family", () => {
    expect(typeof featuredLinkAtom).toBe("function")
  })

  it("should return an atom when called with playId", () => {
    const atom = featuredLinkAtom(123)
    expect(atom).toBeDefined()
  })
})

describe("linksByCategoryAtom", () => {
  it("should be defined as an Atom.family", () => {
    expect(typeof linksByCategoryAtom).toBe("function")
  })

  it("should return an atom when called with playId", () => {
    const atom = linksByCategoryAtom(123)
    expect(atom).toBeDefined()
  })
})

describe("PlayLinks structure", () => {
  it("should create empty PlayLinks", () => {
    const emptyLinks = new PlayLinks({
      playId: 123,
      links: Chunk.empty(),
      byCategory: HashMap.empty(),
      featuredLink: Option.none()
    })

    expect(emptyLinks.playId).toBe(123)
    expect(Chunk.isEmpty(emptyLinks.links)).toBe(true)
    expect(HashMap.isEmpty(emptyLinks.byCategory)).toBe(true)
    expect(Option.isNone(emptyLinks.featuredLink)).toBe(true)
  })

  it("should create PlayLinks with links", () => {
    const youtubeLink = new YoutubeLink({
      id: "test-1",
      url: "https://youtube.com/watch?v=abc123",
      normalizedUrl: "https://youtube.com/watch?v=abc123",
      domain: "youtube.com",
      position: { start: 0, end: 10 },
      videoId: "abc123",
      thumbnailUrl: "https://img.youtube.com/vi/abc123/mqdefault.jpg"
    })

    const links = Chunk.of(youtubeLink)
    const byCategory = HashMap.make(["Youtube", links])
    const featuredLink = Option.some(youtubeLink)

    const playLinks = new PlayLinks({
      playId: 456,
      links,
      byCategory,
      featuredLink
    })

    expect(playLinks.playId).toBe(456)
    expect(Chunk.size(playLinks.links)).toBe(1)
    expect(HashMap.size(playLinks.byCategory)).toBe(1)
    expect(Option.isSome(playLinks.featuredLink)).toBe(true)
  })
})
