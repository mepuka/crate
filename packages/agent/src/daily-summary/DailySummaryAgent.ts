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

import { Effect, Layer, Clock, Data, Config, Duration } from "effect"
import { LanguageModel } from "@effect/ai"
import { FaissClient } from "../FaissClient.js"
import { type TokenUsage, emptyTokenUsage, addTokenUsage } from "../multi-agent/types.js"
import { DayDataCollector } from "./DayDataCollector.js"
import { SummaryResearchAgent } from "./SummaryResearchAgent.js"
import { SummaryWriterAgent } from "./SummaryWriterAgent.js"
import { SummaryPolishAgent, type PolishFixes } from "./SummaryPolishAgent.js"
import type { ResearchContextType, DailySummaryType } from "./schemas.js"
import {
  extractReferencedPlayIds,
  extractCategorizedPlayIds,
  buildPlayLookupTable,
  validatePlayIdPopulation
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
  readonly polishFixes?: PolishFixes | undefined

  // Token usage across phases
  readonly tokenUsage: TokenUsage

  readonly toolCallCount: number
}

/**
 * Options for running the pipeline
 */
export interface PipelineOptions {
  /** Date to generate summary for (YYYY-MM-DD). Defaults to yesterday. */
  readonly date?: string | undefined
  /** Force regeneration even if summary exists */
  readonly regenerate?: boolean | undefined
  /** Skip persistence (for testing) */
  readonly skipPersistence?: boolean | undefined
}

/**
 * Error type for pipeline failures
 */
export class DailySummaryError extends Data.TaggedError("DailySummaryError")<{
  readonly message: string
  readonly phase: "data_collection" | "research" | "writing" | "polish" | "persistence"
  readonly cause?: unknown
}> {}

/**
 * Helper to wrap errors as DailySummaryError for a specific phase
 */
