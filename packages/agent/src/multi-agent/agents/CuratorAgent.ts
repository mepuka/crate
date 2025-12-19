/**
 * CuratorAgent
 *
 * Prioritizes plays for research based on KEXP culture values.
 * First agent in the pipeline - decides what's worth digging into.
 *
 * @module
 */

import { Context, Data, Effect, Layer } from "effect";
import { LanguageModel, Chat, Prompt } from "@effect/ai";
import { AnthropicLanguageModel } from "@effect/ai-anthropic";
import type { SessionExport } from "../../services/index.js";
import { CuratorOutput, type CuratorPrioritization } from "../types.js";
import { buildCuratorPrompt } from "../../prompts/templates/curator.js";

// =============================================================================
// Errors
// =============================================================================

export class CuratorError extends Data.TaggedError("CuratorError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Play Context for Curator
// =============================================================================

export interface PlayForCuration {
  readonly playId: number;
  readonly artist: string;
  readonly track: string;
  readonly album?: string;
  readonly isLocal: boolean;
  readonly comment?: string;
  readonly artistMbids: readonly string[];
  readonly rotationStatus?: string;
  readonly airdate: string;
}

// =============================================================================
// Service Interface
// =============================================================================

export interface CuratorAgentInterface {
  /**
   * Analyze a batch of plays and prioritize them for research
   * Uses LLM with heuristic fallback
   */
  readonly prioritize: (
    plays: readonly PlayForCuration[],
    session: SessionExport
  ) => Effect.Effect<CuratorOutput, CuratorError, LanguageModel.LanguageModel>;
}

// =============================================================================
// Service Tag
// =============================================================================

export class CuratorAgent extends Context.Tag("CuratorAgent")<
  CuratorAgent,
  CuratorAgentInterface
>() {}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Heuristic-based fallback prioritization
 * Used when LLM is unavailable or for testing
 *
 * KEXP CULTURE: Local artists are ALWAYS worth researching.
 * When a Seattle/PNW artist is played, we should explore their
 * scene connections, label mates, and discover their story even
 * if there's no DJ comment to guide us.
 */
const heuristicPrioritize = (
  plays: readonly PlayForCuration[]
): CuratorOutput => {
  const prioritizations: CuratorPrioritization[] = plays.map((play) => {
    let score = 50;
    const findings: string[] = [];

    // KEXP culture: Local artists deserve exploration
    if (play.isLocal) {
      score += 30;  // Increased from 20 - local is always interesting
      findings.push("is_local=true");

      // Local WITHOUT comment is especially interesting - undiscovered story
      if (!play.comment || play.comment.length < 20) {
        score += 15;
        findings.push("local_needs_discovery");
      }
    }
    if (play.comment && play.comment.length > 50) {
      score += 15;
      findings.push("rich_comment");
    }
    if (play.artistMbids.length > 0) {
      score += 10;
      findings.push("has_mbids");
    }
    if (play.rotationStatus === "heavy") {
      score += 5;
      findings.push("heavy_rotation");
    }

    // Threshold for skip is lower - we want to research more, not less
    // The Critic agent will filter out low-quality results
    let priority: "high" | "medium" | "low" | "skip";
    if (score >= 80) priority = "high";
    else if (score >= 60) priority = "medium";
    else if (score >= 30) priority = "low";  // Lowered from 40
    else priority = "skip";

    const intents: Array<{
      type: "lineage" | "collaboration" | "covers" | "geographic" | "label" | "creator" | "surprise";
      seedMbid: string;
      description?: string;
    }> = [];
    if (play.artistMbids.length > 0) {
      intents.push({
        type: "collaboration",
        seedMbid: play.artistMbids[0],
        description: `Explore collaborations for ${play.artist}`,
      });
    }
    if (play.isLocal && play.artistMbids.length > 0) {
      intents.push({
        type: "geographic",
        seedMbid: play.artistMbids[0],
        description: `Find Seattle/PNW scene connections`,
      });
    }

    return {
      playId: play.playId,
      priority,
      suggestedIntents: intents,
      estimatedValue: Math.min(100, score),
      rationale: `Heuristic: ${findings.join(", ") || "baseline"}`,
    };
  });

  return {
    prioritizations,
    totalPlays: plays.length,
    highPriorityCount: prioritizations.filter((p) => p.priority === "high").length,
    skipCount: prioritizations.filter((p) => p.priority === "skip").length,
  };
};

const makeCuratorAgent = Effect.gen(function* () {
  const systemPrompt = buildCuratorPrompt();

  const prioritize = (
    plays: readonly PlayForCuration[],
    _session: SessionExport
  ): Effect.Effect<CuratorOutput, CuratorError, LanguageModel.LanguageModel> =>
    Effect.gen(function* () {
      yield* Effect.log(`CuratorAgent: Analyzing ${plays.length} plays`);

      // Build user message with play data
      const playDescriptions = plays
        .map(
          (p) =>
            `Play ${p.playId}: "${p.track}" by ${p.artist}
  - Local: ${p.isLocal}
  - Comment: ${p.comment || "(none)"}
  - Artist MBIDs: ${p.artistMbids.join(", ") || "(none)"}
  - Rotation: ${p.rotationStatus || "unknown"}`
        )
        .join("\n\n");

      const userMessage = `Analyze these ${plays.length} plays and prioritize them for research:

${playDescriptions}

Output your prioritization decisions as a JSON object with:
- prioritizations: array of { playId, priority, suggestedIntents, estimatedValue, rationale }
- totalPlays: number
- highPriorityCount: number
- skipCount: number`;

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

      // Try LLM-based prioritization, fall back to heuristic on error
      // Temperature 0.35: Low for consistent, analytical prioritization decisions
      const result = yield* Effect.gen(function* () {
        const chat = yield* Chat.fromPrompt(prompt);
        const response = yield* chat.generateObject({
          prompt: [],
          schema: CuratorOutput,
          objectName: "curator_output",
        }).pipe(
          AnthropicLanguageModel.withConfigOverride({ temperature: 0.35 })
        );
        return response.value;
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(
              `CuratorAgent: LLM failed, using heuristic fallback: ${String(error)}`
            );
            return heuristicPrioritize(plays);
          })
        )
      );

      yield* Effect.log(
        `CuratorAgent: ${result.highPriorityCount} high priority, ${result.skipCount} skipped`
      );

      return result;
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CuratorError({
            message: "Failed to prioritize plays",
            cause,
          })
      )
    );

  return { prioritize } satisfies CuratorAgentInterface;
});

// =============================================================================
// Layers
// =============================================================================

export const CuratorAgentLive: Layer.Layer<CuratorAgent> = Layer.effect(
  CuratorAgent,
  makeCuratorAgent
);

export const CuratorAgentTest: Layer.Layer<CuratorAgent> = Layer.succeed(
  CuratorAgent,
  {
    prioritize: (plays, _session) =>
      Effect.succeed({
        prioritizations: plays.map((p) => ({
          playId: p.playId,
          priority: "medium" as const,
          suggestedIntents: [],
          estimatedValue: 50,
          rationale: "Test prioritization",
        })),
        totalPlays: plays.length,
        highPriorityCount: 0,
        skipCount: 0,
      }),
  }
);
