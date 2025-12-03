/**
 * Layer Composition for Crate Research Agent
 *
 * Provides clean layer composition for all services and infrastructure.
 * Enables easy switching between live and test configurations.
 *
 * @module
 */

import { Layer } from "effect"
import { HttpClient } from "@effect/platform"
import { NodeHttpClient } from "@effect/platform-node"

// Configuration services
import {
  FaissConfig,
  MusicBrainzConfig,
  JinaConfig,
  AgentConfigLive
} from "./config.js"

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
  LinkFetcherServiceTest
} from "./services/index.js"

// Tool handlers
import { CrateToolHandlersLayer } from "./tools/handlers.js"

// Toolkit
import { CrateToolkit } from "./tools/definitions.js"

// =============================================================================
// Infrastructure Layer
// =============================================================================

/**
 * Infrastructure layer providing HTTP client and configuration
 *
 * Provides:
 * - HttpClient (via Node's undici)
 * - FaissConfig
 * - MusicBrainzConfig
 * - JinaConfig
 */
export const InfraLive: Layer.Layer<
  HttpClient.HttpClient | FaissConfig | MusicBrainzConfig | JinaConfig
> = Layer.mergeAll(
  NodeHttpClient.layerUndici,
  AgentConfigLive
)

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
export const ServicesLive: Layer.Layer<
  | SearchPlaysService
  | SemanticSearchService
  | InsightSessionService
  | MbidResolverService
  | LinkFetcherService,
  never,
  HttpClient.HttpClient | FaissConfig | MusicBrainzConfig | JinaConfig
> = Layer.mergeAll(
  SearchPlaysServiceLive,
  SemanticSearchServiceLive,
  InsightSessionServiceLive,
  MbidResolverServiceLive,
  LinkFetcherServiceLive
)

/**
 * Services layer with all infrastructure dependencies resolved
 *
 * Fully self-contained layer providing all services.
 */
export const ServicesFull: Layer.Layer<
  | SearchPlaysService
  | SemanticSearchService
  | InsightSessionService
  | MbidResolverService
  | LinkFetcherService
> = ServicesLive.pipe(Layer.provide(InfraLive))

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
export const HandlersLive: Layer.Layer<
  typeof CrateToolkit.Service,
  never,
  | SearchPlaysService
  | SemanticSearchService
  | InsightSessionService
  | MbidResolverService
  | LinkFetcherService
> = CrateToolHandlersLayer

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
export const CrateToolsLive: Layer.Layer<
  | typeof CrateToolkit.Service
  | SearchPlaysService
  | SemanticSearchService
  | InsightSessionService
  | MbidResolverService
  | LinkFetcherService
> = HandlersLive.pipe(
  Layer.provideMerge(ServicesFull)
)

// =============================================================================
// Test Layers
// =============================================================================

/**
 * Test services layer with mock implementations
 *
 * All services return empty/mock results suitable for testing
 * without external dependencies.
 */
export const ServicesTest: Layer.Layer<
  | SearchPlaysService
  | SemanticSearchService
  | InsightSessionService
  | MbidResolverService
  | LinkFetcherService
> = Layer.mergeAll(
  SearchPlaysServiceTest,
  SemanticSearchServiceTest,
  InsightSessionServiceTest,
  MbidResolverServiceTest,
  LinkFetcherServiceTest
)

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
export const CrateToolsTest: Layer.Layer<
  | typeof CrateToolkit.Service
  | SearchPlaysService
  | SemanticSearchService
  | InsightSessionService
  | MbidResolverService
  | LinkFetcherService
> = HandlersLive.pipe(
  Layer.provideMerge(ServicesTest)
)

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

/**
 * Type for full Crate Tools context
 */
export type CrateToolsContext =
  | typeof CrateToolkit.Service
  | CrateToolServices
