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

// SemanticSearchService
export {
  SemanticSearchService,
  SemanticSearchServiceLive,
  SemanticSearchServiceFull,
  SemanticSearchServiceTest,
  type SemanticSearchServiceInterface,
  type SemanticSearchParams,
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
