/**
 * Tool Handlers for Crate Research Agent
 *
 * Wires tool definitions to their service implementations.
 * Uses @effect/ai Toolkit.toLayer() pattern for handler registration.
 *
 * @module
 */

import { Effect } from "effect"
import { Toolkit } from "@effect/ai"
import { CrateToolkit } from "./definitions.js"
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
  GetRecentInsightsResponse
} from "./schemas.js"
import { transformPlayResult } from "../services/http-utils.js"

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
  type LinkFetcherServiceInterface
} from "../services/index.js"

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

/**
 * Handler type extracted from CrateToolkit
 */
export type CrateToolHandlers = Toolkit.HandlersFrom<Toolkit.Tools<typeof CrateToolkit>>

// =============================================================================
// Handler Factory Functions
// =============================================================================

/**
 * Create handler for search_plays tool
 *
 * Wires to SearchPlaysService.timeline() and transforms response
 * to match the tool's expected output schema.
 */
const makeSearchPlaysHandler = (
  service: SearchPlaysServiceInterface
) => (
  params: SearchPlaysParams
): Effect.Effect<SearchPlaysResponse> =>
  Effect.gen(function* () {
    // Build timeline params, only including defined values
    const timelineParams: {
      limit?: number
      artistMbid?: string
      recordingMbid?: string
      since?: string
      until?: string
    } = {}

    if (params.limit !== undefined) timelineParams.limit = params.limit
    if (params.artist_mbid !== undefined) timelineParams.artistMbid = params.artist_mbid
    if (params.recording_mbid !== undefined) timelineParams.recordingMbid = params.recording_mbid
    if (params.since !== undefined) timelineParams.since = params.since
    if (params.until !== undefined) timelineParams.until = params.until

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
          _error: error.message
        })
      )
    )

    // Transform timeline response to match SearchPlaysResponse schema
    // Uses shared transformPlayResult for Date -> ISO string conversion
    const results = response.results.map((play) => transformPlayResult(play, 1.0))

    return {
      results,
      total: response.total_count ?? response.results.length,
      query_time_ms: response.query_time_ms,
      query: params.query
    } satisfies SearchPlaysResponse
  })

/**
 * Create handler for semantic_search tool
 *
 * Wires to SemanticSearchService.search() and transforms response
 * to match the tool's expected output schema.
 */
const makeSemanticSearchHandler = (
  service: SemanticSearchServiceInterface
) => (
  params: SemanticSearchParams
): Effect.Effect<SemanticSearchResponse> =>
  Effect.gen(function* () {
    const response = yield* service.search({
      query: params.query,
      limit: params.limit
    }).pipe(
      // Map service error to success with empty results for tool robustness
      Effect.catchAll((error) =>
        Effect.succeed({
          results: [],
          total: 0,
          query_time_ms: 0,
          query: params.query,
          _error: error.message
        })
      )
    )

    // Transform to match tool schema - uses shared transformPlayResult
    const results = response.results.map((play) => transformPlayResult(play))

    return {
      results,
      total: response.total,
      query_time_ms: response.query_time_ms,
      query: response.query
    } satisfies SemanticSearchResponse
  })

/**
 * Create handler for resolve_mbid tool
 *
 * Wires to MbidResolverService.resolve()
 */
const makeResolveMbidHandler = (
  service: MbidResolverServiceInterface
) => (
  params: ResolveMbidParams
): Effect.Effect<ResolveMbidResponse> =>
  Effect.gen(function* () {
    const response = yield* service.resolve(params).pipe(
      // Map service error to success with empty results for tool robustness
      Effect.catchAll((error) =>
        Effect.succeed({
          results: [],
          query: params.query,
          entity_type: params.entity_type,
          _error: error.message
        })
      )
    )

    return {
      results: response.results,
      query: response.query,
      entity_type: response.entity_type
    } satisfies ResolveMbidResponse
  })

/**
 * Create handler for fetch_link tool
 *
 * Wires to LinkFetcherService.fetch()
 */
const makeFetchLinkHandler = (
  service: LinkFetcherServiceInterface
) => (
  params: FetchLinkParams
): Effect.Effect<FetchLinkResponse> =>
  Effect.gen(function* () {
    const response = yield* service.fetch(params).pipe(
      // Map service error to success with error content for tool robustness
      Effect.catchAll((error) =>
        Effect.succeed({
          url: params.url,
          title: "Error fetching content",
          content: `Failed to fetch content: ${error.message}`,
          word_count: 0,
          links: []
        })
      )
    )

    return response satisfies FetchLinkResponse
  })

/**
 * Create handler for get_recent_insights tool
 *
 * Wires to InsightSessionService.getRecentInsights()
 * Transforms session response to match tool schema (sessionId -> session_id)
 */
const makeGetRecentInsightsHandler = (
  service: InsightSessionServiceInterface
) => (
  params: GetRecentInsightsParams
): Effect.Effect<GetRecentInsightsResponse> =>
  Effect.gen(function* () {
    // Ref operations never fail, so no error handling needed
    const response = yield* service.getRecentInsights(params)

    // Transform sessionId to session_id for schema compliance
    return {
      insights: [...response.insights],
      total: response.total,
      session_id: response.sessionId
    } satisfies GetRecentInsightsResponse
  })

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
  const searchPlaysService = yield* SearchPlaysService
  const semanticSearchService = yield* SemanticSearchService
  const mbidResolverService = yield* MbidResolverService
  const linkFetcherService = yield* LinkFetcherService
  const insightSessionService = yield* InsightSessionService

  // Build handlers that close over the services
  return CrateToolkit.of({
    search_plays: makeSearchPlaysHandler(searchPlaysService),
    semantic_search: makeSemanticSearchHandler(semanticSearchService),
    resolve_mbid: makeResolveMbidHandler(mbidResolverService),
    fetch_link: makeFetchLinkHandler(linkFetcherService),
    get_recent_insights: makeGetRecentInsightsHandler(insightSessionService)
  })
})

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
export const CrateToolHandlersLayer = CrateToolkit.toLayer(makeCrateToolHandlers)

// =============================================================================
// Exports
// =============================================================================

export {
  makeSearchPlaysHandler,
  makeSemanticSearchHandler,
  makeResolveMbidHandler,
  makeFetchLinkHandler,
  makeGetRecentInsightsHandler
}
