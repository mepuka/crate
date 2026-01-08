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
import { GoogleLanguageModel, GoogleClient } from "@effect/ai-google";

// Configuration services
import {
  FaissConfig,
  MusicBrainzConfig,
  JinaConfig,
  AnthropicConfig,
  GoogleAIConfig,
  AIModelConfig,
  PolishModelConfig,
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
  GraphConnectionsServiceFull,
  MusicGraphServiceFull,
  AgentCheckpointService,
  AgentCheckpointServiceLive,
  AgentCheckpointServiceTest,
  ArtCurationService,
  ArtCurationServiceTest,
  ArtCurationServiceGeminiWithConfig,
  // Art generation services
  ArtGenerationOrchestrator,
  ArtGenerationOrchestratorLive,
  LinerNoteGenerationService,
  LinerNoteGenerationServiceLive,
} from "./services/index.js";

import { CrateServerConfig } from "./config.js";

// Tool handlers
import { CrateToolHandlersLayer, CrateToolWithContextHandlersLayer } from "./tools/handlers.js";

// Context store (artifact storage for dynamic context discovery)
import { ArtifactStoreService } from "./services/context-store/index.js";

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
 * - GraphConnectionsService
 * - MusicGraphService
 * - ArtCurationService (with Gemini vision)
 *
 * Requires:
 * - HttpClient
 * - FaissConfig
 * - MusicBrainzConfig
 * - JinaConfig
 * - GOOGLE_AI_API_KEY (for art curation)
 */
export const ServicesLive = Layer.mergeAll(
  SearchPlaysServiceLive,
  SemanticSearchServiceLive,
  InsightSessionServiceLive,
  MbidResolverServiceLive,
  LinkFetcherServiceLive,
  GraphConnectionsServiceFull,
  MusicGraphServiceFull,
  AgentCheckpointServiceLive,
  // Gemini vision for album art analysis (requires GoogleAIConfig)
  ArtCurationServiceGeminiWithConfig.pipe(Layer.provide(GoogleAIConfig.Default))
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
// Context Discovery Layer (Dynamic Context)
// =============================================================================

/**
 * Services layer with ArtifactStoreService for context discovery
 *
 * Adds in-memory artifact storage to the standard services.
 * Used by agents that need dynamic context retrieval.
 */
export const ServicesWithContextLive = Layer.mergeAll(
  ServicesLive,
  ArtifactStoreService.Default
);

/**
 * Services with context - fully resolved with infrastructure
 */
export const ServicesWithContextFull = ServicesWithContextLive.pipe(
  Layer.provide(InfraLive)
);

/**
 * Tool handlers layer with context discovery tools
 *
 * Provides CrateToolkitWithContext handlers that include:
 * - All standard Crate research tools
 * - Context discovery tools (context_list, context_read, context_search, context_tail)
 */
export const HandlersWithContextLive = CrateToolWithContextHandlersLayer;

/**
 * Complete Crate Tools layer with context discovery
 *
 * Same as CrateToolsLive but includes:
 * - ArtifactStoreService for storing/retrieving large data
 * - Context discovery tools for on-demand retrieval
 *
 * Usage:
 * ```ts
 * const program = Effect.gen(function* () {
 *   const toolkit = yield* CrateToolkitWithContext
 *   const result = yield* toolkit.handle("context_read", { artifact_id: "abc" })
 *   return result
 * }).pipe(Effect.provide(CrateToolsWithContextLive))
 * ```
 */
export const CrateToolsWithContextLive = HandlersWithContextLive.pipe(
  Layer.provideMerge(ServicesWithContextFull)
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
  LinkFetcherServiceTest,
  AgentCheckpointServiceTest,
  ArtCurationServiceTest
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
 * Default model for the MusicAgent.
 * Using Haiku for faster responses and lower cost.
 */
const DEFAULT_MODEL = "claude-haiku-4-5" as const;

/**
 * Anthropic LanguageModel layer
 *
 * Creates a fully-provided Anthropic Claude model layer with Tokenizer.
 * Requires AnthropicConfig to be provided for the API key.
 *
 * Uses:
 * - claude-haiku-4-5 model (configurable via DEFAULT_MODEL)
 * - FetchHttpClient for HTTP requests
 * - AnthropicConfig for API key configuration
 * - Tokenizer for pre-flight token counting
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

    // Create model layer with tokenizer and provide the client
    // modelWithTokenizer provides both LanguageModel and Tokenizer services
    return AnthropicLanguageModel.modelWithTokenizer(DEFAULT_MODEL).pipe(
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
// Google AI (Gemini) Layers
// =============================================================================

/**
 * Default model for Google AI.
 * Using Gemini 3 Flash Preview for fast responses, large context (1M tokens), and low cost.
 * Released December 17, 2025.
 * Pricing: $0.50/1M input, $3/1M output
 */
const DEFAULT_GOOGLE_MODEL = "gemini-3-flash-preview" as const;

/**
 * Google AI LanguageModel layer
 *
 * Creates a fully-provided Google Gemini model layer.
 * Requires GoogleAIConfig to be provided for the API key.
 *
 * Uses:
 * - gemini-2.0-flash model (1M+ token context window)
 * - FetchHttpClient for HTTP requests
 * - GoogleAIConfig for API key configuration
 */
export const GoogleModelLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* GoogleAIConfig;

    // Create Google client layer with API key and HTTP client.
    // Use HttpClient.retryTransient to automatically retry common transient
    // errors (rate limits, timeouts, network issues) at the HTTP layer.
    const clientLayer = GoogleClient.layer({
      apiKey: config.apiKey,
      // Transform the underlying HttpClient to add transient retries
      // for all Google AI requests.
      transformClient: HttpClient.retryTransient({ times: 3 }),
    }).pipe(Layer.provide(FetchHttpClient.layer));

    // Create model layer and provide the client
    return GoogleLanguageModel.model(DEFAULT_GOOGLE_MODEL).pipe(
      Layer.provide(clientLayer)
    );
  })
);

