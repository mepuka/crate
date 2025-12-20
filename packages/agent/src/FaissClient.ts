/**
 * FAISS Search API Client
 *
 * HTTP client service for interacting with the Python FAISS search API.
 * Provides type-safe access to semantic search, timeline, and play endpoints.
 *
 * Includes circuit breaker protection to prevent cascading failures when
 * the FAISS API is unavailable.
 */

import { Data, Effect, Schema, Duration } from "effect";
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import * as CircuitBreaker from "./services/CircuitBreaker.js";
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
  UnprocessedPlaysResponse,
} from "@crate/domain/faiss/schemas";
import type { Insight } from "./prompts/insights.js";
import { FaissConfig } from "./config.js";
export { FaissConfig } from "./config.js";

// Generated asset schemas (mirrors server schemas)
const StoreGeneratedAssetRequest = Schema.Struct({
  play_id: Schema.optional(Schema.Number),
  asset_type: Schema.String,
  params_hash: Schema.String,
  generation_params: Schema.optional(Schema.String),
  image_base64: Schema.String,
  mime_type: Schema.optionalWith(Schema.String, { default: () => "image/png" }),
  era: Schema.optional(Schema.String),
  style: Schema.optional(Schema.String),
  model_notes: Schema.optional(Schema.String),
  prompt_used: Schema.optional(Schema.String),
  gcs_url: Schema.optional(Schema.String),
});

const StoreGeneratedAssetResponse = Schema.Struct({
  id: Schema.Number,
  params_hash: Schema.String,
  was_existing: Schema.Boolean,
});

export type StoreGeneratedAssetRequest = typeof StoreGeneratedAssetRequest.Type;
export type StoreGeneratedAssetResponse = typeof StoreGeneratedAssetResponse.Type;

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
 * FAISS API client service
 *
 * Protected by circuit breaker to prevent cascading failures.
 * Circuit opens after 5 failures, half-opens after 60s, closes after 2 successes.
 */
