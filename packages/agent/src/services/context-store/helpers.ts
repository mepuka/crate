/**
 * Context Store Helpers
 *
 * Utility functions for working with artifacts including:
 * - captureLarge: Auto-offload large content to artifact store
 * - formatRef: Human-readable artifact reference
 * - generateId: SHA256-based artifact IDs
 *
 * @module
 */

import { Effect } from "effect"
import { createHash } from "crypto"
import type {
  ArtifactFormat,
  ArtifactRef,
  CaptureResult
} from "./types.js"
import { ArtifactStoreError } from "./types.js"
import { ArtifactStoreService } from "./ArtifactStoreService.js"

// =============================================================================
// Constants
// =============================================================================

/**
 * Default threshold for auto-capture (12K chars ≈ 3K tokens)
 */
export const DEFAULT_CAPTURE_THRESHOLD = 12_000

/**
 * Maximum summary length
 */
export const MAX_SUMMARY_LENGTH = 200

/**
 * Preview length for artifacts
 */
export const PREVIEW_LENGTH = 200

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate artifact ID from content using SHA256 prefix
 */
export const generateArtifactId = (content: string): string => {
  const hash = createHash("sha256").update(content).digest("hex")
  return hash.substring(0, 16)
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format artifact reference for LLM-readable output
 *
 * @example
 * formatRef(ref) => "[ARTIFACT:a1b2c3d4] plays.json (45.2KB, 342 lines)"
 */
export const formatRef = (ref: ArtifactRef, lineCount?: number): string => {
  const sizeKb = (ref.bytes / 1024).toFixed(1)
  const lines = lineCount ? `, ${lineCount} lines` : ""
  return `[ARTIFACT:${ref.id}] ${ref.summary} (${sizeKb}KB${lines})`
}

/**
 * Format multiple artifact refs as a list
 */
export const formatRefs = (
  refs: readonly ArtifactRef[],
  lineCounts?: Map<string, number>
): string => {
  return refs
    .map(ref => formatRef(ref, lineCounts?.get(ref.id)))
    .join("\n")
}

/**
 * Truncate string to max length with ellipsis
 */
export const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + "..."
}

/**
 * Generate preview from content (first N chars, clean)
 */
export const generatePreview = (content: string, maxLength = PREVIEW_LENGTH): string => {
  // Clean whitespace and truncate
  const clean = content.replace(/\s+/g, " ").trim()
  return truncate(clean, maxLength)
}

/**
 * Count lines in content
 */
export const countLines = (content: string): number => {
  if (content.length === 0) return 0
  return content.split("\n").length
}

// =============================================================================
// captureLarge
// =============================================================================

/**
 * Options for captureLarge
 */
export interface CaptureLargeOptions {
  /** Storage format */
  readonly format?: ArtifactFormat
  /** LLM-readable summary (required) */
  readonly summary: string
  /** Searchable tags */
  readonly tags?: readonly string[]
  /** Session scope for cleanup */
  readonly sessionId?: string
  /** Threshold in chars (default: 12K) */
  readonly threshold?: number
  /** Preview length for artifact mode */
  readonly previewLength?: number
}

/**
 * Capture large content to artifact store if above threshold
 *
 * Returns inline content if below threshold, or artifact ref with preview
 * if above. This enables agents to work with compact references while
 * using context discovery tools for full content.
 *
 * @example
 * ```typescript
 * const result = yield* captureLarge(largeJson, {
 *   format: "json",
 *   summary: "342 plays from 2025-01-06",
 *   tags: ["plays", "2025-01-06"]
 * })
 *
 * if (result.type === "inline") {
 *   // Use content directly
 * } else {
 *   // Use result.ref for context tools, result.preview for inline hint
 * }
 * ```
 */
export const captureLarge = (
  content: string,
  options: CaptureLargeOptions
): Effect.Effect<CaptureResult, ArtifactStoreError, ArtifactStoreService> =>
  Effect.gen(function* () {
    const threshold = options.threshold ?? DEFAULT_CAPTURE_THRESHOLD
    const previewLength = options.previewLength ?? PREVIEW_LENGTH

    // Below threshold - return inline
    if (content.length <= threshold) {
      return { type: "inline" as const, content }
    }

    // Above threshold - store as artifact
    const store = yield* ArtifactStoreService

    const ref = yield* store.store({
      content,
      format: options.format ?? "text",
      summary: truncate(options.summary, MAX_SUMMARY_LENGTH),
      tags: options.tags,
      sessionId: options.sessionId
    })

    const preview = generatePreview(content, previewLength)

    return {
      type: "artifact" as const,
      ref,
      preview
    }
  })

// =============================================================================
// Play ID Instructions
// =============================================================================

/**
 * Format instructions for context tool usage
 */
export const formatContextToolInstructions = (artifactRefs: readonly ArtifactRef[]): string => {
  if (artifactRefs.length === 0) return ""

  const refList = artifactRefs
    .map(ref => `  - ${ref.id}: ${ref.summary} [${ref.format}]`)
    .join("\n")

  return `## Available Artifacts

${refList}

## Context Discovery Tools

Use these tools to retrieve artifact content on demand:

- \`context_list(tags?)\` - List available artifacts
- \`context_read(artifact_id, offset?, limit?)\` - Read artifact content
- \`context_search(pattern, artifact_id?)\` - Search within artifacts
- \`context_tail(artifact_id, lines?)\` - Read last N lines

**Strategy**: Start with summaries above. Use context tools to retrieve specific data as needed.`
}
