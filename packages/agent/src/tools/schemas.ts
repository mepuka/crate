/**
 * Tool Schemas for Crate Research Agent
 *
 * Schema definitions for all tool inputs/outputs.
 * Aligned with Python API models in faiss-search-api.
 *
 * @module
 */

import { Schema } from "effect"

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * MusicBrainz entity types
 */
export const MbEntityType = Schema.Literal(
  "artist",
  "recording",
  "release",
  "release_group",
  "label"
)
export type MbEntityType = typeof MbEntityType.Type

/**
 * MusicBrainz ID (UUID format)
 */
export const MbId = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  Schema.brand("MbId")
)
export type MbId = typeof MbId.Type

// =============================================================================
// Play Result Schema (matches Python PlayResult)
// =============================================================================

/**
 * Play result from search - matches Python API PlayResult model
 */
export const PlayResultSchema = Schema.Struct({
  id: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  similarity: Schema.Number,
  album: Schema.NullOr(Schema.String),
  airdate: Schema.String,
  release_date: Schema.NullOr(Schema.String),
  labels: Schema.Array(Schema.String),
  rotation_status: Schema.NullOr(Schema.String),
  is_local: Schema.Boolean,
  is_live: Schema.Boolean,
  is_request: Schema.Boolean,
  comment: Schema.NullOr(Schema.String),
  show: Schema.Number,
  image_uri: Schema.NullOr(Schema.String),
  thumbnail_uri: Schema.NullOr(Schema.String),
  artist_mbid: Schema.Array(Schema.String),
  recording_mbid: Schema.NullOr(Schema.String),
  release_mbid: Schema.NullOr(Schema.String),
  release_group_mbid: Schema.NullOr(Schema.String)
})
export type PlayResult = typeof PlayResultSchema.Type

// =============================================================================
// SearchPlays Tool Schemas
// =============================================================================

/**
 * Parameters for searching KEXP play history
 */
export const SearchPlaysParams = Schema.Struct({
  /** Search query for KEXP play history (artist, song, album, etc.) */
  query: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(500)
  ),
  /** Maximum number of results to return (1-100, default 20) */
  limit: Schema.optionalWith(
    Schema.Number.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(100)),
    { default: () => 20 }
  ),
  /** Filter by artist MusicBrainz ID */
  artist_mbid: Schema.optional(Schema.String),
  /** Filter by recording MusicBrainz ID */
  recording_mbid: Schema.optional(Schema.String),
  /** Filter plays after this ISO date */
  since: Schema.optional(Schema.String),
  /** Filter plays before this ISO date */
  until: Schema.optional(Schema.String)
})
export type SearchPlaysParams = typeof SearchPlaysParams.Type

/**
 * Response from play history search
 */
export const SearchPlaysResponse = Schema.Struct({
  results: Schema.Array(PlayResultSchema),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  query: Schema.String
})
export type SearchPlaysResponse = typeof SearchPlaysResponse.Type

// =============================================================================
// SemanticSearch Tool Schemas
// =============================================================================

/**
 * Parameters for semantic/vector similarity search
 */
export const SemanticSearchParams = Schema.Struct({
  /** Natural language query for semantic search (e.g., 'upbeat jazz fusion') */
  query: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(500)
  ),
  /** Maximum number of results to return (1-100, default 20) */
  limit: Schema.optionalWith(
    Schema.Number.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(100)),
    { default: () => 20 }
  )
})
export type SemanticSearchParams = typeof SemanticSearchParams.Type

/**
 * Response from semantic search
 */
export const SemanticSearchResponse = Schema.Struct({
  results: Schema.Array(PlayResultSchema),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  query: Schema.String
})
export type SemanticSearchResponse = typeof SemanticSearchResponse.Type

// =============================================================================
// ResolveMbid Tool Schemas
// =============================================================================

/**
 * Parameters for resolving MusicBrainz IDs
 */
export const ResolveMbidParams = Schema.Struct({
  /** Artist name, track title, or other text to search MusicBrainz */
  query: Schema.String.pipe(Schema.minLength(1)),
  /** Type of MusicBrainz entity to search for */
  entity_type: MbEntityType,
  /** Artist name to help disambiguate recordings/releases */
  artist_hint: Schema.optional(Schema.String)
})
export type ResolveMbidParams = typeof ResolveMbidParams.Type

/**
 * MusicBrainz entity result
 */
export const MbEntityResult = Schema.Struct({
  mbid: Schema.String,
  name: Schema.String,
  type: MbEntityType,
  disambiguation: Schema.optional(Schema.String),
  score: Schema.Number,
  // Additional metadata based on type
  artist_credit: Schema.optional(Schema.String),
  release_date: Schema.optional(Schema.String),
  country: Schema.optional(Schema.String)
})
export type MbEntityResult = typeof MbEntityResult.Type

/**
 * Response from MBID resolution
 */
export const ResolveMbidResponse = Schema.Struct({
  results: Schema.Array(MbEntityResult),
  query: Schema.String,
  entity_type: MbEntityType
})
export type ResolveMbidResponse = typeof ResolveMbidResponse.Type

// =============================================================================
// FetchLink Tool Schemas
// =============================================================================

/**
 * Parameters for fetching web content
 */
export const FetchLinkParams = Schema.Struct({
  /** URL to fetch content from (must be http or https) */
  url: Schema.String.pipe(Schema.pattern(/^https?:\/\/.+/)),
  /** Whether to extract and return links from the page (default false) */
  extract_links: Schema.optionalWith(Schema.Boolean, { default: () => false })
})
export type FetchLinkParams = typeof FetchLinkParams.Type

/**
 * Extracted link from page
 */
export const ExtractedLink = Schema.Struct({
  url: Schema.String,
  text: Schema.String,
  type: Schema.optional(Schema.String)
})
export type ExtractedLink = typeof ExtractedLink.Type

/**
 * Response from web content fetch
 */
export const FetchLinkResponse = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  content: Schema.String,
  word_count: Schema.Number,
  links: Schema.Array(ExtractedLink)
})
export type FetchLinkResponse = typeof FetchLinkResponse.Type

// =============================================================================
// GetRecentInsights Tool Schemas
// =============================================================================

/**
 * Parameters for getting recent insights from session
 */
export const GetRecentInsightsParams = Schema.Struct({
  /** Maximum number of recent insights to return (1-50, default 10) */
  limit: Schema.optionalWith(
    Schema.Number.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(50)),
    { default: () => 10 }
  ),
  /** Filter insights by artist MBID */
  artist_mbid: Schema.optional(Schema.String),
  /** Filter insights by entity type */
  entity_type: Schema.optional(MbEntityType)
})
export type GetRecentInsightsParams = typeof GetRecentInsightsParams.Type

/**
 * Insight summary from session
 */
export const InsightSummary = Schema.Struct({
  id: Schema.String,
  play_id: Schema.Number,
  artist: Schema.String,
  track: Schema.String,
  insight_type: Schema.String,
  summary: Schema.String,
  created_at: Schema.String,
  entity_mbids: Schema.Array(Schema.String)
})
export type InsightSummary = typeof InsightSummary.Type

/**
 * Response from getting recent insights
 */
export const GetRecentInsightsResponse = Schema.Struct({
  insights: Schema.Array(InsightSummary),
  total: Schema.Number,
  session_id: Schema.String
})
export type GetRecentInsightsResponse = typeof GetRecentInsightsResponse.Type