/**
 * Complete Google model layer with config resolved
 *
 * This is a self-contained layer that provides LanguageModel.LanguageModel
 * after reading GOOGLE_AI_API_KEY from the environment.
 *
 * Key advantages over Anthropic:
 * - 1M+ token context window (vs 200K for Claude)
 * - Lower cost per token (~$0.15/1M vs $5/1M)
 * - Ideal for large-context research tasks
 */
export const GoogleModelLive = GoogleModelLayer.pipe(
  Layer.provide(GoogleAIConfig.Default)
);

// =============================================================================
// Configurable Model Layer (Runtime Provider Selection)
// =============================================================================

/**
 * Create an Anthropic model layer with a specific model name
 */
const makeAnthropicModelLayer = (model: string) =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const config = yield* AnthropicConfig;
      const clientLayer = AnthropicClient.layer({
        apiKey: config.apiKey,
        transformClient: HttpClient.retryTransient({ times: 3 }),
      }).pipe(Layer.provide(FetchHttpClient.layer));

      return AnthropicLanguageModel.modelWithTokenizer(model).pipe(
        Layer.provide(clientLayer)
      );
    })
  );

/**
 * Create a Google model layer with a specific model name
 */
const makeGoogleModelLayer = (model: string) =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const config = yield* GoogleAIConfig;
      const clientLayer = GoogleClient.layer({
        apiKey: config.apiKey,
        transformClient: HttpClient.retryTransient({ times: 3 }),
      }).pipe(Layer.provide(FetchHttpClient.layer));

      return GoogleLanguageModel.model(model).pipe(
        Layer.provide(clientLayer)
      );
    })
  );

/**
 * Configurable model layer that selects provider based on AI_PROVIDER env var
 *
 * This is the recommended layer for production use. It reads:
 * - AI_PROVIDER: "anthropic" | "google" (default: "anthropic")
 * - AI_MODEL: Model name override (optional)
 *
 * Examples:
 *   AI_PROVIDER=google                    → Gemini 3 Flash Preview
 *   AI_PROVIDER=google AI_MODEL=gemini-2.5-pro → Gemini 2.5 Pro
 *   AI_PROVIDER=anthropic AI_MODEL=claude-opus-4 → Claude Opus 4
 *   (no env vars)                         → Claude Haiku 4.5
 *
 * Usage:
 * ```ts
 * const program = myAgent.pipe(Effect.provide(ConfigurableModelLive))
 * ```
 */
