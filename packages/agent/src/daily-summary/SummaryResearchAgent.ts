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
import { LanguageModel, Chat, Prompt } from "@effect/ai"
import { CrateToolkit, CrateToolkitWithContext } from "../tools/definitions.js"
import { type TokenUsage, mutableTokenUsage } from "../multi-agent/types.js"
import {
  buildResearchSystemPrompt,
  buildDayDataMessage,
  buildDayDataIndexMessage
} from "./prompts/research-prompt.js"
import type { DayData, DayDataArtifacts } from "./DayDataCollector.js"
import {
  type ResearchContextType,
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
  readonly tokenUsage: TokenUsage
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
   * Run research on day data and produce ResearchContext (inline data)
   */
  readonly research: (
    dayData: DayData
  ) => Effect.Effect<
    ResearchResult,
    SummaryResearchError,
    LanguageModel.LanguageModel
  >

  /**
   * Run research on artifact-based day data (dynamic context discovery)
   *
   * Uses compact index prompt and context discovery tools to retrieve
   * data on demand, significantly reducing prompt token usage.
   */
  readonly researchWithArtifacts: (
    artifacts: DayDataArtifacts
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
      const toolkitWithContext = yield* CrateToolkitWithContext

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
          const tokenUsage = mutableTokenUsage()

          // =============================================================================
          // Phase 1: Research with tools
          // =============================================================================
          yield* Effect.log("Phase 1: Research with tool calls")

          // Increased limits for thorough exploration (Phase 2.5 enhancement)
          const maxIterations = 20 // Increased from 10 for deeper analysis
          const minIterations = 8 // Increased from 5 for baseline depth

          // Run research loop
          let iteration = 0
          let hasMoreToolCalls = true
          let consecutiveEmptyIterations = 0

          while (hasMoreToolCalls && iteration < maxIterations) {
            yield* Effect.log(`Research iteration ${iteration + 1}`)

            // Determine tool choice based on iteration
            // Phase 1 (iteration 0-1): Search and basic graph exploration
            // Phase 2 (iteration 2-4): Include cached graph algorithm tools for deep analysis
            // Phase 3 (iteration 5+): Auto mode - model decides when done
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
              : iteration < 2
              ? {
                  mode: "required" as const,
                  oneOf: ["explore_graph", "graph_connections", "find_graph_path"]
                }
              : iteration < 5
              ? {
                  mode: "required" as const,
                  oneOf: [
                    // Cached graph algorithm tools for deep analysis
                    "analyze_influence",
                    "explore_neighborhood",
                    "summarize_relationships",
                    "analyze_time_period",
                    "graph_connections"
                  ]
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
              const input = usage.inputTokens ?? 0
              const output = usage.outputTokens ?? 0
              tokenUsage.inputTokens += input
              tokenUsage.outputTokens += output
              tokenUsage.totalTokens += input + output
              // Note: cache tokens may be in provider-specific fields
            }

            const toolCallCount = response.toolCalls.length
            totalToolCalls += toolCallCount
            hasMoreToolCalls = toolCallCount > 0
            iteration++

            yield* Effect.log(`Iteration ${iteration}: ${toolCallCount} tool calls`)

            // Early stopping: if we've done minimum iterations and model stopped calling tools
            // Require 2 consecutive empty iterations to prevent premature exit
            if (toolCallCount === 0) {
              consecutiveEmptyIterations++
              if (iteration >= minIterations && consecutiveEmptyIterations >= 2) {
                yield* Effect.log("Early stop: model finished research (2 consecutive empty)")
                break
              }
            } else {
              consecutiveEmptyIterations = 0
            }

            // Early stopping: if we've accumulated enough tool calls (diminishing returns)
            // Increased from 25 to 50 for more thorough research
            if (iteration >= minIterations && totalToolCalls >= 50) {
              yield* Effect.log(`Early stop: sufficient research (${totalToolCalls} tool calls)`)
              break
            }
          }

          yield* Effect.log(`Research phase complete: ${totalToolCalls} total tool calls over ${iteration} iterations`)

          // =============================================================================
          // Phase 2: Generate structured output
          // =============================================================================
          yield* Effect.log("Phase 2: Generating structured research output")

          const outputPrompt = `Generate structured JSON containing ALL your research findings.

CRITICAL: Do NOT skip findings. If you found birthdays, themes, or discoveries during research, they MUST appear in the output.

## Field-by-Field Instructions:

### discoveries (REQUIRED if you found any first plays/first artists)
For EACH first-ever KEXP play or first-ever artist you identified:
{
  "playId": <number from your research>,
  "artist": "<artist name>",
  "song": "<song title>",
  "album": "<album name or null>",
  "discoveryType": "first_play" | "first_artist" | "first_album",
  "significance": "<why this matters - 1-2 sentences>",
  "relatedContext": "<any DJ comment or context>"
}

### freshReleases (REQUIRED if you found recent releases)
For EACH recently released track (2024-2025):
{
  "playId": <number>,
  "artist": "<artist>",
  "song": "<song>",
  "album": "<album or null>",
  "releaseDate": "<YYYY-MM-DD or null>",
  "releaseType": "single" | "album" | "ep" | "compilation" | "unknown",
  "isLocal": true | false,
  "labelInfo": "<label name or null>",
  "context": "<producer, tour info, or other context>"
}

### rotationUpdates (REQUIRED if you found rotation status changes)
For EACH track with rotation status (Heavy, Medium, Light, New):
{
  "playId": <number>,
  "artist": "<artist>",
  "song": "<song>",
  "rotationStatus": "Heavy" | "Medium" | "Light" | "New" | null,
  "previousStatus": "<previous rotation status or null>",
  "playCountToday": <number of times played today>,
  "significance": "<why this rotation matters or null>"
}

### themes (REQUIRED if you found cross-show patterns)
For EACH thematic pattern spanning 2+ shows or 3+ plays:
{
  "theme": "<short name, e.g., 'ESNS 2025 Showcase'>",
  "description": "<1-2 sentences explaining the pattern>",
  "playIds": [<all relevant play IDs>],
  "showIds": [<show numbers>],
  "crossShowConnections": "<how theme manifests across shows>",
  "suggestedNarrative": "<story angle for the writer>"
}

### culturalMoments (REQUIRED if you found birthdays/anniversaries/events)
For EACH birthday, anniversary, death, or cultural event from DJ comments:
{
  "type": "birthday" | "anniversary" | "death" | "event" | "theme_day" | "other",
  "subject": "<person or album name>",
  "description": "<what happened, e.g., 'Troy Van Leeuwen turns 55'>",
  "playIds": [<related play IDs>],
  "djComment": "<the exact DJ comment mentioning this, or null>",
  "showId": <show number or null>,
  "significance": "<why this matters to KEXP listeners>"
}

### notablePlays (REQUIRED - select 5-10 standout moments)
For EACH notable play that deserves highlighting (rare spins, requests, live performances, deep cuts):
{
  "playId": <number>,
  "artist": "<artist>",
  "song": "<song>",
  "reason": "<why this play is notable - 1-2 sentences>",
  "category": "rare" | "request" | "live" | "deep_cut" | "connection" | "dj_pick" | "other",
  "djComment": "<relevant DJ comment or null>",
  "graphConnections": "<notable artist connections found via graph tools, or null>",
  "showContext": "<show name or DJ context, or null>"
}

### graphConnections (REQUIRED if you found artist connections via graph tools)
For EACH significant connection discovered through graph exploration:
{
  "sourcePlayId": <the play ID that triggered the exploration>,
  "targetPlayIds": [<related play IDs from the same day>],
  "connectionType": "<labelmates | collaborators | band_members | producers | same_genre>",
  "description": "<1-2 sentences explaining the connection>",
  "narrative": "<story angle for the writer, or null>"
}

### researchNotes (REQUIRED)
A summary of your research process and findings. Format as bullet points:
- Key discoveries and their significance
- Patterns you noticed across shows
- Suggested narrative angles for the writer
- Any notable DJ commentary themes
- Recommendations for headline focus

### suggestedHeadlines (REQUIRED - provide 3-5 options)
Array of 3-5 headline options (6-8 words each) that capture the day's essence.

### narrativeAngles (REQUIRED - provide 2-3 angles)
Array of 2-3 narrative approaches the writer could take.

## Verification Checklist:
Before outputting JSON, verify you have NOT omitted:
- Any birthdays you found in DJ comments
- Any thematic programming blocks (ESNS, genre clusters, etc.)
- Any first plays or debut artists
- Any notable local artists
- Any graph connections you discovered
- All rotation status changes

Output the complete JSON now.`

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
            const input = finalUsage.inputTokens ?? 0
            const output = finalUsage.outputTokens ?? 0
            tokenUsage.inputTokens += input
            tokenUsage.outputTokens += output
            tokenUsage.totalTokens += input + output
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

      /**
       * Artifact-based research using dynamic context discovery
       *
       * Similar to `research` but:
       * - Uses compact index prompt (~500-800 tokens vs 4.5-9.5K)
       * - Includes context discovery tools for on-demand retrieval
       * - Agent can fetch specific data from artifacts as needed
       */
      const researchWithArtifacts = (
        artifacts: DayDataArtifacts
      ): Effect.Effect<
        ResearchResult,
        SummaryResearchError,
        LanguageModel.LanguageModel
      > =>
        Effect.gen(function* () {
          yield* Effect.log(`Starting artifact-based research for ${artifacts.date}`)

          const startTime = yield* Clock.currentTimeMillis

          // Build compact prompt with artifact references
          const systemPrompt = buildResearchSystemPrompt()
          const userMessage = buildDayDataIndexMessage(artifacts)

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
          const tokenUsage = mutableTokenUsage()

          // =============================================================================
          // Phase 1: Research with tools (including context discovery)
          // =============================================================================
          yield* Effect.log("Phase 1: Research with tool calls (artifact-based)")

          // Significantly increased limits for thorough multi-pass exploration (Phase 2.5)
          const maxIterations = 25 // Increased from 12 for deep context discovery
          const minIterations = 10 // Increased from 5 for comprehensive research

          // Run research loop
          let iteration = 0
          let hasMoreToolCalls = true
          let consecutiveEmptyIterations = 0

          while (hasMoreToolCalls && iteration < maxIterations) {
            yield* Effect.log(`Research iteration ${iteration + 1}`)

            // Modified tool choice to encourage context discovery first
            // Phase 0 (iteration 0): Start with context discovery to understand data
            // Phase 1 (iteration 1-2): Search and basic graph exploration
            // Phase 2 (iteration 3-5): Deep graph analysis
            // Phase 3 (iteration 6+): Auto mode
            const toolChoice = iteration === 0
              ? {
                  mode: "required" as const,
                  oneOf: [
                    // Start by exploring available context
                    "context_list",
                    "context_search",
                    "context_read"
                  ]
                }
              : iteration < 3
              ? {
                  mode: "required" as const,
                  oneOf: [
                    "search_plays",
                    "semantic_search",
                    "hybrid_search",
                    "context_search",
                    "context_read",
                    "explore_graph",
                    "graph_connections"
                  ]
                }
              : iteration < 6
              ? {
                  mode: "required" as const,
                  oneOf: [
                    "analyze_influence",
                    "explore_neighborhood",
                    "summarize_relationships",
                    "analyze_time_period",
                    "graph_connections",
                    "context_read",
                    "context_search"
                  ]
                }
              : "auto" as const

            const response = yield* chat
              .generateText({
                prompt: [],
                toolkit: toolkitWithContext,
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
              const input = usage.inputTokens ?? 0
              const output = usage.outputTokens ?? 0
              tokenUsage.inputTokens += input
              tokenUsage.outputTokens += output
              tokenUsage.totalTokens += input + output
            }

            const toolCallCount = response.toolCalls.length
            totalToolCalls += toolCallCount
            hasMoreToolCalls = toolCallCount > 0
            iteration++

            yield* Effect.log(`Iteration ${iteration}: ${toolCallCount} tool calls`)

            // Early stopping logic - require 2 consecutive empty iterations
            if (toolCallCount === 0) {
              consecutiveEmptyIterations++
              if (iteration >= minIterations && consecutiveEmptyIterations >= 2) {
                yield* Effect.log("Early stop: model finished research (2 consecutive empty)")
                break
              }
            } else {
              consecutiveEmptyIterations = 0
            }

            // Increased from 30 to 60 for more comprehensive artifact exploration
            if (iteration >= minIterations && totalToolCalls >= 60) {
              yield* Effect.log(`Early stop: sufficient research (${totalToolCalls} tool calls)`)
              break
            }
          }

          yield* Effect.log(`Research phase complete: ${totalToolCalls} total tool calls over ${iteration} iterations`)

          // =============================================================================
          // Phase 2: Generate structured output
          // =============================================================================
          yield* Effect.log("Phase 2: Generating structured research output")

          const outputPrompt = `Generate structured JSON containing ALL your research findings.

CRITICAL: Do NOT skip findings. If you found birthdays, themes, or discoveries during research, they MUST appear in the output.

## Field-by-Field Instructions:

### discoveries (REQUIRED if you found any first plays/first artists)
For EACH first-ever KEXP play or first-ever artist you identified:
{
  "playId": <number from your research>,
  "artist": "<artist name>",
  "song": "<song title>",
  "album": "<album name or null>",
  "discoveryType": "first_play" | "first_artist" | "first_album",
  "significance": "<why this matters - 1-2 sentences>",
  "relatedContext": "<any DJ comment or context>"
}

### freshReleases (REQUIRED if you found recent releases)
For EACH recently released track (2024-2025):
{
  "playId": <number>,
  "artist": "<artist>",
  "song": "<song>",
  "album": "<album or null>",
  "releaseDate": "<YYYY-MM-DD or null>",
  "releaseType": "single" | "album" | "ep" | "compilation" | "unknown",
  "isLocal": true | false,
  "labelInfo": "<label name or null>",
  "context": "<producer, tour info, or other context>"
}

### rotationUpdates (REQUIRED if you found rotation status changes)
For EACH track with rotation status (Heavy, Medium, Light, New):
{
  "playId": <number>,
  "artist": "<artist>",
  "song": "<song>",
  "rotationStatus": "Heavy" | "Medium" | "Light" | "New" | null,
  "previousStatus": "<previous rotation status or null>",
  "playCountToday": <number of times played today>,
  "significance": "<why this rotation matters or null>"
}

### themes (REQUIRED if you found cross-show patterns)
For EACH thematic pattern spanning 2+ shows or 3+ plays:
{
  "theme": "<short name, e.g., 'ESNS 2025 Showcase'>",
  "description": "<1-2 sentences explaining the pattern>",
  "playIds": [<all relevant play IDs>],
  "showIds": [<show numbers>],
  "crossShowConnections": "<how theme manifests across shows>",
  "suggestedNarrative": "<story angle for the writer>"
}

### culturalMoments (REQUIRED if you found birthdays/anniversaries/events)
For EACH birthday, anniversary, death, or cultural event from DJ comments:
{
  "type": "birthday" | "anniversary" | "death" | "event" | "theme_day" | "other",
  "subject": "<person or album name>",
  "description": "<what happened, e.g., 'Troy Van Leeuwen turns 55'>",
  "playIds": [<related play IDs>],
  "djComment": "<the exact DJ comment mentioning this, or null>",
  "showId": <show number or null>,
  "significance": "<why this matters to KEXP listeners>"
}

### notablePlays (REQUIRED - select 5-10 standout moments)
For EACH notable play that deserves highlighting (rare spins, requests, live performances, deep cuts):
{
  "playId": <number>,
  "artist": "<artist>",
  "song": "<song>",
  "reason": "<why this play is notable - 1-2 sentences>",
  "category": "rare" | "request" | "live" | "deep_cut" | "connection" | "dj_pick" | "other",
  "djComment": "<relevant DJ comment or null>",
  "graphConnections": "<notable artist connections found via graph tools, or null>",
  "showContext": "<show name or DJ context, or null>"
}

### graphConnections (REQUIRED if you found artist connections via graph tools)
For EACH significant connection discovered through graph exploration:
{
  "sourcePlayId": <the play ID that triggered the exploration>,
  "targetPlayIds": [<related play IDs from the same day>],
  "connectionType": "<labelmates | collaborators | band_members | producers | same_genre>",
  "description": "<1-2 sentences explaining the connection>",
  "narrative": "<story angle for the writer, or null>"
}

### researchNotes (REQUIRED)
A summary of your research process and findings. Format as bullet points:
- Key discoveries and their significance
- Patterns you noticed across shows
- Suggested narrative angles for the writer
- Any notable DJ commentary themes
- Recommendations for headline focus

### suggestedHeadlines (REQUIRED - provide 3-5 options)
Array of 3-5 headline options (6-8 words each) that capture the day's essence.

### narrativeAngles (REQUIRED - provide 2-3 angles)
Array of 2-3 narrative approaches the writer could take.

## Verification Checklist:
Before outputting JSON, verify you have NOT omitted:
- Any birthdays you found in DJ comments
- Any thematic programming blocks (ESNS, genre clusters, etc.)
- Any first plays or debut artists
- Any notable local artists
- Any graph connections you discovered
- All rotation status changes

Output the complete JSON now.`

          const structuredResponse = yield* chat
            .generateObject({
              prompt: outputPrompt,
              toolkit: toolkitWithContext,
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
            const input = finalUsage.inputTokens ?? 0
            const output = finalUsage.outputTokens ?? 0
            tokenUsage.inputTokens += input
            tokenUsage.outputTokens += output
            tokenUsage.totalTokens += input + output
          }

          const endTime = yield* Clock.currentTimeMillis
          const durationMs = Number(endTime - startTime)

          // Convert to full ResearchContext - use _fullData if available for showGroups
          const dayDataForContext = artifacts._fullData ?? {
            date: artifacts.date,
            stats: artifacts.stats,
            plays: [],
            showGroups: artifacts.showIndex.map(si => ({
              showId: si.showId,
              showName: null,
              startTime: new Date(),
              endTime: new Date(),
              plays: [],
              comments: [],
              localCount: si.localCount,
              rotationCount: si.rotationCount,
              requestCount: si.requestCount
            })),
            firstPlays: [],
            rotationPlays: [],
            localPlays: [],
            livePlays: [],
            requestPlays: [],
            playsWithComments: [],
            uniqueArtistMbids: new Set(),
            uniqueRecordingMbids: new Set(),
            uniqueReleaseMbids: new Set()
          }

          const context = toResearchContext(
            structuredResponse.value,
            dayDataForContext,
            durationMs,
            totalToolCalls
          )

          yield* Effect.log(`Artifact-based research complete for ${artifacts.date}: ${durationMs}ms, ${totalToolCalls} tool calls`)

          return {
            context,
            durationMs,
            toolCallCount: totalToolCalls,
            tokenUsage
          }
        })

      return { research, researchWithArtifacts } satisfies SummaryResearchAgentInterface
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
