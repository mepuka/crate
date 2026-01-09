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
import { SearchResponse, HybridSearchResponse } from "@crate/domain/faiss/schemas"
import { FaissConfig } from "../config.js"
import { SemanticSearchError, HybridSearchError } from "./errors.js"
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
 * Parameters for hybrid search (FTS5 + FAISS with RRF)
 */
export interface HybridSearchParams {
  /** Natural language query */
  readonly query: string
  /** Maximum number of results (1-100, default 20) */
  readonly limit?: number
  /** BM25 weight for keyword matching (0-1, default 0.5) */
  readonly bm25_weight?: number
  /** FAISS weight for semantic matching (0-1, default 0.5) */
  readonly faiss_weight?: number
  /** Use query expansion (default false) */
  readonly use_expansion?: boolean
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

  /**
   * Perform hybrid search using FTS5 keyword matching + FAISS semantic similarity
   *
   * @param params - Search parameters including query, weights, and optional limit
   * @returns Search results ranked by RRF fusion score
   */
  readonly hybridSearch: (
    params: HybridSearchParams
  ) => Effect.Effect<typeof HybridSearchResponse.Type, HybridSearchError>
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

  const search = Effect.fn("SemanticSearchService.search")(function* (
    params: SemanticSearchParams
  ) {
    // Build request body
    const body = {
      query: params.query,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0
    }

    const response = yield* client.post("/api/search", {
      body: HttpBody.unsafeJson(body)
    }).pipe(
      Effect.mapError((error) =>
        new SemanticSearchError({
          message: "Semantic search failed",
          query: params.query,
          cause: error
        })
      )
    )
    return yield* HttpClientResponse.schemaBodyJson(SearchResponse)(response).pipe(
      Effect.mapError((error) =>
        new SemanticSearchError({
          message: "Semantic search response parsing failed",
          query: params.query,
          cause: error
        })
      )
    )
  }) as (
    params: SemanticSearchParams
  ) => Effect.Effect<typeof SearchResponse.Type, SemanticSearchError>

  const hybridSearch = Effect.fn("SemanticSearchService.hybridSearch")(function* (
    params: HybridSearchParams
  ) {
    // Build request body
    const body = {
      query: params.query,
      limit: params.limit ?? 20,
      bm25_weight: params.bm25_weight ?? 0.5,
      faiss_weight: params.faiss_weight ?? 0.5,
      use_expansion: params.use_expansion ?? false
    }

    const response = yield* client.post("/api/search/hybrid", {
      body: HttpBody.unsafeJson(body)
    }).pipe(
      Effect.mapError((error) =>
        new HybridSearchError({
          message: "Hybrid search failed",
          query: params.query,
          cause: error
        })
      )
    )
    return yield* HttpClientResponse.schemaBodyJson(HybridSearchResponse)(response).pipe(
      Effect.mapError((error) =>
        new HybridSearchError({
          message: "Hybrid search response parsing failed",
          query: params.query,
          cause: error
        })
      )
    )
  }) as (
    params: HybridSearchParams
  ) => Effect.Effect<typeof HybridSearchResponse.Type, HybridSearchError>

  return {
    search,
    hybridSearch
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
      }),
    hybridSearch: (params) =>
      Effect.succeed({
        results: [],
        total: 0,
        query_time_ms: 0,
        query: params.query,
        bm25_weight: params.bm25_weight ?? 0.5,
        faiss_weight: params.faiss_weight ?? 0.5
      })
  } satisfies SemanticSearchServiceInterface
)
