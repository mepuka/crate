/**
 * Tool Handlers for Crate Research Agent
 *
 * Wires tool definitions to their service implementations.
 * Uses @effect/ai Toolkit.toLayer() pattern for handler registration.
 *
 * All external service calls are wrapped with retry logic for transient failures
 * (network errors, timeouts, rate limits). See retry-policy.ts for configuration.
 *
 * @module
 */

import { Effect, pipe } from "effect";
import { Toolkit } from "@effect/ai";
import { CrateToolkit } from "./definitions.js";
import { withRetry, TOOL_RETRY_CONFIGS } from "./retry-policy.js";
import type {
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
  ConnectionNodeCompact,
  // Phase 1 graph algorithm schemas
  AnalyzeInfluenceParams,
  AnalyzeInfluenceResponse,
  ExploreNeighborhoodParams,
  ExploreNeighborhoodResponse,
  SummarizeRelationshipsParams,
  SummarizeRelationshipsResponse,
  AnalyzeTimePeriodParams,
  AnalyzeTimePeriodResponse,
} from "./schemas.js";
import { toCompactPlayResult, toCompactConnection } from "../services/http-utils.js";

import {
  SearchPlaysService,
  SemanticSearchService,
  InsightSessionService,
  MbidResolverService,
  LinkFetcherService,
  GraphConnectionsService,
  MusicGraphService,
  type SearchPlaysServiceInterface,
  type SemanticSearchServiceInterface,
  type InsightSessionServiceInterface,
  type MbidResolverServiceInterface,
  type LinkFetcherServiceInterface,
  type GraphConnectionsServiceInterface,
  type MusicGraphServiceInterface,
} from "../services/index.js";

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Truncate text to a maximum number of words
 * Used by fetch_link to prevent unbounded content from bloating context
 */
function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "\n\n[Content truncated...]";
}

// =============================================================================
// Types
// =============================================================================

/**
 * Services required to build tool handlers
 */
export type CrateToolServices =
  | SearchPlaysService
  | SemanticSearchService
  | MbidResolverService
  | LinkFetcherService
  | InsightSessionService
  | GraphConnectionsService
  | MusicGraphService;

/**
 * Handler type extracted from CrateToolkit
 */
export type CrateToolHandlers = Toolkit.HandlersFrom<
  Toolkit.Tools<typeof CrateToolkit>
>;

// =============================================================================
// Handler Factory Functions
// =============================================================================

/**
 * Create handler for search_plays tool
 *
 * Wires to SearchPlaysService.timeline() and transforms response
 * to match the tool's expected output schema.
 */
const makeSearchPlaysHandler =
  (service: SearchPlaysServiceInterface) =>
  (params: SearchPlaysParams): Effect.Effect<SearchPlaysResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing search_plays tool");
        yield* Effect.annotateCurrentSpan({
          tool: "search_plays",
          artist_mbid: params.artist_mbid ?? "none",
          recording_mbid: params.recording_mbid ?? "none",
          release_mbid: params.release_mbid ?? "none",
          release_group_mbid: params.release_group_mbid ?? "none",
          limit: params.limit ?? 10,
        });

        // Build timeline params, only including defined values
        const timelineParams: {
          limit?: number;
          artistMbid?: string;
          recordingMbid?: string;
          releaseMbid?: string;
          releaseGroupMbid?: string;
          since?: string;
          until?: string;
        } = {};

        if (params.limit !== undefined) timelineParams.limit = params.limit;
        if (params.artist_mbid !== undefined)
          timelineParams.artistMbid = params.artist_mbid;
        if (params.recording_mbid !== undefined)
          timelineParams.recordingMbid = params.recording_mbid;
        if (params.release_mbid !== undefined)
          timelineParams.releaseMbid = params.release_mbid;
        if (params.release_group_mbid !== undefined)
          timelineParams.releaseGroupMbid = params.release_group_mbid;
        if (params.since !== undefined) timelineParams.since = params.since;
        if (params.until !== undefined) timelineParams.until = params.until;

        // Call timeline with mapped parameters
        // Retry on transient failures (network errors, timeouts, rate limits)
        const response = yield* withRetry(
          service.timeline(timelineParams),
          TOOL_RETRY_CONFIGS.search
        ).pipe(
          // Map service error to success with empty results for tool robustness
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`search_plays tool error after retries: ${error.message}`);
              yield* Effect.annotateCurrentSpan({ error: error.message, error_type: error._tag ?? "UnknownError" });
              return {
                results: [],
                next_cursor: null,
                has_more: false,
                query_time_ms: 0,
                total_count: 0,
                anchor_position: null,
                _error: error.message,
              };
            })
          )
        );

        // Transform timeline response to match SearchPlaysResponse schema
        // Uses shared toCompactPlayResult for Date -> ISO string conversion
        const results = response.results.map((play) =>
          toCompactPlayResult(play, 1.0)
        );

        yield* Effect.annotateCurrentSpan({
          result_count: results.length,
          query_time_ms: response.query_time_ms,
        });
        yield* Effect.logDebug(
          `search_plays returned ${results.length} results`
        );

        // Propagate _error if present from error handling
        return {
          results,
          total: response.total_count ?? response.results.length,
          query_time_ms: response.query_time_ms,
          ...("_error" in response && response._error ? { _error: response._error } : {}),
        } satisfies SearchPlaysResponse;
      }),
      Effect.withSpan("Tool.search_plays")
    );

