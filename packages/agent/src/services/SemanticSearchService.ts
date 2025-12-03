/**
 * SemanticSearchService
 *
 * Wraps the FAISS API /api/search endpoint for vector similarity search.
 * Enables natural language queries to find semantically similar music.
 *
 * @module
 */

import { Context, Effect, Layer } from "effect"
import { HttpBody, HttpClient, HttpClientResponse, FetchHttpClient } from "@effect/platform"
import { SearchResponse } from "@crate/domain/faiss/schemas"
import { FaissConfig } from "../config.js"
import { SemanticSearchError } from "./errors.js"
import { makeJsonClient } from "./http-utils.js"

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Parameters for semantic search
 */
export interface SemanticSearchParams {
  /** Natural language query (e.g., "upbeat jazz fusion") */
  readonly query: string
  /** Maximum number of results (1-100, default 20) */
  readonly limit?: number
  /** Pagination offset (default 0) */
  readonly offset?: number
}

/**
 * SemanticSearchService interface
 */
export interface SemanticSearchServiceInterface {
  /**
   * Perform semantic search using vector similarity
   *
   * @param params - Search parameters including query and optional limit/offset
   * @returns Search results ranked by semantic similarity
   */
  readonly search: (
    params: SemanticSearchParams
  ) => Effect.Effect<typeof SearchResponse.Type, SemanticSearchError>
}

// =============================================================================
// Service Tag
// =============================================================================

/**
 * SemanticSearchService - semantic/vector similarity search via FAISS API
 */
export class SemanticSearchService extends Context.Tag("SemanticSearchService")<
  SemanticSearchService,
  SemanticSearchServiceInterface
>() {}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Create the SemanticSearchService implementation
 */
const makeSemanticSearchService = Effect.gen(function* () {
  const config = yield* FaissConfig
  const client = yield* makeJsonClient(config.baseUrl)

  const search = (
    params: SemanticSearchParams
  ): Effect.Effect<typeof SearchResponse.Type, SemanticSearchError> => {
    // Build request body
    const body = {
      query: params.query,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0
    }

    return client.post("/api/search", {
      body: HttpBody.unsafeJson(body)
    }).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(SearchResponse)),
      Effect.mapError((error) =>
        new SemanticSearchError({
          message: "Semantic search failed",
          query: params.query,
          cause: error
        })
      )
    )
  }

  return {
    search
  } satisfies SemanticSearchServiceInterface
})

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for SemanticSearchService
 * Requires FaissConfig and HttpClient
 */
export const SemanticSearchServiceLive: Layer.Layer<
  SemanticSearchService,
  never,
  FaissConfig | HttpClient.HttpClient
> = Layer.effect(SemanticSearchService, makeSemanticSearchService)

/**
 * Fully composed layer with all dependencies
 * Uses FetchHttpClient for cross-platform compatibility (Node, Bun, Browser)
 *
 * Note: May fail with ConfigError if FAISS_API_URL env var is missing
 */
export const SemanticSearchServiceFull = SemanticSearchServiceLive.pipe(
  Layer.provide(FaissConfig.Default),
  Layer.provide(FetchHttpClient.layer)
)

/**
 * Test layer with mock implementation
 */
export const SemanticSearchServiceTest: Layer.Layer<SemanticSearchService> = Layer.succeed(
  SemanticSearchService,
  {
    search: (params) =>
      Effect.succeed({
        results: [],
        total: 0,
        query_time_ms: 0,
        query: params.query
      })
  } satisfies SemanticSearchServiceInterface
)
