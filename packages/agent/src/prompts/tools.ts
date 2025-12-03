/**
 * Crate Agent Tool Definitions
 *
 * Tool schemas and descriptions for the Crate Research Agent.
 * These can be converted to Effect AI Tool definitions or used
 * for OpenAI function calling.
 *
 * @module
 */

import { Schema } from "effect"
import { Insight, LinkType } from "./insights.js"

// -----------------------------------------------------------------------------
// MBID Resolution Tool
// -----------------------------------------------------------------------------

/**
 * Entity types that can be resolved via MusicBrainz
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
 * Parameters for the resolve_mbid tool
 */
export class ResolveMbidParams extends Schema.Class<ResolveMbidParams>(
  "ResolveMbidParams"
)({
  query: Schema.String.annotations({
    description: "Name to search for",
  }),
  entityType: MbEntityType.annotations({
    description: "Type of entity to search for",
  }),
  artistHint: Schema.optional(Schema.String).annotations({
    description: "Artist name to narrow recording/release search",
  }),
  releaseHint: Schema.optional(Schema.String).annotations({
    description: "Release name to narrow recording search",
  }),
}) {}

/**
 * A single MBID resolution result
 */
export class MbidResult extends Schema.Class<MbidResult>("MbidResult")({
  mbid: Schema.NullOr(Schema.String),
  name: Schema.String,
  disambiguation: Schema.optional(Schema.String),
  score: Schema.Number,
}) {}

/**
 * Response from the resolve_mbid tool
 */
export class ResolveMbidResponse extends Schema.Class<ResolveMbidResponse>(
  "ResolveMbidResponse"
)({
  results: Schema.Array(MbidResult),
}) {}

export const ResolveMbidTool = {
  name: "resolve_mbid",
  description:
    "Look up MusicBrainz ID for an artist, recording, release, or label by name. Use this to get canonical IDs for any entity you discover.",
  parameters: ResolveMbidParams,
  returns: ResolveMbidResponse,
}

// -----------------------------------------------------------------------------
// Search Plays Tool
// -----------------------------------------------------------------------------

/**
 * Parameters for the search_plays tool
 */
export class SearchPlaysParams extends Schema.Class<SearchPlaysParams>(
  "SearchPlaysParams"
)({
  artistMbid: Schema.optional(Schema.String).annotations({
    description: "Filter by artist MBID",
  }),
  recordingMbid: Schema.optional(Schema.String).annotations({
    description: "Filter by recording MBID",
  }),
  releaseMbid: Schema.optional(Schema.String).annotations({
    description: "Filter by release MBID",
  }),
  releaseGroupMbid: Schema.optional(Schema.String).annotations({
    description: "Filter by release group MBID",
  }),
  labelMbid: Schema.optional(Schema.String).annotations({
    description: "Filter by label MBID",
  }),
  query: Schema.optional(Schema.String).annotations({
    description: "Text search fallback if no MBID available",
  }),
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum results to return (default 10)",
  }),
  beforeDate: Schema.optional(Schema.String).annotations({
    description: "Only plays before this date (ISO format)",
  }),
  afterDate: Schema.optional(Schema.String).annotations({
    description: "Only plays after this date (ISO format)",
  }),
}) {}

/**
 * A single play result
 */
export class PlayResult extends Schema.Class<PlayResult>("PlayResult")({
  id: Schema.Number,
  airdate: Schema.String,
  artist: Schema.String,
  track: Schema.String,
  album: Schema.NullOr(Schema.String),
  label: Schema.NullOr(Schema.String),
  showName: Schema.NullOr(Schema.String),
  hostName: Schema.NullOr(Schema.String),
  comment: Schema.NullOr(Schema.String),
  artistMbid: Schema.NullOr(Schema.String),
  recordingMbid: Schema.NullOr(Schema.String),
  releaseMbid: Schema.NullOr(Schema.String),
  releaseGroupMbid: Schema.NullOr(Schema.String),
}) {}

/**
 * Response from the search_plays tool
 */
export class SearchPlaysResponse extends Schema.Class<SearchPlaysResponse>(
  "SearchPlaysResponse"
)({
  plays: Schema.Array(PlayResult),
  totalCount: Schema.Number,
}) {}

export const SearchPlaysTool = {
  name: "search_plays",
  description:
    "Search KEXP play history. Use MBIDs when available for precision. Useful for first play detection, anniversary detection, play counts.",
  parameters: SearchPlaysParams,
  returns: SearchPlaysResponse,
}

// -----------------------------------------------------------------------------
// Semantic Search Tool
// -----------------------------------------------------------------------------

/**
 * Parameters for the semantic_search tool
 */
export class SemanticSearchParams extends Schema.Class<SemanticSearchParams>(
  "SemanticSearchParams"
)({
  query: Schema.String.annotations({
    description: "Natural language query to search DJ comments",
  }),
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum results to return (default 10)",
  }),
}) {}

/**
 * Response from the semantic_search tool
 */
export class SemanticSearchResponse extends Schema.Class<SemanticSearchResponse>(
  "SemanticSearchResponse"
)({
  plays: Schema.Array(PlayResult),
  scores: Schema.Array(Schema.Number),
}) {}

export const SemanticSearchTool = {
  name: "semantic_search",
  description:
    'Find plays with semantically similar DJ comments. Use for thematic exploration like "tour announcements" or "similar vibes."',
  parameters: SemanticSearchParams,
  returns: SemanticSearchResponse,
}

