/**
 * Context Discovery Tool Handlers
 *
 * Handler implementations for context discovery tools.
 * These handlers interact with the ArtifactStoreService.
 *
 * Uses the same pattern as the main tools/handlers.ts:
 * - Factory functions that close over services
 * - Toolkit.of() to build handler object
 * - Toolkit.toLayer() for layer construction
 *
 * @module
 */

import { Effect, pipe, Layer } from "effect"
import { Toolkit } from "@effect/ai"
import {
  ArtifactStoreService,
  type ArtifactStoreServiceInterface,
  type ArtifactMetadata
} from "../../services/context-store/index.js"
import { ContextDiscoveryToolkit } from "./definitions.js"
import type {
  ContextListParams,
  ContextListResponse,
  ContextReadParams,
  ContextReadResponse,
  ContextSearchParams,
  ContextSearchResponse,
  ContextTailParams,
  ContextTailResponse,
  ArtifactSummary
} from "./schemas.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Handler type extracted from ContextDiscoveryToolkit
 */
export type ContextDiscoveryHandlers = Toolkit.HandlersFrom<
  Toolkit.Tools<typeof ContextDiscoveryToolkit>
>

// =============================================================================
// Handler Helpers
// =============================================================================

/**
 * Convert ArtifactMetadata to ArtifactSummary for tool response
 */
const toArtifactSummary = (metadata: ArtifactMetadata): ArtifactSummary => ({
  id: metadata.id,
  format: metadata.format,
  bytes: metadata.bytes,
  lines: metadata.lineCount,
  summary: metadata.summary,
  tags: [...metadata.tags],
  preview: metadata.preview
})

// =============================================================================
// Handler Factory Functions
// =============================================================================

/**
 * Create handler for context_list tool
 */
const makeContextListHandler =
  (service: ArtifactStoreServiceInterface) =>
  (params: ContextListParams): Effect.Effect<ContextListResponse> =>
    pipe(
      Effect.gen(function* () {
        const artifacts = yield* service.list({
          tags: params.tags,
          sessionId: params.session_id,
          limit: params.limit ?? 50
        })

        const total = yield* service.count()

        return {
          artifacts: artifacts.map(toArtifactSummary),
          total
        }
      }),
      Effect.tap(() => Effect.logDebug("context_list executed"))
    )

/**
 * Create handler for context_read tool
 */
const makeContextReadHandler =
  (service: ArtifactStoreServiceInterface) =>
  (params: ContextReadParams): Effect.Effect<ContextReadResponse> =>
    pipe(
      Effect.gen(function* () {
        // Get metadata for total lines/bytes
        const metadataResult = yield* service.getMetadata(params.artifact_id).pipe(
          Effect.catchTag("ArtifactNotFoundError", () =>
            Effect.succeed(null)
          )
        )

        if (metadataResult === null) {
          return {
            artifact_id: params.artifact_id,
            content: "",
            format: "text" as const,
            total_lines: 0,
            total_bytes: 0,
            from_line: 0,
            lines_returned: 0,
            has_more: false
          }
        }

        const fromLine = params.from_line ?? 0
        const lineLimit = params.line_limit ?? 100

        // Retrieve content with pagination
        const content = yield* service.retrieve(params.artifact_id, {
          fromLine,
          lineLimit,
          offset: params.offset,
          byteLimit: params.byte_limit
        }).pipe(
          Effect.catchAll(() => Effect.succeed(""))
        )

        const linesReturned = content.split("\n").length
        const hasMore = fromLine + linesReturned < metadataResult.lineCount

        return {
          artifact_id: params.artifact_id,
          content,
          format: metadataResult.format,
          total_lines: metadataResult.lineCount,
          total_bytes: metadataResult.bytes,
          from_line: fromLine,
          lines_returned: linesReturned,
          has_more: hasMore
        }
      }),
      Effect.tap(() => Effect.logDebug("context_read executed"))
    )

/**
 * Create handler for context_search tool
 */
