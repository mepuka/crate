/**
 * Music Agent Service
 *
 * AI agent for enriching KEXP plays with insights using Effect AI.
 * Uses Anthropic Claude with tools for research and analysis.
 *
 * @module
 */

import { Effect, Layer, Data, Schema } from "effect";
import { LanguageModel, Chat, Prompt, Tool, Toolkit } from "@effect/ai";
import { AnthropicLanguageModel, AnthropicClient } from "@effect/ai-anthropic";
import { NodeHttpClient } from "@effect/platform-node";
import type * as Kexp from "@crate/domain/kexp/schemas";
import { EnrichmentRequest, EnrichmentItem } from "@crate/domain/faiss/schemas";
import { FaissClient } from "./FaissClient.js";
import {
  PromptBuilderService,
  PromptBuilderServiceFull,
} from "./services/index.js";
import { CrateToolkit } from "./tools/definitions.js";
import { CrateToolsLive } from "./layers.js";
import { AnthropicConfig } from "./config.js";
import { InsightArray, Insight } from "./prompts/insights.js";

/**
 * Wrapper schema for generateObject - wraps InsightArray in a struct
 * to satisfy Record<string, unknown> constraint
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
// Service Interface
// =============================================================================

export interface MusicAgentInterface {
  /**
   * Enrich multiple plays with AI-generated insights
   *
   * The agent will:
   * 1. Build prompts with full context (show, time, recent insights)
   * 2. Use tools to research (search_plays, semantic_search, resolve_mbid, fetch_link, get_recent_insights)
   * 3. Generate insights based on triggers in the system prompt
   * 4. Post enrichments back to FAISS API
   */
  readonly enrichPlays: (
    playIds: number[]
  ) => Effect.Effect<{ count: number }, MusicAgentError>;
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * MusicAgent service for AI-powered play enrichment
 */
