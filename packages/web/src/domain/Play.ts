import { Schema } from "@effect/schema"

/**
 * PlayResult schema - matches FastAPI backend PlayResult model exactly.
 *
 * Represents a single play (track) with metadata and similarity score.
 * Used in both timeline and search responses.
 */
export class PlayResult extends Schema.Class<PlayResult>("PlayResult")({
  // Core fields
  id: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  similarity: Schema.Number,

  // Metadata
  album: Schema.NullOr(Schema.String),
  airdate: Schema.NullOr(Schema.DateFromString), // Automatically transforms ISO 8601 strings to Date objects
  labels: Schema.Array(Schema.String),
  rotation_status: Schema.NullOr(Schema.String),
  is_local: Schema.Boolean,
  is_live: Schema.Boolean,
  is_request: Schema.Boolean,
  comment: Schema.NullOr(Schema.String),
  show: Schema.Number,

  // Album artwork
  image_uri: Schema.NullOr(Schema.String),
  thumbnail_uri: Schema.NullOr(Schema.String),

  // MusicBrainz IDs
  artist_mbid: Schema.NullOr(Schema.Array(Schema.String)),
  recording_mbid: Schema.NullOr(Schema.String),
  release_mbid: Schema.NullOr(Schema.String),
  release_group_mbid: Schema.NullOr(Schema.String)
}) {}

/**
 * TimelineResponse schema - matches FastAPI backend TimelineResponse model exactly.
 *
 * Cursor-based pagination response for timeline endpoint.
 * Supports anchor-based and percentage-based navigation.
 */
export class TimelineResponse extends Schema.Class<TimelineResponse>("TimelineResponse")({
  results: Schema.Array(PlayResult),
  next_cursor: Schema.NullOr(Schema.String),
  has_more: Schema.Boolean,
  query_time_ms: Schema.Number,
  total_count: Schema.optional(Schema.Number),
  anchor_position: Schema.optional(Schema.Number)
}) {}

/**
 * SearchResponse schema - matches FastAPI backend SearchResponse model exactly.
 *
 * Response for semantic search endpoint.
 */
export class SearchResponse extends Schema.Class<SearchResponse>("SearchResponse")({
  results: Schema.Array(PlayResult),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  query: Schema.String
}) {}

// Export type aliases for the schema classes
export type Play = typeof PlayResult.Type
export type Timeline = typeof TimelineResponse.Type
export type SearchResult = typeof SearchResponse.Type
