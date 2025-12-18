/**
 * Agent Services
 *
 * @module
 */

// Error Types
export {
  ApiError,
  SearchPlaysError,
  SemanticSearchError,
  HybridSearchError,
  MbidResolveError,
  LinkFetchError,
  ValidationError,
  SessionError,
  type ToolError,
  isToolError
} from "./errors.js"

// Assets Service
export {
  Assets,
  AssetsLive,
  AssetsTest,
  type AssetsService,
  type DjBio,
  type ShowDescription,
  DjBioSchema,
  normalizeName,
} from "./Assets.js"

// PromptBuilderService
export {
  PromptBuilderService,
  PromptBuilderServiceLive,
  PromptBuilderServiceFull,
  PromptBuilderServiceTest,
  type PromptBuilderServiceInterface,
  type BuiltPrompt,
  type BuiltPromptMetadata,
  type PlayId,
  type MbId,
  PromptBuildError,
  builtPromptToAiPrompt,
  faissPlayToKexpPlay,
} from "./PromptBuilderService.js"

// Re-export prompt context types
export type {
  PlayContext,
  ShowContext,
  SimpleShowContext,
  InsightSummary,
  PromptContext,
} from "../prompts/system-prompt.js"

// SearchPlaysService
export {
  SearchPlaysService,
  SearchPlaysServiceLive,
  SearchPlaysServiceFull,
  SearchPlaysServiceTest,
  type SearchPlaysServiceInterface,
  type SearchTimelineParams,
} from "./SearchPlaysService.js"

// SemanticSearchService (also provides hybrid search)
export {
  SemanticSearchService,
  SemanticSearchServiceLive,
  SemanticSearchServiceFull,
  SemanticSearchServiceTest,
  type SemanticSearchServiceInterface,
  type SemanticSearchParams,
  type HybridSearchParams,
} from "./SemanticSearchService.js"

// InsightSessionService
export {
  InsightSessionService,
  InsightSessionServiceLive,
  InsightSessionServiceScoped,
  InsightSessionServiceTest,
  makeInsightSessionServiceTestWithData,
  type InsightSessionServiceInterface,
  type GetRecentInsightsResponse,
  type SessionExport,
  type SessionMode,
  type ToolCallLogEntry,
  type ResearchStep,
  type EntityFacts,
} from "./InsightSessionService.js"

// MbidResolverService
export {
  MbidResolverService,
  MbidResolverServiceLive,
  MbidResolverServiceFull,
  MbidResolverServiceTest,
  makeMbidResolverServiceTestWithData,
  type MbidResolverServiceInterface,
  type MbEntityDetails,
} from "./MbidResolverService.js"

// LinkFetcherService
export {
  LinkFetcherService,
  LinkFetcherServiceLive,
  LinkFetcherServiceFull,
  LinkFetcherServiceTest,
  makeLinkFetcherServiceTestWithData,
  type LinkFetcherServiceInterface,
} from "./LinkFetcherService.js"

// Graph connections service
export {
  GraphConnectionsClient,
  type GraphConnectionsClientInterface
} from "./GraphConnectionsClient.js"

export {
  GraphConnectionsService,
  GraphConnectionsServiceLive,
  GraphConnectionsServiceFull,
  type GraphConnectionsServiceInterface
} from "./GraphConnectionsService.js"

// Music graph cache
export {
  MusicGraphService,
  MusicGraphServiceLive,
  MusicGraphServiceFull,
  type MusicGraphServiceInterface,
  type GraphNode as MusicGraphNode,
  type GraphEdgeData as MusicGraphEdgeData
} from "./MusicGraphService.js"

// Agent checkpoint service (persistent session storage)
export {
  AgentCheckpointService,
  AgentCheckpointServiceLive,
  AgentCheckpointServiceTest,
  CheckpointError,
  type AgentCheckpointServiceInterface,
  type RunStatus,
  type AgentRunSummary,
  type AgentRunDetail,
  type ListCheckpointsFilter,
} from "./AgentCheckpointService.js"

// Cloud verification service (health checks & smoke tests)
export {
  CloudVerificationService,
  CloudVerificationServiceLive,
  CloudVerificationServiceWithDefaults,
  CloudVerificationConfig,
  HealthCheckError,
  SmokeTestError,
  type CloudVerificationServiceInterface,
  type ServiceHealth,
  type SmokeTestResult,
  type VerificationReport,
} from "./CloudVerificationService.js"
