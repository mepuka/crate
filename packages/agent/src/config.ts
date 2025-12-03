/**
 * Configuration Services for Crate Research Agent
 *
 * Effect Config services for external API connections.
 * Uses Effect.Service pattern with Config composition.
 *
 * Environment variables:
 * - FAISS_API_URL: URL for FAISS search API (default: http://localhost:8000)
 * - FAISS_TIMEOUT_MS: Request timeout in milliseconds (default: 30000)
 * - MUSICBRAINZ_API_URL: URL for MusicBrainz API (default: https://musicbrainz.org/ws/2)
 * - MUSICBRAINZ_USER_AGENT: User-Agent header for MB API (required for rate limiting)
 * - MUSICBRAINZ_RATE_LIMIT_MS: Delay between requests (default: 1000)
 * - JINA_READER_URL: URL for Jina Reader API (default: https://r.jina.ai)
 * - JINA_API_KEY: API key for Jina Reader (optional)
 * - JINA_TIMEOUT_MS: Request timeout in milliseconds (default: 60000)
 *
 * @module
 */

import { Config, Duration, Effect, Layer, Option, Redacted } from "effect"

// =============================================================================
// FAISS API Configuration
// =============================================================================

/**
 * Configuration for FAISS Search API
 */
export interface FaissConfigShape {
  readonly baseUrl: string
  readonly timeout: Duration.Duration
}

/**
 * FAISS API configuration service
 */
export class FaissConfig extends Effect.Service<FaissConfig>()("FaissConfig", {
  effect: Effect.gen(function* () {
    const { baseUrl, timeoutMs } = yield* Config.all({
      baseUrl: Config.string("FAISS_API_URL").pipe(Config.withDefault("http://localhost:8000")),
      timeoutMs: Config.number("FAISS_TIMEOUT_MS").pipe(Config.withDefault(30000))
    })
    return { baseUrl, timeout: Duration.millis(timeoutMs) } satisfies FaissConfigShape
  })
}) {}

// =============================================================================
// MusicBrainz API Configuration
// =============================================================================

/**
 * Configuration for MusicBrainz API
 */
export interface MusicBrainzConfigShape {
  readonly baseUrl: string
  readonly userAgent: string
  readonly rateLimitDelay: Duration.Duration
}

/**
 * MusicBrainz API configuration service
 */
export class MusicBrainzConfig extends Effect.Service<MusicBrainzConfig>()("MusicBrainzConfig", {
  effect: Effect.gen(function* () {
    const { baseUrl, userAgent, rateLimitMs } = yield* Config.all({
      baseUrl: Config.string("MUSICBRAINZ_API_URL").pipe(Config.withDefault("https://musicbrainz.org/ws/2")),
      userAgent: Config.string("MUSICBRAINZ_USER_AGENT").pipe(Config.withDefault("Crate/1.0 (https://github.com/crate-music)")),
      rateLimitMs: Config.number("MUSICBRAINZ_RATE_LIMIT_MS").pipe(Config.withDefault(1000))
    })
    return {
      baseUrl,
      userAgent,
      rateLimitDelay: Duration.millis(rateLimitMs)
    } satisfies MusicBrainzConfigShape
  })
}) {}

// =============================================================================
// Jina Reader API Configuration
// =============================================================================

/**
 * Configuration for Jina Reader API
 */
export interface JinaConfigShape {
  readonly baseUrl: string
  readonly apiKey: Redacted.Redacted<string> | null
  readonly timeout: Duration.Duration
}

/**
 * Jina Reader API configuration service
 */
export class JinaConfig extends Effect.Service<JinaConfig>()("JinaConfig", {
  effect: Effect.gen(function* () {
    const { baseUrl, apiKey, timeoutMs } = yield* Config.all({
      baseUrl: Config.string("JINA_READER_URL").pipe(Config.withDefault("https://r.jina.ai")),
      apiKey: Config.option(Config.redacted("JINA_API_KEY")),
      timeoutMs: Config.number("JINA_TIMEOUT_MS").pipe(Config.withDefault(60000))
    })
    return {
      baseUrl,
      apiKey: Option.getOrNull(apiKey),
      timeout: Duration.millis(timeoutMs)
    } satisfies JinaConfigShape
  })
}) {}

// =============================================================================
// Anthropic API Configuration
// =============================================================================

/**
 * Configuration for Anthropic API
 */
export interface AnthropicConfigShape {
  readonly apiKey: Redacted.Redacted<string>
}

/**
 * Anthropic API configuration service
 */
export class AnthropicConfig extends Effect.Service<AnthropicConfig>()("AnthropicConfig", {
  effect: Effect.gen(function* () {
    const apiKey = yield* Config.redacted("ANTHROPIC_API_KEY")
    return { apiKey } satisfies AnthropicConfigShape
  })
}) {}

// =============================================================================
// Combined Configuration Layer
// =============================================================================

/**
 * All configuration services combined
 *
 * Note: Layer may fail with ConfigError if required env vars are missing
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const faiss = yield* FaissConfig
 *   const mb = yield* MusicBrainzConfig
 *   const jina = yield* JinaConfig
 *   const anthropic = yield* AnthropicConfig
 * }).pipe(Effect.provide(AgentConfigLive))
 * ```
 */
export const AgentConfigLive = Layer.mergeAll(
  FaissConfig.Default,
  MusicBrainzConfig.Default,
  JinaConfig.Default,
  AnthropicConfig.Default
)