/**
 * Create handler for semantic_search tool
 *
 * Wires to SemanticSearchService.search() and transforms response
 * to match the tool's expected output schema.
 */
const makeSemanticSearchHandler =
  (service: SemanticSearchServiceInterface) =>
  (params: SemanticSearchParams): Effect.Effect<SemanticSearchResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing semantic_search tool");
        yield* Effect.annotateCurrentSpan({
          tool: "semantic_search",
          query: params.query,
          limit: params.limit ?? 10,
        });

        // Retry on transient failures (network errors, timeouts, rate limits)
        const response = yield* withRetry(
          service.search({
            query: params.query,
            ...(params.limit !== undefined ? { limit: params.limit } : {}),
            ...(params.offset !== undefined ? { offset: params.offset } : {}),
          }),
          TOOL_RETRY_CONFIGS.search
        ).pipe(
          // Map service error to success with empty results for tool robustness
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`semantic_search tool error after retries: ${error.message}`);
              yield* Effect.annotateCurrentSpan({ error: error.message, error_type: error._tag ?? "UnknownError" });
              return {
                results: [],
                total: 0,
                query_time_ms: 0,
                query: params.query,
                _error: error.message,
              };
            })
          )
        );

        // Transform to match tool schema - uses shared toCompactPlayResult
        const results = response.results.map((play) =>
          toCompactPlayResult(play)
        );

        yield* Effect.annotateCurrentSpan({
          result_count: results.length,
          query_time_ms: response.query_time_ms,
        });
        yield* Effect.logDebug(
          `semantic_search returned ${results.length} results`
        );

        // Propagate _error if present from error handling
        return {
          results,
          total: response.total,
          query_time_ms: response.query_time_ms,
          query: response.query,
          ...("_error" in response && response._error ? { _error: response._error } : {}),
        } satisfies SemanticSearchResponse;
      }),
      Effect.withSpan("Tool.semantic_search")
    );

/**
 * Create handler for hybrid_search tool
 *
 * Wires to SemanticSearchService.hybridSearch() and transforms response
 * to match the tool's expected output schema.
 */
const makeHybridSearchHandler =
  (service: SemanticSearchServiceInterface) =>
  (params: HybridSearchParams): Effect.Effect<HybridSearchResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing hybrid_search tool");
        yield* Effect.annotateCurrentSpan({
          tool: "hybrid_search",
          query: params.query,
          limit: params.limit ?? 20,
          bm25_weight: params.bm25_weight ?? 0.5,
          faiss_weight: params.faiss_weight ?? 0.5,
        });

        // Retry on transient failures (network errors, timeouts, rate limits)
        const response = yield* withRetry(
          service.hybridSearch({
            query: params.query,
            ...(params.limit !== undefined ? { limit: params.limit } : {}),
            ...(params.bm25_weight !== undefined ? { bm25_weight: params.bm25_weight } : {}),
            ...(params.faiss_weight !== undefined ? { faiss_weight: params.faiss_weight } : {}),
          }),
          TOOL_RETRY_CONFIGS.search
        ).pipe(
          // Map service error to success with empty results for tool robustness
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`hybrid_search tool error after retries: ${error.message}`);
              yield* Effect.annotateCurrentSpan({ error: error.message, error_type: error._tag ?? "UnknownError" });
              return {
                results: [],
                total: 0,
                query_time_ms: 0,
                query: params.query,
                bm25_weight: params.bm25_weight ?? 0.5,
                faiss_weight: params.faiss_weight ?? 0.5,
                _error: error.message,
              };
            })
          )
        );

        // Transform results: Date -> ISO string for airdate, arrays to mutable
        const results = response.results.map((play) => ({
          ...play,
          airdate: play.airdate instanceof Date ? play.airdate.toISOString() : String(play.airdate),
          labels: [...play.labels],
          artist_mbid: [...play.artist_mbid],
        }));

        yield* Effect.annotateCurrentSpan({
          result_count: results.length,
          query_time_ms: response.query_time_ms,
        });
        yield* Effect.logDebug(
          `hybrid_search returned ${results.length} results`
        );

        // Propagate _error if present from error handling
        return {
          results,
          total: response.total,
          query_time_ms: response.query_time_ms,
          query: response.query,
          bm25_weight: response.bm25_weight,
          faiss_weight: response.faiss_weight,
          ...("_error" in response && response._error ? { _error: response._error } : {}),
        } satisfies HybridSearchResponse;
      }),
      Effect.withSpan("Tool.hybrid_search")
    );

