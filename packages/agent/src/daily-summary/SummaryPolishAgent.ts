/**
 * Summary Polish Agent
 *
 * Phase 3 of the Daily Summary pipeline.
 *
 * This agent polishes the writer's draft to:
 * - Improve headline specificity and punch
 * - Extract and populate playIds from narrative text
 * - Include themes/cultural moments from research if missing
 * - Enhance narrative voice for KEXP authenticity
 *
 * No tool access - operates purely on the draft + research context.
 * Uses a more capable model (Sonnet/Opus) for quality writing.
 *
 * @module
 */

import { Effect, Schema, Clock, Data, Config, Option } from "effect"
import { LanguageModel, Chat, Prompt, Tokenizer } from "@effect/ai"
import {
  buildPolishSystemPrompt,
  buildPolishMessage
} from "./prompts/polish-prompt.js"
import type { ResearchContextType, DailySummaryType } from "./schemas.js"
import { type TokenUsage, mutableTokenUsage } from "../multi-agent/types.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Polish agent result including metadata and fix report
 */
export interface PolishResult {
  readonly summary: DailySummaryType
  readonly fixes: PolishFixes
  readonly durationMs: number
  readonly tokenUsage: TokenUsage
}

/**
 * Report of what was fixed during polish
 */
export interface PolishFixes {
  readonly headlineImproved: boolean
  readonly playIdsPopulated: boolean
  readonly themesIncluded: boolean
  readonly culturalMomentsIncluded: boolean
  readonly narrativeEnhanced: boolean
}

/**
 * Error type for polish failures
 */
export class SummaryPolishError extends Data.TaggedError("SummaryPolishError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// =============================================================================
// Output Schema for LLM
// =============================================================================

/**
 * Schema for polish output - mirrors DailySummary structure
 *
 * Using the same structure as WriterOutputSchema but with all fields
 * to ensure complete output.
 */
const PolishOutputSchema = Schema.Struct({
  headline: Schema.String,

  // Narrative layer - required
  openingNarrative: Schema.String,

  // All arrays - optional since LLMs sometimes omit them
  highlights: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    playId: Schema.Number,
    headline: Schema.String,
    description: Schema.String,
    category: Schema.Literal("discovery", "theme", "cultural", "connection", "rare", "local"),
    showName: Schema.NullOr(Schema.String)
  })))),

  discoveries: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    playId: Schema.Number,
    artist: Schema.String,
    song: Schema.String,
    album: Schema.NullOr(Schema.String),
    discoveryType: Schema.Literal("first_play", "first_artist", "first_album"),
    blurb: Schema.String
  })))),

  freshReleases: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    playId: Schema.Number,
    artist: Schema.String,
    song: Schema.String,
    album: Schema.NullOr(Schema.String),
    releaseDate: Schema.NullOr(Schema.String),
    releaseType: Schema.Literal("single", "album", "ep", "compilation", "unknown"),
    isLocal: Schema.Boolean,
    blurb: Schema.String
  })))),

  rotationUpdates: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    playId: Schema.Number,
    artist: Schema.String,
    song: Schema.String,
    rotationStatus: Schema.NullOr(Schema.String),
    playCountToday: Schema.Number,
    blurb: Schema.NullOr(Schema.String)
  })))),

  themes: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    title: Schema.String,
    description: Schema.String,
    playIds: Schema.Array(Schema.Number),
    showNames: Schema.Array(Schema.String)
  })))),

  culturalMoments: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    type: Schema.Literal("birthday", "anniversary", "death", "event", "theme_day", "other"),
    title: Schema.String,
    description: Schema.String,
    playIds: Schema.Array(Schema.Number),
    source: Schema.NullOr(Schema.String)
  })))),

  // Play references - also optional with defaults
  playIds: Schema.optional(Schema.NullOr(Schema.Array(Schema.Number))),
  topPickIds: Schema.optional(Schema.NullOr(Schema.Array(Schema.Number))),
  newMusicPlaylistIds: Schema.optional(Schema.NullOr(Schema.Array(Schema.Number)))
})

type PolishOutput = typeof PolishOutputSchema.Type

// =============================================================================
// Service Interface
// =============================================================================

export interface SummaryPolishAgentInterface {
  /**
   * Polish draft summary using research context
   */
  readonly polish: (
    draft: DailySummaryType,
    research: ResearchContextType
  ) => Effect.Effect<
    PolishResult,
    SummaryPolishError,
    LanguageModel.LanguageModel
  >
}

// =============================================================================
// Service Tag
// =============================================================================

