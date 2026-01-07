/**
 * Daily Summary Agent - Orchestrator
 *
 * Coordinates the two-phase daily summary pipeline:
 * 1. DayDataCollector - Gather and pre-process day's plays
 * 2. SummaryResearchAgent - Deep research with tool access
 * 3. SummaryWriterAgent - Narrative synthesis
 *
 * Handles persistence of both research context and final summary
 * for knowledge building and regeneration support.
 *
 * @module
 */

import { Effect, Layer, Clock, Data, Config } from "effect"
import { LanguageModel } from "@effect/ai"
import { FaissClient } from "../FaissClient.js"
import {
  DayDataCollector,
  type DayData
} from "./DayDataCollector.js"
import {
  SummaryResearchAgent,
  type ResearchResult
} from "./SummaryResearchAgent.js"
import {
  SummaryWriterAgent,
  type WriterResult
} from "./SummaryWriterAgent.js"
import {
  SummaryPolishAgent,
  type PolishResult,
  type PolishFixes
} from "./SummaryPolishAgent.js"
import type { ResearchContextType, DailySummaryType } from "./schemas.js"
import {
  extractReferencedPlayIds,
  extractCategorizedPlayIds,
  buildPlayLookupTable
} from "./play-reference.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Complete pipeline result
 */
export interface PipelineResult {
  readonly date: string
  readonly summary: DailySummaryType
  readonly researchId: number
  readonly summaryId: number

  // Timing breakdown
  readonly timing: {
    readonly dataCollectionMs: number
    readonly researchMs: number
    readonly writingMs: number
    readonly polishMs: number
    readonly totalMs: number
  }

  // Polish phase report (what was fixed)
  readonly polishFixes?: PolishFixes

  // Token usage across phases
  readonly tokenUsage: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly cacheReadTokens: number
    readonly cacheCreationTokens: number
  }

  readonly toolCallCount: number
}

/**
 * Options for running the pipeline
 */
export interface PipelineOptions {
  /** Date to generate summary for (YYYY-MM-DD). Defaults to yesterday. */
  readonly date?: string
  /** Force regeneration even if summary exists */
  readonly regenerate?: boolean
  /** Skip persistence (for testing) */
  readonly skipPersistence?: boolean
}

/**
 * Error type for pipeline failures
 */
export class DailySummaryError extends Data.TaggedError("DailySummaryError")<{
  readonly message: string
  readonly phase: "data_collection" | "research" | "writing" | "polish" | "persistence"
  readonly cause?: unknown
}> {}

// =============================================================================
// Persistence Interface
// =============================================================================

/**
 * Interface for persisting research and summaries
 * Implemented by calling the FAISS API endpoints
 */
export interface SummaryPersistence {
  readonly saveResearch: (
    date: string,
    context: ResearchContextType,
    durationMs: number,
    toolCallCount: number
  ) => Effect.Effect<number, Error>

  readonly saveSummary: (
    date: string,
    summary: DailySummaryType,
    researchId: number
  ) => Effect.Effect<number, Error>

  readonly getExistingSummary: (
    date: string
  ) => Effect.Effect<DailySummaryType | null, Error>
}

// =============================================================================
// Service Interface
// =============================================================================

export interface DailySummaryAgentInterface {
  /**
   * Run the complete daily summary pipeline
   */
  readonly run: (
    options?: PipelineOptions
  ) => Effect.Effect<
    PipelineResult,
    DailySummaryError,
    LanguageModel.LanguageModel
  >

  /**
   * Check if a summary exists for a date
   */
  readonly exists: (
    date: string
  ) => Effect.Effect<boolean, DailySummaryError>
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get yesterday's date in YYYY-MM-DD format (UTC)
 *
 * Timezone Strategy:
 * - The KEXP API stores all airdates in UTC
 * - We calculate "yesterday" in UTC to align with API semantics
 * - This means if running at 11 PM Pacific on Jan 1, this returns Dec 31 UTC
 *   (which is appropriate since we want yesterday in the API's timezone)
 *
 * Note: Display times in prompts are converted to Pacific for human readability.
 * See research-prompt.ts for Pacific timezone formatting.
 */
const getYesterday = (): string => {
  const now = new Date()
  const yesterday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1
  ))
  return yesterday.toISOString().split('T')[0]
}

/**
 * Validate date format (YYYY-MM-DD) and calendar validity
 *
 * Ensures the date matches the expected format AND represents a valid
 * calendar date (e.g., rejects 2024-02-30).
 */
const isValidDate = (date: string): boolean => {
  const regex = /^(\d{4})-(\d{2})-(\d{2})$/
  const match = date.match(regex)
  if (!match) return false

  const [, yearStr, monthStr, dayStr] = match
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10) - 1 // JS months are 0-indexed
  const day = parseInt(dayStr, 10)

  // Create date and verify it matches the input
  // This catches invalid dates like 2024-02-30 which would normalize to 2024-03-01
  const parsed = new Date(Date.UTC(year, month, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month &&
    parsed.getUTCDate() === day
  )
}

// =============================================================================
// Service Tag
// =============================================================================

