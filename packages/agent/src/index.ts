/**
 * @crate/agent
 *
 * AI Agent for interacting with the FAISS search API
 */

import { Layer } from "effect"
import { FetchHttpClient } from "@effect/platform"
import { FaissConfig, FaissClient } from "./FaissClient.js"
import { MusicAgentLive, MusicAgentWithAnthropicLive } from "./MusicAgent.js"

// =============================================================================
// Legacy Services (FaissClient, MusicAgent)
// =============================================================================
export { FaissConfig, FaissClient, FaissApiError, FaissClientLive } from "./FaissClient.js"
export type { PlayResult, SearchResponse, TimelineResponse } from "./FaissClient.js"
export {
  MusicAgent,
  MusicAgentLive,
  MusicAgentWithAnthropicLive,
  MusicAgentError,
  type MusicAgentInterface,
  type MusicAgentRequirements
} from "./MusicAgent.js"

// =============================================================================
// Configuration Services
// =============================================================================
export {
  FaissConfig as FaissApiConfig,
  MusicBrainzConfig,
  JinaConfig,
  AnthropicConfig,
  AgentConfigLive,
  type FaissConfigShape,
  type MusicBrainzConfigShape,
  type JinaConfigShape,
  type AnthropicConfigShape
} from "./config.js"

// =============================================================================
// Error Types
// =============================================================================
export {
  ApiError,
  SearchPlaysError,
  SemanticSearchError,
  MbidResolveError,
  LinkFetchError,
  ValidationError,
  SessionError,
  type ToolError,
  isToolError
} from "./services/errors.js"

// =============================================================================
// Services (Tool backends)
// =============================================================================
export {
  // Assets service
  Assets,
  AssetsLive,
  AssetsTest,
  type AssetsService,
  type DjBio,
  type ShowDescription,
  DjBioSchema,
  normalizeName,
  // PromptBuilder service
  PromptBuilderService,
  PromptBuilderServiceLive,
  PromptBuilderServiceFull,
  PromptBuilderServiceTest,
  type PromptBuilderServiceInterface,
  type BuiltPrompt,
  type BuiltPromptMetadata,
  type PlayId,
  PromptBuildError,
  builtPromptToAiPrompt,
  type PlayContext,
  type ShowContext,
  type SimpleShowContext,
  type PromptContext,
  // SearchPlays service
  SearchPlaysService,
  SearchPlaysServiceLive,
  SearchPlaysServiceFull,
  SearchPlaysServiceTest,
  type SearchPlaysServiceInterface,
  type SearchTimelineParams,
  // SemanticSearch service
  SemanticSearchService,
  SemanticSearchServiceLive,
  SemanticSearchServiceFull,
  SemanticSearchServiceTest,
  type SemanticSearchServiceInterface,
  type SemanticSearchParams as SemanticSearchServiceParams,
  // InsightSession service
  InsightSessionService,
  InsightSessionServiceLive,
  InsightSessionServiceScoped,
  InsightSessionServiceTest,
  makeInsightSessionServiceTestWithData,
  type InsightSessionServiceInterface,
  type GetRecentInsightsResponse as InsightResponse,
  // MbidResolver service
  MbidResolverService,
  MbidResolverServiceLive,
  MbidResolverServiceFull,
  MbidResolverServiceTest,
  type MbidResolverServiceInterface,
  // LinkFetcher service
  LinkFetcherService,
  LinkFetcherServiceLive,
  LinkFetcherServiceFull,
  LinkFetcherServiceTest,
  type LinkFetcherServiceInterface
} from "./services/index.js"

// =============================================================================
// Tool Schemas and Definitions
// =============================================================================
export {
  // Common types
  MbEntityType,
  MbId,
  // Schemas
  PlayResultSchema,
  SearchPlaysParams,
  SearchPlaysResponse,
  SemanticSearchParams,
  SemanticSearchResponse,
  ResolveMbidParams,
  ResolveMbidResponse,
  MbEntityResult,
  FetchLinkParams,
  FetchLinkResponse,
  ExtractedLink,
  GetRecentInsightsParams,
  GetRecentInsightsResponse,
  InsightSummary,
  // Tool definitions
  SearchPlaysTool,
  SemanticSearchTool,
  ResolveMbidTool,
  FetchLinkTool,
  GetRecentInsightsTool,
  CrateToolkit,
  type CrateToolkitType
} from "./tools/index.js"

// =============================================================================
// Layer Composition
// =============================================================================
export {
  ConfigLive,
  InfraLive,
  ServicesLive,
  ServicesFull,
  HandlersLive,
  CrateToolsLive,
  CrateToolsTest,
  ServicesTest,
  AnthropicModelLayer,
  AnthropicModelLive,
  type CrateToolServices,
  type CrateToolsContext
} from "./layers.js"

// =============================================================================
// MCP Server
// =============================================================================
export {
  SERVER_INFO,
  CrateMcpServerStdio,
  CrateMcpServerHttp,
  runStdio,
  getClaudeDesktopConfig
} from "./mcp/server.js"

// =============================================================================
// Legacy Layer (deprecated - use MusicAgentWithAnthropicLive instead)
// =============================================================================
/**
 * Complete agent runtime with all dependencies resolved
 * @deprecated Use MusicAgentWithAnthropicLive for agent operations or CrateToolsLive for tools
 */
export const AgentAppLive = Layer.mergeAll(
  FaissConfig.Default,
  FetchHttpClient.layer,
  FaissClient.Default,
  MusicAgentWithAnthropicLive
)
