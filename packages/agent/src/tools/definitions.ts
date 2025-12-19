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
  HybridSearchParams,
  HybridSearchResponse,
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
  FindGraphPathParams,
  FindGraphPathResponse,
  QueryCachedNeighborsParams,
  QueryCachedNeighborsResponse,
  // Phase 1 graph algorithm schemas
  AnalyzeInfluenceParams,
  AnalyzeInfluenceResponse,
  ExploreNeighborhoodParams,
  ExploreNeighborhoodResponse,
  SummarizeRelationshipsParams,
  SummarizeRelationshipsResponse,
  AnalyzeTimePeriodParams,
  AnalyzeTimePeriodResponse,
  // Art curation schemas
  AnalyzeAlbumArtParams,
  AnalyzeAlbumArtResponse,
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

Returns plays with metadata including airdate, labels, and MusicBrainz IDs.
On API error, returns empty results with _error field describing the failure.`,
  parameters: SearchPlaysParams.fields,
  success: SearchPlaysResponse,
  failureMode: "return",
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
Use the returned MBIDs with search_plays to get complete play history.
Supports pagination with offset parameter for browsing large result sets.
On API error, returns empty results with _error field describing the failure.`,
  parameters: SemanticSearchParams.fields,
  success: SemanticSearchResponse,
  failureMode: "return",
});

/**
 * Hybrid search combining keywords and semantic similarity
 *
 * Uses FTS5 (BM25) for exact matching and FAISS for semantic similarity,
 * merged via Reciprocal Rank Fusion (RRF).
 */
export const HybridSearchTool = Tool.make("hybrid_search", {
  description: `Search KEXP plays using BOTH keyword matching AND semantic similarity.

**RECOMMENDED for most searches** - combines the best of both approaches:
- Exact matches: Artist names, song titles, DJ comments → BM25 excels
- Conceptual queries: Mood, style, related concepts → FAISS excels
- Combined: "Fleet Foxes" finds exact artist + semantically similar folk artists

**When to use each:**
- hybrid_search (default): Best for most queries, especially artist/song names
- semantic_search: Pure conceptual queries like "upbeat summer vibes"

**Weights (0-1):**
- bm25_weight=0.7, faiss_weight=0.3 for known artist/song names
- bm25_weight=0.3, faiss_weight=0.7 for mood/style queries
- Default 0.5/0.5 is a good balance

Returns results ranked by Reciprocal Rank Fusion (RRF) score.
Includes bm25_rank and faiss_rank to show which system contributed.
On API error, returns empty results with _error field describing the failure.`,
  parameters: HybridSearchParams.fields,
  success: HybridSearchResponse,
  failureMode: "return",
});

/**
 * Resolve MusicBrainz IDs
 *
 * Searches MusicBrainz to find canonical IDs for artists, recordings, releases.
 * Use when you need to disambiguate or find official metadata.
 */
export const ResolveMbidTool = Tool.make("resolve_mbid", {
  description: `Resolve names to MusicBrainz IDs by searching the MusicBrainz database.

**Use this tool when:**
- You have an artist/track name but need the canonical MBID
- You need to disambiguate entities (e.g., multiple "The National" artists)
- Search results lack MBIDs and you need them for search_plays
- DJ mentions a venue/studio you want to identify

**⚠️ entity_type MUST be one of these 6 ONLY:**
✅ artist, recording, release, release_group, label, place

**❌ NOT Supported (will fail):**
- area (cities/countries) → Skip, use graph tools for geographic info
- event (concerts/festivals) → Skip, extract from DJ comment
- work (compositions) → Skip, resolve via recording instead

Use artist_hint to disambiguate recordings/releases (e.g., "Squeeze" by "SASAMI").
Returns multiple matches ranked by relevance with disambiguation info.`,
  parameters: ResolveMbidParams.fields,
  success: ResolveMbidResponse,
  failureMode: "return",
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
Content is truncated to 5000 words by default to manage context size.
Use max_words parameter (up to 10000) for longer articles when necessary.
Returns cleaned markdown text content suitable for analysis.`,
  parameters: FetchLinkParams.fields,
  success: FetchLinkResponse,
  failureMode: "return",
});

/**
 * Get recent insights from session
 *
 * Retrieves insights generated during the current session.
 * Use to avoid repeating research or to build on previous findings.
 */
export const GetRecentInsightsTool = Tool.make("get_recent_insights", {
  description: `Get insights you've already produced this session.

Use this to:
- Check if you've already covered this artist/track (avoid duplicates)
- Build on previous findings (e.g., "earlier we noted X, now we see Y")
- Maintain coherence across plays in the same session

Optional filters: artist_mbid, entity_type, limit`,
  parameters: GetRecentInsightsParams.fields,
  success: GetRecentInsightsResponse,
  failureMode: "return",
});

/**
 * Graph connections (remote)
 */
export const GraphConnectionsTool = Tool.make("graph_connections", {
  description: `Query the music knowledge graph for connections (remote API call).

Use for:
- Band lineup: "band_members" / "member_of"
- Label relations: "labelmates" / "label_hierarchy"
- Collaborations / covers / origin / recorded_at

Provide MBIDs (1-50); returns typed connections with provenance.

On API error, returns empty connections array with _error field describing the failure.`,
  parameters: GraphConnectionsParams.fields,
  success: GraphConnectionsResponse,
  failureMode: "return",
});

/**
 * Explore graph (remote-expanding, cache-accumulating)
 */
export const ExploreGraphTool = Tool.make("explore_graph", {
  description: `Expand the agent's in-memory graph cache by fetching new connections from the API.

⚠️ NOTE: This tool ALWAYS makes a remote API call, then merges results into the local cache.
It is NOT a pure cache lookup - use query_cached_neighbors for that.

Use this to incrementally build the graph:
1. Start with graph_connections for initial seed
2. Call explore_graph to expand from discovered MBIDs
3. Use query_cached_neighbors to traverse without further API calls

query_type is REQUIRED - specify which relationship to explore.

Returns a summary of new nodes/edges added plus the fetched connections with FULL
relationship context (relationship_type, attributes, dates, via provenance).

On API error, returns empty results - check new_nodes_count=0 as potential failure signal.`,
  parameters: ExploreGraphParams.fields,
  success: ExploreGraphResponse,
  failureMode: "return",
});

/**
 * Find path between two entities in the cached graph
 */
export const FindGraphPathTool = Tool.make("find_graph_path", {
  description: `Find the shortest path between two entities in the cached graph.

Use this AFTER explore_graph/graph_connections to discover connections:
- "How is Thom Yorke connected to Flea?"
- "What's the path from Radiohead to Atoms for Peace?"

Returns empty path if no connection exists in the cache.
Expand with explore_graph first if entities aren't in cache yet.`,
  parameters: FindGraphPathParams.fields,
  success: FindGraphPathResponse,
  failureMode: "return",
});