/**
 * Create handler for resolve_mbid tool
 *
 * Wires to MbidResolverService.resolve()
 */
const makeResolveMbidHandler =
  (service: MbidResolverServiceInterface) =>
  (params: ResolveMbidParams): Effect.Effect<ResolveMbidResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing resolve_mbid tool");
        yield* Effect.annotateCurrentSpan({
          tool: "resolve_mbid",
          query: params.query,
          entity_type: params.entity_type,
        });

        // Retry on transient failures (network errors, timeouts, rate limits)
        const response = yield* withRetry(
          service.resolve(params),
          TOOL_RETRY_CONFIGS.resolve
        ).pipe(
          // Map service error to success with empty results for tool robustness
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`resolve_mbid tool error after retries: ${error.message}`);
              yield* Effect.annotateCurrentSpan({ error: error.message, error_type: error._tag ?? "UnknownError" });
              return {
                results: [],
                query: params.query,
                entity_type: params.entity_type,
                _error: error.message,
              };
            })
          )
        );

        yield* Effect.annotateCurrentSpan(
          "result_count",
          response.results.length
        );
        yield* Effect.logDebug(
          `resolve_mbid returned ${response.results.length} results`
        );

        return {
          results: response.results,
          query: response.query,
          entity_type: response.entity_type,
        } satisfies ResolveMbidResponse;
      }),
      Effect.withSpan("Tool.resolve_mbid")
    );

/**
 * Create handler for fetch_link tool
 *
 * Wires to LinkFetcherService.fetch()
 */
const makeFetchLinkHandler =
  (service: LinkFetcherServiceInterface) =>
  (params: FetchLinkParams): Effect.Effect<FetchLinkResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing fetch_link tool");
        yield* Effect.annotateCurrentSpan({
          tool: "fetch_link",
          url: params.url,
        });

        // Retry on transient failures - external fetches can be flaky
        const rawResponse = yield* withRetry(
          service.fetch(params),
          TOOL_RETRY_CONFIGS.fetch
        ).pipe(
          // Map service error to success with error content for tool robustness
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`fetch_link tool error after retries: ${error.message}`);
              yield* Effect.annotateCurrentSpan({ error: error.message, error_type: error._tag ?? "UnknownError" });
              return {
                url: params.url,
                title: "Error fetching content",
                content: `Failed to fetch content: ${error.message}`,
                word_count: 0,
                links: [],
              };
            })
          )
        );

        // Apply word truncation - raised to support narrative depth research
        const maxWords = Math.min(params.max_words ?? 20000, 50000);
        const truncatedContent = truncateToWords(rawResponse.content, maxWords);
        const truncatedWordCount = truncatedContent.split(/\s+/).length;

        yield* Effect.annotateCurrentSpan({
          word_count: truncatedWordCount,
          original_word_count: rawResponse.word_count,
          link_count: rawResponse.links.length,
          truncated: rawResponse.word_count > maxWords,
        });
        yield* Effect.logDebug(
          `fetch_link returned ${truncatedWordCount} words (original: ${rawResponse.word_count})`
        );

        return {
          ...rawResponse,
          content: truncatedContent,
          word_count: truncatedWordCount,
        } satisfies FetchLinkResponse;
      }),
      Effect.withSpan("Tool.fetch_link")
    );

/**
 * Create handler for get_recent_insights tool
 *
 * Wires to InsightSessionService.getRecentInsights()
 * Transforms session response to match tool schema (sessionId -> session_id)
 */
const makeGetRecentInsightsHandler =
  (service: InsightSessionServiceInterface) =>
  (params: GetRecentInsightsParams): Effect.Effect<GetRecentInsightsResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing get_recent_insights tool");
        yield* Effect.annotateCurrentSpan({
          tool: "get_recent_insights",
          limit: params.limit ?? 10,
        });

        // Ref operations never fail, so no error handling needed
        const response = yield* service.getRecentInsights(params);

        yield* Effect.annotateCurrentSpan({
          insight_count: response.total,
          session_id: response.sessionId,
        });
        yield* Effect.logDebug(
          `get_recent_insights returned ${response.total} insights`
        );

        // Transform sessionId to session_id for schema compliance
        return {
          insights: [...response.insights],
          total: response.total,
          session_id: response.sessionId,
        } satisfies GetRecentInsightsResponse;
      }),
      Effect.withSpan("Tool.get_recent_insights")
    );

