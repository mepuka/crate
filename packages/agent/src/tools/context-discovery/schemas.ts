/**
 * Context Discovery Tool Schemas
 *
 * Schema definitions for context discovery tools that enable
 * agents to retrieve content from the artifact store.
 *
 * @module
 */

import { Schema } from "effect"

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * Artifact format type
 */
export const ArtifactFormatSchema = Schema.Literal("json", "markdown", "text", "ndjson")

// =============================================================================
// context_list - List available artifacts
// =============================================================================

/**
 * Parameters for context_list tool
 */
export const ContextListParams = Schema.Struct({
  tags: Schema.optional(Schema.Array(Schema.String)).annotations({
    description: "Filter by tags (AND logic)"
  }),
  session_id: Schema.optional(Schema.String).annotations({
    description: "Filter by session scope"
  }),
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum results (default: 50)"
  })
})
export type ContextListParams = typeof ContextListParams.Type

/**
 * Artifact summary in list response
 */
export const ArtifactSummary = Schema.Struct({
  id: Schema.String,
  format: ArtifactFormatSchema,
  bytes: Schema.Number,
  lines: Schema.Number,
  summary: Schema.String,
  tags: Schema.Array(Schema.String),
  preview: Schema.String
})
export type ArtifactSummary = typeof ArtifactSummary.Type

/**
 * Response for context_list tool
 */
export const ContextListResponse = Schema.Struct({
  artifacts: Schema.Array(ArtifactSummary),
  total: Schema.Number
})
export type ContextListResponse = typeof ContextListResponse.Type

// =============================================================================
// context_read - Read artifact content with pagination
// =============================================================================

/**
 * Parameters for context_read tool
 */
export const ContextReadParams = Schema.Struct({
  artifact_id: Schema.String.annotations({
    description: "Artifact ID to read"
  }),
  from_line: Schema.optional(Schema.Number).annotations({
    description: "Start line (0-indexed)"
  }),
  line_limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum lines to return (default: 100)"
  }),
  offset: Schema.optional(Schema.Number).annotations({
    description: "Byte offset for raw pagination"
  }),
  byte_limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum bytes to return"
  })
})
export type ContextReadParams = typeof ContextReadParams.Type

/**
 * Response for context_read tool
 */
export const ContextReadResponse = Schema.Struct({
  artifact_id: Schema.String,
  content: Schema.String,
  format: ArtifactFormatSchema,
  total_lines: Schema.Number,
  total_bytes: Schema.Number,
  from_line: Schema.Number,
  lines_returned: Schema.Number,
  has_more: Schema.Boolean
})
export type ContextReadResponse = typeof ContextReadResponse.Type

// =============================================================================
// context_search - Search within artifacts
// =============================================================================

/**
 * Parameters for context_search tool
 */
export const ContextSearchParams = Schema.Struct({
  pattern: Schema.String.annotations({
    description: "Search pattern (regex supported)"
  }),
  artifact_id: Schema.optional(Schema.String).annotations({
    description: "Limit search to specific artifact"
  }),
  context_lines: Schema.optional(Schema.Number).annotations({
    description: "Lines of context around matches (default: 2)"
  }),
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum matches (default: 20)"
  })
})
export type ContextSearchParams = typeof ContextSearchParams.Type

/**
 * Search match result
 */
export const SearchMatch = Schema.Struct({
  artifact_id: Schema.String,
  line_number: Schema.Number,
  line: Schema.String,
  before: Schema.Array(Schema.String),
  after: Schema.Array(Schema.String)
})
export type SearchMatch = typeof SearchMatch.Type

/**
 * Response for context_search tool
 */
export const ContextSearchResponse = Schema.Struct({
  matches: Schema.Array(SearchMatch),
  total_matches: Schema.Number,
  artifacts_searched: Schema.Number
})
export type ContextSearchResponse = typeof ContextSearchResponse.Type

// =============================================================================
// context_tail - Read last N lines
// =============================================================================

/**
 * Parameters for context_tail tool
 */
export const ContextTailParams = Schema.Struct({
  artifact_id: Schema.String.annotations({
    description: "Artifact ID to read"
  }),
  lines: Schema.optional(Schema.Number).annotations({
    description: "Number of lines from end (default: 50)"
  })
})
export type ContextTailParams = typeof ContextTailParams.Type

/**
 * Response for context_tail tool
 */
export const ContextTailResponse = Schema.Struct({
  artifact_id: Schema.String,
  content: Schema.String,
  format: ArtifactFormatSchema,
  total_lines: Schema.Number,
  lines_returned: Schema.Number,
  start_line: Schema.Number
})
export type ContextTailResponse = typeof ContextTailResponse.Type
