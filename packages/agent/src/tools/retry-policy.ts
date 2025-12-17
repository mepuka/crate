/**
 * Retry Policy for Agent Tools
 *
 * Provides exponential backoff retry logic for transient failures
 * like network errors, timeouts, and rate limits.
 *
 * @module
 */

import { Effect, Schedule, Duration, pipe } from "effect";
import type { ToolError } from "../services/errors.js";

// =============================================================================
// Retry Configuration
// =============================================================================

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
  /** Maximum number of retry attempts */
  maxRetries: 3,
  /** Initial delay before first retry */
  initialDelay: Duration.millis(200),
  /** Maximum delay between retries */
  maxDelay: Duration.seconds(10),
  /** Factor for exponential backoff */
  factor: 2,
} as const;

// =============================================================================
// Retryable Error Detection
// =============================================================================

/**
 * Error patterns that indicate transient failures worth retrying
 */
const RETRYABLE_PATTERNS = [
  // Network errors
  /network/i,
  /connection/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /socket hang up/i,
  // Timeout errors
  /timeout/i,
  /timed out/i,
  // Rate limiting
  /rate limit/i,
  /too many requests/i,
  /429/,
  // Server errors (may be transient)
  /502/,
  /503/,
  /504/,
  /service unavailable/i,
  /bad gateway/i,
  /gateway timeout/i,
];

/**
 * HTTP status codes that indicate transient failures
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Check if an error is retryable based on its message and cause
 */
export const isRetryableError = (error: unknown): boolean => {
  // Check if it's a ToolError with statusCode
  if (
    error !== null &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  ) {
    if (RETRYABLE_STATUS_CODES.has((error as { statusCode: number }).statusCode)) {
      return true;
    }
  }

  // Check error message
  const message = getErrorMessage(error);
  if (RETRYABLE_PATTERNS.some((pattern) => pattern.test(message))) {
    return true;
  }

  // Check cause recursively
  if (
    error !== null &&
    typeof error === "object" &&
    "cause" in error &&
    error.cause !== undefined
  ) {
    return isRetryableError(error.cause);
  }

  return false;
};

/**
 * Extract error message from unknown error type
 */
const getErrorMessage = (error: unknown): string => {
  if (error === null || error === undefined) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

// =============================================================================
// Retry Schedule
// =============================================================================

/**
 * Create exponential backoff schedule with jitter
 *
 * Pattern: 200ms -> 400ms -> 800ms (capped at 10s)
 * Jitter adds ±25% randomization to prevent thundering herd
 */
export const makeRetrySchedule = (
  config: typeof DEFAULT_RETRY_CONFIG = DEFAULT_RETRY_CONFIG
): Schedule.Schedule<number, unknown, never> =>
  pipe(
    // Exponential backoff starting at initialDelay
    Schedule.exponential(config.initialDelay, config.factor),
    // Cap at maxDelay
    Schedule.either(Schedule.spaced(config.maxDelay)),
    // Add jitter (±25%)
    Schedule.jittered,
    // Limit total retries
    Schedule.compose(Schedule.recurs(config.maxRetries)),
    // Only retry on retryable errors
    Schedule.whileInput(isRetryableError)
  );

// =============================================================================
// Retry Effect Combinators
// =============================================================================

/**
 * Wrap an effect with retry logic for transient failures
 *
 * @example
 * ```ts
 * const robustSearch = withRetry(
 *   searchService.search(query),
 *   { maxRetries: 5 }
 * );
 * ```
 */
export const withRetry = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  config: Partial<typeof DEFAULT_RETRY_CONFIG> = {}
): Effect.Effect<A, E, R> => {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  return pipe(
    effect,
    Effect.retry(makeRetrySchedule(fullConfig)),
    Effect.tapError((error) =>
      Effect.logWarning("Effect failed after retries", {
        error: getErrorMessage(error),
        maxRetries: fullConfig.maxRetries,
      })
    )
  );
};

/**
 * Wrap an effect with retry logic and convert to success on final failure
 *
 * This is useful for tools where we want to return an error message
 * rather than failing the entire agent loop.
 *
 * @example
 * ```ts
 * const safeSearch = withRetryOrDefault(
 *   searchService.search(query),
 *   { results: [], total: 0, _error: "Search failed after retries" }
 * );
 * ```
 */
export const withRetryOrDefault = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  defaultValue: A,
  config: Partial<typeof DEFAULT_RETRY_CONFIG> = {}
): Effect.Effect<A, never, R> =>
  pipe(
    withRetry(effect, config),
    Effect.catchAll((error) =>
      Effect.succeed({
        ...defaultValue,
        _error: `Failed after ${config.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries} retries: ${getErrorMessage(error)}`,
      } as A)
    )
  );

// =============================================================================
// Tool-Specific Retry Wrappers
// =============================================================================

/**
 * Retry configuration for different tool categories
 */
export const TOOL_RETRY_CONFIGS = {
  /** Search tools - slightly more retries since they're critical */
  search: {
    maxRetries: 4,
    initialDelay: Duration.millis(200),
    maxDelay: Duration.seconds(8),
    factor: 2,
  },
  /** Graph tools - fewer retries, graph data is often cached */
  graph: {
    maxRetries: 3,
    initialDelay: Duration.millis(150),
    maxDelay: Duration.seconds(5),
    factor: 2,
  },
  /** External fetch - more retries, external services can be flaky */
  fetch: {
    maxRetries: 4,
    initialDelay: Duration.millis(300),
    maxDelay: Duration.seconds(15),
    factor: 2,
  },
  /** MBID resolution - quick retries, usually fast service */
  resolve: {
    maxRetries: 3,
    initialDelay: Duration.millis(100),
    maxDelay: Duration.seconds(3),
    factor: 2,
  },
} as const;
