import { Schema } from "effect"

export const StreamingPlatform = Schema.Literal(
  "spotify",
  "apple_music",
  "bandcamp",
  "soundcloud",
  "youtube_music"
)
export type StreamingPlatform = typeof StreamingPlatform.Type

export const StreamingLinkKind = Schema.Literal("track", "album", "artist", "playlist")
export type StreamingLinkKind = typeof StreamingLinkKind.Type

export const StreamingLinkSource = Schema.Literal(
  "recording_mbid",
  "release_group_mbid",
  "release_mbid",
  "artist_mbid"
)
export type StreamingLinkSource = typeof StreamingLinkSource.Type

export const StreamingLink = Schema.Struct({
  platform: StreamingPlatform,
  kind: StreamingLinkKind,
  url: Schema.String,
  // Optional platform-specific ID (e.g., Spotify track ID)
  id: Schema.optional(Schema.String),
  // Optional display string (e.g., track name)
  display: Schema.optional(Schema.String),
  // Confidence score (0-1) from the resolver
  confidence: Schema.optional(Schema.Number),
  source: StreamingLinkSource
})
export type StreamingLink = typeof StreamingLink.Type

export const StreamingLinksRequest = Schema.Struct({
  recording_mbid: Schema.optional(Schema.String),
  release_group_mbid: Schema.optional(Schema.String),
  release_mbid: Schema.optional(Schema.String),
  artist_mbid: Schema.optional(Schema.String),
  storefront: Schema.optional(Schema.String) // Apple Music storefront (e.g., "us")
})
export type StreamingLinksRequest = typeof StreamingLinksRequest.Type

export const StreamingLinksResponse = Schema.Struct({
  links: Schema.Array(StreamingLink),
  resolved_from: StreamingLinkSource,
  resolved_ids: Schema.optional(
    Schema.Struct({
      spotify_id: Schema.optional(Schema.String),
      apple_music_id: Schema.optional(Schema.String)
    })
  )
})
export type StreamingLinksResponse = typeof StreamingLinksResponse.Type