export const ConfigurableModelLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const aiConfig = yield* AIModelConfig;

    // Log the selected provider/model for debugging
    yield* Effect.logInfo(`AI Provider: ${aiConfig.provider}/${aiConfig.model}`);

    if (aiConfig.provider === "google") {
      // Google requires GoogleAIConfig
      return makeGoogleModelLayer(aiConfig.model).pipe(
        Layer.provide(GoogleAIConfig.Default)
      );
    } else {
      // Anthropic is default
      return makeAnthropicModelLayer(aiConfig.model).pipe(
        Layer.provide(AnthropicConfig.Default)
      );
    }
  })
).pipe(Layer.provide(AIModelConfig.Default));

/**
 * Polish Model Layer - Provides LanguageModel for polish phase
 *
 * Uses a more capable model (Sonnet/Opus by default) for quality writing.
 * Can be configured via POLISH_MODEL env var.
 *
 * Environment variables:
 * - POLISH_MODEL: Model name override (default: provider's polish default)
 *
 * Examples:
 *   POLISH_MODEL=claude-opus-4-5-20251101    → Claude Opus for premium quality
 *   POLISH_MODEL=gemini-3-pro                → Gemini 3 Pro
 *   (no env var)                             → Claude Sonnet 4 (default)
 *
 * Usage:
 * ```ts
 * const polishedAgent = polishAgent.pipe(Effect.provide(PolishModelLive))
 * ```
 */
export const PolishModelLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const polishConfig = yield* PolishModelConfig;

    // Log the selected polish model for debugging
    yield* Effect.logInfo(`Polish Model: ${polishConfig.provider}/${polishConfig.model}`);

    if (polishConfig.provider === "google") {
      return makeGoogleModelLayer(polishConfig.model).pipe(
        Layer.provide(GoogleAIConfig.Default)
      );
    } else {
      return makeAnthropicModelLayer(polishConfig.model).pipe(
        Layer.provide(AnthropicConfig.Default)
      );
    }
  })
).pipe(Layer.provide(PolishModelConfig.Default));

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
  | LinkFetcherService
  | AgentCheckpointService
  | ArtCurationService;

/**
 * Type for full Crate Tools context
 */
export type CrateToolsContext = CrateToolServices;

// =============================================================================
// Art Generation Layers
// =============================================================================

/**
 * LinerNoteGenerationService with GoogleClient provided
 *
 * Creates the liner note generation service with Nano Banana Pro model.
 * Requires GoogleAIConfig in environment.
 */
export const LinerNoteGenerationServiceWithConfig: Layer.Layer<
  LinerNoteGenerationService,
  never,
  GoogleAIConfig
> = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* GoogleAIConfig;

    // Build GoogleClient layer with HTTP client
    const googleClientLayer = GoogleClient.layer({
      apiKey: config.apiKey,
    }).pipe(Layer.provide(FetchHttpClient.layer));

    return LinerNoteGenerationServiceLive.pipe(Layer.provide(googleClientLayer));
  })
);

/**
 * Complete Art Generation layer with all dependencies resolved
 *
 * Provides ArtGenerationOrchestrator with:
 * - LinerNoteGenerationService (Nano Banana Pro)
 * - CrateServerConfig (for HTTP storage)
 * - HttpClient (for album art fetching and asset storage)
 *
 * Requires:
 * - GOOGLE_AI_API_KEY (for image generation)
 * - CRATE_SERVER_URL (defaults to http://localhost:3000)
 */
export const ArtGenerationOrchestratorFull: Layer.Layer<
  ArtGenerationOrchestrator,
  never,
  never
> = ArtGenerationOrchestratorLive.pipe(
  Layer.provide(LinerNoteGenerationServiceWithConfig),
  Layer.provide(CrateServerConfig.Default),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(GoogleAIConfig.Default)
);
