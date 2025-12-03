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

// =============================================================================
// Resolution Errors
// =============================================================================

/**
 * Error from MusicBrainz ID resolution operations
 */
export class MbidResolveError extends Data.TaggedError("MbidResolveError")<{
  readonly message: string
  readonly entityType?: "artist" | "recording" | "release" | "release_group" | "label" | undefined
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
  | MbidResolveError
  | LinkFetchError
  | ValidationError
  | SessionError

/**
 * Type guard for ToolError
 */
export const isToolError = (error: unknown): error is ToolError => {
  if (error === null || typeof error !== "object") return false
  const tag = (error as { _tag?: string })._tag
  return (
    tag === "ApiError" ||
    tag === "SearchPlaysError" ||
    tag === "SemanticSearchError" ||
    tag === "MbidResolveError" ||
    tag === "LinkFetchError" ||
    tag === "ValidationError" ||
    tag === "SessionError"
  )
}