export class DailySummaryAgent extends Effect.Service<DailySummaryAgent>()(
  "DailySummaryAgent",
  {
    effect: Effect.gen(function* () {
      const dataCollector = yield* DayDataCollector
      const researchAgent = yield* SummaryResearchAgent
      const writerAgent = yield* SummaryWriterAgent
      const polishAgent = yield* SummaryPolishAgent
      // TODO: Use faissClient for persistence when endpoints are ready
      const _faissClient = yield* FaissClient

      // Simple in-memory persistence for now
      // TODO: Replace with actual FAISS API calls when endpoints are ready
      const persistResearch = (
        date: string,
        context: ResearchContextType,
        durationMs: number,
        toolCallCount: number
      ): Effect.Effect<number, Error> =>
        Effect.gen(function* () {
          yield* Effect.log(`Persisting research for ${date}`)
          // TODO: Call POST /api/summary/research
          // For now, return a mock ID
          return Date.now()
        })

      const persistSummary = (
        date: string,
        summary: DailySummaryType,
        researchId: number
      ): Effect.Effect<number, Error> =>
        Effect.gen(function* () {
          yield* Effect.log(`Persisting summary for ${date}`)
          // TODO: Call POST /api/summary/save
          // For now, return a mock ID
          return Date.now()
        })

      const run = (
        options: PipelineOptions = {}
      ): Effect.Effect<
        PipelineResult,
        DailySummaryError,
        LanguageModel.LanguageModel
      > =>
        Effect.gen(function* () {
          const date = options.date ?? getYesterday()

          yield* Effect.log(`Starting daily summary pipeline for ${date}`)

          // Validate date
          if (!isValidDate(date)) {
            return yield* Effect.fail(
              new DailySummaryError({
                message: `Invalid date format: ${date}. Expected YYYY-MM-DD`,
                phase: "data_collection"
              })
            )
          }

          const pipelineStart = yield* Clock.currentTimeMillis

          // Aggregate token usage
          const tokenUsage = {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0
          }

          // =============================================================================
          // Phase 1: Data Collection
          // =============================================================================
          yield* Effect.log("Phase 1: Collecting day data")
          const dataStart = yield* Clock.currentTimeMillis

          const dayData = yield* dataCollector.collectDay(date).pipe(
            Effect.mapError(e =>
              new DailySummaryError({
                message: `Data collection failed: ${e instanceof Error ? e.message : String(e)}`,
                phase: "data_collection",
                cause: e
              })
            )
          )

          const dataEnd = yield* Clock.currentTimeMillis
          const dataCollectionMs = Number(dataEnd - dataStart)

          yield* Effect.log(`Data collection complete: ${dayData.stats.totalPlays} plays in ${dataCollectionMs}ms`)

          // =============================================================================
          // Phase 2: Research
          // =============================================================================
          yield* Effect.log("Phase 2: Research with tools")
          const researchStart = yield* Clock.currentTimeMillis

          const researchResult = yield* researchAgent.research(dayData).pipe(
            Effect.mapError(e =>
              new DailySummaryError({
                message: `Research failed: ${e instanceof Error ? e.message : String(e)}`,
                phase: "research",
                cause: e
              })
            )
          )

          const researchEnd = yield* Clock.currentTimeMillis
          const researchMs = Number(researchEnd - researchStart)

          // Aggregate token usage
          tokenUsage.inputTokens += researchResult.tokenUsage.inputTokens
          tokenUsage.outputTokens += researchResult.tokenUsage.outputTokens
          tokenUsage.cacheReadTokens += researchResult.tokenUsage.cacheReadTokens
          tokenUsage.cacheCreationTokens += researchResult.tokenUsage.cacheCreationTokens

          yield* Effect.log(`Research complete: ${researchResult.toolCallCount} tool calls in ${researchMs}ms`)

          // Persist research (if not skipped)
          let researchId = 0
          if (!options.skipPersistence) {
            researchId = yield* persistResearch(
              date,
              researchResult.context,
              researchResult.durationMs,
              researchResult.toolCallCount
            ).pipe(
              Effect.mapError(e =>
                new DailySummaryError({
                  message: `Research persistence failed: ${e instanceof Error ? e.message : String(e)}`,
                  phase: "persistence",
                  cause: e
                })
              )
            )
          }

          // =============================================================================
          // Phase 3: Writing
          // =============================================================================
          yield* Effect.log("Phase 3: Writing summary")

          // Build play lookup table from research findings
          // This gives the writer direct access to playIds for resolution
          const referencedIds = extractReferencedPlayIds(researchResult.context)
          const categorizedIds = extractCategorizedPlayIds(researchResult.context)
          const playLookup = buildPlayLookupTable(dayData, referencedIds)

          yield* Effect.log(
            `Play reference: ${referencedIds.size} unique plays, ` +
            `${playLookup.length} in lookup table`
          )

          const writingStart = yield* Clock.currentTimeMillis

          const writerResult = yield* writerAgent.write(researchResult.context, {
            playLookup,
            categorizedIds
          }).pipe(
            Effect.mapError(e =>
              new DailySummaryError({
                message: `Writing failed: ${e instanceof Error ? e.message : String(e)}`,
                phase: "writing",
                cause: e
              })
            )
          )

          const writingEnd = yield* Clock.currentTimeMillis
          const writingMs = Number(writingEnd - writingStart)

          // Aggregate token usage
          tokenUsage.inputTokens += writerResult.tokenUsage.inputTokens
          tokenUsage.outputTokens += writerResult.tokenUsage.outputTokens
          tokenUsage.cacheReadTokens += writerResult.tokenUsage.cacheReadTokens
          tokenUsage.cacheCreationTokens += writerResult.tokenUsage.cacheCreationTokens

          yield* Effect.log(`Writing complete in ${writingMs}ms`)

          // =============================================================================
          // Phase 4: Polish (optional)
          // =============================================================================
          const skipPolish = yield* Config.boolean("SKIP_POLISH").pipe(
            Config.withDefault(false),
            Effect.catchAll(() => Effect.succeed(false))
          )

          let polishMs = 0
          let polishedSummary = writerResult.summary
          let polishFixes: PolishFixes | undefined = undefined

          if (!skipPolish) {
            yield* Effect.log("Phase 4: Polishing summary")
            const polishStart = yield* Clock.currentTimeMillis

            const polishResult = yield* polishAgent
              .polish(writerResult.summary, researchResult.context)
              .pipe(
                Effect.mapError(e =>
                  new DailySummaryError({
                    message: `Polish failed: ${e instanceof Error ? e.message : String(e)}`,
                    phase: "polish",
                    cause: e
                  })
                )
              )

            const polishEnd = yield* Clock.currentTimeMillis
            polishMs = Number(polishEnd - polishStart)

            // Aggregate token usage
            tokenUsage.inputTokens += polishResult.tokenUsage.inputTokens
            tokenUsage.outputTokens += polishResult.tokenUsage.outputTokens
            tokenUsage.cacheReadTokens += polishResult.tokenUsage.cacheReadTokens
            tokenUsage.cacheCreationTokens += polishResult.tokenUsage.cacheCreationTokens

            polishedSummary = polishResult.summary
            polishFixes = polishResult.fixes

            yield* Effect.log(
              `Polish complete in ${polishMs}ms: ` +
              `headline=${polishFixes.headlineImproved}, ` +
              `playIds=${polishFixes.playIdsPopulated}, ` +
              `themes=${polishFixes.themesIncluded}`
            )
          } else {
            yield* Effect.log("Phase 4: Skipped (SKIP_POLISH=true)")
          }

          // Update summary with research ID
          const summary: DailySummaryType = {
            ...polishedSummary,
            researchId
          }

          // Persist summary (if not skipped)
          let summaryId = 0
          if (!options.skipPersistence) {
            summaryId = yield* persistSummary(date, summary, researchId).pipe(
              Effect.mapError(e =>
                new DailySummaryError({
                  message: `Summary persistence failed: ${e instanceof Error ? e.message : String(e)}`,
                  phase: "persistence",
                  cause: e
                })
              )
            )
          }

          const pipelineEnd = yield* Clock.currentTimeMillis
          const totalMs = Number(pipelineEnd - pipelineStart)

          yield* Effect.log(`Pipeline complete for ${date}: ${totalMs}ms total`)

          return {
            date,
            summary,
            researchId,
            summaryId,
            timing: {
              dataCollectionMs,
              researchMs,
              writingMs,
              polishMs,
              totalMs
            },
            polishFixes,
            tokenUsage,
            toolCallCount: researchResult.toolCallCount
          }
        })

      const exists = (date: string): Effect.Effect<boolean, DailySummaryError> =>
        Effect.gen(function* () {
          // TODO: Call GET /api/summary/{date} and check if exists
          yield* Effect.log(`Checking if summary exists for ${date}`)
          return false
        })

      return { run, exists } satisfies DailySummaryAgentInterface
    })
  }
) {}

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for DailySummaryAgent
 *
 * Composes all sub-agent layers:
 * - FaissClient.Default (needed by DailySummaryAgent itself for persistence)
 * - DayDataCollector.Default (includes FaissClient.Default for its own use)
 * - SummaryResearchAgent.Default
 * - SummaryWriterAgent.Default (no dependencies)
 * - SummaryPolishAgent.Default (no dependencies)
 *
 * The caller must still provide:
 * - LanguageModel.LanguageModel (for research, writer, and polish agents)
 * - CrateToolsLive (provides CrateToolkit handlers for SummaryResearchAgent)
 *
 * Note: All agents currently share the same LanguageModel. For phase-specific
 * models (e.g., polish with Sonnet), provide PolishModelLive from layers.ts
 * to the polish agent separately.
 */
export const DailySummaryAgentLive = DailySummaryAgent.Default.pipe(
  Layer.provide(FaissClient.Default),
  Layer.provide(DayDataCollector.Default),
  Layer.provide(SummaryResearchAgent.Default),
  Layer.provide(SummaryWriterAgent.Default),
  Layer.provide(SummaryPolishAgent.Default)
)
