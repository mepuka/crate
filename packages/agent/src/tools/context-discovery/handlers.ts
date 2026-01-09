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
import { Toolkit, Tool } from "@effect/ai"
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
 * Tool.HandlersFor is the type returned by Toolkit.toLayer
 */
export type ContextDiscoveryHandlers = Tool.HandlersFor<Toolkit.Tools<typeof ContextDiscoveryToolkit>>

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

        // Add guidance message when no artifacts found
        const message = artifacts.length === 0
          ? "No artifacts stored yet. Use the day data index to identify shows and plays to explore, then use other tools like semantic_search and explore_graph."
          : undefined

        return {
          artifacts: artifacts.map(toArtifactSummary),
          total,
          message
        }
      }),
      Effect.tap((result) =>
        Effect.log(`context_list: returned ${result.artifacts.length}/${result.total} artifacts`)
      )
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
            has_more: false,
            error_message: `Artifact '${params.artifact_id}' not found. Use context_list to see available artifacts, or verify the artifact ID from the day data index.`
          }
        }

        const fromLine = params.from_line ?? 0
        // Default to 15 lines (~2.25K tokens) to prevent chat history explosion
        // HARD CAP at 25 lines (~3.75K tokens) - model cannot override this
        // This prevents quadratic context growth in iterative agents
        const MAX_LINES = 25
        const requestedLimit = params.line_limit ?? 15
        const lineLimit = Math.min(requestedLimit, MAX_LINES)

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
      Effect.tap((result) =>
        Effect.log(`context_read: ${params.artifact_id} lines ${result.from_line}-${result.from_line + result.lines_returned}/${result.total_lines} (${result.content.length} chars)`)
      )
    )

/**
 * Create handler for context_search tool
 */
const makeContextSearchHandler =
  (service: ArtifactStoreServiceInterface) =>
  (params: ContextSearchParams): Effect.Effect<ContextSearchResponse> =>
    pipe(
      Effect.gen(function* () {
        // HARD CAPS to prevent context overflow
        // Each match with context = ~3 lines × ~600 bytes = ~1.8KB
        // 10 matches × 1.8KB = ~18KB max per search
        const MAX_MATCHES = 10
        const MAX_CONTEXT_LINES = 1

        const requestedLimit = params.limit ?? 10
        const requestedContext = params.context_lines ?? 1

        const results = yield* service.search({
          pattern: params.pattern,
          artifactId: params.artifact_id,
          contextLines: Math.min(requestedContext, MAX_CONTEXT_LINES),
          limit: Math.min(requestedLimit, MAX_MATCHES)
        }).pipe(
          Effect.catchAll(() => Effect.succeed([]))
        )

        // Count unique artifacts searched
        const artifactsSearched = new Set(results.map(r => r.artifactId)).size

        // Add guidance message when no matches found
        const message = results.length === 0
          ? `No matches for pattern "${params.pattern}". Patterns are case-insensitive. Try broader patterns, different keywords, or use context_read to browse artifact content directly.`
          : undefined

        return {
          matches: results.map(r => ({
            artifact_id: r.artifactId,
            line_number: r.lineNumber,
            line: r.line,
            before: [...r.before],
            after: [...r.after]
          })),
          total_matches: results.length,
          artifacts_searched: artifactsSearched,
          message
        }
      }),
      Effect.tap((result) =>
        Effect.log(`context_search: pattern="${params.pattern}" found ${result.total_matches} matches in ${result.artifacts_searched} artifacts`)
      )
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
            start_line: 0,
            error_message: `Artifact '${params.artifact_id}' not found. Use context_list to see available artifacts.`
          }
        }

        // Default to 15 lines (~2.25K tokens) to prevent chat history explosion
        // HARD CAP at 25 lines to match context_read limits
        const MAX_LINES = 25
        const requestedLines = Math.min(params.lines ?? 15, MAX_LINES)
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
      Effect.tap((result) =>
        Effect.log(`context_tail: ${params.artifact_id} last ${result.lines_returned}/${result.total_lines} lines (${result.content.length} chars)`)
      )
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
  ContextDiscoveryHandlers
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