/**
 * Query cached neighbors without remote fetch
 */
export const QueryCachedNeighborsTool = Tool.make("query_cached_neighbors", {
  description: `Get neighbors for an entity from the local graph cache (no API call).

Use this for fast traversal AFTER the graph has been expanded:
- List all band members already discovered
- Show known collaborators without re-fetching
- Navigate the graph efficiently

Returns up to 20 neighbors by default. Use limit parameter to increase (max 100).
Returns full relationship context by default (include_edges=true).
Returns empty array if MBID not in cache - use explore_graph first.`,
  parameters: QueryCachedNeighborsParams.fields,
  success: QueryCachedNeighborsResponse,
  failureMode: "return",
});

// =============================================================================
// Phase 1 Graph Algorithm Tools
// =============================================================================

/**
 * Analyze artist influence via degree centrality
 */
export const AnalyzeInfluenceTool = Tool.make("analyze_influence", {
  description: `Analyze an artist's influence in the knowledge graph using degree centrality.

Returns:
- in_degree: How many artists point TO this artist (influences received, covers of their work, etc.)
- out_degree: How many artists this artist points TO (collaborations, band memberships, etc.)
- total_degree: Combined connectivity score

Use this to identify:
- Highly collaborative artists (high out_degree)
- Influential artists whose work is frequently covered/sampled (high in_degree)
- Well-connected artists (high total_degree)

⚠️ PREREQUISITE - Graph must be populated FIRST:
1. explore_graph(query_type="band_members", mbids=[artist_mbid])
2. explore_graph(query_type="member_of", mbids=[artist_mbid])
Then call this tool. Returns error message if graph is empty.`,
  parameters: AnalyzeInfluenceParams.fields,
  success: AnalyzeInfluenceResponse,
  failureMode: "return",
});

/**
 * Explore k-hop neighborhood around an artist
 */
export const ExploreNeighborhoodTool = Tool.make("explore_neighborhood", {
  description: `Find all artists within K hops of a source artist in the knowledge graph.

Use this to:
- Discover artists connected to a seed artist ("Who is connected to Radiohead?")
- Map collaboration networks ("Show me the 2-hop network around Thom Yorke")
- Find related artists for recommendations

Parameters:
- mbid: Source artist's MusicBrainz ID
- max_hops: How many relationship hops to explore (1-3, default 2)
- limit: Maximum nodes to return (default 50, max 100)

Returns nodes sorted by distance (closest first).

⚠️ PREREQUISITE - Graph must be populated FIRST:
1. explore_graph(query_type="band_members", mbids=[artist_mbid])
2. explore_graph(query_type="member_of", mbids=[artist_mbid])
Then call this tool. Returns error message if graph is empty.`,
  parameters: ExploreNeighborhoodParams.fields,
  success: ExploreNeighborhoodResponse,
  failureMode: "return",
});

/**
 * Summarize an artist's relationships in the graph
 */
