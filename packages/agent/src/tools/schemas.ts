/**
 * Tool Schemas for Crate Research Agent
 *
 * Schema definitions for all tool inputs/outputs.
 * Aligned with Python API models in faiss-search-api.
 *
 * IMPORTANT: Tool parameter schemas MUST be JSON Schema compatible.
 * Avoid Schema.pipe(), Schema.optionalWith(), Schema.brand(), etc.
 * as these create Transformation AST nodes that can't be converted to JSON Schema.
 * Use plain Schema.Struct with primitive fields for tool parameters.
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

/**
 * Compact play result for tool responses - omits fields the model doesn't use.
 *
 * Drops: show, image_uri, thumbnail_uri, release_date (saves ~150 tokens per result)
 *
 * Use this for tool responses; use PlayResultSchema for API parsing.
 */
export const PlayResultCompact = Schema.Struct({
  id: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  similarity: Schema.Number,
  album: Schema.NullOr(Schema.String),
  airdate: Schema.String,
  labels: Schema.Array(Schema.String),
  rotation_status: Schema.NullOr(Schema.String),
  is_local: Schema.Boolean,
  is_live: Schema.Boolean,
  is_request: Schema.Boolean,
  comment: Schema.NullOr(Schema.String),
  artist_mbid: Schema.Array(Schema.String),
  recording_mbid: Schema.NullOr(Schema.String),
  release_mbid: Schema.NullOr(Schema.String),
  release_group_mbid: Schema.NullOr(Schema.String),
})
export type PlayResultCompact = typeof PlayResultCompact.Type

// =============================================================================
// SearchPlays Tool Schemas
// =============================================================================

/**
 * Parameters for browsing KEXP play timeline
 *
 * NOTE: Uses plain Schema.String/Number without .pipe() to ensure JSON Schema compatibility.
 * This tool browses the timeline by MBID/date filters - use semantic_search for text queries.
 */
export const SearchPlaysParams = Schema.Struct({
  /** Filter by artist MusicBrainz ID - finds all plays by this artist */
  artist_mbid: Schema.optional(Schema.String).annotations({
    description: "Filter by artist MusicBrainz ID. Finds all plays by this artist across all releases."
  }),
  /** Filter by recording MusicBrainz ID - finds all plays of this specific recording */
  recording_mbid: Schema.optional(Schema.String).annotations({
    description: "Filter by recording MusicBrainz ID. Finds all plays of this exact recording (same audio)."
  }),
  /** Filter by release MusicBrainz ID - finds plays from this specific release edition */
  release_mbid: Schema.optional(Schema.String).annotations({
    description: "Filter by release MusicBrainz ID. Finds plays from this specific album edition/pressing."
  }),
  /** Filter by release group MusicBrainz ID - finds plays from any edition of this album */
  release_group_mbid: Schema.optional(Schema.String).annotations({
    description: "Filter by release group MusicBrainz ID. Finds plays from any edition of this album (includes remasters, represses)."
  }),
  /** Maximum number of results to return (1-100, default 20) */
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum number of results to return (1-100, default 20)"
  }),
  /** Filter plays after this ISO date */
  since: Schema.optional(Schema.String).annotations({
    description: "Filter plays after this ISO date (YYYY-MM-DD)"
  }),
  /** Filter plays before this ISO date */
  until: Schema.optional(Schema.String).annotations({
    description: "Filter plays before this ISO date (YYYY-MM-DD)"
  })
})
export type SearchPlaysParams = typeof SearchPlaysParams.Type

/**
 * Response from play timeline browsing
 *
 * Uses PlayResultCompact to reduce token usage (drops image_uri, thumbnail_uri, show, release_date)
 */
export const SearchPlaysResponse = Schema.Struct({
  results: Schema.Array(PlayResultCompact),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  /** Error message if the API call failed (empty results returned on error) */
  _error: Schema.optional(Schema.String)
})
export type SearchPlaysResponse = typeof SearchPlaysResponse.Type

// =============================================================================
// SemanticSearch Tool Schemas
// =============================================================================

/**
 * Parameters for semantic/vector similarity search
 *
 * NOTE: Uses plain Schema.String/Number without .pipe() to ensure JSON Schema compatibility.
 */
export const SemanticSearchParams = Schema.Struct({
  /** Natural language query for semantic search (e.g., 'upbeat jazz fusion') */
  query: Schema.String.annotations({
    description: "Natural language query for semantic search (e.g., 'upbeat jazz fusion')"
  }),
  /** Maximum number of results to return (1-100, default 20) */
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum number of results to return (1-100, default 20)"
  }),
  /** Pagination offset (default 0) */
  offset: Schema.optional(Schema.Number).annotations({
    description: "Pagination offset - skip this many results (default 0)"
  })
})
export type SemanticSearchParams = typeof SemanticSearchParams.Type

