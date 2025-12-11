/**
 * Music Agent Service
 *
 * AI agent for enriching KEXP plays with insights using Effect AI.
 * Uses Anthropic Claude with tools for research and analysis.
 *
 * DEPENDENCY INJECTION PATTERN:
 * This service REQUIRES LanguageModel.LanguageModel as a dependency.
 * The actual Anthropic configuration is provided via MusicAgentLive layer
 * which composes the Anthropic client and model at the app boundary.
 *
 * @module
 */

import { Effect, Data, Schema, Layer, pipe, Clock } from "effect";
import { LanguageModel, Chat, Prompt, Tool, Toolkit } from "@effect/ai";
import type * as Kexp from "@crate/domain/kexp/schemas";
// EnrichmentRequest and EnrichmentItem no longer used - using postInsights directly
import { FaissClient } from "./FaissClient.js";
import type {
  InsightRecord,
  EvalContext,
  ToolCallRecord,
} from "@crate/domain/faiss/schemas";
import { TokenUsage, calculateCost } from "@crate/domain/faiss/enrichment.js";
import {
  PromptBuilderService,
  PromptBuilderServiceFull,
  InsightSessionService,
  faissPlayToKexpPlay,
} from "./services/index.js";
import { CrateToolkit } from "./tools/definitions.js";
import { CrateToolsLive, AnthropicModelLive } from "./layers.js";
import {
  InsightArray,
  InsightsResponseEncoded,
  Insight,
  getInsightSummary,
} from "./prompts/insights.js";
import type { InsightSummary } from "./tools/schemas.js";

/**
 * Full InsightsResponse schema - used for decoding after generateObject.
 * This schema produces typed class instances (TaggedClass).
 */
const InsightsResponse = Schema.Struct({
  insights: InsightArray,
});
type InsightsResponse = typeof InsightsResponse.Type;

// =============================================================================
// Errors
// =============================================================================

