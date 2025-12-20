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
  readonly apiKey: string | null
  readonly timeout: Duration.Duration
}

/**
 * FAISS API configuration service
 */
export class FaissConfig extends Effect.Service<FaissConfig>()("FaissConfig", {
  effect: Effect.gen(function* () {
    const { baseUrl, timeoutMs, apiKey } = yield* Config.all({
      baseUrl: Config.string("FAISS_API_URL").pipe(Config.withDefault("http://localhost:8000")),
      timeoutMs: Config.number("FAISS_TIMEOUT_MS").pipe(Config.withDefault(30000)),
      apiKey: Config.option(Config.string("FAISS_API_KEY"))
    })
    return {
      baseUrl,
      apiKey: Option.getOrElse(apiKey, () => null),
      timeout: Duration.millis(timeoutMs)
    } satisfies FaissConfigShape
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
      userAgent: Config.string("MUSICBRAINZ_USER_AGENT").pipe(Config.withDefault("CrateAgent/1.0 (https://github.com/crate-music; crate-music@proton.me)")),
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
// Pub/Sub Push Verification
// =============================================================================

/**
 * Configuration for Pub/Sub push authentication
 */
export interface PubSubConfigShape {
  readonly invokerEmail: string | null
}

/**
 * Optional expected caller email for Pub/Sub push requests.
 * If set, the /pubsub handler will reject requests whose
 * X-Goog-Authenticated-Identity does not include this email.
 */
export class PubSubConfig extends Effect.Service<PubSubConfig>()("PubSubConfig", {
  effect: Effect.gen(function* () {
    const invokerEmail = yield* Config.option(Config.string("PUBSUB_INVOKER_EMAIL"))
    return {
      invokerEmail: Option.getOrNull(invokerEmail)
    } satisfies PubSubConfigShape
  })
}) {}

// =============================================================================
// Google AI Configuration
// =============================================================================

/**
 * Configuration for Google AI (Gemini) API
 */
export interface GoogleAIConfigShape {
  readonly apiKey: Redacted.Redacted<string>
}

/**
 * Google AI API configuration service
 *
 * Environment variables (checked in order):
 * - GOOGLE_AI_API_KEY
 * - GOOGLE_API_KEY
 */
export class GoogleAIConfig extends Effect.Service<GoogleAIConfig>()("GoogleAIConfig", {
  effect: Effect.gen(function* () {
    // Try GOOGLE_AI_API_KEY first, fallback to GOOGLE_API_KEY
    const apiKey = yield* Config.redacted("GOOGLE_AI_API_KEY").pipe(
      Config.orElse(() => Config.redacted("GOOGLE_API_KEY"))
    )
    return { apiKey } satisfies GoogleAIConfigShape
  })
}) {}

// =============================================================================
// AI Model Selection Configuration
// =============================================================================

/**
 * Supported AI providers
 */
export type AIProvider = "anthropic" | "google"

/**
 * Default models per provider
 */
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-3-flash-preview",
} as const

/**
 * Configuration for AI model selection
 */
export interface AIModelConfigShape {
  readonly provider: AIProvider
  readonly model: string
}

/**
 * AI Model configuration service
 *
 * Allows runtime selection of AI provider and model via environment variables.
 * No code changes or redeployment needed to switch models.
 *
 * Environment variables:
 * - AI_PROVIDER: "anthropic" | "google" (default: "anthropic")
 * - AI_MODEL: Model name override (default: provider's default)
 *
 * Examples:
 *   AI_PROVIDER=anthropic AI_MODEL=claude-opus-4         → Claude Opus 4
 *   AI_PROVIDER=google AI_MODEL=gemini-2.5-pro           → Gemini 2.5 Pro
 *   AI_PROVIDER=google                                   → Gemini 3 Flash Preview
 *   (no env vars)                                        → Claude Haiku 4.5
 */
export class AIModelConfig extends Effect.Service<AIModelConfig>()("AIModelConfig", {
  effect: Effect.gen(function* () {
    const { provider, model } = yield* Config.all({
      provider: Config.literal("anthropic", "google")("AI_PROVIDER").pipe(
        Config.withDefault("anthropic" as AIProvider)
      ),
      model: Config.option(Config.string("AI_MODEL"))
    })

    // Use specified model or default for the provider
    const resolvedModel = Option.getOrElse(model, () => DEFAULT_MODELS[provider])

    return {
      provider,
      model: resolvedModel
    } satisfies AIModelConfigShape
  })
}) {}

// =============================================================================
// Crate Server Configuration
// =============================================================================

/**
 * Configuration for Crate TypeScript server
 * Used for storing generated assets and other server-side operations
 */
export interface CrateServerConfigShape {
  readonly baseUrl: string
  readonly timeout: Duration.Duration
}

/**
 * Crate server configuration service
 */
export class CrateServerConfig extends Effect.Service<CrateServerConfig>()("CrateServerConfig", {
  effect: Effect.gen(function* () {
    const { baseUrl, timeoutMs } = yield* Config.all({
      baseUrl: Config.string("CRATE_SERVER_URL").pipe(Config.withDefault("http://localhost:3000")),
      timeoutMs: Config.number("CRATE_SERVER_TIMEOUT_MS").pipe(Config.withDefault(60000))
    })
    return {
      baseUrl,
      timeout: Duration.millis(timeoutMs)
    } satisfies CrateServerConfigShape
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
 *   const aiModel = yield* AIModelConfig
 *   console.log(`Using ${aiModel.provider}/${aiModel.model}`)
 * }).pipe(Effect.provide(AgentConfigLive))
 * ```
 */
export const AgentConfigLive = Layer.mergeAll(
  FaissConfig.Default,
  MusicBrainzConfig.Default,
  JinaConfig.Default,
  AnthropicConfig.Default,
  PubSubConfig.Default,
  AIModelConfig.Default
  // Note: GoogleAIConfig.Default not included here to avoid requiring
  // GOOGLE_AI_API_KEY when only using Anthropic. Add it explicitly when needed.
)