/**
 * Create handler for graph_connections tool (remote API)
 */
const makeGraphConnectionsHandler =
  (service: GraphConnectionsServiceInterface) =>
  (params: GraphConnectionsParams): Effect.Effect<GraphConnectionsResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing graph_connections tool");
        yield* Effect.annotateCurrentSpan({
          tool: "graph_connections",
          query_type: params.query_type,
          mbids: params.mbids.join(","),
        });

        // Retry on transient failures - graph API is a remote service
        const result = yield* withRetry(
          service.connections(params),
          TOOL_RETRY_CONFIGS.graph
        ).pipe(
          Effect.map((response) => ({
            query_type: response.query_type,
            source_mbids: response.source_mbids,
            connections: response.connections.map(toCompactConnection),
            total: response.total,
            query_time_ms: response.query_time_ms,
          })),
          // Map service error to success with empty results for tool robustness
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`graph_connections tool error after retries: ${error.message}`);
              yield* Effect.annotateCurrentSpan({ error: error.message, error_type: error._tag ?? "UnknownError" });
              return {
                query_type: params.query_type,
                connections: [] as ConnectionNodeCompact[],
                total: 0,
                query_time_ms: 0,
                source_mbids: params.mbids,
                _error: error.message,
              };
            })
          )
        );

        yield* Effect.logDebug(
          `graph_connections returned ${result.connections.length} connections`
        );
        return result;
      }),
      Effect.withSpan("Tool.graph_connections")
    );

/**
 * Create handler for explore_graph tool (local cache)
 *
 * Uses expand result connections directly to preserve full edge data
 * (relationship_type, attributes, begin_date, end_date, via_mbid, via_name).
 */
const makeExploreGraphHandler =
  (service: MusicGraphServiceInterface) =>
  (params: ExploreGraphParams): Effect.Effect<ExploreGraphResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing explore_graph tool");
        yield* Effect.annotateCurrentSpan({
          tool: "explore_graph",
          query_type: params.query_type,
          mbids: params.mbids.join(","),
        });

        // Expand returns full connection data from remote API
        // Retry on transient failures
        const result = yield* withRetry(
          service.expand({
            query_type: params.query_type,
            mbids: params.mbids,
            limit: params.limit,
            include_attributes: true,
          }),
          TOOL_RETRY_CONFIGS.graph
        ).pipe(
          Effect.map((r) => ({
            ...r,
            // Preserve connections for neighbor extraction
            hasConnections: true as const,
            _error: undefined as string | undefined,
          })),
          // Map service error to success with empty results for tool robustness
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              // Log full error details including cause for debugging
              const cause = "cause" in error ? error.cause : undefined;
              const causeStr = cause ? ` (cause: ${cause instanceof Error ? cause.message : String(cause)})` : "";
              yield* Effect.logWarning(`explore_graph tool error after retries: ${error.message}${causeStr}`);
              yield* Effect.annotateCurrentSpan({
                error: error.message,
                error_type: error._tag ?? "UnknownError",
                error_cause: causeStr || undefined
              });
              return {
                newNodes: 0,
                newEdges: 0,
                hasConnections: false as const,
                _error: error.message,
              };
            })
          )
        );

        // Use connections directly from expand result - preserves all edge data!
        // No need to call neighbors() which loses relationship context.
        // Transform to compact format (null -> undefined for optional fields)
        const neighbors =
          result.hasConnections && "connections" in result
            ? result.connections.connections.map(toCompactConnection)
            : [];

        yield* Effect.annotateCurrentSpan({
          new_nodes: result.newNodes,
          new_edges: result.newEdges,
          neighbor_count: neighbors.length,
        });

        // Build response with optional _error
        return {
          summary: `Expanded ${params.mbids.length} seed(s): +${result.newNodes} nodes, +${result.newEdges} edges`,
          new_nodes_count: result.newNodes,
          new_edges_count: result.newEdges,
          neighbors,
          ...(result._error ? { _error: result._error } : {}),
        } satisfies ExploreGraphResponse;
      }),
      Effect.withSpan("Tool.explore_graph")
    );

/**
 * Create handler for find_graph_path tool
 *
 * Uses MusicGraphService.path() to find shortest path between two entities.
 */
