/**
 * @crate/agent
 *
 * AI Agent for interacting with the FAISS search API
 */

import { Layer } from "effect"
import { NodeHttpClient } from "@effect/platform-node"
import { FaissConfig, FaissClient } from "./FaissClient.js"
import { MusicAgent } from "./MusicAgent.js"

// Core services
export { FaissConfig, FaissClient, FaissApiError, FaissClientLive } from "./FaissClient.js"
export type { PlayResult, SearchResponse, TimelineResponse } from "./FaissClient.js"
export { MusicAgent, MusicAgentLive } from "./MusicAgent.js"

// Configuration services (new)
export {
  FaissConfig as FaissApiConfig,
  MusicBrainzConfig,
  JinaConfig,
  AgentConfigLive,
  type FaissConfigShape,
  type MusicBrainzConfigShape,
  type JinaConfigShape
} from "./config.js"

// Error types
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

// Services
export {
  Assets,
  AssetsLive,
  AssetsTest,
  type AssetsService,
  type DjBio,
  type ShowDescription,
  DjBioSchema,
  normalizeName,
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
  type PromptContext
} from "./services/index.js"

// Tools (schemas and definitions)
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

/**
 * Complete agent runtime with all dependencies resolved
 */
export const AgentAppLive = Layer.mergeAll(
  FaissConfig.Default,
  NodeHttpClient.layerUndici,
  FaissClient.Default,
  MusicAgent.Default
)
