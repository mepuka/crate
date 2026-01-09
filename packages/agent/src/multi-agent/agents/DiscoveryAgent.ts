/**
 * DiscoveryAgent
 *
 * Explores the music graph to surface interesting patterns and connections.
 * Second agent in the pipeline - finds what's worth researching deeper.
 *
 * Uses GraphConnectionsService to make actual graph queries based on
 * the curator's suggested intents, then synthesizes discoveries with LLM.
 *
 * @module
 */

import { Context, Data, Effect, Layer } from "effect";
import { LanguageModel, Chat, Prompt } from "@effect/ai";
import { AnthropicLanguageModel } from "@effect/ai-anthropic";
import type { SessionExport } from "../../services/index.js";
import { GraphConnectionsService } from "../../services/index.js";
import {
  type CuratorPrioritization,
  DiscoveryOutput,
  type Discovery,
  type DiscoveryIntentType,
} from "../types.js";
import { buildDiscoveryPrompt } from "../../prompts/templates/discovery.js";

// =============================================================================
// Intent to Query Mapping
// =============================================================================

/**
 * Map discovery intent types to graph query types
 */
const intentToQueries: Record<DiscoveryIntentType, string[]> = {
  lineage: ["member_of", "band_members"],
  collaboration: ["collaborators", "collaborators_direct"],
  covers: ["covers"],
  geographic: ["artist_origin", "artists_from_area"],
  label: ["labelmates", "label_hierarchy"],
  creator: ["works_by_creator", "work_credits"],
  surprise: ["collaborators", "covers", "labelmates"], // Multi-path exploration
};

// =============================================================================
// Errors
// =============================================================================