export class SummaryPolishAgent extends Effect.Service<SummaryPolishAgent>()(
  "SummaryPolishAgent",
  {
    effect: Effect.gen(function* () {
      /**
       * Determine what was fixed by comparing draft to polished output
       */
      const detectFixes = (
        draft: DailySummaryType,
        polished: PolishOutput
      ): PolishFixes => {
        // Headline improved if it changed and polished is different length/words
        const headlineImproved = draft.headline !== polished.headline

        // PlayIds populated if draft was empty and polished has items
        const polishedPlayIds = polished.playIds ?? []
        const playIdsPopulated =
          draft.playIds.length === 0 && polishedPlayIds.length > 0

        // Themes included if draft was empty and polished has items
        const polishedThemes = polished.themes ?? []
        const themesIncluded =
          draft.themes.length === 0 && polishedThemes.length > 0

        // Cultural moments included if draft was empty and polished has items
        const polishedMoments = polished.culturalMoments ?? []
        const culturalMomentsIncluded =
          draft.culturalMoments.length === 0 && polishedMoments.length > 0

        // Narrative enhanced if it changed significantly (more than 10% different)
        const narrativeEnhanced =
          Math.abs(draft.openingNarrative.length - polished.openingNarrative.length) >
          draft.openingNarrative.length * 0.1 ||
          draft.openingNarrative !== polished.openingNarrative

        return {
          headlineImproved,
          playIdsPopulated,
          themesIncluded,
          culturalMomentsIncluded,
          narrativeEnhanced
        }
      }

      /**
       * Convert polish output to DailySummary, preserving original metadata
       * Falls back to draft values for any missing arrays
       */
      const toPolishedSummary = (
        output: PolishOutput,
        draft: DailySummaryType
      ): DailySummaryType => ({
        date: draft.date,
        headline: output.headline,

        // Narrative layer
        openingNarrative: output.openingNarrative,
        highlights: (output.highlights ?? draft.highlights).map(h => ({
          ...h,
          category: h.category as "discovery" | "theme" | "cultural" | "connection" | "rare" | "local"
        })),

        // Structured sections - fallback to draft if missing
        discoveries: (output.discoveries ?? draft.discoveries).map(d => ({
          ...d,
          discoveryType: d.discoveryType as "first_play" | "first_artist" | "first_album"
        })),
        freshReleases: (output.freshReleases ?? draft.freshReleases).map(r => ({
          ...r,
          releaseType: r.releaseType as "single" | "album" | "ep" | "compilation" | "unknown"
        })),
        rotationUpdates: output.rotationUpdates ?? draft.rotationUpdates,
        themes: output.themes ?? draft.themes,
        culturalMoments: (output.culturalMoments ?? draft.culturalMoments).map(c => ({
          ...c,
          type: c.type as "birthday" | "anniversary" | "death" | "event" | "theme_day" | "other"
        })),

        // Play references - the critical fix, fallback to draft
        playIds: output.playIds ?? draft.playIds,
        topPickIds: output.topPickIds ?? draft.topPickIds,
        newMusicPlaylistIds: output.newMusicPlaylistIds ?? draft.newMusicPlaylistIds,

        // Preserve original metadata
        stats: draft.stats,
        generatedAt: draft.generatedAt,
        researchId: draft.researchId
      })

      const truncatePrompt = (
        prompt: Prompt.Prompt,
        maxTokens: number,
        label: string
      ): Effect.Effect<Prompt.Prompt, never> =>
        Effect.serviceOption(Tokenizer.Tokenizer).pipe(
          Effect.flatMap((tokenizerOption) =>
            maxTokens > 0
              ? Option.match(tokenizerOption, {
                  onNone: () =>
                    Effect.logWarning(`${label} prompt truncation skipped (Tokenizer unavailable)`).pipe(
                      Effect.as(prompt)
                    ),
                  onSome: (tokenizer) =>
                    tokenizer.truncate(prompt, maxTokens).pipe(
                      Effect.catchAll((error) =>
                        Effect.logWarning(
                          `${label} prompt truncation failed: ${
                            error instanceof Error ? error.message : String(error)
                          }`
                        ).pipe(Effect.as(prompt))
                      )
                    )
                })
              : Effect.succeed(prompt)
          )
        )

      const polish = (
        draft: DailySummaryType,
        research: ResearchContextType
      ): Effect.Effect<
        PolishResult,
        SummaryPolishError,
        LanguageModel.LanguageModel
      > =>
        Effect.gen(function* () {
          yield* Effect.log(`Starting polish for ${draft.date}`)

          const startTime = yield* Clock.currentTimeMillis
          const maxTokens = yield* Config.number("DAILY_SUMMARY_POLISH_MAX_TOKENS").pipe(
            Config.withDefault(30000),
            Effect.catchAll(() => Effect.succeed(30000))
          )

          // Build prompt
          const systemPrompt = buildPolishSystemPrompt()
          const userMessage = buildPolishMessage(draft, research)

          const prompt = Prompt.make([
            {
              role: "system",
              content: systemPrompt,
              options: {
                anthropic: {
                  cacheControl: { type: "ephemeral" }
                }
              }
            },
            { role: "user", content: userMessage }
          ])

          const truncatedPrompt = yield* truncatePrompt(prompt, maxTokens, "Polish")
          const chat = yield* Chat.fromPrompt(truncatedPrompt)

          // Token usage
          const tokenUsage = mutableTokenUsage()

          // Generate polished output (no tools needed)
          const response = yield* chat
            .generateObject({
              prompt: [],
              schema: PolishOutputSchema
            })
            .pipe(
              Effect.mapError(e => new SummaryPolishError({
                message: `Failed to polish summary: ${e instanceof Error ? e.message : String(e)}`,
                cause: e
              }))
            )

          // Track token usage
          const usage = response.usage
          if (usage) {
            const input = usage.inputTokens ?? 0
            const output = usage.outputTokens ?? 0
            tokenUsage.inputTokens = input
            tokenUsage.outputTokens = output
            tokenUsage.totalTokens = input + output
          }

          const endTime = yield* Clock.currentTimeMillis
          const durationMs = Number(endTime - startTime)

          // Detect what was fixed
          const fixes = detectFixes(draft, response.value)

          // Convert to DailySummary
          const summary = toPolishedSummary(response.value, draft)

          yield* Effect.log(
            `Polish complete for ${draft.date}: ${durationMs}ms, ` +
            `headline=${fixes.headlineImproved}, ` +
            `playIds=${fixes.playIdsPopulated}, ` +
            `themes=${fixes.themesIncluded}, ` +
            `cultural=${fixes.culturalMomentsIncluded}`
          )

          return {
            summary,
            fixes,
            durationMs,
            tokenUsage
          }
        })

      return { polish } satisfies SummaryPolishAgentInterface
    })
  }
) {}

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for SummaryPolishAgent
 */
export const SummaryPolishAgentLive = SummaryPolishAgent.Default
