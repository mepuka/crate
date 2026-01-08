/**
 * Context Discovery Tool Definitions
 *
 * Tools for dynamic context discovery from the artifact store.
 * Enables agents to retrieve content on-demand instead of
 * embedding large data inline.
 *
 * @module
 */

import { Tool, Toolkit } from "@effect/ai"
import {
  ContextListParams,
  ContextListResponse,
  ContextReadParams,
  ContextReadResponse,
  ContextSearchParams,
  ContextSearchResponse,
  ContextTailParams,
  ContextTailResponse
} from "./schemas.js"

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * List available artifacts
 *
 * Returns a summary of artifacts available for retrieval.
 * Use tags to filter by category (e.g., "plays", "research").
 */
export const ContextListTool = Tool.make("context_list", {
  description: `List available artifacts in the context store.

Use this to discover what data is available before reading:
- Filter by tags: ["plays", "2025-01-06"] for specific categories
- Filter by session_id to see artifacts from current session only
- Returns summaries with format, size, line count, and preview

**Typical workflow:**
1. context_list() to see all available artifacts
2. context_read(artifact_id) to retrieve specific content
3. context_search(pattern) to find specific data across artifacts

Returns artifact IDs that can be used with context_read and context_search.`,
  parameters: ContextListParams.fields,
  success: ContextListResponse,
  failureMode: "return"
})

/**
 * Read artifact content with pagination
 *
 * Retrieves artifact content with support for line-based or byte-based pagination.
 */
export const ContextReadTool = Tool.make("context_read", {
  description: `Read content from a specific artifact with optional pagination.

Use this to retrieve full or partial artifact content:
- artifact_id: Required, from context_list
- from_line/line_limit: Line-based pagination (recommended for text/ndjson)
- offset/byte_limit: Byte-based pagination (for precise control)

**Pagination strategy:**
- For JSON arrays: Read all, parse in your logic
- For NDJSON: Read in chunks using from_line/line_limit
- For large text: Use line-based pagination to avoid overwhelming context

**Returns:**
- content: The requested portion
- has_more: Whether more content is available
- total_lines/total_bytes: For pagination planning

Example: Read first 50 lines of plays
  context_read(artifact_id="abc123", line_limit=50)

Example: Read next 50 lines
  context_read(artifact_id="abc123", from_line=50, line_limit=50)`,
  parameters: ContextReadParams.fields,
  success: ContextReadResponse,
  failureMode: "return"
})

/**
 * Search within artifacts
 *
 * Search for patterns across one or all artifacts.
 */
export const ContextSearchTool = Tool.make("context_search", {
  description: `Search for patterns within artifacts.

Use this to find specific data without reading entire artifacts:
- pattern: Regex pattern to match (case-insensitive)
- artifact_id: Optional, limit search to one artifact
- context_lines: Lines before/after matches (default: 2)

**Use cases:**
- Find plays by artist: context_search(pattern="Fleet Foxes")
- Find specific data: context_search(pattern="rotation.*heavy")
- Search JSON: context_search(pattern="\"is_local\": true")

**Returns:**
- matches: Array of {line, line_number, before, after}
- artifact_id: Which artifact contained each match
- total_matches: Total found (may be capped by limit)

Returns up to 20 matches by default. Increase limit if needed.`,
  parameters: ContextSearchParams.fields,
  success: ContextSearchResponse,
  failureMode: "return"
})

/**
 * Read last N lines of an artifact
 *
 * Useful for logs, chronological data, or checking recent entries.
 */
export const ContextTailTool = Tool.make("context_tail", {
  description: `Read the last N lines of an artifact (like Unix tail).

Use this for:
- Chronological data: Get most recent entries
- Logs: Check latest activity
- NDJSON: Read recent records without knowing total size

Parameters:
- artifact_id: Required, from context_list
- lines: Number of lines from end (default: 50)

**Tip:** Combine with context_search to find relevant sections,
then use context_tail or context_read to get full context.`,
  parameters: ContextTailParams.fields,
  success: ContextTailResponse,
  failureMode: "return"
})

// =============================================================================
// Toolkit
// =============================================================================

/**
 * Context Discovery Toolkit
 *
 * All tools for artifact-based context retrieval.
 */
export const ContextDiscoveryToolkit = Toolkit.make(
  ContextListTool,
  ContextReadTool,
  ContextSearchTool,
  ContextTailTool
)

export type ContextDiscoveryToolkit = typeof ContextDiscoveryToolkit

// =============================================================================
// Tool Types
// =============================================================================

export type ContextListToolType = typeof ContextListTool
export type ContextReadToolType = typeof ContextReadTool
export type ContextSearchToolType = typeof ContextSearchTool
export type ContextTailToolType = typeof ContextTailTool
