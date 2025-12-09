/**
 * FAISS Search API Client
 *
 * HTTP client service for interacting with the Python FAISS search API.
 * Provides type-safe access to semantic search, timeline, and play endpoints.
 */

import { Config, Data, Effect, Schema } from "effect";
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import {
  BatchPlaysResponse,
  EnrichmentRequest,
  EnrichmentResponse,
  GetInsightsResponse,
  InsightsResponse,
  PlayInsightsResponse,
  PlayResult as PlayResultSchema,
  SearchParams,
  SearchResponse as SearchResponseSchema,
  TimelineParams,
  TimelineResponse as TimelineResponseSchema,
  EvalContext,
  HybridSearchParams,
  HybridSearchResponse as HybridSearchResponseSchema,
} from "@crate/domain/faiss/schemas";
import type { Insight } from "./prompts/insights.js";

// Export type aliases for convenience
export type PlayResult = typeof PlayResultSchema.Type;
export type SearchResponse = typeof SearchResponseSchema.Type;
export type TimelineResponse = typeof TimelineResponseSchema.Type;
export type HybridSearchResponse = typeof HybridSearchResponseSchema.Type;

/**
 * Tagged error for FAISS API failures
 */
export class FaissApiError extends Data.TaggedError("FaissApiError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Configuration for FAISS API
 */
export class FaissConfig extends Effect.Service<FaissConfig>()("FaissConfig", {
  effect: Effect.gen(function* () {
    const baseUrl = yield* Config.string("FAISS_API_URL").pipe(
      Config.withDefault("http://localhost:8000")
    );
    return { baseUrl };
  }),
}) {}

/**
 * FAISS API client service
 */
export class FaissClient extends Effect.Service<FaissClient>()("FaissClient", {
  effect: Effect.gen(function* () {
    const config = yield* FaissConfig;

    // Configure HTTP client with base URL and defaults
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(config.baseUrl)),
      HttpClient.mapRequest(HttpClientRequest.acceptJson)
    );

    return {
      /**
       * Perform semantic search for music tracks
       */
      search: (request: SearchParams) =>
        client
          .post("/api/search", {
            body: HttpBody.unsafeJson(request),
          })
          .pipe(
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(SearchResponseSchema)
            ),
            Effect.mapError(
              (error) =>
                new FaissApiError({
                  message: "Search failed",
                  cause: error,
                })
            )
          ),

      /**
       * Perform hybrid search (FTS5 + FAISS with RRF)
       */
      hybridSearch: (request: typeof HybridSearchParams.Type) =>
        client
          .post("/api/search/hybrid", {
            body: HttpBody.unsafeJson(request),
          })
          .pipe(
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(HybridSearchResponseSchema)
            ),
            Effect.mapError(
              (error) =>
                new FaissApiError({
                  message: "Hybrid search failed",
                  cause: error,
                })
            )
          ),

      /**
       * Get timeline of plays with cursor-based pagination
       */
      timeline: (request: TimelineParams) =>
        client
          .get("/api/plays/timeline", {
            urlParams: request,
          })
          .pipe(
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(TimelineResponseSchema)
            ),
            Effect.mapError(
              (error) =>
                new FaissApiError({
                  message: "Timeline fetch failed",
                  cause: error,
                })
            )
          ),

      /**
       * Get a single play by ID
       */
      getPlay: (id: number) =>
        client.get(`/api/plays/${id}`).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(PlayResultSchema)),
          Effect.mapError(
            (error) =>
              new FaissApiError({
                message: "Get play failed",
                cause: error,
              })
          )
        ),

      /**
       * Health check
       */
      health: () =>
        client.get("/api/health").pipe(
          Effect.flatMap(
            HttpClientResponse.schemaBodyJson(
              Schema.Struct({
                status: Schema.String,
              })
            )
          ),
          Effect.mapError(
            (error) =>
              new FaissApiError({
                message: "Health check failed",
                cause: error,
              })
          )
        ),

      /**
       * Fetch multiple plays by IDs
       */
      getPlaysBatch: (playIds: number[]) =>
        client
          .get("/api/plays/batch", {
            urlParams: { play_ids: playIds.join(",") },
          })
          .pipe(
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(BatchPlaysResponse)
            ),
            Effect.mapError(
              (error) =>
                new FaissApiError({
                  message: "Batch fetch failed",
                  cause: error,
                })
            )
          ),

      /**
       * POST enrichments back to FAISS API (legacy untyped endpoint)
       */
      postEnrichments: (request: EnrichmentRequest) =>
        client
          .post("/api/enrichments", {
            body: HttpBody.unsafeJson(request),
          })
          .pipe(
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(EnrichmentResponse)
            ),
            Effect.mapError(
              (error) =>
                new FaissApiError({
                  message: "Post enrichments failed",
                  cause: error,
                })
            )
          ),

      /**
       * POST typed insights to FAISS API
       *
       * This endpoint provides type-safe storage with:
       * - Pydantic validation of insight structure
       * - MBID extraction for efficient entity queries
       * - Auto-generated summaries
       * - Optional eval_context for evaluation/debugging
       */
      postInsights: (
        insights: readonly Insight[],
        evalContext?: typeof EvalContext.Type
      ) =>
        client
          .post("/api/insights", {
            body: HttpBody.unsafeJson({
              insights,
              ...(evalContext && { eval_context: evalContext }),
            }),
          })
          .pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(InsightsResponse)),
            Effect.mapError(
              (error) =>
                new FaissApiError({
                  message: "Post insights failed",
                  cause: error,
                })
            )
          ),

      /**
       * GET insights for a specific play
       *
       * Fetches all previously generated insights for a play from the database.
       * Used to pre-seed session context so the agent can see its own past work.
       */
      getInsightsForPlay: (playId: number) =>
        client.get(`/api/insights/plays/${playId}`).pipe(
          Effect.flatMap(
            HttpClientResponse.schemaBodyJson(PlayInsightsResponse)
          ),
          Effect.mapError(
            (error) =>
              new FaissApiError({
                message: `Get insights for play ${playId} failed`,
                cause: error,
              })
          )
        ),

      /**
       * GET recent insights across all plays (temporal context)
       *
       * Fetches the most recent N insights from the database.
       * Used to seed session with temporal context so the agent can
       * see what it has been producing recently.
       */
      getRecentInsights: (limit: number = 20) =>
        client.get(`/api/insights?limit=${limit}`).pipe(
          Effect.flatMap(
            HttpClientResponse.schemaBodyJson(GetInsightsResponse)
          ),
          Effect.mapError(
            (error) =>
              new FaissApiError({
                message: `Get recent insights failed`,
                cause: error,
              })
          )
        ),

      /**
       * GET insights from plays within a time window (same show context)
       *
       * Fetches insights for plays aired within ±windowHours of the given play.
       * This provides temporal context from the same DJ show, enabling the agent
       * to see what insights were produced for nearby plays on the timeline.
       *
       * @param playId - The center play to build context around
       * @param windowHours - Hours before/after to include (default 3 = typical show length)
       * @param limit - Maximum insights to return (default 20)
       */
      getInsightsForContext: (
        playId: number,
        windowHours: number = 3,
        limit: number = 20
      ) =>
        client
          .get(`/api/insights/context`, {
            urlParams: {
              play_id: playId.toString(),
              window_hours: windowHours.toString(),
              limit: limit.toString(),
            },
          })
          .pipe(
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(GetInsightsResponse)
            ),
            Effect.mapError(
              (error) =>
                new FaissApiError({
                  message: `Get context insights for play ${playId} failed`,
                  cause: error,
                })
            )
          ),
    };
  }),
  dependencies: [FaissConfig.Default, FetchHttpClient.layer],
}) {}

/**
 * Complete FAISS client layer with all dependencies
 */
export const FaissClientLive = FaissClient.Default;