// -----------------------------------------------------------------------------
// Fetch Link Tool
// -----------------------------------------------------------------------------

/**
 * Parameters for the fetch_link tool
 */
export class FetchLinkParams extends Schema.Class<FetchLinkParams>(
  "FetchLinkParams"
)({
  url: Schema.String.annotations({
    description: "URL to fetch and summarize",
  }),
  focusQuery: Schema.optional(Schema.String).annotations({
    description: "What to focus on when summarizing the content",
  }),
}) {}

/**
 * Extracted MBIDs from link content
 */
export class ExtractedMbids extends Schema.Class<ExtractedMbids>(
  "ExtractedMbids"
)({
  artists: Schema.optional(Schema.Array(Schema.String)),
  releases: Schema.optional(Schema.Array(Schema.String)),
}) {}

/**
 * Response from the fetch_link tool
 */
export class FetchLinkResponse extends Schema.Class<FetchLinkResponse>(
  "FetchLinkResponse"
)({
  title: Schema.String,
  markdown: Schema.String.annotations({
    description: "Full markdown content from Jina",
  }),
  summary: Schema.String.annotations({
    description: "AI-generated summary",
  }),
  linkType: LinkType,
  extractedMbids: Schema.optional(ExtractedMbids),
}) {}

export const FetchLinkTool = {
  name: "fetch_link",
  description:
    "Fetch and summarize content from a URL via Jina AI. Use when DJ comment contains a URL or to enrich with external context.",
  parameters: FetchLinkParams,
  returns: FetchLinkResponse,
}

// -----------------------------------------------------------------------------
// Get Recent Insights Tool
// -----------------------------------------------------------------------------

/**
 * Parameters for the get_recent_insights tool
 */
export class GetRecentInsightsParams extends Schema.Class<GetRecentInsightsParams>(
  "GetRecentInsightsParams"
)({
  artistMbid: Schema.optional(Schema.String).annotations({
    description: "Filter by artist MBID",
  }),
  recordingMbid: Schema.optional(Schema.String).annotations({
    description: "Filter by recording MBID",
  }),
  insightType: Schema.optional(Schema.String).annotations({
    description: "Filter by insight type (_tag)",
  }),
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum results to return",
  }),
}) {}

/**
 * Response from the get_recent_insights tool
 */
export class GetRecentInsightsResponse extends Schema.Class<GetRecentInsightsResponse>(
  "GetRecentInsightsResponse"
)({
  insights: Schema.Array(Insight),
}) {}

export const GetRecentInsightsTool = {
  name: "get_recent_insights",
  description:
    "Get insights you've already produced this session. Use for coherence: avoid repetition, enable threading.",
  parameters: GetRecentInsightsParams,
  returns: GetRecentInsightsResponse,
}

// -----------------------------------------------------------------------------
// Tool Collection
// -----------------------------------------------------------------------------

/**
 * All available tools for the Crate agent
 */
export const CrateTools = {
  resolve_mbid: ResolveMbidTool,
  search_plays: SearchPlaysTool,
  semantic_search: SemanticSearchTool,
  fetch_link: FetchLinkTool,
  get_recent_insights: GetRecentInsightsTool,
}

/**
 * Generate OpenAI-compatible function definitions from tool schemas
 */
export function toOpenAIFunctions() {
  return [
    {
      name: "resolve_mbid",
      description: ResolveMbidTool.description,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Name to search for",
          },
          entityType: {
            type: "string",
            enum: ["artist", "recording", "release", "release_group", "label"],
            description: "Type of entity to search for",
          },
          artistHint: {
            type: "string",
            description: "Artist name to narrow recording/release search",
          },
          releaseHint: {
            type: "string",
            description: "Release name to narrow recording search",
          },
        },
        required: ["query", "entityType"],
      },
    },
    {
      name: "search_plays",
      description: SearchPlaysTool.description,
      parameters: {
        type: "object",
        properties: {
          artistMbid: { type: "string", description: "Filter by artist MBID" },
          recordingMbid: {
            type: "string",
            description: "Filter by recording MBID",
          },
          releaseMbid: {
            type: "string",
            description: "Filter by release MBID",
          },
          releaseGroupMbid: {
            type: "string",
            description: "Filter by release group MBID",
          },
          labelMbid: { type: "string", description: "Filter by label MBID" },
          query: {
            type: "string",
            description: "Text search fallback if no MBID",
          },
          limit: { type: "number", description: "Maximum results (default 10)" },
          beforeDate: {
            type: "string",
            description: "Only plays before this date (ISO)",
          },
          afterDate: {
            type: "string",
            description: "Only plays after this date (ISO)",
          },
        },
        required: [],
      },
    },
    {
      name: "semantic_search",
      description: SemanticSearchTool.description,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language query to search DJ comments",
          },
          limit: { type: "number", description: "Maximum results (default 10)" },
        },
        required: ["query"],
      },
    },
    {
      name: "fetch_link",
      description: FetchLinkTool.description,
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch and summarize" },
          focusQuery: {
            type: "string",
            description: "What to focus on when summarizing",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "get_recent_insights",
      description: GetRecentInsightsTool.description,
      parameters: {
        type: "object",
        properties: {
          artistMbid: { type: "string", description: "Filter by artist MBID" },
          recordingMbid: {
            type: "string",
            description: "Filter by recording MBID",
          },
          insightType: { type: "string", description: "Filter by insight type" },
          limit: { type: "number", description: "Maximum results" },
        },
        required: [],
      },
    },
  ]
}

export default CrateTools