export const SummarizeRelationshipsTool = Tool.make("summarize_relationships", {
  description: `Get a summary of an artist's relationships in the knowledge graph.

Returns:
- total_connections: Number of relationships in the graph
- by_type: Breakdown by relationship type (band memberships, collaborations, labelmates, etc.)
- top_collaborators: Names of key collaborators/band members
- has_recent_activity: Whether relationships are ongoing or ended in last 5 years

Use this for:
- Artist profile generation ("Tell me about this artist's collaborations")
- Understanding an artist's career scope
- Finding key relationships to explore further

⚠️ PREREQUISITE - Graph must be populated FIRST:
1. explore_graph(query_type="band_members", mbids=[artist_mbid])
2. explore_graph(query_type="member_of", mbids=[artist_mbid])
Then call this tool. Returns error message if graph is empty.`,
  parameters: SummarizeRelationshipsParams.fields,
  success: SummarizeRelationshipsResponse,
  failureMode: "return",
});

/**
 * Analyze graph activity during a time period
 */
export const AnalyzeTimePeriodTool = Tool.make("analyze_time_period", {
  description: `Analyze which relationships in the graph were active during a time period.

Use this for temporal analysis:
- "What was the Seattle scene like in 1991-1994?"
- "Show collaborations active in the 2000s"
- "Find bands that were together in the 1980s"

Filters edges by begin_date/end_date overlap with the specified window.
Ongoing relationships (no end_date) are included if they started before end_year.

Returns:
- active_nodes: Number of artists involved in relationships during this period
- active_edges: Number of relationships active during this period
- relationship_types: Types of relationships found (band memberships, collaborations, etc.)

⚠️ PREREQUISITE - Graph must be populated FIRST:
1. Get artist MBIDs via search
2. explore_graph(query_type="band_members", mbids=[...])
3. explore_graph(query_type="member_of", mbids=[...])
Then call this tool. Returns error message if graph is empty.`,
  parameters: AnalyzeTimePeriodParams.fields,
  success: AnalyzeTimePeriodResponse,
  failureMode: "return",
});

// =============================================================================
// Art Curation Tool
// =============================================================================

/**
 * Analyze album art for creative style extraction
 *
 * Uses vision capabilities to analyze album art and extract:
 * - Creative description and interesting visual elements
 * - Color palette with temperature
 * - Derived UI assets (glows, gradients, textures)
 *
 * The agent is GROUNDED in the source art's aesthetic - never departing from it.
 * KEXP culture: Embrace imperfection, documentary over marketing, vinyl den feeling.
 */
export const AnalyzeAlbumArtTool = Tool.make("analyze_album_art", {
  description: `Analyze album art to extract visual style and generate derived UI assets.

This tool uses vision to creatively analyze album art while staying STRICTLY grounded
in the source artwork's aesthetic. The original art is SACRED - we enhance, never replace.

**Use this tool when:**
- You have album art URL and want to extract its visual style
- You need derived assets (glows, gradients, textures) that complement the art
- You want to understand the mood, era, and aesthetic of an album's visual identity

**What you get back:**
- Creative description of what's visually interesting
- Color palette (dominant color, palette array, warm/cool/neutral temperature)
- Derived assets: glow color, CSS gradient, texture recommendation
- Reasoning explaining why these choices fit the source aesthetic

**Context helps:**
- Provide artist name, album title for research-informed analysis
- Include releaseYear for era-appropriate styling
- Set isLocal=true for Pacific Northwest artists (extra warmth, DIY aesthetic)

**KEXP Culture principles:**
- Embrace imperfection (grain, warmth, authenticity over polish)
- Even playing field - local artists get same visual respect
- Documentary aesthetic over marketing aesthetic
- Pacific Northwest vinyl den feeling`,
  parameters: AnalyzeAlbumArtParams.fields,
  success: AnalyzeAlbumArtResponse,
  failureMode: "return",
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
  HybridSearchTool,
  ResolveMbidTool,
  FetchLinkTool,
  GetRecentInsightsTool,
  GraphConnectionsTool,
  ExploreGraphTool,
  FindGraphPathTool,
  QueryCachedNeighborsTool,
  // Phase 1 graph algorithm tools
  AnalyzeInfluenceTool,
  ExploreNeighborhoodTool,
  SummarizeRelationshipsTool,
  AnalyzeTimePeriodTool,
  // Art curation tool
  AnalyzeAlbumArtTool
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
export type HybridSearchToolType = typeof HybridSearchTool;
export type ResolveMbidToolType = typeof ResolveMbidTool;
export type FetchLinkToolType = typeof FetchLinkTool;
export type GetRecentInsightsToolType = typeof GetRecentInsightsTool;
export type GraphConnectionsToolType = typeof GraphConnectionsTool;
export type ExploreGraphToolType = typeof ExploreGraphTool;
export type FindGraphPathToolType = typeof FindGraphPathTool;
export type QueryCachedNeighborsToolType = typeof QueryCachedNeighborsTool;
// Phase 1 graph algorithm tool types
export type AnalyzeInfluenceToolType = typeof AnalyzeInfluenceTool;
export type ExploreNeighborhoodToolType = typeof ExploreNeighborhoodTool;
export type SummarizeRelationshipsToolType = typeof SummarizeRelationshipsTool;
export type AnalyzeTimePeriodToolType = typeof AnalyzeTimePeriodTool;
// Art curation tool type
export type AnalyzeAlbumArtToolType = typeof AnalyzeAlbumArtTool;