export class FaissClient extends Effect.Service<FaissClient>()("FaissClient", {
  effect: Effect.gen(function* () {
    const config = yield* FaissConfig;

    // Create circuit breaker for FAISS API
    const breaker = yield* CircuitBreaker.make({
      name: "FaissAPI",
      failureThreshold: 5,
      successThreshold: 2,
      resetTimeout: Duration.seconds(60),
    });

    yield* Effect.log("FaissClient: Circuit breaker initialized");

    // Configure HTTP client with base URL and defaults
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(config.baseUrl)),
      HttpClient.mapRequest(HttpClientRequest.acceptJson),
      HttpClient.mapRequest((req) =>
        config.apiKey
          ? HttpClientRequest.setHeader("X-API-Key", config.apiKey)(req)
          : req
      )
    );

    /**
     * Wrap effect with timeout and circuit breaker protection
     */
    const withProtection = <A, E, R>(
      effect: Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | FaissApiError | CircuitBreaker.CircuitOpenError, R> =>
      breaker.protect(
        effect.pipe(
          Effect.timeoutFail({
            duration: config.timeout,
            onTimeout: () =>
              new FaissApiError({
                message: "FAISS request timed out",
              }),
          })
        )
      );

    // Legacy withTimeout for backwards compatibility (no circuit breaker)
    const withTimeout = <A, E, R>(
      effect: Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | FaissApiError, R> =>
      effect.pipe(
        Effect.timeoutFail({
          duration: config.timeout,
          onTimeout: () =>
            new FaissApiError({
              message: "FAISS request timed out",
            }),
        })
      );

    return {
      /**
       * Perform semantic search for music tracks
       * Protected by circuit breaker
       */
      search: (request: SearchParams) =>
        withProtection(
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
          )
        ),

      /**
       * Perform hybrid search (FTS5 + FAISS with RRF)
       * Protected by circuit breaker
       */
      hybridSearch: (request: typeof HybridSearchParams.Type) =>
        withProtection(
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
          )
        ),

      /**
       * Get timeline of plays with cursor-based pagination
       * Protected by circuit breaker
       */
      timeline: (request: TimelineParams) =>
        withProtection(
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
          )
        ),

      /**
       * Get a single play by ID
       * Protected by circuit breaker
       */
      getPlay: (id: number) =>
        withProtection(
          client.get(`/api/plays/${id}`).pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(PlayResultSchema)),
            Effect.mapError(
              (error) =>
                new FaissApiError({
                  message: "Get play failed",
                  cause: error,
                })
            )
          )
        ),

      /**
       * Health check (not protected by circuit breaker - used to test service)
       */
      health: () =>
        withTimeout(
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
          )
        ),

      /**
       * Fetch multiple plays by IDs
       * Protected by circuit breaker
       */
      getPlaysBatch: (playIds: number[]) =>
        withProtection(
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
          )
        ),

      /**
       * POST enrichments back to FAISS API (legacy untyped endpoint)
       * Protected by circuit breaker
       */
      postEnrichments: (request: EnrichmentRequest) =>
        withProtection(
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
          )
        ),

      /**
       * POST typed insights to FAISS API
       * Protected by circuit breaker
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
        withProtection(
          client
            .post("/api/insights", {
              body: HttpBody.unsafeJson({
                insights,
                ...(evalContext && { eval_context: evalContext }),
              }),
          })
          .pipe(
            Effect.flatMap((response) => {
              // For successful responses, parse as InsightsResponse
              if (response.status >= 200 && response.status < 300) {
                return HttpClientResponse.schemaBodyJson(InsightsResponse)(response);
              }
              // For error responses, read body and fail with descriptive error
              return Effect.gen(function* () {
                const errorBody = yield* response.text;
                return yield* Effect.fail(
                  new Error(`HTTP ${response.status}: ${errorBody}`)
                );
              });
            }),
            Effect.mapError(
              (error) =>
                new FaissApiError({
                  message: error instanceof Error ? error.message : "Post insights failed",
                  cause: error,
                })
            )
          )
        ),

      /**
       * GET insights for a specific play
       * Protected by circuit breaker
       *
       * Fetches all previously generated insights for a play from the database.
       * Used to pre-seed session context so the agent can see its own past work.
       */
      getInsightsForPlay: (playId: number) =>
        withProtection(
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
          )
        ),

      /**
       * GET recent insights across all plays (temporal context)
       * Protected by circuit breaker
       *
       * Fetches the most recent N insights from the database.
       * Used to seed session with temporal context so the agent can
       * see what it has been producing recently.
       */
      getRecentInsights: (limit: number = 20) =>
        withProtection(
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
          )
        ),

      /**
       * GET insights from plays within a time window (same show context)
       * Protected by circuit breaker
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
        withProtection(
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
          )
        ),

      /**
       * GET plays without insights (for Cloud Scheduler batch enrichment)
       * Protected by circuit breaker
       *
       * Returns play IDs that haven't been enriched with insights yet.
       * Used by Cloud Scheduler to trigger periodic batch enrichment jobs.
       *
       * @param limit - Maximum number of play IDs to return (default 50, max 500)
       * @param strategy - Selection strategy: "oldest_first" (default), "newest_first", or "random"
       * @param minPlayId - Optional minimum play ID filter for incremental processing
       */
      getUnprocessedPlays: (
        limit: number = 50,
        strategy: "oldest_first" | "newest_first" | "random" = "oldest_first",
        minPlayId?: number
      ) =>
        withProtection(
          client
            .get(`/api/plays/unprocessed`, {
              urlParams: {
                limit: limit.toString(),
                strategy,
                ...(minPlayId !== undefined && { min_play_id: minPlayId.toString() }),
              },
            })
            .pipe(
              Effect.flatMap(
                HttpClientResponse.schemaBodyJson(UnprocessedPlaysResponse)
              ),
              Effect.mapError(
                (error) =>
                  new FaissApiError({
                    message: `Get unprocessed plays failed`,
                    cause: error,
                  })
              )
            )
        ),

      /**
       * Store a generated asset (liner note, enhanced art, etc.)
       * Protected by circuit breaker
       *
       * Stores asset metadata in the database. If a GCS URL is provided,
       * the frontend will use it for production serving; otherwise falls
       * back to base64 data URL.
       */
      storeGeneratedAsset: (request: StoreGeneratedAssetRequest) =>
        withProtection(
          client
            .post("/api/generated-assets", {
              body: HttpBody.unsafeJson(request),
            })
            .pipe(
              Effect.flatMap(
                HttpClientResponse.schemaBodyJson(StoreGeneratedAssetResponse)
              ),
              Effect.mapError(
                (error) =>
                  new FaissApiError({
                    message: `Store generated asset failed`,
                    cause: error,
                  })
              )
            )
        ),

      /**
       * Get circuit breaker state (for monitoring)
       */
      getCircuitState: breaker.getState,
    };
  }),
  dependencies: [FaissConfig.Default, FetchHttpClient.layer],
}) {}

// Re-export CircuitOpenError for callers to handle
export { CircuitOpenError } from "./services/CircuitBreaker.js";

/**
 * Complete FAISS client layer with all dependencies
 */
export const FaissClientLive = FaissClient.Default;
