/**
 * Tool Definitions for Crate Research Agent
 *
 * Defines AI tools using @effect/ai Tool module.
 * These tools are registered with the LLM to extend its capabilities.
 *
 * @module
 */

import { Tool, Toolkit } from "@effect/ai";
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
  GetRecentInsightsResponse,
  GraphConnectionsParams,
  GraphConnectionsResponse,
  ExploreGraphParams,
  ExploreGraphResponse,
} from "./schemas.js";

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Browse KEXP play timeline
 *
 * Browses the KEXP play timeline filtered by MusicBrainz IDs and/or date range.
 * Use semantic_search for text queries - this tool is for MBID-based lookup.
 */
export const SearchPlaysTool = Tool.make("search_plays", {
  description: `Browse KEXP play timeline filtered by MusicBrainz IDs and/or date range.

⚠️ IMPORTANT: This tool does NOT support text search. Use semantic_search to find plays by text, then use the returned MBIDs with this tool.

**Filter options (use one or combine):**
- artist_mbid → All plays by this artist (any album/track)
- recording_mbid → All plays of this specific recording (same audio)
- release_mbid → Plays from this specific album edition/pressing
- release_group_mbid → Plays from any edition of this album
- since/until → Date range filters (YYYY-MM-DD)

**Typical workflow:**
1. semantic_search("Fleet Foxes") → Returns plays with MBIDs
2. search_plays(artist_mbid="...") → Gets full play history for that artist

Returns plays with metadata including airdate, labels, and MusicBrainz IDs.`,
  parameters: SearchPlaysParams.fields,
  success: SearchPlaysResponse,
});

/**
 * Semantic search for music
 *
 * Uses vector similarity to find music matching a natural language description.
 * This is the primary tool for text-based music discovery.
 */
export const SemanticSearchTool = Tool.make("semantic_search", {
  description: `Search KEXP play history using natural language text queries.

This is the PRIMARY tool for finding music by text. Use this when you want to:
- Search by artist name: "Fleet Foxes", "SASAMI"
- Search by song/album: "White Winter Hymnal", "Squeeze"
- Search by mood/style: "upbeat jazz fusion", "melancholic indie folk"
- Search by description: "Seattle indie bands from 2020"

Returns plays ranked by semantic similarity with full metadata including MBIDs.
Use the returned MBIDs with search_plays to get complete play history.`,
  parameters: SemanticSearchParams.fields,
  success: SemanticSearchResponse,
});

/**
 * Resolve MusicBrainz IDs
 *
 * Searches MusicBrainz to find canonical IDs for artists, recordings, releases.
 * Use when you need to disambiguate or find official metadata.
 */
export const ResolveMbidTool = Tool.make("resolve_mbid", {
  description: `Resolve names to MusicBrainz IDs by searching the MusicBrainz database.

Use this tool when:
- You have an artist/track name but need the canonical MBID
- You need to disambiguate entities (e.g., multiple "The National" artists)
- Search results lack MBIDs and you need them for search_plays

entity_type must be one of: artist, recording, release, release_group, label
Use artist_hint to disambiguate recordings/releases (e.g., "Squeeze" by "SASAMI").

Returns multiple matches ranked by relevance with disambiguation info.`,
  parameters: ResolveMbidParams.fields,
  success: ResolveMbidResponse,
});

/**
 * Fetch web content
 *
 * Fetches and extracts content from a URL using Jina Reader.
 * Can optionally extract links for further research.
 */
export const FetchLinkTool = Tool.make("fetch_link", {
  description: `Fetch and extract content from a web URL.

Use this tool when:
- DJ comment contains a URL you want to analyze
- You need to research an artist/album from external sources

Good sources: Wikipedia, Bandcamp, Discogs, Pitchfork, music publications.

Set extract_links=true to also get links from the page for further research.
Returns cleaned markdown text content suitable for analysis.`,
  parameters: FetchLinkParams.fields,
  success: FetchLinkResponse,
});

/**
 * Get recent insights from session
 *
 * Retrieves insights generated during the current session.
 * Use to avoid repeating research or to build on previous findings.
 */
export const GetRecentInsightsTool = Tool.make("get_recent_insights", {
  description: `Get insights you've already produced this session.

⚠️ CALL THIS FIRST before producing any insights to avoid duplicates.

Use this to:
- Check if you've already covered this artist/track
- Build on previous findings (e.g., "earlier we noted X, now we see Y")
- Maintain coherence across plays in the same session

Optional filters: artist_mbid, entity_type, limit`,
  parameters: GetRecentInsightsParams.fields,
  success: GetRecentInsightsResponse,
});

/**
 * Graph connections (remote)
 */
export const GraphConnectionsTool = Tool.make("graph_connections", {
  description: `Query the music knowledge graph for connections (remote, batched).

Use for:
- Band lineup: "band_members" / "member_of"
- Label relations: "labelmates" / "label_hierarchy"
- Collaborations / covers / origin / recorded_at

Provide MBIDs (1-50); returns typed connections with provenance.`,
  parameters: GraphConnectionsParams.fields,
  success: GraphConnectionsResponse,
});

/**
 * Explore graph (local cache backed by effect/Graph)
 */
export const ExploreGraphTool = Tool.make("explore_graph", {
  description: `Expand and reuse the agent's in-memory graph cache.

Use after an initial graph_connections call to walk further hops without re-fetching.
Returns a summary of new nodes/edges plus neighbors for the seeds.`,
  parameters: ExploreGraphParams.fields,
  success: ExploreGraphResponse,
});

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
  GetRecentInsightsTool,
  GraphConnectionsTool,
  ExploreGraphTool
);

/**
 * Type alias for the toolkit
 */
export type CrateToolkit = typeof CrateToolkit;

/**
 * Export individual tool types for handler implementations
 */
export type SearchPlaysToolType = typeof SearchPlaysTool;
export type SemanticSearchToolType = typeof SemanticSearchTool;
export type ResolveMbidToolType = typeof ResolveMbidTool;
export type FetchLinkToolType = typeof FetchLinkTool;
export type GetRecentInsightsToolType = typeof GetRecentInsightsTool;
export type GraphConnectionsToolType = typeof GraphConnectionsTool;
export type ExploreGraphToolType = typeof ExploreGraphTool;