/**
 * Response from semantic search
 *
 * Uses PlayResultCompact to reduce token usage (drops image_uri, thumbnail_uri, show, release_date)
 */
export const SemanticSearchResponse = Schema.Struct({
  results: Schema.Array(PlayResultCompact),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  query: Schema.String,
  /** Error message if the API call failed (empty results returned on error) */
  _error: Schema.optional(Schema.String)
})
export type SemanticSearchResponse = typeof SemanticSearchResponse.Type

// =============================================================================
// ResolveMbid Tool Schemas
// =============================================================================

/**
 * Parameters for resolving MusicBrainz IDs
 *
 * NOTE: Uses plain Schema.String without .pipe() to ensure JSON Schema compatibility.
 */
export const ResolveMbidParams = Schema.Struct({
  /** Artist name, track title, or other text to search MusicBrainz */
  query: Schema.String.annotations({
    description: "Artist name, track title, or other text to search MusicBrainz"
  }),
  /** Type of MusicBrainz entity to search for */
  entity_type: MbEntityType.annotations({
    description: "Type of MusicBrainz entity to search for: artist, recording, release, release_group, or label"
  }),
  /** Artist name to help disambiguate recordings/releases */
  artist_hint: Schema.optional(Schema.String).annotations({
    description: "Artist name to help disambiguate recordings/releases"
  })
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
 *
 * NOTE: Uses plain Schema.String without .pipe() to ensure JSON Schema compatibility.
 */
export const FetchLinkParams = Schema.Struct({
  /** URL to fetch content from (must be http or https) */
  url: Schema.String.annotations({
    description: "URL to fetch content from (must be http or https)"
  }),
  /** Whether to extract and return links from the page (default false) */
  extract_links: Schema.optional(Schema.Boolean).annotations({
    description: "Whether to extract and return links from the page (default false)"
  })
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
 *
 * NOTE: Uses plain Schema.Number without .pipe() to ensure JSON Schema compatibility.
 */
export const GetRecentInsightsParams = Schema.Struct({
  /** Maximum number of recent insights to return (1-50, default 10) */
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum number of recent insights to return (1-50, default 10)"
  }),
  /** Filter insights by play ID - shows insights already produced for this play */
  play_id: Schema.optional(Schema.Number).annotations({
    description: "Filter insights by play ID. Use this to see what insights already exist for the current play."
  }),
  /** Filter insights by artist MBID */
  artist_mbid: Schema.optional(Schema.String).annotations({
    description: "Filter insights by artist MusicBrainz ID"
  }),
  /** Filter insights by entity type */
  entity_type: Schema.optional(MbEntityType).annotations({
    description: "Filter insights by entity type: artist, recording, release, release_group, or label"
  })
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

// =============================================================================
// Graph Connections Tool Schemas
// =============================================================================

/**
 * Supported graph query types
 */
export const GraphQueryType = Schema.Literal(
  "band_members",
  "member_of",
  "labelmates",
  "label_hierarchy",
  "covers",
  "artist_origin",
  "artists_from_area",
  "recorded_at",
  "collaborators"
)
export type GraphQueryType = typeof GraphQueryType.Type

/**
 * Parameters for graph connections lookup
 *
 * NOTE: keep primitive optionals for JSON Schema compatibility.
 */
export const GraphConnectionsParams = Schema.Struct({
  query_type: GraphQueryType.annotations({
    description: "Type of graph query to run (e.g., band_members, labelmates)"
  }),
  mbids: Schema.Array(Schema.String).annotations({
    description: "List of MusicBrainz IDs to query (1-50)"
  }),
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum connections to return (default 20, max 100)"
  }),
  include_attributes: Schema.optional(Schema.Boolean).annotations({
    description: "Whether to include edge attributes (default true)"
  })
})
export type GraphConnectionsParams = typeof GraphConnectionsParams.Type

/**
 * A single connection in the graph response
 */
export const ConnectionNode = Schema.Struct({
  mbid: Schema.String,
  name: Schema.String,
  node_type: Schema.Literal("artist", "band", "label", "recording", "work", "area", "place"),
  relationship_type: Schema.String,
  // These fields are nullable in the Python / FastAPI models, so we accept nulls
  // here to keep the tool schema aligned with the shared domain contract.
  attributes: Schema.NullOr(Schema.Array(Schema.String)),
  begin_date: Schema.NullOr(Schema.String),
  end_date: Schema.NullOr(Schema.String),
  via_mbid: Schema.NullOr(Schema.String),
  via_name: Schema.NullOr(Schema.String)
})
export type ConnectionNode = typeof ConnectionNode.Type

/**
 * Compact connection node - uses optional fields instead of nullable.
 *
 * When serialized to JSON, undefined fields are omitted entirely,
 * reducing token usage for sparse connection data (~38% savings).
 */
export const ConnectionNodeCompact = Schema.Struct({
  mbid: Schema.String,
  name: Schema.String,
  node_type: Schema.Literal("artist", "band", "label", "recording", "work", "area", "place"),
  relationship_type: Schema.String,
  // Optional fields - omitted when not present (vs null which serializes)
  attributes: Schema.optional(Schema.Array(Schema.String)),
  begin_date: Schema.optional(Schema.String),
  end_date: Schema.optional(Schema.String),
  via_mbid: Schema.optional(Schema.String),
  via_name: Schema.optional(Schema.String),
})
export type ConnectionNodeCompact = typeof ConnectionNodeCompact.Type

/**
 * Response from graph connections API
 *
 * Uses ConnectionNodeCompact to reduce token usage (omits null fields)
 */
export const GraphConnectionsResponse = Schema.Struct({
  query_type: GraphQueryType,
  source_mbids: Schema.Array(Schema.String),
  connections: Schema.Array(ConnectionNodeCompact),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  /** Error message if the API call failed (empty connections returned on error) */
  _error: Schema.optional(Schema.String)
})
export type GraphConnectionsResponse = typeof GraphConnectionsResponse.Type

// =============================================================================
// Explore Graph (local cache) Tool Schemas
// =============================================================================

export const ExploreGraphParams = Schema.Struct({
  mbids: Schema.Array(Schema.String).annotations({
    description: "Seed MBIDs to expand in the local graph cache"
  }),
  query_type: GraphQueryType.annotations({
    description: "Type of graph query to use when expanding (e.g., band_members, labelmates)"
  }),
  limit: Schema.optional(Schema.Number).annotations({
    description: "Optional limit for the remote expansion"
  })
})
export type ExploreGraphParams = typeof ExploreGraphParams.Type

export const ExploreGraphResponse = Schema.Struct({
  summary: Schema.String,
  new_nodes_count: Schema.Number,
  new_edges_count: Schema.Number,
  neighbors: Schema.optional(Schema.Array(ConnectionNodeCompact)),
  /** Error message if the API call failed (zero counts returned on error) */
  _error: Schema.optional(Schema.String)
})
export type ExploreGraphResponse = typeof ExploreGraphResponse.Type

// =============================================================================
// Graph Path Tool Schemas
// =============================================================================

export const FindGraphPathParams = Schema.Struct({
  from_mbid: Schema.String.annotations({
    description: "Starting MBID for the path search"
  }),
  to_mbid: Schema.String.annotations({
    description: "Target MBID to find a path to"
  })
})
export type FindGraphPathParams = typeof FindGraphPathParams.Type

export const FindGraphPathResponse = Schema.Struct({
  path_found: Schema.Boolean,
  path_length: Schema.Number,
  path: Schema.Array(Schema.Struct({
    mbid: Schema.String,
    name: Schema.String,
    node_type: Schema.String
  }))
})
export type FindGraphPathResponse = typeof FindGraphPathResponse.Type

// =============================================================================
// Query Cached Neighbors Tool Schemas
// =============================================================================

export const QueryCachedNeighborsParams = Schema.Struct({
  mbid: Schema.String.annotations({
    description: "MBID to get cached neighbors for"
  }),
  include_edges: Schema.optional(Schema.Boolean).annotations({
    description: "Whether to include full edge data with relationship context (default true)"
  })
})
export type QueryCachedNeighborsParams = typeof QueryCachedNeighborsParams.Type

export const CachedNeighborNode = Schema.Struct({
  mbid: Schema.String,
  name: Schema.String,
  node_type: Schema.String,
  relationship_type: Schema.optional(Schema.String),
  attributes: Schema.optional(Schema.Array(Schema.String)),
  begin_date: Schema.optional(Schema.String),
  end_date: Schema.optional(Schema.String),
  via_mbid: Schema.optional(Schema.String),
  via_name: Schema.optional(Schema.String)
})
export type CachedNeighborNode = typeof CachedNeighborNode.Type

export const QueryCachedNeighborsResponse = Schema.Struct({
  mbid: Schema.String,
  neighbors: Schema.Array(CachedNeighborNode),
  neighbor_count: Schema.Number
})
export type QueryCachedNeighborsResponse = typeof QueryCachedNeighborsResponse.Type