const makeFindGraphPathHandler =
  (service: MusicGraphServiceInterface) =>
  (params: FindGraphPathParams): Effect.Effect<FindGraphPathResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing find_graph_path tool");
        yield* Effect.annotateCurrentSpan({
          tool: "find_graph_path",
          from_mbid: params.from_mbid,
          to_mbid: params.to_mbid,
        });

        const pathResult = yield* service.path(params.from_mbid, params.to_mbid);

        if (pathResult._tag === "None") {
          yield* Effect.annotateCurrentSpan("path_found", false);
          return {
            path_found: false,
            path_length: 0,
            path: [],
          } satisfies FindGraphPathResponse;
        }

        const pathNodes = pathResult.value.map((node) => ({
          mbid: node.mbid,
          name: node.name,
          node_type: node.nodeType,
        }));

        yield* Effect.annotateCurrentSpan({
          path_found: true,
          path_length: pathNodes.length,
        });

        return {
          path_found: true,
          path_length: pathNodes.length,
          path: pathNodes,
        } satisfies FindGraphPathResponse;
      }),
      Effect.withSpan("Tool.find_graph_path")
    );

/**
 * Create handler for query_cached_neighbors tool
 *
 * Uses MusicGraphService.outgoingEdges() or neighbors() based on include_edges flag.
 */
const makeQueryCachedNeighborsHandler =
  (service: MusicGraphServiceInterface) =>
  (params: QueryCachedNeighborsParams): Effect.Effect<QueryCachedNeighborsResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing query_cached_neighbors tool");
        const includeEdges = params.include_edges ?? true;
        // Apply limit with default of 20, max of 100
        const limit = Math.min(params.limit ?? 20, 100);

        yield* Effect.annotateCurrentSpan({
          tool: "query_cached_neighbors",
          mbid: params.mbid,
          include_edges: includeEdges,
          limit,
        });

        if (includeEdges) {
          // Use outgoingEdges for full relationship context
          const edges = yield* service.outgoingEdges(params.mbid);
          const allNeighbors = edges.map((e) => ({
            mbid: e.node.mbid,
            name: e.node.name,
            node_type: e.node.nodeType,
            relationship_type: e.edge.relationshipType,
            attributes: e.edge.attributes ? [...e.edge.attributes] : undefined,
            begin_date: e.edge.beginDate,
            end_date: e.edge.endDate,
            via_mbid: e.edge.viaMbid,
            via_name: e.edge.viaName,
          }));

          // Apply limit
          const neighbors = allNeighbors.slice(0, limit);

          yield* Effect.annotateCurrentSpan({
            neighbor_count: neighbors.length,
            total_available: allNeighbors.length,
            limited: allNeighbors.length > limit,
          });

          return {
            mbid: params.mbid,
            neighbors,
            neighbor_count: neighbors.length,
          } satisfies QueryCachedNeighborsResponse;
        } else {
          // Use neighbors for basic node info only
          const nodes = yield* service.neighbors(params.mbid);
          const allNeighbors = nodes.map((n) => ({
            mbid: n.mbid,
            name: n.name,
            node_type: n.nodeType,
          }));

          // Apply limit
          const neighbors = allNeighbors.slice(0, limit);

          yield* Effect.annotateCurrentSpan({
            neighbor_count: neighbors.length,
            total_available: allNeighbors.length,
            limited: allNeighbors.length > limit,
          });

          return {
            mbid: params.mbid,
            neighbors,
            neighbor_count: neighbors.length,
          } satisfies QueryCachedNeighborsResponse;
        }
      }),
      Effect.withSpan("Tool.query_cached_neighbors")
    );

// =============================================================================
// Phase 1 Graph Algorithm Handlers
// =============================================================================

/**
 * Create handler for analyze_influence tool
 *
 * Uses MusicGraphService.degreeCentrality() to get degree metrics
 */