const wrapPhaseError = <E>(
  phase: DailySummaryError["phase"],
  description: string
) => (e: E): DailySummaryError =>
  new DailySummaryError({
    message: `${description} failed: ${e instanceof Error ? e.message : String(e)}`,
    phase,
    cause: e
  })

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
   *
   * Note: LanguageModel is provided at the layer level, not exposed in the R channel.
   * Use DailySummaryAgentLive(modelLayer) to construct the service.
   */
  readonly run: (
    options?: PipelineOptions
  ) => Effect.Effect<
    PipelineResult,
    DailySummaryError
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
      const faissClient = yield* FaissClient

      /**
       * Persist research context to the database via FAISS API
       *
       * Stores the full research findings (discoveries, themes, cultural moments, etc.)
       * which are referenced by the summary for future analysis.
       */
      const persistResearch = (
        date: string,
        context: ResearchContextType,
        durationMs: number,
        toolCallCount: number,
        tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }
      ): Effect.Effect<number, Error> =>
        Effect.gen(function* () {
          yield* Effect.log(`Persisting research for ${date}`)

          const response = yield* faissClient.saveDailyResearch(
            date,
            context as unknown as Record<string, unknown>,
            durationMs,
            toolCallCount,
            tokenUsage ? {
              inputTokens: tokenUsage.inputTokens,
              outputTokens: tokenUsage.outputTokens,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              totalTokens: tokenUsage.totalTokens
            } : undefined
          ).pipe(
            Effect.mapError(e => new Error(`Failed to persist research: ${e.message}`))
          )

          yield* Effect.log(`Research persisted: id=${response.id}, status=${response.status}`)
          return response.id
        })

      /**
       * Persist final summary to the database via FAISS API
       *
       * Stores the complete summary including headline, narrative, highlights,
       * discoveries, fresh releases, themes, and all play references.
       */
      const persistSummary = (
        date: string,
        summary: DailySummaryType,
        researchId: number
      ): Effect.Effect<number, Error> =>
        Effect.gen(function* () {
          yield* Effect.log(`Persisting summary for ${date}`)

          const response = yield* faissClient.saveDailySummary(
            date,
            summary as unknown as Record<string, unknown>,
            researchId
          ).pipe(
            Effect.mapError(e => new Error(`Failed to persist summary: ${e.message}`))
          )

          yield* Effect.log(`Summary persisted: id=${response.id}, status=${response.status}, regenerated_count=${response.regenerated_count}`)
          return response.id
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
          let tokenUsage = emptyTokenUsage()

          // =============================================================================
          // Phase 1: Data Collection
          // =============================================================================
          yield* Effect.log("Phase 1: Collecting day data")

          const [dataCollectionDuration, dayData] = yield* dataCollector.collectDay(date).pipe(
            Effect.mapError(wrapPhaseError("data_collection", "Data collection")),
            Effect.timed
          )
          const dataCollectionMs = Duration.toMillis(dataCollectionDuration)

          yield* Effect.log(`Data collection complete: ${dayData.stats.totalPlays} plays in ${dataCollectionMs}ms`)

          // =============================================================================
          // Phase 2: Research
          // =============================================================================
          yield* Effect.log("Phase 2: Research with tools")

          const [researchDuration, researchResult] = yield* researchAgent.research(dayData).pipe(
            Effect.mapError(wrapPhaseError("research", "Research")),
            Effect.timed
          )
          const researchMs = Duration.toMillis(researchDuration)

          // Aggregate token usage
          tokenUsage = addTokenUsage(tokenUsage, researchResult.tokenUsage)

          yield* Effect.log(`Research complete: ${researchResult.toolCallCount} tool calls in ${researchMs}ms`)

          // Persist research (if not skipped)
          let researchId = 0
          if (!options.skipPersistence) {
            researchId = yield* persistResearch(
              date,
              researchResult.context,
              researchResult.durationMs,
              researchResult.toolCallCount,
              researchResult.tokenUsage
            ).pipe(
              Effect.mapError(wrapPhaseError("persistence", "Research persistence"))
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

          const [writingDuration, writerResult] = yield* writerAgent.write(researchResult.context, {
            playLookup,
            categorizedIds
          }).pipe(
            Effect.mapError(wrapPhaseError("writing", "Writing")),
            Effect.timed
          )
          const writingMs = Duration.toMillis(writingDuration)

          // Aggregate token usage
          tokenUsage = addTokenUsage(tokenUsage, writerResult.tokenUsage)

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

            const [polishDuration, polishResult] = yield* polishAgent
              .polish(writerResult.summary, researchResult.context)
              .pipe(
                Effect.mapError(wrapPhaseError("polish", "Polish")),
                Effect.timed
              )
            polishMs = Duration.toMillis(polishDuration)

            // Aggregate token usage
            tokenUsage = addTokenUsage(tokenUsage, polishResult.tokenUsage)

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

          // Update summary with research ID and ensure all playIds are included
          // Programmatic fix: merge any missing IDs that the LLM didn't include
          const existingPlayIds = new Set(polishedSummary.playIds)
          const missingPlayIds = categorizedIds.all.filter(id => !existingPlayIds.has(id))

          // Also fix newMusicPlaylistIds - should contain all fresh releases
          const existingNewMusic = new Set(polishedSummary.newMusicPlaylistIds)
          const missingNewMusic = categorizedIds.freshReleases.filter(id => !existingNewMusic.has(id))

          const summary: DailySummaryType = {
            ...polishedSummary,
            researchId,
            // Merge missing playIds programmatically
            playIds: missingPlayIds.length > 0
              ? [...polishedSummary.playIds, ...missingPlayIds]
              : polishedSummary.playIds,
            // Merge missing newMusicPlaylistIds programmatically
            newMusicPlaylistIds: missingNewMusic.length > 0
              ? [...polishedSummary.newMusicPlaylistIds, ...missingNewMusic]
              : polishedSummary.newMusicPlaylistIds
          }

          if (missingPlayIds.length > 0) {
            yield* Effect.log(`PlayId fix: added ${missingPlayIds.length} missing IDs`)
          }
          if (missingNewMusic.length > 0) {
            yield* Effect.log(`NewMusic fix: added ${missingNewMusic.length} fresh releases`)
          }

          // Validate playId population (should now pass)
          const validationIssues = validatePlayIdPopulation(summary, categorizedIds)
          if (validationIssues.length > 0) {
            yield* Effect.logWarning(`PlayId validation issues: ${validationIssues.join('; ')}`)
          } else {
            yield* Effect.log("PlayId validation: all arrays properly populated")
          }

          // Persist summary (if not skipped)
          let summaryId = 0
          if (!options.skipPersistence) {
            summaryId = yield* persistSummary(date, summary, researchId).pipe(
              Effect.mapError(wrapPhaseError("persistence", "Summary persistence"))
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
 * Live layer for DailySummaryAgent (parameterized)
 *
 * Accepts a LanguageModel layer to satisfy sub-agent requirements.
 * The modelLayer is provided to the composed layer to satisfy LanguageModel
 * requirements at runtime (sub-agent methods return Effects that need it).
 *
 * Composes all sub-agent layers:
 * - FaissClient.Default (needed by DailySummaryAgent itself for persistence)
 * - DayDataCollector.Default (includes FaissClient.Default for its own use)
 * - SummaryResearchAgent.Default
 * - SummaryWriterAgent.Default
 * - SummaryPolishAgent.Default
 *
 * The caller must still provide:
 * - CrateToolsLive (provides CrateToolkit handlers for SummaryResearchAgent)
 *
 * @param modelLayer - Layer providing LanguageModel.LanguageModel service
 *
 * @example
 * ```typescript
 * // Build layer with model and merge to make available at runtime
 * const DailySummaryWithDeps = DailySummaryAgentLive(ConfigurableModelLive).pipe(
 *   Layer.provide(CrateToolsLive)
 * )
 * const FullLayer = Layer.mergeAll(DailySummaryWithDeps, ConfigurableModelLive)
 * ```
 */
export const DailySummaryAgentLive = (
  modelLayer: Layer.Layer<LanguageModel.LanguageModel>
) =>
  DailySummaryAgent.Default.pipe(
    Layer.provide(FaissClient.Default),
    Layer.provide(DayDataCollector.Default),
    Layer.provide(SummaryResearchAgent.Default),
    Layer.provide(SummaryWriterAgent.Default),
    Layer.provide(SummaryPolishAgent.Default),
    // Provide modelLayer to satisfy LanguageModel requirements at runtime
    Layer.provide(modelLayer)
  )
