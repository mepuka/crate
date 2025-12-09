/**
 * Error Types for Crate Research Agent
 *
 * Tagged errors for all agent services using Data.TaggedError.
 * Each error includes structured context for debugging and recovery.
 *
 * @module
 */

import { Data } from "effect"

// =============================================================================
// Base API Error
// =============================================================================

/**
 * Base HTTP API error - used for all external service failures
 */
export class ApiError extends Data.TaggedError("ApiError")<{
  readonly message: string
  readonly statusCode?: number
  readonly url?: string
  readonly cause?: unknown
}> {}

// =============================================================================
// Search Errors
// =============================================================================

/**
 * Error from KEXP play history search operations
 */
export class SearchPlaysError extends Data.TaggedError("SearchPlaysError")<{
  readonly message: string
  readonly query?: string
  readonly cause?: unknown
}> {}

/**
 * Error from semantic/vector similarity search operations
 */
export class SemanticSearchError extends Data.TaggedError("SemanticSearchError")<{
  readonly message: string
  readonly query?: string
  readonly cause?: unknown
}> {}

/**
 * Error from hybrid search operations (FTS5 + FAISS)
 */
export class HybridSearchError extends Data.TaggedError("HybridSearchError")<{
  readonly message: string
  readonly query?: string
  readonly cause?: unknown
}> {}

// =============================================================================
// Resolution Errors
// =============================================================================

/**
 * Error from MusicBrainz ID resolution operations
 */
export class MbidResolveError extends Data.TaggedError("MbidResolveError")<{
  readonly message: string
  readonly entityType?: "artist" | "recording" | "release" | "release_group" | "label" | "place" | undefined
  readonly query?: string
  readonly mbid?: string
  readonly cause?: unknown
}> {}

// =============================================================================
// Content Fetch Errors
// =============================================================================

/**
 * Error from web content fetching (Jina Reader)
 */
export class LinkFetchError extends Data.TaggedError("LinkFetchError")<{
  readonly message: string
  readonly url?: string
  readonly cause?: unknown
}> {}

// =============================================================================
// Validation Errors
// =============================================================================

/**
 * Input validation error - parameters failed schema validation
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string
  readonly field?: string
  readonly value?: unknown
  readonly cause?: unknown
}> {}

// =============================================================================
// Session Errors
// =============================================================================

/**
 * Error from insight session management
 */
export class SessionError extends Data.TaggedError("SessionError")<{
  readonly message: string
  readonly sessionId?: string
  readonly cause?: unknown
}> {}

/**
 * Error from graph connections API or graph cache operations
 */
export class GraphApiError extends Data.TaggedError("GraphApiError")<{
  readonly message: string
  readonly query?: string
  readonly cause?: unknown
}> {}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Union of all tool-related errors
 */
export type ToolError =
  | ApiError
  | SearchPlaysError
  | SemanticSearchError
  | HybridSearchError
  | MbidResolveError
  | LinkFetchError
  | ValidationError
  | SessionError
  | GraphApiError

/**
 * Set of valid ToolError tags for O(1) lookup
 */
const toolErrorTags = new Set([
  "ApiError",
  "SearchPlaysError",
  "SemanticSearchError",
  "HybridSearchError",
  "MbidResolveError",
  "LinkFetchError",
  "ValidationError",
  "SessionError",
  "GraphApiError"
] as const)

/**
 * Type guard for ToolError
 * Uses Set.has() for O(1) tag lookup instead of chained || comparisons
 */
export const isToolError = (error: unknown): error is ToolError =>
  error !== null &&
  typeof error === "object" &&
  "_tag" in error &&
  typeof (error as { _tag: unknown })._tag === "string" &&
  toolErrorTags.has((error as { _tag: string })._tag as typeof toolErrorTags extends Set<infer T> ? T : never)
