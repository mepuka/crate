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
  GetRecentInsightsResponse,
  PlayResult
} from "./schemas.js"

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
    // Domain uses Date objects, tool schemas use ISO strings
    const results: PlayResult[] = response.results.map((play) => ({
      id: play.id,
      artist: play.artist,
      song: play.song,
      similarity: play.similarity ?? 1.0, // Timeline doesn't have similarity scores
      album: play.album,
      // Convert Date to ISO string
      airdate: play.airdate instanceof Date ? play.airdate.toISOString() : String(play.airdate),
      // Convert Date | null to string | null
      release_date: play.release_date instanceof Date ? play.release_date.toISOString() : play.release_date,
      labels: [...play.labels],
      rotation_status: play.rotation_status,
      is_local: play.is_local,
      is_live: play.is_live,
      is_request: play.is_request,
      comment: play.comment,
      show: play.show,
      image_uri: play.image_uri,
      thumbnail_uri: play.thumbnail_uri,
      artist_mbid: [...play.artist_mbid],
      recording_mbid: play.recording_mbid,
      release_mbid: play.release_mbid,
      release_group_mbid: play.release_group_mbid
    }))

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

    // Transform to match tool schema - convert Date to string
    const results: PlayResult[] = response.results.map((play) => ({
      id: play.id,
      artist: play.artist,
      song: play.song,
      similarity: play.similarity,
      album: play.album,
      airdate: play.airdate instanceof Date ? play.airdate.toISOString() : String(play.airdate),
      release_date: play.release_date instanceof Date ? play.release_date.toISOString() : play.release_date,
      labels: [...play.labels],
      rotation_status: play.rotation_status,
      is_local: play.is_local,
      is_live: play.is_live,
      is_request: play.is_request,
      comment: play.comment,
      show: play.show,
      image_uri: play.image_uri,
      thumbnail_uri: play.thumbnail_uri,
      artist_mbid: [...play.artist_mbid],
      recording_mbid: play.recording_mbid,
      release_mbid: play.release_mbid,
      release_group_mbid: play.release_group_mbid
    }))

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
    const response = yield* service.getRecentInsights(params).pipe(
      // Map service error to success with empty insights for tool robustness
      Effect.catchAll((error) =>
        Effect.succeed({
          insights: [],
          total: 0,
          sessionId: "error",
          _error: error.message
        })
      )
    )

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
