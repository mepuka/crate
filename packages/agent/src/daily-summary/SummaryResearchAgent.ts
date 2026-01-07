/**
 * Summary Research Agent
 *
 * Phase 1 of the Daily Summary pipeline.
 *
 * This agent performs deep research on a day's broadcasts using:
 * - Graph exploration tools
 * - Play history/count tools
 * - Semantic search tools
 *
 * Outputs ResearchContext which feeds into the WriterAgent.
 *
 * @module
 */

import { Effect, Schema, Clock, Data } from "effect"
import { Chat, Prompt } from "@effect/ai"
import { CrateToolkit } from "../tools/definitions.js"
import {
  buildResearchSystemPrompt,
  buildDayDataMessage
} from "./prompts/research-prompt.js"
import type { DayData } from "./DayDataCollector.js"
import {
  ResearchContext,
  type ResearchContextType,
  DiscoveryFinding,
  FreshReleaseFinding,
  RotationFinding,
  ThemeFinding,
  CulturalFinding,
  NotablePlayFinding,
  GraphConnectionFinding,
  ShowSummary
} from "./schemas.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Research agent result including metadata
 */
export interface ResearchResult {
  readonly context: ResearchContextType
  readonly durationMs: number
  readonly toolCallCount: number
  readonly tokenUsage: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly cacheReadTokens: number
    readonly cacheCreationTokens: number
  }
}

/**
 * Error type for research failures
 */
export class SummaryResearchError extends Data.TaggedError("SummaryResearchError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// =============================================================================
// Output Schema for LLM
// =============================================================================

/**
 * Simplified schema for LLM output (before full conversion to ResearchContext)
 *
 * The LLM outputs JSON matching this shape, which we then convert to
 * the full ResearchContext with additional computed fields.
 */
const ResearchOutputSchema = Schema.Struct({
  // All arrays are optional - LLM may omit fields or return null
  discoveries: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    playId: Schema.Number,
    artist: Schema.String,
    song: Schema.String,
    album: Schema.NullOr(Schema.String),
    discoveryType: Schema.Literal("first_play", "first_artist", "first_album"),
    significance: Schema.String,
    relatedContext: Schema.NullOr(Schema.String)
  })))),

  freshReleases: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    playId: Schema.Number,
    artist: Schema.String,
    song: Schema.String,
    album: Schema.NullOr(Schema.String),
    releaseDate: Schema.NullOr(Schema.String),
    releaseType: Schema.Literal("single", "album", "ep", "compilation", "unknown"),
    isLocal: Schema.Boolean,
    labelInfo: Schema.NullOr(Schema.String),
    context: Schema.NullOr(Schema.String)
  })))),

  rotationUpdates: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    playId: Schema.Number,
    artist: Schema.String,
    song: Schema.String,
    rotationStatus: Schema.NullOr(Schema.String),
    previousStatus: Schema.NullOr(Schema.String),
    playCountToday: Schema.Number,
    significance: Schema.NullOr(Schema.String)
  })))),

  themes: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    theme: Schema.String,
    description: Schema.String,
    playIds: Schema.Array(Schema.Number),
    showIds: Schema.Array(Schema.Number),
    crossShowConnections: Schema.NullOr(Schema.String),
    suggestedNarrative: Schema.NullOr(Schema.String)
  })))),

  culturalMoments: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    type: Schema.Literal("birthday", "anniversary", "death", "event", "theme_day", "other"),
    subject: Schema.String,
    description: Schema.String,
    playIds: Schema.Array(Schema.Number),
    djComment: Schema.NullOr(Schema.String),
    showId: Schema.NullOr(Schema.Number),
    significance: Schema.String
  })))),

  notablePlays: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    playId: Schema.Number,
    artist: Schema.String,
    song: Schema.String,
    reason: Schema.String,
    category: Schema.Literal("rare", "request", "live", "deep_cut", "connection", "dj_pick", "other"),
    djComment: Schema.NullOr(Schema.String),
    graphConnections: Schema.NullOr(Schema.String),
    showContext: Schema.NullOr(Schema.String)
  })))),

  graphConnections: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({
    sourcePlayId: Schema.Number,
    targetPlayIds: Schema.Array(Schema.Number),
    connectionType: Schema.String,
    description: Schema.String,
    narrative: Schema.NullOr(Schema.String)
  })))),

  // Research notes and angles - also optional
  researchNotes: Schema.optional(Schema.NullOr(Schema.String)),
  suggestedHeadlines: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  narrativeAngles: Schema.optional(Schema.NullOr(Schema.Array(Schema.String)))
})