export class MusicAgent extends Effect.Service<MusicAgent>()("MusicAgent", {
  effect: Effect.gen(function* () {
    const promptBuilder = yield* PromptBuilderService;
    const faissClient = yield* FaissClient;
    const toolkit = yield* CrateToolkit;
    const anthropicConfig = yield* AnthropicConfig;

    // Create fully provided layers for the agent loop
    // These will be used when calling LanguageModel.generateText
    const anthropicClientLayer = AnthropicClient.layer({
      apiKey: anthropicConfig.apiKey,
    }).pipe(Layer.provide(NodeHttpClient.layerUndici));

    const model = AnthropicLanguageModel.model("claude-sonnet-4-5");
    const modelLayer = model.pipe(Layer.provide(anthropicClientLayer));

    // Combined layer with model + toolkit handlers
    // This ensures the agent loop can use tools properly
    const agentLayer = Layer.mergeAll(modelLayer, CrateToolsLive);

    // =============================================================================
    // Agent Loop Helper
    // =============================================================================

    /**
     * Agent state for iteration
     */
    type AgentState<Tools extends Record<string, Tool.Any>> = {
      readonly chat: Chat.Service;
      readonly iteration: number;
      readonly response: LanguageModel.GenerateObjectResponse<
        Tools,
        InsightsResponse
      > | null;
    };

    /**
     * Run agent loop with Chat API for automatic history management
     *
     * Uses Effect.iterate for declarative stateful iteration and Chat API
     * to automatically manage conversation history including tool calls and results.
     * Uses generateObject to get structured InsightArray output.
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
      LanguageModel.GenerateObjectResponse<Tools, InsightsResponse>,
      MusicAgentError,
      // Note: Chat.Service is NOT required - Chat.fromPrompt returns a self-contained
      // Service value. Only LanguageModel and toolkit context are needed.
      | LanguageModel.LanguageModel
      | LanguageModel.ExtractContext<{ toolkit: Toolkit.WithHandler<Tools> }>
    > =>
      Effect.gen(function* () {
        // Initialize chat with CratePrompt system prompt and user message
        const chat = yield* Chat.fromPrompt(initialPrompt);

        return yield* Effect.iterate(
          {
            chat,
            iteration: 0,
            response: null,
          } as AgentState<Tools>,
          {
            while: (state) =>
              state.response === null ||
              (state.response.toolCalls.length > 0 &&
                state.iteration < maxIterations),
            body: (state) =>
              Effect.gen(function* () {
                yield* Effect.log(
                  `Agent iteration ${state.iteration + 1}/${maxIterations}`
                );

                // Chat maintains history automatically, so we pass empty prompt
                // Tool results from previous iteration are already in chat history
                // Use generateObject to get structured insights output
                // Wrap array in struct to satisfy Record<string, unknown> constraint
                const response = yield* state.chat
                  .generateObject({
                    prompt: [], // Empty - Chat maintains full history automatically
                    toolkit,
                    schema: InsightsResponse,
                    objectName: "insights",
                  })
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new MusicAgentError({
                          message: `Agent iteration ${state.iteration + 1} failed`,
                          cause: error,
                        })
                    )
                  );

                // If no tool calls, we're done
                if (response.toolCalls.length === 0) {
                  yield* Effect.log(
                    `Agent completed after ${state.iteration + 1} iterations`
                  );
                }

                // Chat automatically added tool results to history via Prompt.fromResponseParts
                // No manual prompt merging needed!

                return {
                  chat: state.chat,
                  iteration: state.iteration + 1,
                  response,
                } as AgentState<Tools>;
              }),
          }
        ).pipe(
          Effect.map((finalState) => {
            if (finalState.response === null) {
              throw new MusicAgentError({
                message: "Agent loop completed without response",
              });
            }
            return finalState.response;
          })
        );
      });

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
      Effect.gen(function* () {
        yield* Effect.log(`Starting enrichment for ${playIds.length} plays`);

        // Fetch plays from FAISS API
        const batchResponse = yield* faissClient.getPlaysBatch(playIds).pipe(
          Effect.mapError(
            (error) =>
              new MusicAgentError({
                message: "Failed to fetch plays",
                cause: error,
              })
          )
        );

        const plays = batchResponse.plays as unknown as Kexp.KexpTrackPlay[];
        yield* Effect.log(`Fetched ${plays.length} plays`);

        /**
         * Process a single play and return its enrichment items
         */
        const processPlay = (play: Kexp.KexpTrackPlay) =>
          Effect.gen(function* () {
            yield* Effect.log(
              `Processing play ${play.id}: ${play.artist} - ${play.song}`
            );

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
                )
              );

            // Run agent loop with Chat API and Effect.iterate
            // Chat automatically manages conversation history including tool calls and results
            // Effect.iterate provides declarative stateful iteration
            const response = yield* runAgentLoop(prompt, toolkit, 10).pipe(
              Effect.provide(agentLayer),
              Effect.mapError(
                (error) =>
                  new MusicAgentError({
                    message: `Failed to generate insights for play ${play.id}`,
                    cause: error,
                  })
              )
            );

            // Extract insights from structured output
            // generateObject already validates against the schema, so response.value is typed correctly
            const insights = response.value.insights;

            yield* Effect.log(
              `Agent completed for play ${play.id}. Produced ${insights.length} insights`
            );

            // Log insight types produced
            if (insights.length > 0) {
              const insightTypes = insights.map((i) => i._tag).join(", ");
              yield* Effect.log(
                `Insights for play ${play.id}: ${insightTypes}`
              );
            } else {
              yield* Effect.log(
                `No insights produced for play ${play.id} (0 insights is valid)`
              );
            }

            // Create enrichment items from insights
            // Each insight becomes a separate enrichment item
            // Encode insights to plain JSON objects for API compatibility
            const enrichmentItems = yield* Effect.all(
              insights.map((insight) =>
                Schema.encode(Insight)(insight).pipe(
                  Effect.mapError(
                    (error) =>
                      new MusicAgentError({
                        message: `Failed to encode insight for play ${play.id}`,
                        cause: error,
                      })
                  ),
                  Effect.map(
                    (encodedInsight) =>
                      ({
                        play_id: play.id,
                        data: encodedInsight as any, // Schema.Unknown accepts any JSON object
                      }) as EnrichmentItem
                  )
                )
              ),
              { concurrency: "unbounded" }
            );

            return enrichmentItems;
          });

        // Process all plays concurrently with a concurrency limit
        // This prevents overwhelming the system while still getting parallelization benefits
        const enrichmentArrays = yield* Effect.forEach(plays, processPlay, {
          concurrency: 5, // Process 5 plays at a time
        }).pipe(
          Effect.mapError(
            (error) =>
              new MusicAgentError({
                message: "Failed to process plays",
                cause: error,
              })
          )
        );

        // Flatten the array of arrays into a single array
        const enrichments = enrichmentArrays.flat();

        // Post enrichments back to FAISS API
        // If no enrichments were produced, skip posting
        if (enrichments.length === 0) {
          yield* Effect.log(`No enrichments to post for ${plays.length} plays`);
          return { count: 0 };
        }

        const enrichmentRequest: EnrichmentRequest = {
          enrichment_type: "insights",
          enrichments,
        };

        const enrichmentResponse = yield* faissClient
          .postEnrichments(enrichmentRequest)
          .pipe(
            Effect.mapError(
              (error) =>
                new MusicAgentError({
                  message: "Failed to post enrichments",
                  cause: error,
                })
            )
          );

        yield* Effect.log(
          `Enrichment complete: ${enrichmentResponse.count} insight enrichments posted (from ${plays.length} plays)`
        );

        return { count: enrichmentResponse.count };
      });

    return {
      enrichPlays: enrichPlays as MusicAgentInterface["enrichPlays"],
    } satisfies MusicAgentInterface;
  }),
  dependencies: [
    PromptBuilderServiceFull,
    FaissClient.Default,
    CrateToolsLive,
    AnthropicConfig.Default,
    NodeHttpClient.layerUndici,
  ],
}) {}

// =============================================================================
// Layers
// =============================================================================

/**
 * Complete MusicAgent layer with all dependencies
 */
export const MusicAgentLive = MusicAgent.Default;
