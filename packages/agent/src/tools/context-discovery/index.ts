/**
 * Context Discovery Tools Module
 *
 * Tools for dynamic context discovery from artifact storage.
 * Enables agents to retrieve content on-demand.
 *
 * @module
 */

// Schemas
export type {
  ContextListParams,
  ContextListResponse,
  ContextReadParams,
  ContextReadResponse,
  ContextSearchParams,
  ContextSearchResponse,
  ContextTailParams,
  ContextTailResponse,
  ArtifactSummary,
  SearchMatch
} from "./schemas.js"

// Tool Definitions
export {
  ContextListTool,
  ContextReadTool,
  ContextSearchTool,
  ContextTailTool,
  ContextDiscoveryToolkit,
  type ContextDiscoveryToolkit as ContextDiscoveryToolkitType,
  type ContextListToolType,
  type ContextReadToolType,
  type ContextSearchToolType,
  type ContextTailToolType
} from "./definitions.js"

// Handlers
export {
  ContextDiscoveryHandlersLayer,
  ContextDiscoveryLive,
  makeContextListHandler,
  makeContextReadHandler,
  makeContextSearchHandler,
  makeContextTailHandler,
  makeContextDiscoveryHandlers,
  type ContextDiscoveryHandlers
} from "./handlers.js"
