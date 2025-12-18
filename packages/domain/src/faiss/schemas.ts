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
 * Also handles actual null values from the API.
 */
const StringOrNull = Schema.transform(
  Schema.NullOr(Schema.String),
  Schema.NullOr(Schema.String),
  {
    decode: (s) => s === "" || s === null ? null : s,
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

/**
 * PlayCountResponse schema - matches FastAPI backend PlayCountResponse model.
 *
 * Response for play count endpoint.
 */
export class PlayCountResponse extends Schema.Class<PlayCountResponse>("PlayCountResponse")({
  count: Schema.Number,
  entity_type: Schema.NullOr(Schema.String),
  mbid: Schema.NullOr(Schema.String),
  query_time_ms: Schema.Number
}) {}

/**
 * HybridPlayResult schema - matches FastAPI backend HybridPlayResult model.
 *
 * Similar to PlayResult but with RRF ranking info instead of similarity score.
 */
export class HybridPlayResult extends Schema.Class<HybridPlayResult>("HybridPlayResult")({
  // Core fields
  id: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  rrf_score: Schema.Number,

  // Ranking info
  bm25_rank: Schema.NullOr(Schema.Number),
  faiss_rank: Schema.NullOr(Schema.Number),
  faiss_score: Schema.NullOr(Schema.Number),

  // Metadata
  album: StringOrNull,
  airdate: Schema.DateFromString,
  release_date: Schema.NullOr(SafeDateFromString),
  labels: Schema.Array(Schema.String),
  rotation_status: Schema.NullOr(Schema.String),
  is_local: Schema.Boolean,
  is_live: Schema.Boolean,
  is_request: Schema.Boolean,
  comment: Schema.NullOr(Schema.String),
  show: Schema.Number,

  // Album artwork
  image_uri: StringOrNull,
  thumbnail_uri: StringOrNull,

  // MusicBrainz IDs
  artist_mbid: Schema.Array(Schema.String),
  recording_mbid: Schema.NullOr(Schema.String),
  release_mbid: Schema.NullOr(Schema.String),
  release_group_mbid: Schema.NullOr(Schema.String)
}) {}

/**
 * HybridSearchResponse schema - matches FastAPI backend HybridSearchResponse model.
 *
 * Response for hybrid search endpoint (FTS5 + FAISS with RRF).
 */
export class HybridSearchResponse extends Schema.Class<HybridSearchResponse>("HybridSearchResponse")({
  results: Schema.Array(HybridPlayResult),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  query: Schema.String,
  bm25_weight: Schema.Number,
  faiss_weight: Schema.Number
}) {}

/**
 * HybridSearchParams - request parameters for hybrid search
 */
export class HybridSearchParams extends Schema.Class<HybridSearchParams>("HybridSearchParams")({
  query: Schema.String,
  limit: Schema.optionalWith(Schema.Number, { default: () => 20 }),
  bm25_weight: Schema.optionalWith(Schema.Number, { default: () => 0.5 }),
  faiss_weight: Schema.optionalWith(Schema.Number, { default: () => 0.5 }),
  use_expansion: Schema.optionalWith(Schema.Boolean, { default: () => false })
}) {}

// Export type aliases for the schema classes
export type Play = typeof PlayResult.Type
export type Timeline = typeof TimelineResponse.Type
export type SearchResult = typeof SearchResponse.Type
export type PlayCount = typeof PlayCountResponse.Type
export type HybridPlay = typeof HybridPlayResult.Type
export type HybridSearch = typeof HybridSearchResponse.Type
export type HybridSearchInput = typeof HybridSearchParams.Type

/**
 * Batch plays response (for fetching multiple plays)
 *
 * Properly types the plays array using PlayResult schema so that
 * date fields are correctly transformed (DateFromString -> Date).
 */
export class BatchPlaysResponse extends Schema.Class<BatchPlaysResponse>("BatchPlaysResponse")({
  plays: Schema.Array(PlayResult)
}) {}

/**
 * UnprocessedPlaysResponse schema - matches FastAPI backend UnprocessedPlaysResponse model.
 *
 * Response for unprocessed plays query (Cloud Scheduler integration).
 * Returns play IDs that don't have any insights yet.
 */
export class UnprocessedPlaysResponse extends Schema.Class<UnprocessedPlaysResponse>("UnprocessedPlaysResponse")({
  play_ids: Schema.Array(Schema.Number),
  count: Schema.Number,
  total_unprocessed: Schema.Number,
  strategy: Schema.String,
  query_time_ms: Schema.Number
}) {}

// Export parameter schemas
export * from "./params.js"

// Export enrichment schemas
export * from "./enrichment.js"