const makeAnalyzeInfluenceHandler =
  (service: MusicGraphServiceInterface) =>
  (params: AnalyzeInfluenceParams): Effect.Effect<AnalyzeInfluenceResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing analyze_influence tool");
        yield* Effect.annotateCurrentSpan({
          tool: "analyze_influence",
          mbid: params.mbid,
        });

        const centrality = yield* service.degreeCentrality(params.mbid);

        // Check if graph is empty for this MBID - return explicit error
        if (centrality.totalDegree === 0) {
          yield* Effect.logWarning(
            `analyze_influence called on empty graph for ${params.mbid}. ` +
            "Use explore_graph to populate first."
          );
          yield* Effect.annotateCurrentSpan({
            error: "graph_not_populated",
            mbid: params.mbid,
          });

          // Return error response that signals LLM to take corrective action
          return {
            mbid: params.mbid,
            in_degree: 0,
            out_degree: 0,
            total_degree: 0,
            influence_summary: `⚠️ GRAPH NOT POPULATED: Artist ${params.mbid} not found in graph cache. ` +
              "You must call explore_graph FIRST to populate the graph before using this tool. " +
              "Required steps: (1) explore_graph(query_type='band_members', mbids=['${params.mbid}']) " +
              "(2) explore_graph(query_type='member_of', mbids=['${params.mbid}']) " +
              "Then retry analyze_influence.",
          } satisfies AnalyzeInfluenceResponse;
        }

        // Generate human-readable summary for populated graph
        let summary = "";
        if (centrality.outDegree > centrality.inDegree * 2) {
          summary = `Highly collaborative artist with ${centrality.outDegree} outgoing connections.`;
        } else if (centrality.inDegree > centrality.outDegree * 2) {
          summary = `Influential artist with ${centrality.inDegree} incoming connections (frequently referenced/covered).`;
        } else {
          summary = `Well-balanced connectivity with ${centrality.totalDegree} total connections.`;
        }

        yield* Effect.annotateCurrentSpan({
          in_degree: centrality.inDegree,
          out_degree: centrality.outDegree,
          total_degree: centrality.totalDegree,
        });

        return {
          mbid: params.mbid,
          in_degree: centrality.inDegree,
          out_degree: centrality.outDegree,
          total_degree: centrality.totalDegree,
          influence_summary: summary,
        } satisfies AnalyzeInfluenceResponse;
      }),
      Effect.withSpan("Tool.analyze_influence")
    );

/**
 * Create handler for explore_neighborhood tool
 *
 * Uses MusicGraphService.kHopNeighborhood() for BFS exploration
 */
const makeExploreNeighborhoodHandler =
  (service: MusicGraphServiceInterface) =>
  (params: ExploreNeighborhoodParams): Effect.Effect<ExploreNeighborhoodResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing explore_neighborhood tool");
        const maxHops = Math.min(Math.max(params.max_hops ?? 2, 1), 3);
        const limit = Math.min(params.limit ?? 50, 100);

        yield* Effect.annotateCurrentSpan({
          tool: "explore_neighborhood",
          mbid: params.mbid,
          max_hops: maxHops,
          limit,
        });

        const neighborhood = yield* service.kHopNeighborhood(params.mbid, maxHops);

        // Check if graph is empty for this MBID - return explicit error
        if (neighborhood.length === 0) {
          yield* Effect.logWarning(
            `explore_neighborhood called on empty graph for ${params.mbid}. ` +
            "Use explore_graph to populate first."
          );
          yield* Effect.annotateCurrentSpan({
            error: "graph_not_populated",
            mbid: params.mbid,
          });

          return {
            source_mbid: params.mbid,
            max_hops: maxHops,
            nodes: [],
            total_found: 0,
            summary: `⚠️ GRAPH NOT POPULATED: Artist ${params.mbid} not found in graph cache. ` +
              "You must call explore_graph FIRST to populate the graph before using this tool. " +
              "Required steps: (1) explore_graph(query_type='band_members', mbids=['${params.mbid}']) " +
              "(2) explore_graph(query_type='member_of', mbids=['${params.mbid}']) " +
              "Then retry explore_neighborhood.",
          } satisfies ExploreNeighborhoodResponse;
        }

        // Transform and limit results
        const nodes = neighborhood.slice(0, limit).map((n) => ({
          mbid: n.node.mbid,
          name: n.node.name,
          node_type: n.node.nodeType,
          distance: n.distance,
        }));

        // Group by distance for summary
        const byDistance = new Map<number, number>();
        for (const n of neighborhood) {
          byDistance.set(n.distance, (byDistance.get(n.distance) ?? 0) + 1);
        }

        const parts: string[] = [];
        for (let d = 1; d <= maxHops; d++) {
          const count = byDistance.get(d) ?? 0;
          if (count > 0) {
            parts.push(`${count} at ${d} hop${d > 1 ? "s" : ""}`);
          }
        }
        let summary = `Found ${neighborhood.length} nodes: ${parts.join(", ")}.`;
        if (neighborhood.length > limit) {
          summary += ` (showing first ${limit})`;
        }

        yield* Effect.annotateCurrentSpan({
          total_found: neighborhood.length,
          returned: nodes.length,
        });

        return {
          source_mbid: params.mbid,
          max_hops: maxHops,
          nodes,
          total_found: neighborhood.length,
          summary,
        } satisfies ExploreNeighborhoodResponse;
      }),
      Effect.withSpan("Tool.explore_neighborhood")
    );

