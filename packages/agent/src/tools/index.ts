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
  MbId,
  type MbEntityType as MbEntityTypeValue,
  type MbId as MbIdValue,
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
  type InsightSummary as InsightSummaryType
} from "./schemas.js"

// Tool definitions
export {
  SearchPlaysTool,
  SemanticSearchTool,
  ResolveMbidTool,
  FetchLinkTool,
  GetRecentInsightsTool,
  CrateToolkit,
  type CrateToolkit as CrateToolkitType,
  type SearchPlaysToolType,
  type SemanticSearchToolType,
  type ResolveMbidToolType,
  type FetchLinkToolType,
  type GetRecentInsightsToolType
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
