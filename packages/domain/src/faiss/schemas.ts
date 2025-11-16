import { Schema } from "effect"

/**
 * Safe date parser that handles invalid date strings gracefully.
 * Converts invalid dates and empty strings to null instead of creating invalid Date objects.
 */
const SafeDateFromString = Schema.transform(
  Schema.String,
  Schema.NullOr(Schema.DateFromSelf),
  {
    decode: (s) => {
      // Treat empty strings as null
      if (s === "") return null;
      const date = new Date(s);
      // Check if the date is valid, return null for invalid dates
      return isNaN(date.getTime()) ? null : date;
    },
    encode: (dateOrNull) => dateOrNull ? dateOrNull.toISOString() : ""
  }
);

/**
 * String that normalizes empty strings to null.
 * KEXP API sometimes returns empty strings instead of null for missing data.
 */
const StringOrNull = Schema.transform(
  Schema.String,
  Schema.NullOr(Schema.String),
  {
    decode: (s) => s === "" ? null : s,
    encode: (s) => s ?? ""
  }
);

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
  album: StringOrNull, // Normalize empty strings to null
  airdate: Schema.DateFromString, // Always present - automatically transforms ISO 8601 strings to Date objects
  release_date: Schema.NullOr(SafeDateFromString), // Album/track release date (can be null, empty string, or invalid - safely converts to null)
  labels: Schema.Array(Schema.String),
  rotation_status: Schema.NullOr(Schema.String),
  is_local: Schema.Boolean,
  is_live: Schema.Boolean,
  is_request: Schema.Boolean,
  comment: Schema.NullOr(Schema.String),
  show: Schema.Number,

  // Album artwork - normalize empty strings to null
  image_uri: StringOrNull,
  thumbnail_uri: StringOrNull,

  // MusicBrainz IDs
  artist_mbid: Schema.Array(Schema.String), // Always an array, never null (can be empty)
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
  total_count: Schema.NullOr(Schema.Number),
  anchor_position: Schema.NullOr(Schema.Number)
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

// Export parameter schemas
export * from "./params.js"

// Export enrichment schemas
export * from "./enrichment.js"
