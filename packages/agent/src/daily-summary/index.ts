/**
 * Daily Summary Agent Module
 *
 * A multi-phase agent pipeline that creates engaging summaries of KEXP's daily broadcasts.
 *
 * Architecture:
 * - DayDataCollector: Gathers and pre-processes day's plays
 * - SummaryResearchAgent: Deep analysis with tool access (Phase 1)
 * - SummaryWriterAgent: Narrative synthesis (Phase 2)
 * - SummaryPolishAgent: Quality refinement (Phase 3)
 * - DailySummaryAgent: Orchestrator coordinating the pipeline
 *
 * Usage:
 * ```ts
 * import { DailySummaryAgent, DailySummaryAgentLive } from "./daily-summary"
 * import { Effect, Layer } from "effect"
 * import { ConfigurableModelLive, CrateToolsLive } from "./layers"
 *
 * // Build layer with parameterized model
 * const DailySummaryWithDeps = DailySummaryAgentLive(ConfigurableModelLive).pipe(
 *   Layer.provide(CrateToolsLive)
 * )
 * // Merge to make LanguageModel available at runtime
 * const FullLayer = Layer.mergeAll(DailySummaryWithDeps, ConfigurableModelLive)
 *
 * // Run pipeline
 * const program = Effect.gen(function* () {
 *   const agent = yield* DailySummaryAgent
 *   return yield* agent.run({ date: "2025-01-06" })
 * }).pipe(Effect.provide(FullLayer))
 * ```
 *
 * @module
 */

// Schemas
export * from "./schemas.js"

// Data Collection
export {
  DayDataCollector,
  DayDataCollectorLive,
  DayDataCollectorError,
  type DayDataCollectorInterface,
  type DayData,
  type DayStats,
  type CategorizedPlay,
  type ShowGroup,
  // Artifact-based types (Dynamic Context Discovery)
  type ShowIndexEntry,
  type NotablePlaySummary,
  type DayDataArtifacts
} from "./DayDataCollector.js"

// Research Agent (Phase 1)
export {
  SummaryResearchAgent,
  SummaryResearchAgentLive,
  SummaryResearchError,
  type SummaryResearchAgentInterface,
  type ResearchResult
} from "./SummaryResearchAgent.js"

// Writer Agent (Phase 2)
export {
  SummaryWriterAgent,
  SummaryWriterAgentLive,
  SummaryWriterError,
  type SummaryWriterAgentInterface,
  type WriterResult,
  type WriterOptions
} from "./SummaryWriterAgent.js"

// Polish Agent (Phase 3)
export {
  SummaryPolishAgent,
  SummaryPolishAgentLive,
  SummaryPolishError,
  type SummaryPolishAgentInterface,
  type PolishResult,
  type PolishFixes
} from "./SummaryPolishAgent.js"

// Orchestrator
export {
  DailySummaryAgent,
  DailySummaryAgentLive,
  DailySummaryError,
  type DailySummaryAgentInterface,
  type PipelineResult,
  type PipelineOptions
} from "./DailySummaryAgent.js"

// Prompts (for customization)
export {
  buildResearchSystemPrompt,
  buildDayDataMessage,
  buildDayDataIndexMessage
} from "./prompts/research-prompt.js"
export {
  buildWriterSystemPrompt,
  buildResearchContextMessage,
  buildResearchIndexMessage
} from "./prompts/writer-prompt.js"
export {
  buildPolishSystemPrompt,
  buildPolishMessage
} from "./prompts/polish-prompt.js"

// Play Reference Utilities
export {
  extractReferencedPlayIds,
  extractCategorizedPlayIds,
  buildPlayLookupTable,
  formatPlayLookupTable,
  formatPlayIdInstructions,
  validatePlayIdPopulation,
  type PlayLookupEntry,
  type CategorizedPlayIds
} from "./play-reference.js"