export class DiscoveryError extends Data.TaggedError("DiscoveryError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Service Interface
// =============================================================================

export interface DiscoveryAgentInterface {
  /**
   * Explore patterns and connections for prioritized plays
   * Makes actual graph queries, then uses LLM to synthesize discoveries
   */
  readonly discover: (
    prioritizations: readonly CuratorPrioritization[],
    session: SessionExport
  ) => Effect.Effect<DiscoveryOutput, DiscoveryError, LanguageModel.LanguageModel>;
}

/**
 * Graph query result for a single intent
 */
interface IntentQueryResult {
  readonly intentType: DiscoveryIntentType;
  readonly seedMbid: string;
  readonly queryType: string;
  readonly connections: readonly {
    readonly mbid: string;
    readonly name: string;
    readonly type?: string;
    readonly relationship_type?: string;
  }[];
}

// =============================================================================
// Service Tag
// =============================================================================

export class DiscoveryAgent extends Context.Tag("DiscoveryAgent")<
  DiscoveryAgent,
  DiscoveryAgentInterface
>() {}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Graph-enhanced fallback discovery
 * Creates discoveries from actual graph query results when LLM fails
 */
const graphEnhancedDiscover = (
  prioritizations: readonly CuratorPrioritization[],
  graphResults: readonly IntentQueryResult[]
): DiscoveryOutput => {
  const toExplore = prioritizations.filter(
    (p) => p.priority === "high" || p.priority === "medium"
  );

  // Group graph results by seed MBID for easy lookup
  const resultsByMbid = new Map<string, IntentQueryResult[]>();
  for (const result of graphResults) {
    const existing = resultsByMbid.get(result.seedMbid) || [];
    existing.push(result);
    resultsByMbid.set(result.seedMbid, existing);
  }

  const results = toExplore.map((p) => {
    const discoveries: Discovery[] = [];

    for (const intent of p.suggestedIntents) {
      const graphData = resultsByMbid.get(intent.seedMbid) || [];

      if (graphData.length > 0) {
        // Create discoveries from actual graph connections
        for (const queryResult of graphData) {
          if (queryResult.connections.length > 0) {
            const topConnections = queryResult.connections.slice(0, 5);
            discoveries.push({
              type: queryResult.intentType,
              description: `Found ${queryResult.connections.length} ${queryResult.queryType} connections`,
              relatedMbids: topConnections.map((c) => c.mbid),
              interestScore: Math.min(100, 50 + queryResult.connections.length * 5),
              evidence: `Graph query ${queryResult.queryType}: ${topConnections.map((c) => c.name).join(", ")}`,
            });
          }
        }
      } else {
        // No graph data - use curator suggestion
        discoveries.push({
          type: intent.type,
          description: intent.description || `${intent.type} exploration for play`,
          relatedMbids: [intent.seedMbid],
          interestScore: Math.floor(p.estimatedValue * 0.6),
          evidence: "Suggested by Curator (no graph data available)",
        });
      }
    }

    return {
      playId: p.playId,
      discoveries,
      suggestedResearchPaths: discoveries.map((d) => `Deep dive: ${d.description}`),
    };
  });

  return {
    results,
    totalDiscoveries: results.reduce((sum, r) => sum + r.discoveries.length, 0),
  };
};

const makeDiscoveryAgent = Effect.gen(function* () {
  const graphService = yield* GraphConnectionsService;
  const systemPrompt = buildDiscoveryPrompt();

  /**
   * Execute graph queries for a single intent
   */
  const queryForIntent = (
    intent: { type: DiscoveryIntentType; seedMbid: string }
  ): Effect.Effect<IntentQueryResult[], never, never> =>
    Effect.gen(function* () {
      const queryTypes = intentToQueries[intent.type];
      const results: IntentQueryResult[] = [];

      for (const queryType of queryTypes) {
        const response = yield* graphService
          .connections({
            query_type: queryType as Parameters<typeof graphService.connections>[0]["query_type"],
            mbids: [intent.seedMbid],
            limit: 20,
          })
          .pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning(
                  `DiscoveryAgent: Graph query ${queryType} failed: ${String(error)}`
                );
                return { query_type: queryType, connections: [], total: 0 };
              })
            )
          );

        if (response.connections.length > 0) {
          results.push({
            intentType: intent.type,
            seedMbid: intent.seedMbid,
            queryType,
            connections: response.connections.map((c) => ({
              mbid: c.mbid,
              name: c.name,
              type: c.node_type,
              relationship_type: c.relationship_type,
            })),
          });
        }
      }

      return results;
    });

  const discover = (
    prioritizations: readonly CuratorPrioritization[],
    session: SessionExport
  ): Effect.Effect<DiscoveryOutput, DiscoveryError, LanguageModel.LanguageModel> =>
    Effect.gen(function* () {
      const toExplore = prioritizations.filter(
        (p) => p.priority === "high" || p.priority === "medium"
      );

      yield* Effect.log(
        `DiscoveryAgent: Exploring ${toExplore.length} prioritized plays`
      );

      // Collect all intents from prioritizations
      const allIntents = toExplore.flatMap((p) =>
        p.suggestedIntents.map((i) => ({
          playId: p.playId,
          type: i.type as DiscoveryIntentType,
          seedMbid: i.seedMbid,
          description: i.description,
        }))
      );

      // Execute graph queries for all intents
      yield* Effect.log(
        `DiscoveryAgent: Querying graph for ${allIntents.length} intents`
      );

      const graphResults: IntentQueryResult[] = [];
      for (const intent of allIntents) {
        const results = yield* queryForIntent(intent);
        graphResults.push(...results);
      }

      yield* Effect.log(
        `DiscoveryAgent: Graph returned ${graphResults.length} result sets`
      );

      // Build context from session and graph results
      const existingEntities = session.entities.map((e: { name: string }) => e.name).join(", ");
      const priorFindings = session.researchSteps
        .flatMap((s: { findings: readonly string[] }) => s.findings)
        .join("; ");

      // Format graph results for LLM
      const graphContext = graphResults.length > 0
        ? graphResults
            .map(
              (r) =>
                `${r.intentType} query (${r.queryType}) from ${r.seedMbid}:\n  ${r.connections
                  .slice(0, 10)
                  .map((c) => `- ${c.name} (${c.type || "entity"}) via ${c.relationship_type || "connection"}`)
                  .join("\n  ")}`
            )
            .join("\n\n")
        : "No graph connections found";

      const userMessage = `Explore connections for these prioritized plays:

${toExplore
  .map(
    (p) => `Play ${p.playId}: Priority=${p.priority}, Value=${p.estimatedValue}
  Rationale: ${p.rationale}
  Suggested intents: ${p.suggestedIntents.map((i) => i.type).join(", ") || "none"}`
  )
  .join("\n\n")}

## Graph Query Results
${graphContext}

Prior findings: ${priorFindings || "none yet"}
Known entities: ${existingEntities || "none yet"}

Based on the graph data above, identify interesting patterns and connections.
Output discoveries as JSON with:
- results: array of { playId, discoveries[], suggestedResearchPaths[] }
- totalDiscoveries: number`;

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

      // Try LLM-based discovery, fall back to heuristic on error
      // Temperature 0.7: Higher for creative, exploratory pattern discovery
      const result = yield* Effect.gen(function* () {
        const chat = yield* Chat.fromPrompt(prompt);
        const response = yield* chat.generateObject({
          prompt: [],
          schema: DiscoveryOutput,
          objectName: "discovery_output",
        }).pipe(
          AnthropicLanguageModel.withConfigOverride({ temperature: 0.7 })
        );

        // Log token usage for cost attribution
        const usage = response.usage;
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        yield* Effect.log(
          `DiscoveryAgent: Token usage - input: ${inputTokens}, output: ${outputTokens}, ` +
          `cache_read: ${usage.cachedInputTokens ?? 0}, total: ${inputTokens + outputTokens}`
        );

        return response.value;
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(
              `DiscoveryAgent: LLM failed, using heuristic fallback: ${String(error)}`
            );
            // Use graph results to enhance heuristic fallback
            return graphEnhancedDiscover(prioritizations, graphResults);
          })
        )
      );

      yield* Effect.log(
        `DiscoveryAgent: Found ${result.totalDiscoveries} potential discoveries`
      );

      return result;
    }).pipe(
      Effect.mapError(
        (cause) =>
          new DiscoveryError({
            message: "Discovery exploration failed",
            cause,
          })
      )
    );

  return { discover } satisfies DiscoveryAgentInterface;
});

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for DiscoveryAgent
 * Requires GraphConnectionsService for actual graph queries
 */
export const DiscoveryAgentLive: Layer.Layer<
  DiscoveryAgent,
  never,
  GraphConnectionsService
> = Layer.effect(DiscoveryAgent, makeDiscoveryAgent);

/**
 * Test layer with mock implementation (no graph calls)
 */
export const DiscoveryAgentTest: Layer.Layer<DiscoveryAgent> = Layer.succeed(
  DiscoveryAgent,
  {
    discover: (prioritizations, _session) =>
      Effect.succeed({
        results: prioritizations.map((p) => ({
          playId: p.playId,
          discoveries: [],
          suggestedResearchPaths: [],
        })),
        totalDiscoveries: 0,
      }),
  }
);