/**
 * Create handler for summarize_relationships tool
 *
 * Uses MusicGraphService.summarizeRelationships() for relationship aggregation
 */
const makeSummarizeRelationshipsHandler =
  (service: MusicGraphServiceInterface) =>
  (params: SummarizeRelationshipsParams): Effect.Effect<SummarizeRelationshipsResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing summarize_relationships tool");
        yield* Effect.annotateCurrentSpan({
          tool: "summarize_relationships",
          mbid: params.mbid,
        });

        const summary = yield* service.summarizeRelationships(params.mbid);

        // Check if graph is empty for this MBID - return explicit error
        if (summary.totalConnections === 0) {
          yield* Effect.logWarning(
            `summarize_relationships called on empty graph for ${params.mbid}. ` +
            "Use explore_graph to populate first."
          );
          yield* Effect.annotateCurrentSpan({
            error: "graph_not_populated",
            mbid: params.mbid,
          });

          return {
            mbid: params.mbid,
            total_connections: 0,
            by_type: [],
            top_collaborators: [],
            has_recent_activity: false,
            summary: `⚠️ GRAPH NOT POPULATED: Artist ${params.mbid} not found in graph cache. ` +
              "You must call explore_graph FIRST to populate the graph before using this tool. " +
              "Required steps: (1) explore_graph(query_type='band_members', mbids=['${params.mbid}']) " +
              "(2) explore_graph(query_type='member_of', mbids=['${params.mbid}']) " +
              "Then retry summarize_relationships.",
          } satisfies SummarizeRelationshipsResponse;
        }

        // Convert Map to array format for JSON serialization
        const byType: Array<{ relationship_type: string; count: number }> = [];
        for (const [type, count] of summary.byType) {
          byType.push({ relationship_type: type, count });
        }
        // Sort by count descending
        byType.sort((a, b) => b.count - a.count);

        // Generate human-readable summary
        const typeParts = byType.slice(0, 3).map((t) => `${t.count} ${t.relationship_type}`);
        let textSummary = `${summary.totalConnections} connections: ${typeParts.join(", ")}`;
        if (byType.length > 3) {
          textSummary += `, and ${byType.length - 3} more types`;
        }
        textSummary += ".";
        if (summary.hasRecentActivity) {
          textSummary += " Artist has recent/ongoing activity.";
        }

        yield* Effect.annotateCurrentSpan({
          total_connections: summary.totalConnections,
          relationship_types: byType.length,
          has_recent_activity: summary.hasRecentActivity,
        });

        return {
          mbid: params.mbid,
          total_connections: summary.totalConnections,
          by_type: byType,
          top_collaborators: [...summary.topCollaborators],
          has_recent_activity: summary.hasRecentActivity,
          summary: textSummary,
        } satisfies SummarizeRelationshipsResponse;
      }),
      Effect.withSpan("Tool.summarize_relationships")
    );

/**
 * Create handler for analyze_time_period tool
 *
 * Uses MusicGraphService.timeWindowStats() for temporal analysis
 */
const makeAnalyzeTimePeriodHandler =
  (service: MusicGraphServiceInterface) =>
  (params: AnalyzeTimePeriodParams): Effect.Effect<AnalyzeTimePeriodResponse> =>
    pipe(
      Effect.gen(function* () {
        yield* Effect.logDebug("Executing analyze_time_period tool");
        yield* Effect.annotateCurrentSpan({
          tool: "analyze_time_period",
          start_year: params.start_year,
          end_year: params.end_year,
        });

        const stats = yield* service.timeWindowStats(params.start_year, params.end_year);

        // Check if graph is empty - return explicit error
        if (stats.edgeCount === 0 && stats.nodeCount === 0) {
          yield* Effect.logWarning(
            `analyze_time_period called on empty graph for ${params.start_year}-${params.end_year}. ` +
            "Use explore_graph to populate first."
          );
          yield* Effect.annotateCurrentSpan({
            error: "graph_not_populated",
            start_year: params.start_year,
            end_year: params.end_year,
          });

          return {
            start_year: params.start_year,
            end_year: params.end_year,
            active_nodes: 0,
            active_edges: 0,
            relationship_types: [],
            summary: `⚠️ GRAPH NOT POPULATED: No data found for ${params.start_year}-${params.end_year}. ` +
              "The graph cache is likely empty. You must call explore_graph FIRST to populate the graph. " +
              "Required steps: (1) Get an artist MBID via search (2) explore_graph(query_type='band_members', mbids=[...]) " +
              "(3) explore_graph(query_type='member_of', mbids=[...]) " +
              "Then retry analyze_time_period.",
          } satisfies AnalyzeTimePeriodResponse;
        }

        // Generate human-readable summary - graph has data but maybe no overlap with time window
        let summary = "";
        if (stats.edgeCount === 0) {
          summary = `No relationships found active during ${params.start_year}-${params.end_year}. ` +
            "The graph has data but the time window doesn't overlap with any relationships.";
        } else {
          summary = `${params.start_year}-${params.end_year}: ${stats.nodeCount} artists, ` +
            `${stats.edgeCount} relationships (${stats.activeRelationships.join(", ")}).`;
        }

        yield* Effect.annotateCurrentSpan({
          active_nodes: stats.nodeCount,
          active_edges: stats.edgeCount,
          relationship_type_count: stats.activeRelationships.length,
        });

        return {
          start_year: params.start_year,
          end_year: params.end_year,
          active_nodes: stats.nodeCount,
          active_edges: stats.edgeCount,
          relationship_types: [...stats.activeRelationships],
          summary,
        } satisfies AnalyzeTimePeriodResponse;
      }),
      Effect.withSpan("Tool.analyze_time_period")
    );

