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
