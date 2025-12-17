/**
 * Crate Research Agent Tools
 *
 * Tool definitions, schemas, and toolkit for the AI agent.
 *
 * @module
 */

// Schemas
export {
  // Common types
  MbEntityType,
  type MbEntityType as MbEntityTypeValue,
  // Play result
  PlayResultSchema,
  type PlayResult,
  // SearchPlays
  SearchPlaysParams,
  SearchPlaysResponse,
  type SearchPlaysParams as SearchPlaysParamsType,
  type SearchPlaysResponse as SearchPlaysResponseType,
  // SemanticSearch
  SemanticSearchParams,
  SemanticSearchResponse,
  type SemanticSearchParams as SemanticSearchParamsType,
  type SemanticSearchResponse as SemanticSearchResponseType,
  // ResolveMbid
  ResolveMbidParams,
  ResolveMbidResponse,
  MbEntityResult,
  type ResolveMbidParams as ResolveMbidParamsType,
  type ResolveMbidResponse as ResolveMbidResponseType,
  type MbEntityResult as MbEntityResultType,
  // FetchLink
  FetchLinkParams,
  FetchLinkResponse,
  ExtractedLink,
  type FetchLinkParams as FetchLinkParamsType,
  type FetchLinkResponse as FetchLinkResponseType,
  type ExtractedLink as ExtractedLinkType,
  // GetRecentInsights
  GetRecentInsightsParams,
  GetRecentInsightsResponse,
  InsightSummary,
  type GetRecentInsightsParams as GetRecentInsightsParamsType,
  type GetRecentInsightsResponse as GetRecentInsightsResponseType,
  type InsightSummary as InsightSummaryType,
  // Graph
  GraphQueryType,
  GraphConnectionsParams,
  GraphConnectionsResponse,
  ConnectionNode,
  ExploreGraphParams,
  ExploreGraphResponse,
  type GraphQueryType as GraphQueryTypeValue,
  type GraphConnectionsParams as GraphConnectionsParamsType,
  type GraphConnectionsResponse as GraphConnectionsResponseType,
  type ConnectionNode as ConnectionNodeType,
  type ExploreGraphParams as ExploreGraphParamsType,
  type ExploreGraphResponse as ExploreGraphResponseType
} from "./schemas.js"

// Tool definitions
export {
  SearchPlaysTool,
  SemanticSearchTool,
  ResolveMbidTool,
  FetchLinkTool,
  GetRecentInsightsTool,
  GraphConnectionsTool,
  ExploreGraphTool,
  CrateToolkit,
  type CrateToolkit as CrateToolkitType,
  type SearchPlaysToolType,
  type SemanticSearchToolType,
  type ResolveMbidToolType,
  type FetchLinkToolType,
  type GetRecentInsightsToolType,
  type GraphConnectionsToolType,
  type ExploreGraphToolType
} from "./definitions.js"

// Tool handlers
export {
  CrateToolHandlersLayer,
  makeCrateToolHandlers,
  makeSearchPlaysHandler,
  makeSemanticSearchHandler,
  makeResolveMbidHandler,
  makeFetchLinkHandler,
  makeGetRecentInsightsHandler,
  type CrateToolHandlers,
  type CrateToolServices
} from "./handlers.js"

// Retry policy for transient failure handling
export {
  withRetry,
  withRetryOrDefault,
  isRetryableError,
  makeRetrySchedule,
  DEFAULT_RETRY_CONFIG,
  TOOL_RETRY_CONFIGS
} from "./retry-policy.js"