export class MusicAgentError extends Data.TaggedError("MusicAgentError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract result count from tool results for eval context.
 * Handles various result shapes from different tools.
 */
const extractResultCount = (
  toolName: string,
  result: unknown
): number | undefined => {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;

  // Most search tools return { results: [...], total: N }
  if ("results" in r && Array.isArray(r.results)) return r.results.length;
  if ("total" in r && typeof r.total === "number") return r.total;

  // Graph tools return { connections: [...] } or { neighbors: [...] }
  if ("connections" in r && Array.isArray(r.connections))
    return r.connections.length;
  if ("neighbors" in r && Array.isArray(r.neighbors)) return r.neighbors.length;

  // resolve_mbid returns { matches: [...] }
  if ("matches" in r && Array.isArray(r.matches)) return r.matches.length;

  return undefined;
};

/**
 * Summarize a tool result for eval context.
 * Truncates to avoid storing massive payloads.
 */
const summarizeToolResult = (
  toolName: string,
  result: unknown,
  isFailure: boolean
): string => {
  if (isFailure) {
    return `Error: ${String(result).slice(0, 200)}`;
  }

  // For search tools, just report the count
  const count = extractResultCount(toolName, result);
  if (count !== undefined) {
    return `${count} results`;
  }

  // For other tools, truncate the JSON
  try {
    const json = JSON.stringify(result);
    if (json.length > 300) {
      return json.slice(0, 297) + "...";
    }
    return json;
  } catch {
    return String(result).slice(0, 300);
  }
};

/**
 * Convert an InsightRecord (from database) to InsightSummary for session pre-seeding
 *
 * InsightRecord comes from GET /api/insights/plays/{play_id} endpoint.
 * We extract the key fields and mark it as coming from the database.
 */
const insightRecordToSummary = (
  record: InsightRecord,
  play: { artist?: string; song?: string }
): InsightSummary => {
  // Extract artist and track from the stored data or fall back to play info
  const data = record.data as Record<string, unknown>;
  const artist = (data?.artist as string) || play.artist || "Unknown";
  const track = (data?.song as string) || play.song || "Unknown";

  // Collect all referenced MBIDs
  const entityMbids: string[] = [];
  if (record.source_recording_mbid)
    entityMbids.push(record.source_recording_mbid);
  if (record.source_release_mbid) entityMbids.push(record.source_release_mbid);
  if (record.referenced_artist_mbid)
    entityMbids.push(record.referenced_artist_mbid);
  if (record.referenced_recording_mbid)
    entityMbids.push(record.referenced_recording_mbid);
  if (record.referenced_release_mbid)
    entityMbids.push(record.referenced_release_mbid);
  if (record.referenced_label_mbid)
    entityMbids.push(record.referenced_label_mbid);

  return {
    id: `db-${record.id}`, // Prefix with db- to indicate it's from database
    play_id: record.play_id,
    artist,
    track,
    insight_type: record.insight_type,
    summary: record.summary ?? `${record.insight_type} insight`,
    created_at: record.created_at,
    entity_mbids: [...new Set(entityMbids)], // Dedupe
  };
};

/**
 * Convert an Insight to InsightSummary for session storage
 *
 * InsightSummary is a simplified format used by get_recent_insights tool
 * to help the agent avoid duplicate research.
 */
const insightToSummary = (insight: Insight): InsightSummary => {
  // Collect all MBIDs from the insight
  const entityMbids: string[] = [];

  // Add source MBIDs
  if (insight.sourceRecordingMbid) {
    entityMbids.push(insight.sourceRecordingMbid);
  }
  if (insight.sourceReleaseMbid) {
    entityMbids.push(insight.sourceReleaseMbid);
  }
  entityMbids.push(...insight.sourceArtistMbids);

  // Add type-specific MBIDs
  switch (insight._tag) {
    case "Concert":
      if (insight.artist.mbid) entityMbids.push(insight.artist.mbid);
      break;
    case "Cover":
      if (insight.original.mbid) entityMbids.push(insight.original.mbid);
      insight.original.artists.forEach((a) => {
        if (a.mbid) entityMbids.push(a.mbid);
      });
      break;
    case "Sample":
      if (insight.sampled.mbid) entityMbids.push(insight.sampled.mbid);
      insight.sampled.artists.forEach((a) => {
        if (a.mbid) entityMbids.push(a.mbid);
      });
      break;
    case "PlayHistory":
      if (insight.entityMbid) entityMbids.push(insight.entityMbid);
      break;
    case "Connection":
      if (insight.fromArtist.mbid) entityMbids.push(insight.fromArtist.mbid);
      if (insight.toArtist.mbid) entityMbids.push(insight.toArtist.mbid);
      if (insight.viaLabel?.mbid) entityMbids.push(insight.viaLabel.mbid);
      break;
    case "Link":
      // RelatedEntity can be ArtistRef, RecordingRef, or ReleaseRef
      if (insight.relatedEntity && "mbid" in insight.relatedEntity) {
        if (insight.relatedEntity.mbid)
          entityMbids.push(insight.relatedEntity.mbid);
      }
      break;
  }

  // Deduplicate MBIDs
  const uniqueMbids = [...new Set(entityMbids)];

  // Get artist/track info for display (varies by insight type)
  let artist = "Unknown";
  let track = "Unknown";

  switch (insight._tag) {
    case "Concert":
      artist = insight.artist.name;
      track = `Concert at ${insight.venue ?? "venue"}`;
      break;
    case "Cover":
    case "Sample":
    case "PlayHistory":
    case "Connection":
    case "Link":
      // These don't have direct artist/track - use summary
      artist = getInsightSummary(insight);
      track = insight._tag;
      break;
  }

  return {
    id: `${insight._tag}-${insight.playId}-${Date.now()}`,
    play_id: insight.playId,
    artist,
    track,
    insight_type: insight._tag,
    summary: getInsightSummary(insight),
    created_at: new Date().toISOString(),
    entity_mbids: uniqueMbids,
  };
};

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Requirements for MusicAgent methods
 *
 * The agent needs LanguageModel to generate insights.
 * This requirement is exposed so callers can satisfy it at the app boundary.
 */
export type MusicAgentRequirements = LanguageModel.LanguageModel;

export interface MusicAgentInterface {
  /**
   * Enrich multiple plays with AI-generated insights
   *
   * The agent will:
   * 1. Build prompts with full context (show, time, recent insights)
   * 2. Use tools to research (search_plays, semantic_search, resolve_mbid, fetch_link, get_recent_insights)
   * 3. Generate insights based on triggers in the system prompt
   * 4. Post enrichments back to FAISS API
   *
   * @requires LanguageModel.LanguageModel - Provide via AnthropicModelLive or mock layer
   */
  readonly enrichPlays: (
    playIds: number[]
  ) => Effect.Effect<
    { count: number },
    MusicAgentError,
    MusicAgentRequirements
  >;
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * MusicAgent service for AI-powered play enrichment
 *
 * Requires LanguageModel.LanguageModel to be provided via the R channel.
 * Use MusicAgentLive layer which composes the Anthropic model.
 */
export class MusicAgent extends Effect.Service<MusicAgent>()("MusicAgent", {
  effect: Effect.gen(function* () {
    const promptBuilder = yield* PromptBuilderService;
    const faissClient = yield* FaissClient;
    const toolkit = yield* CrateToolkit;
    const insightSession = yield* InsightSessionService;
    // LanguageModel is now required via the R channel - no internal layer creation

    // =============================================================================
    // Agent Loop Helper
    // =============================================================================

    /**
     * Aggregated token usage across API calls
     */
    type AggregatedTokenUsage = {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
    };

    /**
     * Agent state for research iteration (uses generateText)
     */
    type ResearchState<Tools extends Record<string, Tool.Any>> = {
      readonly chat: Chat.Service;
      readonly iteration: number;
      readonly response: LanguageModel.GenerateTextResponse<Tools> | null;
      readonly toolCalls: readonly ToolCallRecord[];
      readonly tokenUsage: AggregatedTokenUsage;
    };

    /**
     * Result from running the agent loop, including research metadata for eval
     */
    interface AgentLoopResult<Tools extends Record<string, Tool.Any>> {
      readonly response: LanguageModel.GenerateObjectResponse<
        Tools,
        InsightsResponseEncoded
      >;
      readonly researchMeta: {
        readonly iterationCount: number;
        readonly toolsCalled: readonly string[];
        readonly totalToolCalls: number;
        readonly researchDurationMs: number;
        readonly toolCalls: readonly ToolCallRecord[];
        readonly tokenUsage: AggregatedTokenUsage;
      };
    }

    /**
     * Run two-phase agent loop:
     * 1. Research phase: Use generateText with forced tool calls to gather data
     * 2. Output phase: Use generateObject to produce structured insights
     *
     * This split is necessary because generateObject in @effect/ai-anthropic
     * overrides toolChoice to force the schema tool, ignoring our research
     * tool requirements. By separating the phases, we can force tool usage
     * during research while still getting structured output.
     *
     * Returns both the response and research metadata for evaluation.
     *
     * @param initialPrompt - The initial prompt from CratePrompt
     * @param toolkit - The toolkit with tools and handlers
     * @param maxIterations - Maximum number of iterations (default: 10)
     */
    const runAgentLoop = <Tools extends Record<string, Tool.Any>>(
      initialPrompt: Prompt.Prompt,
      toolkit: Toolkit.WithHandler<Tools>,
      maxIterations: number = 10
    ): Effect.Effect<
      AgentLoopResult<Tools>,
      MusicAgentError,
      MusicAgentRequirements
    > =>
      Effect.gen(function* () {
        // Initialize chat with CratePrompt system prompt and user message
        const chat = yield* Chat.fromPrompt(initialPrompt);

        // Track research start time for duration calculation
        const researchStartTime = yield* Clock.currentTimeMillis;

        // =============================================================================
        // Phase 1: Research - use generateText with forced tool calls
        // =============================================================================
        yield* Effect.logDebug("Starting research phase");

        const initialTokenUsage: AggregatedTokenUsage = {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        };

        const finalState = yield* Effect.iterate(
          {
            chat,
            iteration: 0,
            response: null,
            toolCalls: [] as readonly ToolCallRecord[],
            tokenUsage: initialTokenUsage,
          } as ResearchState<Tools>,
          {
            // Continue while:
            // - First iteration (no response yet) OR
            // - There are tool calls AND we haven't hit max iterations
            while: (state) =>
              state.response === null ||
              (state.response.toolCalls.length > 0 &&
                state.iteration < maxIterations),
            body: (state) =>
              pipe(
                Effect.gen(function* () {
                  yield* Effect.logDebug(
                    `Research iteration ${state.iteration + 1}`
                  );
                  yield* Effect.annotateCurrentSpan({
                    phase: "research",
                    iteration: state.iteration + 1,
                    max_iterations: maxIterations,
                  });

                  const iterationStartTime = yield* Clock.currentTimeMillis;

                  // Use generateText with toolChoice to force tool calls
                  // On first iteration, REQUIRE a tool call
                  // On subsequent iterations, allow auto (model decides)
                  const response = yield* chat
                    .generateText({
                      prompt: [], // Empty - Chat maintains full history
                      toolkit,
                      toolChoice:
                        state.iteration === 0
                          ? {
                              mode: "required" as const,
                              oneOf: [
                                "get_recent_insights",
                                "search_plays",
                                "semantic_search",
                                "resolve_mbid",
                                "fetch_link",
                                "explore_graph",
                                "graph_connections",
                              ],
                            }
                          : "auto",
                    })
                    .pipe(
                      Effect.mapError(
                        (error) =>
                          new MusicAgentError({
                            message: `Research iteration ${state.iteration + 1} failed`,
                            cause: error,
                          })
                      )
                    );

                  const iterationEndTime = yield* Clock.currentTimeMillis;
                  const toolCallCount = response.toolCalls.length;

                  // Record tool calls for eval context with params and results
                  const newToolCalls: ToolCallRecord[] = response.toolCalls.map(
                    (tc) => {
                      // Find matching result by tool call ID
                      const result = response.toolResults.find(
                        (tr) => tr.id === tc.id
                      );

                      return {
                        iteration: state.iteration,
                        tool_name: tc.name,
                        timestamp: new Date().toISOString(),
                        duration_ms: Number(
                          iterationEndTime - iterationStartTime
                        ),
                        // Capture parameters (already available on tc.params)
                        parameters: tc.params,
                        // Summarize result
                        result_summary: result
                          ? summarizeToolResult(
                              tc.name,
                              result.result,
                              result.isFailure
                            )
                          : undefined,
                        // Extract count for search tools
                        result_count:
                          result && !result.isFailure
                            ? extractResultCount(tc.name, result.result)
                            : undefined,
                      };
                    }
                  );

                  yield* Effect.annotateCurrentSpan({
                    tool_call_count: toolCallCount,
                  });

                  if (toolCallCount > 0) {
                    const toolNames = response.toolCalls
                      .map((tc) => tc.name)
                      .join(", ");
                    yield* Effect.logDebug(`Tool calls: ${toolNames}`);
                    yield* Effect.annotateCurrentSpan("tool_calls", toolNames);
                  } else {
                    yield* Effect.logDebug(
                      `Research complete after ${state.iteration + 1} iterations`
                    );
                  }

                  // Accumulate token usage from this response
                  const usage = response.usage;
                  const updatedTokenUsage: AggregatedTokenUsage = {
                    inputTokens:
                      state.tokenUsage.inputTokens + (usage.inputTokens ?? 0),
                    outputTokens:
                      state.tokenUsage.outputTokens + (usage.outputTokens ?? 0),
                    totalTokens:
                      state.tokenUsage.totalTokens + (usage.totalTokens ?? 0),
                    cacheReadTokens:
                      state.tokenUsage.cacheReadTokens +
                      (usage.cachedInputTokens ?? 0),
                    cacheCreationTokens: state.tokenUsage.cacheCreationTokens, // Not available in standard response
                  };

                  return {
                    chat,
                    iteration: state.iteration + 1,
                    response,
                    toolCalls: [...state.toolCalls, ...newToolCalls],
                    tokenUsage: updatedTokenUsage,
                  } as ResearchState<Tools>;
                }),
                Effect.withSpan("MusicAgent.researchIteration", {
                  attributes: { iteration: state.iteration + 1 },
                })
              ),
          }
        );

        // Calculate research duration
        const researchEndTime = yield* Clock.currentTimeMillis;
        const researchDurationMs = Number(researchEndTime - researchStartTime);

        // Build research metadata for eval context
        const toolsCalled = [
          ...new Set(finalState.toolCalls.map((tc) => tc.tool_name)),
        ];
        const researchMeta = {
          iterationCount: finalState.iteration,
          toolsCalled,
          totalToolCalls: finalState.toolCalls.length,
          researchDurationMs,
          toolCalls: finalState.toolCalls,
          tokenUsage: finalState.tokenUsage,
        };

        // =============================================================================
        // Phase 2: Output - use generateObject to produce structured insights
        // =============================================================================
        yield* Effect.logDebug("Starting output phase");

        // Now that research is complete, ask the model to produce structured insights
        // based on all the tool results accumulated in chat history
        const response = yield* chat
          .generateObject({
            prompt: [
              {
                role: "user",
                content:
                  "Based on your research above, now produce your final insights. Return the insights JSON object.",
              },
            ],
            toolkit, // Include toolkit so tool results stay in context
            schema: InsightsResponseEncoded,
            objectName: "insights",
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new MusicAgentError({
                  message: "Output phase failed",
                  cause: error,
                })
            ),
            Effect.withSpan("MusicAgent.outputPhase")
          );

        const rawInsights =
          (response.value as any)?.insights &&
          Array.isArray((response.value as any).insights)
            ? (response.value as any).insights
            : [];

        // Add output phase token usage to the total
        const outputUsage = response.usage;
        const totalTokenUsage: AggregatedTokenUsage = {
          inputTokens:
            researchMeta.tokenUsage.inputTokens +
            (outputUsage.inputTokens ?? 0),
          outputTokens:
            researchMeta.tokenUsage.outputTokens +
            (outputUsage.outputTokens ?? 0),
          totalTokens:
            researchMeta.tokenUsage.totalTokens +
            (outputUsage.totalTokens ?? 0),
          cacheReadTokens:
            researchMeta.tokenUsage.cacheReadTokens +
            (outputUsage.cachedInputTokens ?? 0),
          cacheCreationTokens: researchMeta.tokenUsage.cacheCreationTokens,
        };

        // Update researchMeta with final token usage
        const finalResearchMeta = {
          ...researchMeta,
          tokenUsage: totalTokenUsage,
        };

        yield* Effect.logInfo(
          `Agent completed with ${rawInsights.length} insights`
        );
        yield* Effect.annotateCurrentSpan({
          phase: "complete",
          insight_count: rawInsights.length,
          iteration_count: finalResearchMeta.iterationCount,
          total_tool_calls: finalResearchMeta.totalToolCalls,
          research_duration_ms: finalResearchMeta.researchDurationMs,
          input_tokens: totalTokenUsage.inputTokens,
          output_tokens: totalTokenUsage.outputTokens,
          cache_read_tokens: totalTokenUsage.cacheReadTokens,
        });

        return { response, researchMeta: finalResearchMeta };
      }).pipe(Effect.withSpan("MusicAgent.runAgentLoop"));

    /**
     * Enrich multiple plays with full agent loop
     *
     * The agent loop:
     * 1. Builds prompt with context (show, time, recent insights) using CratePrompt
     * 2. Uses Chat API to manage conversation history automatically
     * 3. Runs agent loop with Effect.iterate:
     *    - Model decides to call tools (search_plays, semantic_search, resolve_mbid, etc.)
     *    - Tools are executed via handlers
     *    - Chat automatically adds tool results to history
     *    - Loop continues until no more tool calls or max iterations
     * 4. Parses insights from response (TODO: structured parsing)
     * 5. Posts enrichments to FAISS API
     */
    const enrichPlays = (playIds: number[]) =>
      pipe(
        Effect.gen(function* () {
          yield* Effect.logInfo(
            `Starting enrichment for ${playIds.length} plays`
          );
          yield* Effect.annotateCurrentSpan({
            play_count: playIds.length,
            play_ids: playIds.join(","),
          });

          // NOTE: We no longer seed with global recent insights here.
          // Instead, each play gets context-based seeding (insights from same show window)
          // This is done per-play in processPlay() below.

          // Fetch plays from FAISS API
          const batchResponse = yield* faissClient.getPlaysBatch(playIds).pipe(
            Effect.mapError(
              (error) =>
                new MusicAgentError({
                  message: "Failed to fetch plays",
                  cause: error,
                })
            ),
            Effect.withSpan("MusicAgent.fetchPlays")
          );

          // Convert FAISS API plays to KEXP format
          // FAISS API uses different field names for MBIDs (artist_mbid vs artist_ids)
          // so we need to map them properly using faissPlayToKexpPlay
          const plays = batchResponse.plays.map((p) =>
            faissPlayToKexpPlay(p as import("@crate/domain/faiss/schemas").Play)
          );
          yield* Effect.logDebug(`Fetched ${plays.length} plays from API`);

          /**
           * Process a single play and return its enrichment items
           */
          const processPlay = (play: Kexp.KexpTrackPlay) =>
            pipe(
              Effect.gen(function* () {
                yield* Effect.logInfo(
                  `Processing play: ${play.artist} - ${play.song}`
                );
                yield* Effect.annotateCurrentSpan({
                  play_id: play.id,
                  artist: play.artist ?? "Unknown",
                  song: play.song ?? "Unknown",
                });

                // Reset per-play session to avoid leaking insights between plays
                yield* insightSession.reset();

                // 1. Fetch CONTEXT insights from same show window (±3 hours)
                // This gives the agent awareness of what's been discussed on the show
                const contextInsights = yield* faissClient
                  .getInsightsForContext(play.id, 3, 15)
                  .pipe(
                    Effect.map((response) =>
                      response.insights.map((record) =>
                        insightRecordToSummary(record, {
                          artist: "show-context", // Mark as context, not current play
                          song: "show-context",
                        })
                      )
                    ),
                    // Fall back to empty if endpoint not available (needs FAISS API update)
                    Effect.catchAll((error) => {
                      return Effect.logDebug(
                        `Context insights not available for play ${play.id}: ${error.message}`
                      ).pipe(Effect.map(() => [] as InsightSummary[]));
                    }),
                    Effect.withSpan("MusicAgent.fetchContextInsights")
                  );

                if (contextInsights.length > 0) {
                  yield* insightSession.seedWithExistingInsights(
                    contextInsights
                  );
                  yield* Effect.logDebug(
                    `Pre-seeded session with ${contextInsights.length} context insights from same show window`
                  );
                  yield* Effect.annotateCurrentSpan({
                    context_insight_count: contextInsights.length,
                  });
                }

                // 2. Fetch existing insights for THIS SPECIFIC play from database
                // This allows the agent to see its previous work and decide if new insights add value
                const existingInsights = yield* faissClient
                  .getInsightsForPlay(play.id)
                  .pipe(
                    Effect.map((response) =>
                      response.insights.map((record) =>
                        insightRecordToSummary(record, {
                          artist: play.artist ?? "Unknown",
                          song: play.song ?? "Unknown",
                        })
                      )
                    ),
                    // Don't fail if we can't fetch existing insights - just proceed without them
                    Effect.catchAll((error) => {
                      return Effect.logWarning(
                        `Failed to fetch existing insights for play ${play.id}: ${error.message}`
                      ).pipe(Effect.map(() => [] as InsightSummary[]));
                    }),
                    Effect.withSpan("MusicAgent.fetchExistingInsights")
                  );

                if (existingInsights.length > 0) {
                  yield* insightSession.seedWithExistingInsights(
                    existingInsights
                  );
                  yield* Effect.logDebug(
                    `Pre-seeded session with ${existingInsights.length} existing insights for play ${play.id}`
                  );
                  yield* Effect.annotateCurrentSpan({
                    existing_insight_count: existingInsights.length,
                  });
                }

                // Build prompt with full context (show, time, recent insights)
                // The prompt includes instructions for using tools and producing insights
                // buildPromptForKexpPlay returns Prompt.Prompt object from CratePrompt
                const prompt = yield* promptBuilder
                  .buildPromptForKexpPlay(play)
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new MusicAgentError({
                          message: `Failed to build prompt for play ${play.id}`,
                          cause: error,
                        })
                    ),
                    Effect.tap((p) =>
                      Effect.gen(function* () {
                        // Extract system and user text for logging / debugging
                        const systemMessages = p.content.filter(
                          (m) => m.role === "system"
                        );
                        const userMessages = p.content.filter(
                          (m) => m.role === "user"
                        );

                        const systemText = systemMessages
                          .map((m) =>
                            typeof (m as any).content === "string"
                              ? (m as any).content
                              : ""
                          )
                          .join("\n\n");

                        const userText = userMessages
                          .map((m) => {
                            const content = (m as any).content;
                            if (Array.isArray(content)) {
                              return content
                                .filter(
                                  (part: any) =>
                                    part &&
                                    part.type === "text" &&
                                    typeof part.text === "string"
                                )
                                .map((part: any) => part.text)
                                .join("\n\n");
                            }
                            if (typeof content === "string") {
                              return content;
                            }
                            return "";
                          })
                          .join("\n\n");

                        const truncate = (value: string, max: number) =>
                          value.length > max
                            ? `${value.slice(0, max)}...[truncated]`
                            : value;

                        const systemPreview = truncate(systemText, 2000);
                        const userPreview = truncate(userText, 1000);

                        yield* Effect.annotateCurrentSpan({
                          prompt_system_preview: systemPreview,
                          prompt_user_preview: userPreview,
                        });

                        // Also log previews so they are visible in standard logs
                        yield* Effect.logDebug(
                          `Prompt system text (truncated):\n${systemPreview}`
                        );
                        yield* Effect.logDebug(
                          `Prompt user text (truncated):\n${userPreview}`
                        );
                      })
                    ),
                    Effect.withSpan("MusicAgent.buildPrompt")
                  );

                // Run agent loop with Chat API and Effect.iterate
                // Chat automatically manages conversation history including tool calls and results
                // Effect.iterate provides declarative stateful iteration
                // LanguageModel is provided externally via MusicAgentLive layer
                const { response, researchMeta } = yield* runAgentLoop(
                  prompt,
                  toolkit,
                  10
                ).pipe(
                  Effect.mapError(
                    (error) =>
                      new MusicAgentError({
                        message: `Failed to generate insights for play ${play.id}`,
                        cause: error,
                      })
                  )
                );

                // Decode from encoded schema to get typed class instances
                // generateObject uses InsightsResponseEncoded (plain struct for JSON Schema compatibility)
                // We decode with InsightsResponse to get TaggedClass instances
                const decoded = yield* Schema.decodeUnknown(InsightsResponse)(
                  response.value
                ).pipe(
                  Effect.mapError(
                    (error) =>
                      new MusicAgentError({
                        message: `Failed to decode insights for play ${play.id}`,
                        cause: error,
                      })
                  )
                );

                // Extract insights from decoded response
                const insights = decoded.insights;

                // Get session ID for eval context
                const sessionId = yield* insightSession.getSessionId();

                // Build token usage for eval context
                const tokenUsage = new TokenUsage({
                  input_tokens: researchMeta.tokenUsage.inputTokens,
                  output_tokens: researchMeta.tokenUsage.outputTokens,
                  total_tokens: researchMeta.tokenUsage.totalTokens,
                  cache_read_tokens: researchMeta.tokenUsage.cacheReadTokens,
                  cache_creation_tokens:
                    researchMeta.tokenUsage.cacheCreationTokens,
                });

                // Calculate estimated cost (using haiku pricing as default)
                const modelName = "claude-haiku-4-5";
                const estimatedCost = calculateCost(tokenUsage, modelName);

                // Build eval context from research metadata
                const evalContext: EvalContext = {
                  session_id: sessionId,
                  iteration_count: researchMeta.iterationCount,
                  tools_called: [...researchMeta.toolsCalled],
                  total_tool_calls: researchMeta.totalToolCalls,
                  research_duration_ms: researchMeta.researchDurationMs,
                  model: modelName,
                  had_existing_insights: existingInsights.length > 0,
                  existing_insight_count: existingInsights.length,
                  // Pass through full tool call records including params/results
                  tool_calls: researchMeta.toolCalls,
                  // Token usage and cost
                  token_usage: tokenUsage,
                  estimated_cost_usd: estimatedCost,
                };

                // Annotate span with insight count and types
                const insightTypes = insights.map((i) => i._tag);
                yield* Effect.annotateCurrentSpan({
                  insight_count: insights.length,
                  insight_types: insightTypes.join(","),
                });

                // Log insight types produced
                if (insights.length > 0) {
                  yield* Effect.logInfo(
                    `Produced ${insights.length} insights: ${insightTypes.join(", ")}`
                  );

                  // Add insights to session for get_recent_insights tool
                  // This enables the agent to recall previous findings and avoid duplicates
                  yield* Effect.forEach(
                    insights,
                    (insight) =>
                      insightSession.addInsight(insightToSummary(insight)),
                    { discard: true }
                  );
                  yield* Effect.logDebug(
                    `Added ${insights.length} insights to session`
                  );
                } else {
                  yield* Effect.logDebug(
                    "No insights produced (0 insights is valid)"
                  );
                }

                // Return insights with their eval context
                return { insights, evalContext };
              }),
              Effect.withSpan("MusicAgent.processPlay", {
                attributes: { play_id: play.id },
              })
            );

          // Process plays sequentially to ensure session isolation
          // Each play clears the session then seeds with its own existing insights.
          // Sequential processing prevents race conditions on the shared session state.
          // Future: use per-play scoped sessions to enable parallelization
          const playResults = yield* Effect.forEach(plays, processPlay, {
            concurrency: 1, // Sequential to maintain session isolation
          }).pipe(
            Effect.mapError(
              (error) =>
                new MusicAgentError({
                  message: "Failed to process plays",
                  cause: error,
                })
            )
          );

          // Post insights back to FAISS API per play with its own eval context
          // This preserves accurate evaluation metadata for each play.
          const postedCounts = yield* Effect.forEach(
            playResults,
            (result) =>
              result.insights.length === 0
                ? Effect.succeed(0)
                : faissClient
                    .postInsights(result.insights, result.evalContext)
                    .pipe(
                      Effect.mapError(
                        (error) =>
                          new MusicAgentError({
                            message: "Failed to post insights",
                            cause: error,
                          })
                      ),
                      Effect.withSpan("MusicAgent.postInsights")
                    )
                    .pipe(Effect.map((res) => res.count)),
            { concurrency: 1 }
          );

          const totalPosted = postedCounts.reduce((sum, count) => sum + count, 0);

          yield* Effect.logInfo(
            `Enrichment complete: ${totalPosted} insights posted from ${plays.length} plays`
          );
          yield* Effect.annotateCurrentSpan({
            insights_posted: totalPosted,
            plays_processed: plays.length,
          });

          return { count: totalPosted };
        }),
        Effect.withSpan("MusicAgent.enrichPlays")
      );

    return {
      enrichPlays,
    } satisfies MusicAgentInterface;
  }),
  // Note: LanguageModel.LanguageModel is NOT listed here because it's provided
  // at the app boundary via MusicAgentLive layer composition in layers.ts.
  // This service only lists dependencies needed for its own construction.
  dependencies: [PromptBuilderServiceFull, FaissClient.Default, CrateToolsLive],
}) {}

