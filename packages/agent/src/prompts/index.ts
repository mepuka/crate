/**
 * Crate Agent Prompts
 *
 * Modular prompt system for the Crate Research Agent.
 *
 * @example
 * ```ts
 * import { Prompt } from "@effect/ai"
 * import { CratePrompt, CrateInsights, CrateTools } from "./prompts"
 *
 * // Build system prompt with context
 * const systemContent = CratePrompt.buildSystemPrompt({
 *   currentTime: new Date(),
 *   showContext: { name: "The Morning Show", host: "John Richards" },
 *   recentInsights: []
 * })
 *
 * // Create Effect AI Prompt
 * const prompt = Prompt.make([
 *   { role: "system", content: systemContent },
 *   { role: "user", content: CratePrompt.buildPlayMessage(playData) }
 * ])
 *
 * // Validate insight output
 * const parsed = Schema.decodeUnknown(CrateInsights.InsightArray)(rawOutput)
 * ```
 *
 * @module
 */

// System prompt building
export {
  // Static sections
  CORE_IDENTITY,
  PHILOSOPHY,
  TONE,
  KEXP_CULTURE,
  KEXP_DJ_COMMENT_PATTERNS,
  KEXP_ROTATION,
  MBID_INSTRUCTION,
  INSIGHT_TYPES,
  TOOLS,
  GUIDELINES,
  TEMPORAL_REASONING,
  CONFIDENCE,
  CONSTRAINTS,

  // Formatting functions
  formatTimeContext,
  formatShowContext,
  formatRecentInsights,
  formatPlayData,

  // Builder functions
  buildSystemPrompt,
  buildPlayMessage,
  createPromptMessages,

  // Types
  type HostContext,
  type ShowContext,
  type SimpleShowContext,
  type PlayContext,
  type InsightSummary,
  type PromptContext,

  // Namespace
  CratePrompt,
} from "./system-prompt.js"

// Insight schemas
export {
  // Entity references
  ArtistRef,
  RecordingRef,
  ReleaseRef,
  LabelRef,

  // Type literals
  Confidence,
  SourceType,
  EntityType,
  ConnectionType,
  LinkType,
  SampleDirection,

  // Insight schemas
  ConcertInsight,
  CoverInsight,
  SampleInsight,
  PlayHistoryInsight,
  ConnectionInsight,
  LinkInsight,

  // Supporting schemas
  PlayReference,
  NotableComment,

  // Union schemas
  ExtractionInsight,
  DatabaseInsight,
  ExternalInsight,
  Insight,
  InsightArray,

  // Helpers
  getInsightLabel,
  getInsightSummary,

  // Namespace
  CrateInsights,
} from "./insights.js"

// Tool definitions
export {
  // Entity type
  MbEntityType,

  // resolve_mbid
  ResolveMbidParams,
  MbidResult,
  ResolveMbidResponse,
  ResolveMbidTool,

  // search_plays
  SearchPlaysParams,
  PlayResult,
  SearchPlaysResponse,
  SearchPlaysTool,

  // semantic_search
  SemanticSearchParams,
  SemanticSearchResponse,
  SemanticSearchTool,

  // fetch_link
  FetchLinkParams,
  ExtractedMbids,
  FetchLinkResponse,
  FetchLinkTool,

  // get_recent_insights
  GetRecentInsightsParams,
  GetRecentInsightsResponse,
  GetRecentInsightsTool,

  // Collection and helpers
  CrateTools,
  toOpenAIFunctions,
} from "./tools.js"