const makeContextSearchHandler =
  (service: ArtifactStoreServiceInterface) =>
  (params: ContextSearchParams): Effect.Effect<ContextSearchResponse> =>
    pipe(
      Effect.gen(function* () {
        const results = yield* service.search({
          pattern: params.pattern,
          artifactId: params.artifact_id,
          contextLines: params.context_lines ?? 2,
          limit: params.limit ?? 20
        }).pipe(
          Effect.catchAll(() => Effect.succeed([]))
        )

        // Count unique artifacts searched
        const artifactsSearched = new Set(results.map(r => r.artifactId)).size

        return {
          matches: results.map(r => ({
            artifact_id: r.artifactId,
            line_number: r.lineNumber,
            line: r.line,
            before: [...r.before],
            after: [...r.after]
          })),
          total_matches: results.length,
          artifacts_searched: artifactsSearched
        }
      }),
      Effect.tap(() => Effect.logDebug("context_search executed"))
    )

/**
 * Create handler for context_tail tool
 */
const makeContextTailHandler =
  (service: ArtifactStoreServiceInterface) =>
  (params: ContextTailParams): Effect.Effect<ContextTailResponse> =>
    pipe(
      Effect.gen(function* () {
        // Get metadata
        const metadataResult = yield* service.getMetadata(params.artifact_id).pipe(
          Effect.catchTag("ArtifactNotFoundError", () =>
            Effect.succeed(null)
          )
        )

        if (metadataResult === null) {
          return {
            artifact_id: params.artifact_id,
            content: "",
            format: "text" as const,
            total_lines: 0,
            lines_returned: 0,
            start_line: 0
          }
        }

        const requestedLines = params.lines ?? 50
        const startLine = Math.max(0, metadataResult.lineCount - requestedLines)

        // Retrieve from calculated start line
        const content = yield* service.retrieve(params.artifact_id, {
          fromLine: startLine,
          lineLimit: requestedLines
        }).pipe(
          Effect.catchAll(() => Effect.succeed(""))
        )

        const linesReturned = content.split("\n").length

        return {
          artifact_id: params.artifact_id,
          content,
          format: metadataResult.format,
          total_lines: metadataResult.lineCount,
          lines_returned: linesReturned,
          start_line: startLine
        }
      }),
      Effect.tap(() => Effect.logDebug("context_tail executed"))
    )

// =============================================================================
// Handler Factory
// =============================================================================

/**
 * Create all context discovery handlers
 *
 * Requires ArtifactStoreService in context
 */
const makeContextDiscoveryHandlers = Effect.gen(function* () {
  const storeService = yield* ArtifactStoreService

  return ContextDiscoveryToolkit.of({
    context_list: makeContextListHandler(storeService),
    context_read: makeContextReadHandler(storeService),
    context_search: makeContextSearchHandler(storeService),
    context_tail: makeContextTailHandler(storeService)
  })
})

// =============================================================================
// Layer
// =============================================================================

/**
 * Layer providing ContextDiscoveryToolkit handlers
 *
 * Requires ArtifactStoreService to be available in context.
 *
 * Usage:
 * ```ts
 * const program = ContextDiscoveryToolkit.pipe(
 *   Effect.flatMap(toolkit => toolkit.handle("context_list", {}))
 * )
 *
 * const runnable = program.pipe(
 *   Effect.provide(ContextDiscoveryHandlersLayer),
 *   Effect.provide(ArtifactStoreService.Default)
 * )
 * ```
 */
export const ContextDiscoveryHandlersLayer = ContextDiscoveryToolkit.toLayer(
  makeContextDiscoveryHandlers
)

/**
 * Combined layer with ArtifactStoreService
 *
 * Self-contained layer that provides both handlers and their dependency.
 */
export const ContextDiscoveryLive: Layer.Layer<
  Toolkit.Handlers<typeof ContextDiscoveryToolkit>
> = ContextDiscoveryHandlersLayer.pipe(
  Layer.provide(ArtifactStoreService.Default)
)

// =============================================================================
// Exports
// =============================================================================

export {
  makeContextListHandler,
  makeContextReadHandler,
  makeContextSearchHandler,
  makeContextTailHandler,
  makeContextDiscoveryHandlers
}
