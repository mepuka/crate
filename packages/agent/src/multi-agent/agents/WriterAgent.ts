/**
 * WriterAgent
 *
 * Transforms research findings into compelling narratives in KEXP voice.
 * Fourth agent in the pipeline - the primary voice owner.
 *
 * @module
 */

import { Context, Data, Effect, Layer, Schema } from "effect";
import { LanguageModel, Chat, Prompt } from "@effect/ai";
import { AnthropicLanguageModel } from "@effect/ai-anthropic";
import type { SessionExport } from "../../services/index.js";
import type { InsightSummary } from "../../tools/schemas.js";
import { buildWriterPrompt } from "../../prompts/templates/writer.js";

// Schema for WriterAgent output (for generateObject)
const WriterOutputSchema = Schema.Struct({
  playId: Schema.Number,
  insights: Schema.Array(Schema.Struct({
    id: Schema.String,
    play_id: Schema.Number,
    artist: Schema.String,
    track: Schema.String,
    insight_type: Schema.String,
    summary: Schema.String,
    entity_mbids: Schema.Array(Schema.String),
  })),
  narrative: Schema.String,
});

// =============================================================================
// Errors
// =============================================================================

export class WriterError extends Data.TaggedError("WriterError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Writer Output
// =============================================================================

export interface WriterOutput {
  readonly playId: number;
  readonly insights: readonly InsightSummary[];
  readonly narrative: string;
}

// =============================================================================
// Service Interface
// =============================================================================

export interface WriterAgentInterface {
  /**
   * Write insights based on accumulated research
   * Uses LLM with placeholder fallback
   */
  readonly write: (
    playId: number,
    session: SessionExport
  ) => Effect.Effect<WriterOutput, WriterError, LanguageModel.LanguageModel>;

  /**
   * Write insights for multiple plays
   * Uses LLM with placeholder fallback
   */
  readonly writeBatch: (
    playIds: readonly number[],
    session: SessionExport
  ) => Effect.Effect<readonly WriterOutput[], WriterError, LanguageModel.LanguageModel>;
}

// =============================================================================
// Service Tag
// =============================================================================

export class WriterAgent extends Context.Tag("WriterAgent")<
  WriterAgent,
  WriterAgentInterface
>() {}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Placeholder fallback for WriterAgent
 * Returns empty insights when LLM is unavailable
 */
const placeholderWrite = (playId: number): WriterOutput => ({
  playId,
  insights: [],
  narrative: "Placeholder narrative - WriterAgent LLM unavailable",
});

const makeWriterAgent = Effect.gen(function* () {
  const systemPrompt = buildWriterPrompt();

  const write = (
    playId: number,
    session: SessionExport
  ): Effect.Effect<WriterOutput, WriterError, LanguageModel.LanguageModel> =>
    Effect.gen(function* () {
      yield* Effect.log(`WriterAgent: Crafting narrative for play ${playId}`);

      // Gather context from session
      type EntityFact = { mbid: string; name: string; type: string; facts: readonly string[] };
      type ResearchStep = { entityMbids: readonly string[]; findings: readonly string[] };
      type ToolCall = { toolName: string; resultSummary: string };

      const relevantEntities = session.entities.filter((e: EntityFact) =>
        session.researchSteps.some((s: ResearchStep) => s.entityMbids.includes(e.mbid))
      );

      const researchFindings = session.researchSteps
        .flatMap((s: ResearchStep) => s.findings)
        .join("\n- ");

      const toolCallSummary = session.toolCalls
        .map((tc: ToolCall) => `${tc.toolName}: ${tc.resultSummary}`)
        .join("\n");

      const userMessage = `Write insights for play ${playId}.

## Research Findings
- ${researchFindings || "No specific findings yet"}

## Discovered Entities
${
  relevantEntities.length > 0
    ? relevantEntities
        .map((e: EntityFact) => `${e.name} (${e.type}): ${e.facts.join("; ")}`)
        .join("\n")
    : "No entities discovered yet"
}

## Tool Call Evidence
${toolCallSummary || "No tool calls made yet"}

Craft compelling InsightSummary objects that tell the story.
Match the KEXP DJ voice - earnest, specific, narrative-driven.

Output as JSON with:
- playId: number
- insights: array of { id, play_id, artist, track, insight_type, summary, entity_mbids[] }
- narrative: string (the storytelling summary)`;

      // Build prompt for LLM
      // System prompt is static and cached by Anthropic for 5 minutes
      const prompt = Prompt.make([
        {
          role: "system",
          content: systemPrompt,
          options: {
            anthropic: {
              cacheControl: { type: "ephemeral" },
            },
          },
        },
        { role: "user", content: userMessage },
      ]);

      // Try LLM-based writing, fall back to placeholder on error
      // Temperature 0.75: Highest for creative narrative voice and storytelling
      const result = yield* Effect.gen(function* () {
        const chat = yield* Chat.fromPrompt(prompt);
        const response = yield* chat.generateObject({
          prompt: [],
          schema: WriterOutputSchema,
          objectName: "writer_output",
        }).pipe(
          AnthropicLanguageModel.withConfigOverride({ temperature: 0.75 })
        );

        // Log token usage for cost attribution
        const usage = response.usage;
        yield* Effect.log(
          `WriterAgent: Token usage - input: ${usage.inputTokens}, output: ${usage.outputTokens}, ` +
          `cache_read: ${usage.cachedInputTokens ?? 0}, total: ${usage.inputTokens + usage.outputTokens}`
        );

        return response.value as WriterOutput;
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(
              `WriterAgent: LLM failed, using placeholder: ${String(error)}`
            );
            return placeholderWrite(playId);
          })
        )
      );

      yield* Effect.log(
        `WriterAgent: Generated ${result.insights.length} insights for play ${playId}`
      );

      return result;
    }).pipe(
      Effect.mapError(
        (cause) =>
          new WriterError({
            message: `Failed to write insights for play ${playId}`,
            cause,
          })
      )
    );

  const writeBatch = (
    playIds: readonly number[],
    session: SessionExport
  ): Effect.Effect<readonly WriterOutput[], WriterError, LanguageModel.LanguageModel> =>
    Effect.gen(function* () {
      yield* Effect.log(
        `WriterAgent: Writing for ${playIds.length} plays in batch`
      );

      // Process sequentially for now (could parallelize with concurrency limit)
      const results: WriterOutput[] = [];
      for (const playId of playIds) {
        const result = yield* write(playId, session);
        results.push(result);
      }

      return results;
    });

  return { write, writeBatch } satisfies WriterAgentInterface;
});

// =============================================================================
// Layers
// =============================================================================

export const WriterAgentLive: Layer.Layer<WriterAgent> = Layer.effect(
  WriterAgent,
  makeWriterAgent
);

export const WriterAgentTest: Layer.Layer<WriterAgent> = Layer.succeed(
  WriterAgent,
  {
    write: (playId, _session) =>
      Effect.succeed({
        playId,
        insights: [],
        narrative: "Test narrative",
      }),
    writeBatch: (playIds, _session) =>
      Effect.succeed(
        playIds.map((playId) => ({
          playId,
          insights: [],
          narrative: "Test narrative",
        }))
      ),
  }
);
