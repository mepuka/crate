/**
 * FAISS Search API Client
 *
 * HTTP client service for interacting with the Python FAISS search API.
 * Provides type-safe access to semantic search, timeline, and play endpoints.
 *
 * Includes circuit breaker protection to prevent cascading failures when
 * the FAISS API is unavailable.
 */

import { Data, Effect, Schema, Duration, Option } from "effect";
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

// Daily summary persistence schemas
const TokenUsageSchema = Schema.Struct({
  inputTokens: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  outputTokens: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  cacheReadTokens: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  cacheWriteTokens: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  totalTokens: Schema.optionalWith(Schema.Number, { default: () => 0 }),
});

const SaveResearchRequest = Schema.Struct({
  date: Schema.String,
  research_context: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  duration_ms: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  tool_call_count: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  token_usage: Schema.optional(TokenUsageSchema),
});

const SaveResearchResponse = Schema.Struct({
  id: Schema.Number,
  date: Schema.String,
  status: Schema.String,
});

const SaveSummaryRequest = Schema.Struct({
  date: Schema.String,
  summary: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  research_id: Schema.Number,
});

const SaveSummaryResponse = Schema.Struct({
  id: Schema.Number,
  date: Schema.String,
  status: Schema.String,
  regenerated_count: Schema.Number,
});

// Schema for GET /api/research/{date} response
const GetDailyResearchResponse = Schema.Struct({
  id: Schema.Number,
  date: Schema.String,
  research_context: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  created_at: Schema.String,
  duration_ms: Schema.NullOr(Schema.Number),
  tool_call_count: Schema.Number,
});

// Schema for GET /api/summary/{date} response
const GetDailySummaryResponse = Schema.Struct({
  id: Schema.Number,
  date: Schema.String,
  summary: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  plays: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  created_at: Schema.String,
  regenerated_count: Schema.Number,
});

export type SaveResearchRequest = typeof SaveResearchRequest.Type;
export type SaveResearchResponse = typeof SaveResearchResponse.Type;
export type SaveSummaryRequest = typeof SaveSummaryRequest.Type;
export type SaveSummaryResponse = typeof SaveSummaryResponse.Type;
export type GetDailyResearchResponse = typeof GetDailyResearchResponse.Type;
export type GetDailySummaryResponse = typeof GetDailySummaryResponse.Type;

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
      HttpClient.retryTransient({ times: 3 }),
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
            Effect.flatMap((response) =>
              Effect.if(response.status >= 200 && response.status < 300, {
                onTrue: () =>
                  HttpClientResponse.schemaBodyJson(InsightsResponse)(response).pipe(
                    Effect.mapError(
                      (error) =>
                        new FaissApiError({
                          message: "Post insights failed",
                          cause: error,
                        })
                    )
                  ),
                onFalse: () =>
                  response.text.pipe(
                    Effect.mapError(
                      (error) =>
                        new FaissApiError({
                          message: "Post insights failed",
                          cause: error,
                        })
                    ),
                    Effect.flatMap((errorBody) =>
                      Effect.fail(
                        new FaissApiError({
                          message: `HTTP ${response.status}: ${errorBody}`,
                        })
                      )
                    )
                  ),
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
       * Save daily research context (Phase 1 output)
       * Protected by circuit breaker
       *
       * Persists the research findings from the research agent to the database.
       * Upserts by date - if research exists for this date, it will be updated.
       *
       * @param date - Date in YYYY-MM-DD format
       * @param researchContext - Full research context object
       * @param durationMs - How long research phase took
       * @param toolCallCount - Number of tool calls made during research
       * @param tokenUsage - Optional token usage statistics
       */
      saveDailyResearch: (
        date: string,
        researchContext: Record<string, unknown>,
        durationMs: number = 0,
        toolCallCount: number = 0,
        tokenUsage?: typeof TokenUsageSchema.Type
      ) =>
        withProtection(
          client
            .post("/api/summary/research", {
              body: HttpBody.unsafeJson({
                date,
                research_context: researchContext,
                duration_ms: durationMs,
                tool_call_count: toolCallCount,
                token_usage: tokenUsage,
              }),
            })
            .pipe(
              Effect.flatMap(
                HttpClientResponse.schemaBodyJson(SaveResearchResponse)
              ),
              Effect.mapError(
                (error) =>
                  new FaissApiError({
                    message: `Save daily research failed`,
                    cause: error,
                  })
              )
            )
        ),

      /**
       * Save daily summary (Phase 2 output)
       * Protected by circuit breaker
       *
       * Persists the final summary from the writer agent to the database.
       * Upserts by date - if summary exists for this date, it will be updated.
       *
       * @param date - Date in YYYY-MM-DD format
       * @param summary - Full summary object
       * @param researchId - Reference to the research phase ID
       */
      saveDailySummary: (
        date: string,
        summary: Record<string, unknown>,
        researchId: number
      ) =>
        withProtection(
          client
            .post("/api/summary/save", {
              body: HttpBody.unsafeJson({
                date,
                summary,
                research_id: researchId,
              }),
            })
            .pipe(
              Effect.flatMap(
                HttpClientResponse.schemaBodyJson(SaveSummaryResponse)
              ),
              Effect.mapError(
                (error) =>
                  new FaissApiError({
                    message: `Save daily summary failed`,
                    cause: error,
                  })
              )
            )
        ),

      /**
       * Get daily research by date
       * Protected by circuit breaker
       *
       * Returns Option.some with research if found, Option.none if not found.
       * Throws FaissApiError for other failures.
       *
       * @param date - Date in YYYY-MM-DD format
       */
      getDailyResearch: (date: string) =>
        withProtection(
          client
            .get(`/api/research/${date}`)
            .pipe(
              Effect.flatMap((response) =>
                response.status === 404
                  ? Effect.succeed(Option.none<GetDailyResearchResponse>())
                  : HttpClientResponse.schemaBodyJson(GetDailyResearchResponse)(response).pipe(
                      Effect.map(Option.some)
                    )
              ),
              Effect.mapError(
                (error) =>
                  new FaissApiError({
                    message: `Get daily research failed for ${date}`,
                    cause: error,
                  })
              )
            )
        ),

      /**
       * Get daily summary by date
       * Protected by circuit breaker
       *
       * Returns Option.some with the summary if found, Option.none if not found.
       * Throws FaissApiError for other failures.
       *
       * @param date - Date in YYYY-MM-DD format
       */
      getDailySummary: (date: string) =>
        withProtection(
          client
            .get(`/api/summary/${date}`)
            .pipe(
              Effect.flatMap((response) =>
                response.status === 404
                  ? Effect.succeed(Option.none<GetDailySummaryResponse>())
                  : HttpClientResponse.schemaBodyJson(GetDailySummaryResponse)(response).pipe(
                      Effect.map(Option.some)
                    )
              ),
              Effect.mapError(
                (error) =>
                  new FaissApiError({
                    message: `Get daily summary failed for ${date}`,
                    cause: error,
                  })
              )
            )
        ),

      /**
       * Check if daily summary exists for a date
       * Protected by circuit breaker
       *
       * @param date - Date in YYYY-MM-DD format
       * @returns true if summary exists, false otherwise
       */
      dailySummaryExists: (date: string) =>
        withProtection(
          client
            .get(`/api/summary/${date}`)
            .pipe(
              Effect.map((response) => response.status !== 404),
              Effect.mapError(
                (error) =>
                  new FaissApiError({
                    message: `Check daily summary exists failed for ${date}`,
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