// =============================================================================
// Layers
// =============================================================================

/**
 * Base MusicAgent layer - provides the MusicAgent service
 *
 * This layer provides all non-LLM dependencies. The MusicAgent.enrichPlays
 * method still requires LanguageModel.LanguageModel to be provided.
 *
 * For production, combine with AnthropicModelLive:
 * ```ts
 * const program = Effect.gen(function* () {
 *   const agent = yield* MusicAgent
 *   return yield* agent.enrichPlays([1, 2, 3])
 * }).pipe(
 *   Effect.provide(MusicAgentLive),
 *   Effect.provide(AnthropicModelLive)
 * )
 * ```
 *
 * For testing, combine with a mock LanguageModel:
 * ```ts
 * const testProgram = Effect.gen(function* () {
 *   const agent = yield* MusicAgent
 *   return yield* agent.enrichPlays([1, 2, 3])
 * }).pipe(
 *   Effect.provide(MusicAgentLive),
 *   Effect.provide(MockLanguageModelLayer)
 * )
 * ```
 */
export const MusicAgentLive = MusicAgent.Default;

/**
 * Complete MusicAgent layer with Anthropic model included
 *
 * This is a fully self-contained layer for production use.
 * It provides both MusicAgent service and satisfies the LanguageModel requirement.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const agent = yield* MusicAgent
 *   return yield* agent.enrichPlays([1, 2, 3])
 * }).pipe(Effect.provide(MusicAgentWithAnthropicLive))
 * ```
 */
export const MusicAgentWithAnthropicLive = Layer.merge(
  MusicAgentLive,
  AnthropicModelLive
);
