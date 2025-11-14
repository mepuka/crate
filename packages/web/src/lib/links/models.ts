/**
 * Link Models - Schema-validated link types with Data.TaggedClass
 *
 * CRITICAL: Study Effect Schema and Data patterns before modifying
 * - Effect Schema docs: mcp__effect-docs__effect_docs_search("Schema.Struct")
 * - Local source: docs/effect-source/schema/src/Schema.ts
 * - Existing pattern: packages/web/src/atoms/kexp-atoms.ts
 */

import { Schema, Data } from "effect"

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
const YoutubeLinkFields = Schema.Struct({
  ...BaseLinkFields,
  videoId: Schema.String,
  thumbnailUrl: Schema.String      // https://img.youtube.com/vi/{id}/mqdefault.jpg
})

export class YoutubeLink extends Data.TaggedClass("Youtube")<
  Schema.Schema.Type<typeof YoutubeLinkFields>
> {}

export const YoutubeLinkSchema = Schema.Struct({
  ...BaseLinkFields,
  _tag: Schema.Literal("Youtube"),
  videoId: Schema.String,
  thumbnailUrl: Schema.String
})

// SoundCloud link with track data
const SoundCloudLinkFields = Schema.Struct({
  ...BaseLinkFields,
  trackId: Schema.String,
  permalink: Schema.String,
  artworkUrl: Schema.optionalWith(Schema.String, { exact: true })
})

export class SoundCloudLink extends Data.TaggedClass("SoundCloud")<
  Schema.Schema.Type<typeof SoundCloudLinkFields>
> {}

export const SoundCloudLinkSchema = Schema.Struct({
  ...BaseLinkFields,
  _tag: Schema.Literal("SoundCloud"),
  trackId: Schema.String,
  permalink: Schema.String,
  artworkUrl: Schema.optionalWith(Schema.String, { exact: true })
})

// KEXP link (blog, main site)
const KexpLinkFields = Schema.Struct({
  ...BaseLinkFields,
  path: Schema.String,             // URL path for routing
  isBlog: Schema.Boolean           // blog.kexp.org vs kexp.org
})

export class KexpLink extends Data.TaggedClass("Kexp")<
  Schema.Schema.Type<typeof KexpLinkFields>
> {}

export const KexpLinkSchema = Schema.Struct({
  ...BaseLinkFields,
  _tag: Schema.Literal("Kexp"),
  path: Schema.String,
  isBlog: Schema.Boolean
})

// Generic link for other platforms (social, news, websites)
const GenericLinkFields = Schema.Struct({
  ...BaseLinkFields,
  category: Schema.Literal("Social", "News", "Website", "Other"),
  favicon: Schema.optionalWith(Schema.String, { exact: true })
})

export class GenericLink extends Data.TaggedClass("Generic")<
  Schema.Schema.Type<typeof GenericLinkFields>
> {}

export const GenericLinkSchema = Schema.Struct({
  ...BaseLinkFields,
  _tag: Schema.Literal("Generic"),
  category: Schema.Literal("Social", "News", "Website", "Other"),
  favicon: Schema.optionalWith(Schema.String, { exact: true })
})

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

// PlayLinks: Container for all links in a play
const PlayLinksFields = Schema.Struct({
  playId: Schema.Number,
  links: Schema.Chunk(ExtractedLinkSchema),        // All extracted links
  byCategory: Schema.HashMap({                      // Grouped for details panel
    key: Schema.String,
    value: Schema.Chunk(ExtractedLinkSchema)
  }),
  featuredLink: Schema.OptionFromNullOr(ExtractedLinkSchema) // Priority link for timeline
})

export class PlayLinks extends Data.TaggedClass("PlayLinks")<
  Schema.Schema.Type<typeof PlayLinksFields>
> {}

export const PlayLinksSchema = Schema.Struct({
  _tag: Schema.Literal("PlayLinks"),
  playId: Schema.Number,
  links: Schema.Chunk(ExtractedLinkSchema),
  byCategory: Schema.HashMap({
    key: Schema.String,
    value: Schema.Chunk(ExtractedLinkSchema)
  }),
  featuredLink: Schema.OptionFromNullOr(ExtractedLinkSchema)
})
