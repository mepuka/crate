/**
 * Daily Summary Agent Module
 *
 * A two-phase agent pipeline that creates engaging summaries of KEXP's daily broadcasts.
 *
 * Architecture:
 * - DayDataCollector: Gathers and pre-processes day's plays
 * - SummaryResearchAgent: Deep analysis with tool access (Phase 1)
 * - SummaryWriterAgent: Narrative synthesis (Phase 2)
 * - DailySummaryAgent: Orchestrator coordinating the pipeline
 *
 * Usage:
 * ```ts
 * import { DailySummaryAgent } from "./daily-summary"
 * import { Layer } from "effect"
 * import { AnthropicModelLive } from "./layers"
 *
 * const result = await Effect.runPromise(
 *   DailySummaryAgent.run({ date: "2025-01-06" }).pipe(
 *     Effect.provide(DailySummaryAgent.Default),
 *     Effect.provide(AnthropicModelLive)
 *   )
 * )
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
  type ShowGroup
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
  type WriterResult
} from "./SummaryWriterAgent.js"

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
  buildDayDataMessage
} from "./prompts/research-prompt.js"
export {
  buildWriterSystemPrompt,
  buildResearchContextMessage
} from "./prompts/writer-prompt.js"
