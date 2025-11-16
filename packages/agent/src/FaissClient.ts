/**
 * FAISS Search API Client
 *
 * HTTP client service for interacting with the Python FAISS search API.
 * Provides type-safe access to semantic search, timeline, and play endpoints.
 */

import { Config, Data, Effect, Schema } from "effect"
import { HttpBody, HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform"
import { NodeHttpClient } from "@effect/platform-node"
import {
  PlayResult as PlayResultSchema,
  SearchParams,
  SearchResponse as SearchResponseSchema,
  TimelineParams,
  TimelineResponse as TimelineResponseSchema
} from "@crate/domain/faiss/schemas"

// Export type aliases for convenience
export type PlayResult = typeof PlayResultSchema.Type
export type SearchResponse = typeof SearchResponseSchema.Type
export type TimelineResponse = typeof TimelineResponseSchema.Type

/**
 * Tagged error for FAISS API failures
 */
export class FaissApiError extends Data.TaggedError("FaissApiError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Configuration for FAISS API
 */
export class FaissConfig extends Effect.Service<FaissConfig>()("FaissConfig", {
  effect: Effect.gen(function* () {
    const baseUrl = yield* Config.string("FAISS_API_URL").pipe(
      Config.withDefault("http://localhost:8000")
    )
    return { baseUrl }
  })
}) {}

/**
 * FAISS API client service
 */
export class FaissClient extends Effect.Service<FaissClient>()("FaissClient", {
  effect: Effect.gen(function* () {
    const config = yield* FaissConfig

    // Configure HTTP client with base URL and defaults
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(config.baseUrl)),
      HttpClient.mapRequest(HttpClientRequest.acceptJson)
    )

    return {
      /**
       * Perform semantic search for music tracks
       */
      search: (request: SearchParams) =>
        client.post("/api/search", {
          body: HttpBody.unsafeJson(request)
        }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(SearchResponseSchema)),
          Effect.mapError((error) =>
            new FaissApiError({
              message: "Search failed",
              cause: error
            })
          )
        ),

      /**
       * Get timeline of plays with cursor-based pagination
       */
      timeline: (request: TimelineParams) =>
        client.get("/api/plays/timeline", {
          urlParams: request
        }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(TimelineResponseSchema)),
          Effect.mapError((error) =>
            new FaissApiError({
              message: "Timeline fetch failed",
              cause: error
            })
          )
        ),

      /**
       * Get a single play by ID
       */
      getPlay: (id: number) =>
        client.get(`/api/plays/${id}`).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(PlayResultSchema)),
          Effect.mapError((error) =>
            new FaissApiError({
              message: "Get play failed",
              cause: error
            })
          )
        ),

      /**
       * Health check
       */
      health: () =>
        client.get("/api/health").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(
            Schema.Struct({
              status: Schema.String
            })
          )),
          Effect.mapError((error) =>
            new FaissApiError({
              message: "Health check failed",
              cause: error
            })
          )
        )
    }
  }),
  dependencies: [FaissConfig.Default, NodeHttpClient.layerUndici]
}) {}

/**
 * Complete FAISS client layer with all dependencies
 */
export const FaissClientLive = FaissClient.Default
