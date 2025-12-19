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

// Art curation service (album art style extraction)
export {
  ArtCurationService,
  ArtCurationServiceLive,
  ArtCurationServiceTest,
  ArtCurationServiceGemini,
  ArtCurationServiceGeminiWithConfig,
  makeArtCurationService,
  ArtCurationError,
  ArtContext,
  ArtAnalysis,
  ColorPalette,
  DerivedAssets,
  CurationResult,
  analyzeAlbumArtTool,
  curate,
  type ArtCurationServiceInterface,
} from "./ArtCurationService.js"

// Character generation service (Crate Cat variants in album style)
export {
  CharacterGenerationService,
  CharacterGenerationServiceLive,
  CharacterGenerationServiceTest,
  CharacterGenerationError,
  CharacterConfig,
  CharacterGenerationRequest,
  CharacterGenerationResponse,
  generate as generateCharacter,
  refine as refineCharacter,
  loadConfig as loadCharacterConfig,
  type CharacterGenerationServiceInterface,
} from "./CharacterGenerationService.js"

// Derived asset generator (SVG overlays from curation)
export {
  DerivedAssetGenerator,
  DerivedAssetGeneratorLive,
  AssetGenerationError,
  generateAssets,
  type DerivedAssetGeneratorInterface,
  type GeneratedAsset,
  type GeneratedAssetBundle,
} from "./DerivedAssetGenerator.js"

// Design directive service (design school-informed art direction)
export {
  DesignDirectiveService,
  DesignDirectiveServiceLive,
  DirectiveError,
  DesignContext,
  DesignDirective,
  getDesignDirective,
  generateDesignPromptAddendum,
  LABEL_AESTHETICS,
  ERA_AESTHETICS,
  JAPANESE_AESTHETICS,
  type DesignDirectiveServiceInterface,
} from "./DesignDirectiveService.js"

// Canonical reference service (folder-based, like skills)
export {
  // Service
  CanonicalReferenceService,
  CanonicalReferenceServiceLive,
  CanonicalReferenceServiceTest,
  CanonicalReferenceServiceLayer,
  type CanonicalReferenceServiceInterface,
  // Errors
  CanonicalNotFoundError,
  ConfigParseError,
  VariantNotFoundError,
  // Schemas
  CanonicalCategory,
  RenderStyle,
  StyleGuide,
  VariantConfig,
  CanonicalConfig,
  SelectionContext,
  // Types
  type LoadedCanonical,
  type LoadedVariant,
  // Convenience accessors
  loadAllCanonicals,
  getCanonical,
  getCanonicalsByCategory,
  getVariantForContext,
  getCanonicalImage,
  listCanonicals,
  reloadCanonicals,
} from "./CanonicalReferenceService.js"

// Liner note generation service (era-aware visual liner notes)
export {
  LinerNoteGenerationService,
  LinerNoteGenerationServiceLive,
  LinerNoteGenerationError,
  LinerNoteStyle,
  LinerNoteRequest,
  LinerNoteResponse,
  generateLinerNote,
  extractGraphContext,
  buildGraphContextForArtist,
  type LinerNoteGenerationServiceInterface,
  type GraphContext as LinerNoteGraphContext,
} from "./LinerNoteGenerationService.js"

// Generated asset repository (persistence for AI-generated images)
export {
  GeneratedAssetRepository,
  GeneratedAssetRepositoryLive,
  AssetRepositoryError,
  AssetType,
  GeneratedAssetRecord,
  hashParams,
  type GeneratedAssetRepositoryInterface,
  type StoreAssetInput,
  type StoreAssetResult,
  type GenerationParams,
} from "./GeneratedAssetRepository.js"