// =============================================================================
// Toolkit Handler Builder
// =============================================================================

/**
 * Build all tool handlers from services
 *
 * This Effect acquires all required services from context and
 * creates handlers that close over those service instances.
 */
export const makeCrateToolHandlers: Effect.Effect<
  CrateToolHandlers,
  never,
  CrateToolServices
> = Effect.gen(function* () {
  // Acquire all services
  const searchPlaysService = yield* SearchPlaysService;
  const semanticSearchService = yield* SemanticSearchService;
  const mbidResolverService = yield* MbidResolverService;
  const linkFetcherService = yield* LinkFetcherService;
  const insightSessionService = yield* InsightSessionService;
  const graphConnectionsService = yield* GraphConnectionsService;
  const musicGraphService = yield* MusicGraphService;

  // Build handlers that close over the services
  return CrateToolkit.of({
    search_plays: makeSearchPlaysHandler(searchPlaysService),
    semantic_search: makeSemanticSearchHandler(semanticSearchService),
    hybrid_search: makeHybridSearchHandler(semanticSearchService),
    resolve_mbid: makeResolveMbidHandler(mbidResolverService),
    fetch_link: makeFetchLinkHandler(linkFetcherService),
    get_recent_insights: makeGetRecentInsightsHandler(insightSessionService),
    graph_connections: makeGraphConnectionsHandler(graphConnectionsService),
    explore_graph: makeExploreGraphHandler(musicGraphService),
    find_graph_path: makeFindGraphPathHandler(musicGraphService),
    query_cached_neighbors: makeQueryCachedNeighborsHandler(musicGraphService),
    // Phase 1 graph algorithm tools
    analyze_influence: makeAnalyzeInfluenceHandler(musicGraphService),
    explore_neighborhood: makeExploreNeighborhoodHandler(musicGraphService),
    summarize_relationships: makeSummarizeRelationshipsHandler(musicGraphService),
    analyze_time_period: makeAnalyzeTimePeriodHandler(musicGraphService),
  });
});

// =============================================================================
// Toolkit Handler Layer
// =============================================================================

/**
 * Layer providing CrateToolkit handlers
 *
 * Requires all 5 services to be available in context:
 * - SearchPlaysService
 * - SemanticSearchService
 * - MbidResolverService
 * - LinkFetcherService
 * - InsightSessionService
 *
 * Usage:
 * ```ts
 * const program = CrateToolkit.pipe(
 *   Effect.flatMap((toolkit) => toolkit.handle("search_plays", { query: "jazz" }))
 * )
 *
 * const runnable = program.pipe(
 *   Effect.provide(CrateToolHandlersLayer),
 *   Effect.provide(SearchPlaysServiceLive),
 *   Effect.provide(SemanticSearchServiceLive),
 *   // ... other service layers
 * )
 * ```
 */
export const CrateToolHandlersLayer = CrateToolkit.toLayer(
  makeCrateToolHandlers
);

// =============================================================================
// Exports
// =============================================================================

export {
  makeSearchPlaysHandler,
  makeSemanticSearchHandler,
  makeHybridSearchHandler,
  makeResolveMbidHandler,
  makeFetchLinkHandler,
  makeGetRecentInsightsHandler,
  makeGraphConnectionsHandler,
  makeExploreGraphHandler,
  makeFindGraphPathHandler,
  makeQueryCachedNeighborsHandler,
  // Phase 1 graph algorithm handlers
  makeAnalyzeInfluenceHandler,
  makeExploreNeighborhoodHandler,
  makeSummarizeRelationshipsHandler,
  makeAnalyzeTimePeriodHandler,
};
