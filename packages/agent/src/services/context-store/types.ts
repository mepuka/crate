/**
 * Context Store Types
 *
 * Types for the artifact-based context storage system.
 * Enables dynamic context discovery by storing large content
 * as artifacts with compact references.
 *
 * @module
 */

import { Data } from "effect"

// =============================================================================
// Artifact Format
// =============================================================================

/**
 * Supported artifact storage formats
 */
export type ArtifactFormat = "json" | "markdown" | "text" | "ndjson"

// =============================================================================
// Artifact Reference
// =============================================================================

/**
 * Compact reference to a stored artifact
 *
 * This is the primary type passed to agents instead of large content.
 * Agents use context discovery tools to retrieve artifact content.
 */
export interface ArtifactRef {
  /** Unique artifact ID (SHA256 prefix, 16 chars) */
  readonly id: string
  /** Storage format for parsing hints */
  readonly format: ArtifactFormat
  /** Content size in bytes */
  readonly bytes: number
  /** LLM-readable summary (max 200 chars) */
  readonly summary: string
  /** Searchable tags for filtering */
  readonly tags: readonly string[]
  /** ISO timestamp of creation */
  readonly createdAt: string
  /** Optional session scope for cleanup */
  readonly sessionId?: string | undefined
}

// =============================================================================
// Artifact Metadata
// =============================================================================

/**
 * Extended metadata for listing/searching artifacts
 */
export interface ArtifactMetadata extends ArtifactRef {
  /** Line count for pagination hints */
  readonly lineCount: number
  /** Preview of first ~200 chars */
  readonly preview: string
}

// =============================================================================
// Store Parameters
// =============================================================================

/**
 * Parameters for storing an artifact
 */
export interface StoreParams {
  /** Content to store */
  readonly content: string
  /** Storage format */
  readonly format: ArtifactFormat
  /** LLM-readable summary (max 200 chars) */
  readonly summary: string
  /** Searchable tags */
  readonly tags?: readonly string[] | undefined
  /** Session scope for cleanup */
  readonly sessionId?: string | undefined
}

/**
 * Parameters for listing artifacts
 */
export interface ListParams {
  /** Filter by tags (AND logic) */
  readonly tags?: readonly string[] | undefined
  /** Filter by session */
  readonly sessionId?: string | undefined
  /** Maximum results */
  readonly limit?: number | undefined
}

/**
 * Parameters for searching within artifacts
 */
export interface SearchParams {
  /** Search pattern (regex supported) */
  readonly pattern: string
  /** Optional artifact ID to search within */
  readonly artifactId?: string | undefined
  /** Lines of context around matches */
  readonly contextLines?: number | undefined
  /** Maximum results */
  readonly limit?: number | undefined
}

/**
 * Search result with context
 */
export interface SearchResult {
  /** Artifact containing the match */
  readonly artifactId: string
  /** Line number of match */
  readonly lineNumber: number
  /** Matching line content */
  readonly line: string
  /** Context before match */
  readonly before: readonly string[]
  /** Context after match */
  readonly after: readonly string[]
}

/**
 * Options for retrieving artifact content
 */
export interface RetrieveOptions {
  /** Start offset in bytes */
  readonly offset?: number | undefined
  /** Maximum bytes to return */
  readonly byteLimit?: number | undefined
  /** Start line for line-based pagination */
  readonly fromLine?: number | undefined
  /** Maximum lines to return */
  readonly lineLimit?: number | undefined
}

// =============================================================================
// Stored Artifact (Internal)
// =============================================================================

/**
 * Full stored artifact (internal use only)
 */
export interface StoredArtifact {
  readonly ref: ArtifactRef
  readonly content: string
  readonly lineCount: number
  readonly preview: string
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Base error for artifact store operations
 */
export class ArtifactStoreError extends Data.TaggedError("ArtifactStoreError")<{
  readonly message: string
  readonly operation: "store" | "retrieve" | "search" | "list" | "clear"
  readonly cause?: unknown
}> {}

/**
 * Artifact not found error
 */
export class ArtifactNotFoundError extends Data.TaggedError("ArtifactNotFoundError")<{
  readonly artifactId: string
}> {}

// =============================================================================
// captureLarge Result
// =============================================================================

/**
 * Result of captureLarge operation
 * Either inline content or artifact reference with preview
 */
export type CaptureResult =
  | { readonly type: "inline"; readonly content: string }
  | { readonly type: "artifact"; readonly ref: ArtifactRef; readonly preview: string }
