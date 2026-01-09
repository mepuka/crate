/**
 * CriticAgent
 *
 * Reviews insights for quality, accuracy, and KEXP voice alignment.
 * Final agent in the pipeline - the culture gatekeeper.
 *
 * @module
 */

import { Context, Data, Effect, Layer } from "effect";
import { LanguageModel, Chat, Prompt } from "@effect/ai";
import { AnthropicLanguageModel } from "@effect/ai-anthropic";
import type { SessionExport } from "../../services/index.js";
import type { InsightSummary } from "../../tools/schemas.js";
import { CriticOutput, CriticReview, type ReviewIssue } from "../types.js";
import { buildCriticPrompt } from "../../prompts/templates/critic.js";

// =============================================================================
// Errors
// =============================================================================

export class CriticError extends Data.TaggedError("CriticError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Service Interface
// =============================================================================

export interface CriticAgentInterface {
  /**
   * Review insights for a single play
   * Uses LLM with heuristic fallback
   */
  readonly review: (
    playId: number,
    insights: readonly InsightSummary[],
    session: SessionExport
  ) => Effect.Effect<CriticReview, CriticError, LanguageModel.LanguageModel>;

  /**
   * Review all insights in the session
   * Uses LLM with heuristic fallback
   */
  readonly reviewAll: (
    session: SessionExport
  ) => Effect.Effect<CriticOutput, CriticError, LanguageModel.LanguageModel>;
}

// =============================================================================
// Service Tag
// =============================================================================

export class CriticAgent extends Context.Tag("CriticAgent")<
  CriticAgent,
  CriticAgentInterface
>() {}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Heuristic-based fallback review
 * Applies basic quality checks when LLM is unavailable
 *
 * Includes PlayHistory enforcement to reduce dominance of bare statistics.
 * PlayHistory insights need narrative context, not just "X plays on KEXP".
 */
const heuristicReview = (
  playId: number,
  insights: readonly InsightSummary[]
): typeof CriticReview.Type => {
  const issues: ReviewIssue[] = [];
  let score = 80;

  // =========================================================================
  // PlayHistory Quota Enforcement
  // Limit PlayHistory to ~25% of insights to encourage variety
  // =========================================================================
  const playHistoryCount = insights.filter(
    (i) => i.insight_type === "PlayHistory"
  ).length;
  const playHistoryRatio = insights.length > 0 ? playHistoryCount / insights.length : 0;

  if (playHistoryRatio > 0.25 && playHistoryCount > 1) {
    issues.push({
      severity: "warning",
      description: `PlayHistory dominates (${playHistoryCount}/${insights.length} = ${Math.round(playHistoryRatio * 100)}%). Consider more DiscoveryArc, Connection, or Concert insights.`,
    });
    score -= 10;
  }

  // =========================================================================
  // Per-Insight Quality Checks
  // =========================================================================
  for (let i = 0; i < insights.length; i++) {
    const insight = insights[i];

    // Check for empty text
    if (!insight.summary || insight.summary.length < 20) {
      issues.push({
        severity: "error",
        description: "Insight text too short or empty",
        insightIndex: i,
      });
      score -= 20;
    }

    // =========================================================================
    // PlayHistory Quality Gate
    // Bare statistics like "X plays on KEXP" are low-value.
    // Good PlayHistory tells a story: first play, comeback, anniversary, DJ love.
    // =========================================================================
    if (insight.insight_type === "PlayHistory") {
      const summaryLength = insight.summary?.length ?? 0;

      // Bare stats check: too short means no narrative context
      if (summaryLength < 100) {
        issues.push({
          severity: "error",
          description:
            "PlayHistory insight lacks narrative context. Should tell a story (first play, comeback, DJ favorite) not just stats.",
          insightIndex: i,
        });
        score -= 15;
      }

      // Check for story indicators that make PlayHistory valuable
      const storyIndicators = [
        "first",
        "debut",
        "return",
        "comeback",
        "anniversary",
        "favorite",
        "beloved",
        "journey",
        "discovered",
        "milestone",
        "decade",
        "years",
      ];
      const hasStoryElement = storyIndicators.some((word) =>
        insight.summary.toLowerCase().includes(word)
      );

      if (summaryLength >= 100 && !hasStoryElement) {
        issues.push({
          severity: "warning",
          description:
            "PlayHistory could be stronger with a story angle (first spin, comeback, anniversary).",
          insightIndex: i,
        });
        score -= 5;
      }
    }

    // Check for missing MBIDs
    if (insight.entity_mbids.length === 0) {
      issues.push({
        severity: "warning",
        description: "No entity MBIDs - insight may be hard to verify",
        insightIndex: i,
      });
      score -= 10;
    }

    // Check for marketing speak
    const marketingWords = ["amazing", "incredible", "groundbreaking", "revolutionary"];
    const hasMarketing = marketingWords.some((word) =>
      insight.summary.toLowerCase().includes(word)
    );
    if (hasMarketing) {
      issues.push({
        severity: "warning",
        description: "Contains marketing speak - revise for KEXP earnest voice",
        insightIndex: i,
      });
      score -= 5;
    }
  }

  const approved = score >= 70 && !issues.some((i) => i.severity === "error");

  return {
    playId,
    approved,
    qualityScore: Math.max(0, Math.min(100, score)),
    issues,
    revisionSuggestions: issues
      .filter((i) => i.severity !== "suggestion")
      .map((i) => i.description),
  };
};

const makeCriticAgent = Effect.gen(function* () {
  const systemPrompt = buildCriticPrompt();

  const review = (
    playId: number,
    insights: readonly InsightSummary[],
    session: SessionExport
  ): Effect.Effect<typeof CriticReview.Type, CriticError, LanguageModel.LanguageModel> =>
    Effect.gen(function* () {
      yield* Effect.log(
        `CriticAgent: Reviewing ${insights.length} insights for play ${playId}`
      );

      // Gather evidence for fact-checking
      const toolCallEvidence = session.toolCalls
        .map((tc: { toolName: string; resultSummary: string }) => `${tc.toolName}: ${tc.resultSummary}`)
        .join("\n");

      const entityFacts = session.entities
        .map((e: { name: string; facts: readonly string[] }) => `${e.name}: ${e.facts.join("; ")}`)
        .join("\n");

      const userMessage = `Review these ${insights.length} insights for play ${playId}:

## Insights to Review
${insights
  .map(
    (insight, i) => `[${i}] Type: ${insight.insight_type}
Text: ${insight.summary}
Entity MBIDs: ${insight.entity_mbids.join(", ")}`
  )
  .join("\n\n")}

## Evidence Available
${toolCallEvidence || "No tool call evidence"}

## Known Facts
${entityFacts || "No entity facts"}

Apply the KEXP Culture Checklist. Score each insight and flag any issues.

Output as JSON with:
- playId: number
- approved: boolean
- qualityScore: number (0-100)
- issues: array of { severity, description, insightIndex }
- revisionSuggestions: array of strings`;

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

      // Try LLM-based review, fall back to heuristic on error
      // Temperature 0.25: Lowest for consistent, reliable quality assessment
      const result = yield* Effect.gen(function* () {
        const chat = yield* Chat.fromPrompt(prompt);
        const response = yield* chat.generateObject({
          prompt: [],
          schema: CriticReview,
          objectName: "critic_review",
        }).pipe(
          AnthropicLanguageModel.withConfigOverride({ temperature: 0.25 })
        );

        // Log token usage for cost attribution
        const usage = response.usage;
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        yield* Effect.log(
          `CriticAgent: Token usage - input: ${inputTokens}, output: ${outputTokens}, ` +
          `cache_read: ${usage.cachedInputTokens ?? 0}, total: ${inputTokens + outputTokens}`
        );

        return response.value;
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(
              `CriticAgent: LLM failed, using heuristic fallback: ${String(error)}`
            );
            return heuristicReview(playId, insights);
          })
        )
      );

      yield* Effect.log(
        `CriticAgent: Score ${result.qualityScore}, ${result.approved ? "approved" : "needs revision"}`
      );

      return result;
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CriticError({
            message: `Failed to review insights for play ${playId}`,
            cause,
          })
      )
    );

  const reviewAll = (
    session: SessionExport
  ): Effect.Effect<typeof CriticOutput.Type, CriticError, LanguageModel.LanguageModel> =>
    Effect.gen(function* () {
      yield* Effect.log(
        `CriticAgent: Reviewing all ${session.insights.length} insights`
      );

      // Group insights by play
      const insightsByPlay = new Map<number, InsightSummary[]>();
      for (const insight of session.insights) {
        const existing = insightsByPlay.get(insight.play_id) || [];
        existing.push(insight);
        insightsByPlay.set(insight.play_id, existing);
      }

      // Review each play's insights
      const reviews: Array<typeof CriticReview.Type> = [];
      for (const [playId, insights] of insightsByPlay) {
        const reviewResult = yield* review(playId, insights, session);
        reviews.push(reviewResult);
      }

      const approvedCount = reviews.filter((r) => r.approved).length;
      const rejectedCount = reviews.filter((r) => !r.approved).length;
      const averageScore =
        reviews.length > 0
          ? reviews.reduce((sum, r) => sum + r.qualityScore, 0) / reviews.length
          : 0;

      yield* Effect.log(
        `CriticAgent: ${approvedCount} approved, ${rejectedCount} rejected, avg score ${averageScore.toFixed(1)}`
      );

      return {
        reviews,
        approvedCount,
        rejectedCount,
        averageScore,
      };
    });

  return { review, reviewAll } satisfies CriticAgentInterface;
});

// =============================================================================
// Layers
// =============================================================================

export const CriticAgentLive: Layer.Layer<CriticAgent> = Layer.effect(
  CriticAgent,
  makeCriticAgent
);

export const CriticAgentTest: Layer.Layer<CriticAgent> = Layer.succeed(
  CriticAgent,
  {
    review: (playId, _insights, _session) =>
      Effect.succeed({
        playId,
        approved: true,
        qualityScore: 80,
        issues: [],
        revisionSuggestions: [],
      }),
    reviewAll: (_session) =>
      Effect.succeed({
        reviews: [],
        approvedCount: 0,
        rejectedCount: 0,
        averageScore: 80,
      }),
  }
);
