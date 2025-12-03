/**
 * Layer Composition for Crate Research Agent
 *
 * Provides clean layer composition for all services and infrastructure.
 * Enables easy switching between live and test configurations.
 *
 * LAYER COMPOSITION PATTERN:
 * This module follows the Effect pattern of composing layers at the app boundary.
 * Services declare their requirements via the R channel, and layers are composed
 * here to satisfy those requirements. This enables:
 * - Easy testing with mock layers
 * - Clear separation between service logic and infrastructure
 * - Swappable implementations (e.g., Anthropic vs OpenAI)
 *
 * @module
 */

import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import { AnthropicLanguageModel, AnthropicClient } from "@effect/ai-anthropic";

// Configuration services
import {
  FaissConfig,
  MusicBrainzConfig,
  JinaConfig,
  AnthropicConfig,
} from "./config.js";

// Service imports
import {
  SearchPlaysService,
  SearchPlaysServiceLive,
  SearchPlaysServiceTest,
  SemanticSearchService,
  SemanticSearchServiceLive,
  SemanticSearchServiceTest,
  InsightSessionService,
  InsightSessionServiceLive,
  InsightSessionServiceTest,
  MbidResolverService,
  MbidResolverServiceLive,
  MbidResolverServiceTest,
  LinkFetcherService,
  LinkFetcherServiceLive,
  LinkFetcherServiceTest,
} from "./services/index.js";

// Tool handlers
import { CrateToolHandlersLayer } from "./tools/handlers.js";

// Toolkit

// =============================================================================
// Configuration Layers (separated for flexibility)
// =============================================================================

/**
 * Configuration layer for all services (without AnthropicConfig)
 *
 * This is the minimal config layer needed for tool operations.
 * AnthropicConfig is only needed when using the LLM directly.
 */
export const ConfigLive = Layer.mergeAll(
  FaissConfig.Default,
  MusicBrainzConfig.Default,
  JinaConfig.Default
);

/**
 * Infrastructure layer providing HTTP client and configuration
 *
 * Uses FetchHttpClient for cross-platform compatibility (Node, Bun, Browser).
 *
 * Provides:
 * - HttpClient (via fetch API - works in Bun)
 * - FaissConfig
 * - MusicBrainzConfig
 * - JinaConfig
 */
export const InfraLive = Layer.mergeAll(FetchHttpClient.layer, ConfigLive);

// =============================================================================
// Services Layer
// =============================================================================

/**
 * All service layers combined
 *
 * Provides:
 * - SearchPlaysService
 * - SemanticSearchService
 * - InsightSessionService
 * - MbidResolverService
 * - LinkFetcherService
 *
 * Requires:
 * - HttpClient
 * - FaissConfig
 * - MusicBrainzConfig
 * - JinaConfig
 */
export const ServicesLive = Layer.mergeAll(
  SearchPlaysServiceLive,
  SemanticSearchServiceLive,
  InsightSessionServiceLive,
  MbidResolverServiceLive,
  LinkFetcherServiceLive
);

/**
 * Services layer with all infrastructure dependencies resolved
 *
 * Fully self-contained layer providing all services.
 */
export const ServicesFull = ServicesLive.pipe(Layer.provide(InfraLive));

// =============================================================================
// Tool Handlers Layer
// =============================================================================

/**
 * Tool handlers layer with all service dependencies
 *
 * Provides:
 * - CrateToolkit handlers (registered toolkit)
 *
 * Requires services to be provided.
 */
export const HandlersLive = CrateToolHandlersLayer;

// =============================================================================
// Full Layers
// =============================================================================

/**
 * Complete Crate Tools layer with all dependencies resolved
 *
 * This is the main layer for production use. It provides:
 * - All 5 services (SearchPlays, SemanticSearch, InsightSession, MbidResolver, LinkFetcher)
 * - Toolkit handlers wired to services
 * - HTTP client and configuration
 *
 * Usage:
 * ```ts
 * const program = Effect.gen(function* () {
 *   const toolkit = yield* CrateToolkit
 *   const result = yield* toolkit.handle("search_plays", { query: "jazz" })
 *   return result
 * }).pipe(Effect.provide(CrateToolsLive))
 * ```
 */
export const CrateToolsLive = HandlersLive.pipe(
  Layer.provideMerge(ServicesFull)
);

// =============================================================================
// Test Layers
// =============================================================================

/**
 * Test services layer with mock implementations
 *
 * All services return empty/mock results suitable for testing
 * without external dependencies.
 */
export const ServicesTest = Layer.mergeAll(
  SearchPlaysServiceTest,
  SemanticSearchServiceTest,
  InsightSessionServiceTest,
  MbidResolverServiceTest,
  LinkFetcherServiceTest
);

/**
 * Complete test layer with mock services
 *
 * This layer can be used for testing without any external dependencies.
 * All services are mocked with default empty responses.
 *
 * Usage:
 * ```ts
 * const program = Effect.gen(function* () {
 *   const toolkit = yield* CrateToolkit
 *   const result = yield* toolkit.handle("search_plays", { query: "test" })
 *   return result
 * }).pipe(Effect.provide(CrateToolsTest))
 * ```
 */
export const CrateToolsTest = HandlersLive.pipe(
  Layer.provideMerge(ServicesTest)
);

// =============================================================================
// MusicAgent Layers
// =============================================================================

/**
 * Anthropic LanguageModel layer
 *
 * Creates a fully-provided Anthropic Claude model layer.
 * Requires AnthropicConfig to be provided for the API key.
 *
 * Uses:
 * - claude-sonnet-4-5 model
 * - FetchHttpClient for HTTP requests
 * - AnthropicConfig for API key configuration
 */
export const AnthropicModelLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* AnthropicConfig;

    // Create Anthropic client layer with API key and HTTP client.
    // Use HttpClient.retryTransient to automatically retry common transient
    // errors (rate limits, timeouts, network issues) at the HTTP layer.
    const clientLayer = AnthropicClient.layer({
      apiKey: config.apiKey,
      // Transform the underlying HttpClient to add transient retries
      // for all Anthropic requests.
      transformClient: HttpClient.retryTransient({ times: 3 }),
    }).pipe(Layer.provide(FetchHttpClient.layer));

    // Create model layer and provide the client
    // AnthropicLanguageModel.model returns an AiModel.Model which is both a Layer and Effect
    return AnthropicLanguageModel.model("claude-sonnet-4-5").pipe(
      Layer.provide(clientLayer)
    );
  })
);

/**
 * Complete Anthropic model layer with config resolved
 *
 * This is a self-contained layer that provides LanguageModel.LanguageModel
 * after reading ANTHROPIC_API_KEY from the environment.
 */
export const AnthropicModelLive = AnthropicModelLayer.pipe(
  Layer.provide(AnthropicConfig.Default)
);

// =============================================================================
// Type Exports
// =============================================================================

/**
 * Type for services provided by CrateToolsLive
 */
export type CrateToolServices =
  | SearchPlaysService
  | SemanticSearchService
  | InsightSessionService
  | MbidResolverService
  | LinkFetcherService;

/**
 * Type for full Crate Tools context
 */
export type CrateToolsContext = CrateToolServices;
