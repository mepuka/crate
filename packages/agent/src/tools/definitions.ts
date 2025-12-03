/**
 * Tool Definitions for Crate Research Agent
 *
 * Defines AI tools using @effect/ai Tool module.
 * These tools are registered with the LLM to extend its capabilities.
 *
 * @module
 */

import { Tool, Toolkit } from "@effect/ai"
import {
  SearchPlaysParams,
  SearchPlaysResponse,
  SemanticSearchParams,
  SemanticSearchResponse,
  ResolveMbidParams,
  ResolveMbidResponse,
  FetchLinkParams,
  FetchLinkResponse,
  GetRecentInsightsParams,
  GetRecentInsightsResponse
} from "./schemas.js"

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Search KEXP play history
 *
 * Searches the KEXP play database for tracks matching the query.
 * Supports filtering by artist/recording MBID and date range.
 */
export const SearchPlaysTool = Tool.make("search_plays", {
  description: `Search KEXP play history for tracks, artists, or albums.
Returns matching plays with metadata including airdate, labels, and MusicBrainz IDs.
Use this when the user asks about specific artists, songs, or wants to find plays.`,
  parameters: SearchPlaysParams.fields,
  success: SearchPlaysResponse
})

/**
 * Semantic search for music
 *
 * Uses vector similarity to find music matching a natural language description.
 * Good for mood-based, genre-based, or conceptual queries.
 */
export const SemanticSearchTool = Tool.make("semantic_search", {
  description: `Semantic search using natural language descriptions.
Find music by mood, genre, style, or any descriptive query.
Examples: "upbeat jazz fusion", "melancholic indie folk", "energetic punk rock".
Results are ranked by semantic similarity, not keyword matching.`,
  parameters: SemanticSearchParams.fields,
  success: SemanticSearchResponse
})

/**
 * Resolve MusicBrainz IDs
 *
 * Searches MusicBrainz to find canonical IDs for artists, recordings, releases.
 * Use when you need to disambiguate or find official metadata.
 */
export const ResolveMbidTool = Tool.make("resolve_mbid", {
  description: `Resolve artist, recording, or release names to MusicBrainz IDs.
Use this to find canonical identifiers for music entities.
Helpful for disambiguation (e.g., multiple artists with same name) or
linking to authoritative metadata.`,
  parameters: ResolveMbidParams.fields,
  success: ResolveMbidResponse
})

/**
 * Fetch web content
 *
 * Fetches and extracts content from a URL using Jina Reader.
 * Can optionally extract links for further research.
 */
export const FetchLinkTool = Tool.make("fetch_link", {
  description: `Fetch and extract content from a web URL.
Use this to research additional context about artists, albums, or music topics.
Good sources: Wikipedia, Bandcamp, artist websites, music publications.
Returns cleaned text content suitable for analysis.`,
  parameters: FetchLinkParams.fields,
  success: FetchLinkResponse
})

/**
 * Get recent insights from session
 *
 * Retrieves insights generated during the current session.
 * Use to avoid repeating research or to build on previous findings.
 */
export const GetRecentInsightsTool = Tool.make("get_recent_insights", {
  description: `Get insights from the current research session.
Use this to check what you've already discovered about an artist or track.
Helps avoid duplicate research and enables building on previous findings.`,
  parameters: GetRecentInsightsParams.fields,
  success: GetRecentInsightsResponse
})

// =============================================================================
// Toolkit
// =============================================================================

/**
 * Complete Crate Research Agent toolkit
 *
 * Contains all tools available to the agent for music research.
 */
export const CrateToolkit = Toolkit.make(
  SearchPlaysTool,
  SemanticSearchTool,
  ResolveMbidTool,
  FetchLinkTool,
  GetRecentInsightsTool
)

/**
 * Type alias for the toolkit
 */
export type CrateToolkit = typeof CrateToolkit

/**
 * Export individual tool types for handler implementations
 */
export type SearchPlaysToolType = typeof SearchPlaysTool
export type SemanticSearchToolType = typeof SemanticSearchTool
export type ResolveMbidToolType = typeof ResolveMbidTool
export type FetchLinkToolType = typeof FetchLinkTool
export type GetRecentInsightsToolType = typeof GetRecentInsightsTool
