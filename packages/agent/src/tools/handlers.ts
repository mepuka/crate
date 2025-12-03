/**
 * Tool Handlers for Crate Research Agent
 *
 * Wires tool definitions to their service implementations.
 * Uses @effect/ai Toolkit.toLayer() pattern for handler registration.
 *
 * @module
 */

import { Effect, pipe } from "effect";
import { Toolkit } from "@effect/ai";
import { CrateToolkit } from "./definitions.js";
import type {
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
} from "./schemas.js";
import { transformPlayResult } from "../services/http-utils.js";

import {
  SearchPlaysService,
  SemanticSearchService,
  InsightSessionService,
  MbidResolverService,
  LinkFetcherService,
  type SearchPlaysServiceInterface,
  type SemanticSearchServiceInterface,
  type InsightSessionServiceInterface,
  type MbidResolverServiceInterface,
  type LinkFetcherServiceInterface,
} from "../services/index.js";

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
  | InsightSessionService;

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
        const response = yield* service.timeline(timelineParams).pipe(
          // Map service error to success with empty results for tool robustness
          Effect.catchAll((error) =>
            Effect.succeed({
              results: [],
              next_cursor: null,
              has_more: false,
              query_time_ms: 0,
              total_count: 0,
              anchor_position: null,
              _error: error.message,
            })
          )
        );

        // Transform timeline response to match SearchPlaysResponse schema
        // Uses shared transformPlayResult for Date -> ISO string conversion
        const results = response.results.map((play) =>
          transformPlayResult(play, 1.0)
        );

        yield* Effect.annotateCurrentSpan({
          result_count: results.length,
          query_time_ms: response.query_time_ms,
        });
        yield* Effect.logDebug(
          `search_plays returned ${results.length} results`
        );

        return {
          results,
          total: response.total_count ?? response.results.length,
          query_time_ms: response.query_time_ms,
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

        const response = yield* service
          .search({
            query: params.query,
            ...(params.limit !== undefined ? { limit: params.limit } : {}),
          })
          .pipe(
            // Map service error to success with empty results for tool robustness
            Effect.catchAll((error) =>
              Effect.succeed({
                results: [],
                total: 0,
                query_time_ms: 0,
                query: params.query,
                _error: error.message,
              })
            )
          );

        // Transform to match tool schema - uses shared transformPlayResult
        const results = response.results.map((play) =>
          transformPlayResult(play)
        );

        yield* Effect.annotateCurrentSpan({
          result_count: results.length,
          query_time_ms: response.query_time_ms,
        });
        yield* Effect.logDebug(
          `semantic_search returned ${results.length} results`
        );

        return {
          results,
          total: response.total,
          query_time_ms: response.query_time_ms,
          query: response.query,
        } satisfies SemanticSearchResponse;
      }),
      Effect.withSpan("Tool.semantic_search")
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

        const response = yield* service.resolve(params).pipe(
          // Map service error to success with empty results for tool robustness
          Effect.catchAll((error) =>
            Effect.succeed({
              results: [],
              query: params.query,
              entity_type: params.entity_type,
              _error: error.message,
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

        const response = yield* service.fetch(params).pipe(
          // Map service error to success with error content for tool robustness
          Effect.catchAll((error) =>
            Effect.succeed({
              url: params.url,
              title: "Error fetching content",
              content: `Failed to fetch content: ${error.message}`,
              word_count: 0,
              links: [],
            })
          )
        );

        yield* Effect.annotateCurrentSpan({
          word_count: response.word_count,
          link_count: response.links.length,
        });
        yield* Effect.logDebug(
          `fetch_link returned ${response.word_count} words`
        );

        return response satisfies FetchLinkResponse;
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

  // Build handlers that close over the services
  return CrateToolkit.of({
    search_plays: makeSearchPlaysHandler(searchPlaysService),
    semantic_search: makeSemanticSearchHandler(semanticSearchService),
    resolve_mbid: makeResolveMbidHandler(mbidResolverService),
    fetch_link: makeFetchLinkHandler(linkFetcherService),
    get_recent_insights: makeGetRecentInsightsHandler(insightSessionService),
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
  makeResolveMbidHandler,
  makeFetchLinkHandler,
  makeGetRecentInsightsHandler,
};
