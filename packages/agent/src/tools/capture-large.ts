/**
 * Capture Large Handler Wrapper
 *
 * Higher-order function that wraps tool handlers to automatically
 * capture large results to the artifact store.
 *
 * When a tool result exceeds the threshold, the full result is
 * stored as an artifact and a truncated version with artifact
 * reference is returned instead.
 *
 * @module
 */

import { Effect } from "effect"
import {
  ArtifactStoreService,
  DEFAULT_CAPTURE_THRESHOLD,
  type ArtifactFormat,
  type ArtifactRef
} from "../services/context-store/index.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for withCaptureLarge wrapper
 */
export interface CaptureLargeConfig {
  /** Threshold in chars (default: 12K) */
  readonly threshold?: number
  /** Tags for artifact categorization */
  readonly tags: readonly string[]
  /** Tool name for logging */
  readonly toolName: string
  /** Artifact format (default: json) */
  readonly format?: ArtifactFormat
  /** Session scope for cleanup */
  readonly sessionId?: string
  /** Preview length (default: 500) */
  readonly previewLength?: number
}

/**
 * Result wrapper that indicates large content was captured
 */
export interface CapturedResult<T> {
  /** Original result or truncated version */
  readonly result: T
  /** Artifact reference if captured */
  readonly artifactRef?: ArtifactRef
  /** Whether the result was captured to artifact store */
  readonly captured: boolean
}

// =============================================================================
// Wrapper Implementation
// =============================================================================

/**
 * Format tool result as string for storage
 */
const formatResult = (result: unknown): string => {
  if (typeof result === "string") return result
  return JSON.stringify(result, null, 2)
}

/**
 * Generate summary for artifact
 */
const generateSummary = (
  toolName: string,
  result: unknown,
  charCount: number
): string => {
  const sizeKb = (charCount / 1024).toFixed(1)

  // Try to extract useful info from result
  if (typeof result === "object" && result !== null) {
    // Check for common array properties
    const arr = result as Record<string, unknown>
    for (const key of ["plays", "results", "matches", "items", "data"]) {
      if (Array.isArray(arr[key])) {
        return `${toolName}: ${arr[key].length} ${key} (${sizeKb}KB)`
      }
    }
  }

  return `${toolName} result (${sizeKb}KB)`
}

/**
 * Truncate result for inline return with artifact hint
 *
 * IMPORTANT: We do NOT insert marker objects into arrays because
 * typed arrays (e.g., HybridPlayResult[]) require specific schema fields.
 * Instead, we just slice arrays and add truncation info to _artifact.
 */
const truncateWithHint = <T>(
  result: T,
  artifactRef: ArtifactRef,
  previewLength: number
): T => {
  // For objects, add _artifact_ref hint
  if (typeof result === "object" && result !== null) {
    const truncated = { ...result } as Record<string, unknown>
    const truncatedArrays: Array<{ key: string; shown: number; total: number }> = []

    // Truncate large arrays (just slice, no marker objects to preserve schema validity)
    for (const key of Object.keys(truncated)) {
      const value = truncated[key]
      if (Array.isArray(value) && value.length > 3) {
        truncatedArrays.push({ key, shown: 3, total: value.length })
        truncated[key] = value.slice(0, 3)
      } else if (typeof value === "string" && value.length > previewLength) {
        truncated[key] = value.substring(0, previewLength) + "..."
      }
    }

    // Add artifact reference hint with truncation metadata
    truncated._artifact = {
      id: artifactRef.id,
      summary: artifactRef.summary,
      hint: "Full result stored. Use context_read(artifact_id) to retrieve.",
      ...(truncatedArrays.length > 0 && {
        truncated: truncatedArrays.map(t => `${t.key}: showing ${t.shown}/${t.total}`).join(", ")
      })
    }

    return truncated as T
  }

  // For strings, just truncate
  if (typeof result === "string") {
    return `${result.substring(0, previewLength)}...\n\n[Full content stored as artifact: ${artifactRef.id}]` as T
  }

  return result
}

/**
 * Wrap a tool handler to auto-capture large results
 *
 * When the handler's result exceeds the threshold, the full result
 * is stored in the artifact store and a truncated version with
 * artifact reference is returned.
 *
 * @example
 * ```typescript
 * const originalHandler = (params: P) => Effect.gen(function* () {
 *   // ... return large result
 * })
 *
 * const wrappedHandler = withCaptureLarge(originalHandler, {
 *   toolName: "semantic_search",
 *   tags: ["search", "plays"],
 *   threshold: 10000
 * })
 * ```
 */
export const withCaptureLarge = <P, A, E, R>(
  handler: (params: P) => Effect.Effect<A, E, R>,
  config: CaptureLargeConfig
): ((params: P) => Effect.Effect<A, E, R | ArtifactStoreService>) => {
  const threshold = config.threshold ?? DEFAULT_CAPTURE_THRESHOLD
  const format = config.format ?? "json"
  const previewLength = config.previewLength ?? 500

  return (params: P): Effect.Effect<A, E, R | ArtifactStoreService> =>
    Effect.gen(function* () {
      // Execute original handler
      const result = yield* handler(params)

      // Check if result is large
      const resultStr = formatResult(result)
      if (resultStr.length <= threshold) {
        return result
      }

      // Capture to artifact store
      const store = yield* ArtifactStoreService

      const summary = generateSummary(config.toolName, result, resultStr.length)

      const ref = yield* store.store({
        content: resultStr,
        format,
        summary,
        tags: [...config.tags, config.toolName],
        sessionId: config.sessionId
      }).pipe(
        Effect.catchAll(() => Effect.succeed(null))
      )

      if (ref === null) {
        // Store failed, return original result
        yield* Effect.logWarning(
          `Failed to capture large result for ${config.toolName}`
        )
        return result
      }

      yield* Effect.log(
        `Captured large ${config.toolName} result: ${ref.id} (${resultStr.length} chars)`
      )

      // Return truncated result with artifact hint
      return truncateWithHint(result, ref, previewLength)
    })
}

/**
 * Batch wrap multiple handlers with capture configuration
 *
 * @example
 * ```typescript
 * const handlers = {
 *   semantic_search: semanticSearchHandler,
 *   search_plays: searchPlaysHandler,
 * }
 *
 * const wrappedHandlers = batchWithCaptureLarge(handlers, {
 *   semantic_search: { tags: ["search"], threshold: 8000 },
 *   search_plays: { tags: ["plays"], threshold: 10000 }
 * })
 * ```
 */
export const batchWithCaptureLarge = <
  H extends Record<string, (params: never) => Effect.Effect<unknown, unknown, unknown>>
>(
  handlers: H,
  configs: { [K in keyof H]?: Omit<CaptureLargeConfig, "toolName"> }
): {
  [K in keyof H]: (
    params: Parameters<H[K]>[0]
  ) => Effect.Effect<
    ReturnType<H[K]> extends Effect.Effect<infer A, unknown, unknown> ? A : never,
    ReturnType<H[K]> extends Effect.Effect<unknown, infer E, unknown> ? E : never,
    | (ReturnType<H[K]> extends Effect.Effect<unknown, unknown, infer R> ? R : never)
    | ArtifactStoreService
  >
} => {
  const result: Record<string, unknown> = {}

  for (const [name, handler] of Object.entries(handlers)) {
    const config = configs[name as keyof H]
    if (config) {
      result[name] = withCaptureLarge(
        handler as (params: never) => Effect.Effect<unknown, unknown, unknown>,
        { ...config, toolName: name }
      )
    } else {
      result[name] = handler
    }
  }

  return result as never
}