type ResearchOutput = typeof ResearchOutputSchema.Type

// =============================================================================
// Service Interface
// =============================================================================

export interface SummaryResearchAgentInterface {
  /**
   * Run research on day data and produce ResearchContext
   */
  readonly research: (
    dayData: DayData
  ) => Effect.Effect<
    ResearchResult,
    SummaryResearchError,
    LanguageModel.LanguageModel
  >
}

// =============================================================================
// Service Tag
// =============================================================================

export class SummaryResearchAgent extends Effect.Service<SummaryResearchAgent>()(
  "SummaryResearchAgent",
  {
    effect: Effect.gen(function* () {
      const toolkit = yield* CrateToolkit

      // Token usage tracking
      type TokenUsage = {
        inputTokens: number
        outputTokens: number
        cacheReadTokens: number
        cacheCreationTokens: number
      }

      /**
       * Convert LLM output to full ResearchContext
       */
      const toResearchContext = (
        output: ResearchOutput,
        dayData: DayData,
        durationMs: number,
        toolCallCount: number
      ): ResearchContextType => {
        // Build show summaries from dayData
        const showSummaries: Array<typeof ShowSummary.Type> = dayData.showGroups.map(show => ({
          showId: show.showId,
          showName: show.showName,
          hostName: null, // Would need show metadata lookup
          playCount: show.plays.length,
          startTime: show.startTime.toISOString(),
          endTime: show.endTime.toISOString(),
          themes: [], // Could be filled from analysis
          notableComments: show.comments.slice(0, 5),
          highlightPlayIds: [] // Could be filled from analysis
        }))

        return {
          date: dayData.date,

          // Core findings - handle null with empty arrays
          discoveries: (output.discoveries ?? []).map(d => ({
            ...d,
            discoveryType: d.discoveryType as "first_play" | "first_artist" | "first_album"
          })),
          freshReleases: (output.freshReleases ?? []).map(r => ({
            ...r,
            releaseType: r.releaseType as "single" | "album" | "ep" | "compilation" | "unknown"
          })),
          rotationUpdates: output.rotationUpdates ?? [],

          // Thematic analysis
          themes: output.themes ?? [],
          culturalMoments: (output.culturalMoments ?? []).map(c => ({
            ...c,
            type: c.type as "birthday" | "anniversary" | "death" | "event" | "theme_day" | "other"
          })),

          // Notable plays and connections
          notablePlays: (output.notablePlays ?? []).map(p => ({
            ...p,
            category: p.category as "rare" | "request" | "live" | "deep_cut" | "connection" | "dj_pick" | "other"
          })),
          graphConnections: output.graphConnections ?? [],

          // Show context
          showSummaries,

          // Stats from dayData
          totalPlays: dayData.stats.totalPlays,
          uniqueArtists: dayData.stats.uniqueArtists,
          uniqueAlbums: dayData.stats.uniqueAlbums,
          localArtistCount: dayData.stats.localArtistCount,
          livePerformanceCount: dayData.stats.livePerformanceCount,
          requestCount: dayData.stats.requestCount,

          // Research metadata - handle null with defaults
          researchNotes: output.researchNotes ?? "",
          suggestedHeadlines: output.suggestedHeadlines ?? [],
          narrativeAngles: output.narrativeAngles ?? [],

          // Processing info
          createdAt: new Date().toISOString(),
          durationMs,
          toolCallCount
        }
      }

      const research = (
        dayData: DayData
      ): Effect.Effect<
        ResearchResult,
        SummaryResearchError,
        LanguageModel.LanguageModel
      > =>
        Effect.gen(function* () {
          yield* Effect.log(`Starting research for ${dayData.date}`)

          const startTime = yield* Clock.currentTimeMillis

          // Build prompt using array-based pattern (correct @effect/ai API)
          const systemPrompt = buildResearchSystemPrompt()
          const userMessage = buildDayDataMessage(dayData)

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
          const chat = yield* Chat.fromPrompt(prompt)

          // Track tool calls and token usage
          let totalToolCalls = 0
          const tokenUsage: TokenUsage = {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0
          }

          // =============================================================================
          // Phase 1: Research with tools
          // =============================================================================
          yield* Effect.log("Phase 1: Research with tool calls")

          const maxIterations = 10 // Reduced from 15 for token efficiency
          const minIterations = 5 // Ensure at least this many iterations for thorough research

          // Run research loop
          let iteration = 0
          let hasMoreToolCalls = true
          let consecutiveEmptyIterations = 0

          while (hasMoreToolCalls && iteration < maxIterations) {
            yield* Effect.log(`Research iteration ${iteration + 1}`)

            // Determine tool choice based on iteration
            // First iterations: require specific tools to ensure thorough exploration
            // Later iterations: auto mode lets model decide when done
            const toolChoice = iteration === 0
              ? {
                  mode: "required" as const,
                  oneOf: [
                    "search_plays",
                    "semantic_search",
                    "hybrid_search",
                    "explore_graph",
                    "graph_connections"
                  ]
                }
              : iteration < 3
              ? {
                  mode: "required" as const,
                  oneOf: ["explore_graph", "graph_connections"]
                }
              : "auto" as const

            const response = yield* chat
              .generateText({
                prompt: [],
                toolkit,
                toolChoice
              })
              .pipe(
                Effect.mapError(e => new SummaryResearchError({
                  message: `Research iteration ${iteration + 1} failed: ${e instanceof Error ? e.message : String(e)}`,
                  cause: e
                }))
              )

            // Track token usage
            const usage = response.usage
            if (usage) {
              tokenUsage.inputTokens += usage.inputTokens ?? 0
              tokenUsage.outputTokens += usage.outputTokens ?? 0
              // Note: cache tokens may be in provider-specific fields
            }

            const toolCallCount = response.toolCalls.length
            totalToolCalls += toolCallCount
            hasMoreToolCalls = toolCallCount > 0
            iteration++

            yield* Effect.log(`Iteration ${iteration}: ${toolCallCount} tool calls`)

            // Early stopping: if we've done minimum iterations and model stopped calling tools
            if (toolCallCount === 0) {
              consecutiveEmptyIterations++
              if (iteration >= minIterations && consecutiveEmptyIterations >= 1) {
                yield* Effect.log("Early stop: model finished research")
                break
              }
            } else {
              consecutiveEmptyIterations = 0
            }

            // Early stopping: if we've accumulated enough tool calls (diminishing returns)
            if (iteration >= minIterations && totalToolCalls >= 25) {
              yield* Effect.log(`Early stop: sufficient research (${totalToolCalls} tool calls)`)
              break
            }
          }

          yield* Effect.log(`Research phase complete: ${totalToolCalls} total tool calls over ${iteration} iterations`)

          // =============================================================================
          // Phase 2: Generate structured output
          // =============================================================================
          yield* Effect.log("Phase 2: Generating structured research output")

          const outputPrompt = `Based on all the research you've conducted, provide your complete findings as structured JSON.

Include:
- All discoveries (first plays, first artists)
- Fresh releases you identified
- Rotation updates
- Themes detected across shows
- Cultural moments extracted from DJ comments
- Notable plays worth highlighting
- Graph connections discovered
- Your research notes and suggested narrative angles

Output JSON matching the ResearchContext schema.`

          const structuredResponse = yield* chat
            .generateObject({
              prompt: outputPrompt,
              toolkit,
              schema: ResearchOutputSchema
            })
            .pipe(
              Effect.mapError(e => new SummaryResearchError({
                message: `Failed to generate structured output: ${e instanceof Error ? e.message : String(e)}`,
                cause: e
              }))
            )

          // Track final token usage
          const finalUsage = structuredResponse.usage
          if (finalUsage) {
            tokenUsage.inputTokens += finalUsage.inputTokens ?? 0
            tokenUsage.outputTokens += finalUsage.outputTokens ?? 0
          }

          const endTime = yield* Clock.currentTimeMillis
          const durationMs = Number(endTime - startTime)

          // Convert to full ResearchContext
          const context = toResearchContext(
            structuredResponse.value,
            dayData,
            durationMs,
            totalToolCalls
          )

          yield* Effect.log(`Research complete for ${dayData.date}: ${durationMs}ms, ${totalToolCalls} tool calls`)

          return {
            context,
            durationMs,
            toolCallCount: totalToolCalls,
            tokenUsage
          }
        })

      return { research } satisfies SummaryResearchAgentInterface
    })
    // Note: CrateToolkit is provided by CrateToolsLive layer at the app boundary
    // Toolkit.make() doesn't create a service with .Default, so we can't include it here
  }
) {}

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for SummaryResearchAgent
 *
 * Note: This layer requires CrateToolkit to be provided externally.
 * Use CrateToolsLive from layers.ts to provide the toolkit handlers.
 */
export const SummaryResearchAgentLive = SummaryResearchAgent.Default
