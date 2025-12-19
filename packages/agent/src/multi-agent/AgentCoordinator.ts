/**
 * AgentCoordinator
 *
 * Orchestrates the multi-agent pipeline: Curator → Discovery → Research → Writer → Critic
 * Each agent receives SessionExport from the previous agent and logs its work.
 *
 * @module
 */

import { Context, Data, Effect, Layer } from "effect";
import { LanguageModel } from "@effect/ai";
import {
  InsightSessionService,
  AgentCheckpointService,
  CheckpointError,
  type SessionExport,
} from "../services/index.js";
import { MusicAgent, MusicAgentError, type MusicAgentRequirements } from "../MusicAgent.js";
import { FaissClient } from "../FaissClient.js";
import { CuratorAgent, CuratorError, type PlayForCuration } from "./agents/CuratorAgent.js";
import { WriterAgent, WriterError } from "./agents/WriterAgent.js";
import { CriticAgent, CriticError } from "./agents/CriticAgent.js";
import { DiscoveryAgent, DiscoveryError } from "./agents/DiscoveryAgent.js";
import type {
  CuratorOutput,
  DiscoveryOutput,
  CriticOutput,
  CoordinatorResult,
  PipelineStage,
} from "./types.js";

// =============================================================================
// Errors
// =============================================================================

export class CoordinatorError extends Data.TaggedError("CoordinatorError")<{
  readonly stage: PipelineStage;
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Agent Interfaces (to be implemented by specialist agents)
// =============================================================================

/**
 * Interface for specialist agents in the pipeline
 */
export interface SpecialistAgent<Input, Output> {
  readonly name: string;
  readonly run: (
    input: Input,
    session: SessionExport
  ) => Effect.Effect<Output, CoordinatorError>;
}

// =============================================================================
// Service Interface
// =============================================================================

export interface AgentCoordinatorInterface {
  /**
   * Process a batch of plays through the full pipeline
   *
   * Requires MusicAgentRequirements (LanguageModel, etc.) to be provided
   * via the R channel for all stages that need LLM access
   * (Curator, Discovery, Research, Writer, Critic).
   */
  readonly processBatch: (
    playIds: readonly number[]
  ) => Effect.Effect<CoordinatorResult, CoordinatorError | CheckpointError, MusicAgentRequirements | LanguageModel.LanguageModel>;

  /**
   * Run a partial pipeline (for testing/debugging)
   */
  readonly runStage: <T>(
    stage: PipelineStage,
    input: unknown
  ) => Effect.Effect<T, CoordinatorError>;

  /**
   * Get current pipeline status
   */
  readonly getStatus: () => Effect.Effect<{
    stage: PipelineStage;
    sessionId: string | null;
  }>;
}

// =============================================================================
// Service Tag
// =============================================================================

export class AgentCoordinator extends Context.Tag("AgentCoordinator")<
  AgentCoordinator,
  AgentCoordinatorInterface
>() {}

// =============================================================================
// Implementation
// =============================================================================

const makeAgentCoordinator = Effect.gen(function* () {
  const session = yield* InsightSessionService;
  const checkpoint = yield* AgentCheckpointService;
  const musicAgent = yield* MusicAgent;
  const faissClient = yield* FaissClient;
  const curatorAgent = yield* CuratorAgent;
  const writerAgent = yield* WriterAgent;
  const criticAgent = yield* CriticAgent;
  const discoveryAgent = yield* DiscoveryAgent;

  // Track current stage
  let currentStage: PipelineStage = "initializing";
  let currentSessionId: string | null = null;

  // ==========================================================================
  // Stage Runners
  // ==========================================================================

  /**
   * Run the Curator stage to prioritize plays
   *
   * Uses CuratorAgent LLM to analyze plays and assign priorities/intents.
   * Requires LanguageModel to be provided via the R channel.
   */
  const runCurator = (
    playIds: readonly number[]
  ): Effect.Effect<CuratorOutput, CoordinatorError, LanguageModel.LanguageModel> =>
    Effect.gen(function* () {
      currentStage = "curating";
      yield* Effect.log(`Curator: Analyzing ${playIds.length} plays`);

      // Log research step
      yield* session.logResearchStep({
        step: "analyze",
        description: `Curator analyzing batch of ${playIds.length} plays`,
        findings: [`batch_size=${playIds.length}`],
        entityMbids: [],
      });

      // Empty batch - nothing to do
      if (playIds.length === 0) {
        return {
          prioritizations: [],
          totalPlays: 0,
          highPriorityCount: 0,
          skipCount: 0,
        };
      }

      // Fetch play data from FAISS API
      yield* Effect.log(`Curator: Fetching ${playIds.length} plays from API`);
      const playsResponse = yield* faissClient
        .getPlaysBatch([...playIds])
        .pipe(
          Effect.mapError((error) =>
            new CoordinatorError({
              stage: "curating",
              message: "Failed to fetch play data",
              cause: error,
            })
          )
        );

      // Transform to PlayForCuration format
      const playsForCuration: PlayForCuration[] = playsResponse.plays.map((play) => ({
        playId: play.id,
        artist: play.artist,
        track: play.song,
        isLocal: play.is_local,
        artistMbids: play.artist_mbid,
        airdate: play.airdate.toISOString(),
        ...(play.album && { album: play.album }),
        ...(play.comment && { comment: play.comment }),
        ...(play.rotation_status && { rotationStatus: play.rotation_status }),
      }));

      // Get session export for curator context
      const sessionExport = yield* session.exportSession();

      // Call CuratorAgent to prioritize plays
      const output = yield* curatorAgent.prioritize(playsForCuration, sessionExport).pipe(
        Effect.mapError((error) =>
          new CoordinatorError({
            stage: "curating",
            message: error instanceof CuratorError ? error.message : "Curator prioritization failed",
            cause: error,
          })
        )
      );

      yield* Effect.log(
        `Curator: ${output.highPriorityCount} high priority, ${output.skipCount} skipped out of ${output.totalPlays}`
      );

      return output;
    });

  /**
   * Run the Discovery stage to find patterns
   *
   * Uses DiscoveryAgent to query the knowledge graph and synthesize
   * findings into research directions.
   * Requires LanguageModel to be provided via the R channel.
   */
  const runDiscovery = (
    curatorOutput: CuratorOutput
  ): Effect.Effect<DiscoveryOutput, CoordinatorError, LanguageModel.LanguageModel> =>
    Effect.gen(function* () {
      currentStage = "discovering";
      const highPriority = curatorOutput.prioritizations.filter(
        (p) => p.priority !== "skip"
      );
      yield* Effect.log(
        `Discovery: Exploring patterns for ${highPriority.length} plays`
      );

      // Log research step
      yield* session.logResearchStep({
        step: "graph",
        description: `Discovery exploring ${highPriority.length} prioritized plays`,
        findings: [`exploring_count=${highPriority.length}`],
        entityMbids: [],
      });

      // Empty curator output - nothing to explore
      if (highPriority.length === 0) {
        yield* Effect.log("Discovery: No plays to explore, skipping");
        return {
          results: [],
          totalDiscoveries: 0,
        };
      }

      // Get session export for discovery context
      const sessionExport = yield* session.exportSession();

      // Call DiscoveryAgent to explore graph and synthesize findings
      const output = yield* discoveryAgent.discover(curatorOutput.prioritizations, sessionExport).pipe(
        Effect.mapError((error) =>
          new CoordinatorError({
            stage: "discovering",
            message: error instanceof DiscoveryError ? error.message : "Discovery exploration failed",
            cause: error,
          })
        )
      );

      yield* Effect.log(
        `Discovery: Found ${output.totalDiscoveries} patterns across ${output.results.length} plays`
      );

      // Log discoveries as research steps so they flow to Writer
      // This bridges the Discovery → Writer pipeline depth gap
      for (const result of output.results) {
        for (const discovery of result.discoveries) {
          yield* session.logResearchStep({
            step: "graph",
            description: `[Discovery:${discovery.type}] ${discovery.description}`,
            findings: [
              discovery.description,
              ...(discovery.evidence ? [`Evidence: ${discovery.evidence}`] : []),
              `Interest: ${discovery.interestScore}/100`,
            ],
            entityMbids: [...discovery.relatedMbids],
          });
        }
      }

      // Re-export session after logging discoveries
      const updatedExport = yield* session.exportSession();

      // Checkpoint after discovery
      yield* checkpoint.saveCheckpoint(updatedExport, "running").pipe(
        Effect.mapError((error) =>
          new CoordinatorError({
            stage: "discovering",
            message: "Failed to save checkpoint after discovery",
            cause: error,
          })
        )
      );

      return output;
    });

  /**
   * Run the Research stage (uses existing MusicAgent)
   *
   * This is the core stage where actual research happens:
   * - MusicAgent.enrichPlays() executes the agentic loop
   * - Tools are called (search_plays, semantic_search, resolve_mbid, etc.)
   * - Insights are generated and posted to FAISS API
   * - Session captures all tool calls and findings
   */
  const runResearch = (
    discoveryOutput: DiscoveryOutput
  ): Effect.Effect<{ insightCount: number }, CoordinatorError, MusicAgentRequirements> =>
    Effect.gen(function* () {
      currentStage = "researching";

      // Extract play IDs from discovery results (non-skipped plays)
      const playIds = discoveryOutput.results.map((r) => r.playId);

      yield* Effect.log(
        `Research: Enriching ${playIds.length} plays via MusicAgent`
      );

      // Log research step
      yield* session.logResearchStep({
        step: "search",
        description: `Research phase: MusicAgent enriching ${playIds.length} plays`,
        findings: [`plays_to_research=${playIds.length}`],
        entityMbids: [],
      });

      if (playIds.length === 0) {
        yield* Effect.log("Research: No plays to research, skipping");
        return { insightCount: 0 };
      }

      // Call MusicAgent to enrich plays
      // This runs the full agentic loop with tools and generates insights
      const result = yield* musicAgent.enrichPlays(playIds).pipe(
        Effect.tap(({ count }) =>
          Effect.log(`Research: MusicAgent generated ${count} insights`)
        ),
        // Checkpoint after research completes
        Effect.tap(() =>
          Effect.gen(function* () {
            const exported = yield* session.exportSession();
            yield* checkpoint.saveCheckpoint(exported, "running");
          })
        )
      );

      yield* Effect.log(`Research: Complete with ${result.count} insights`);
      return { insightCount: result.count };
    }).pipe(
      Effect.mapError((cause) => {
        // Handle MusicAgentError specially
        if (cause instanceof MusicAgentError) {
          return new CoordinatorError({
            stage: "researching",
            message: `MusicAgent failed: ${cause.message}`,
            cause,
          });
        }
        return new CoordinatorError({
          stage: "researching",
          message: "Research stage failed",
          cause,
        });
      })
    );

  /**
   * Run the Writer stage to craft narratives
   *
   * Uses WriterAgent LLM to synthesize session research into insights.
   * Requires LanguageModel to be provided via the R channel.
   */
  const runWriter = (): Effect.Effect<number, CoordinatorError, LanguageModel.LanguageModel> =>
    Effect.gen(function* () {
      currentStage = "writing";

      // Get current session state
      const sessionExport = yield* session.exportSession();
      const playIds = sessionExport.playIds;

      yield* Effect.log(
        `Writer: Crafting narratives for ${playIds.length} plays`
      );

      // Log research step
      yield* session.logResearchStep({
        step: "synthesize",
        description: `Writer synthesizing research into insights for ${playIds.length} plays`,
        findings: [],
        entityMbids: [],
      });

      // Empty batch - nothing to do
      if (playIds.length === 0) {
        yield* Effect.log("Writer: No plays to write about, skipping");
        return 0;
      }

      // Call WriterAgent to synthesize insights
      const results = yield* writerAgent.writeBatch(playIds, sessionExport).pipe(
        Effect.mapError((error) =>
          new CoordinatorError({
            stage: "writing",
            message: error instanceof WriterError ? error.message : "Writer synthesis failed",
            cause: error,
          })
        )
      );

      // Count total insights generated across all plays
      const insightsWritten = results.reduce(
        (total, r) => total + r.insights.length,
        0
      );

      yield* Effect.log(`Writer: Created ${insightsWritten} insights`);

      // Checkpoint after writing completes
      const exported = yield* session.exportSession();
      yield* checkpoint.saveCheckpoint(exported, "running").pipe(
        Effect.mapError((error) =>
          new CoordinatorError({
            stage: "writing",
            message: "Failed to save checkpoint after writing",
            cause: error,
          })
        )
      );

      return insightsWritten;
    });

  /**
   * Run the Critic stage to review quality
   *
   * Uses CriticAgent LLM to review all insights for quality, accuracy,
   * and KEXP voice alignment.
   * Requires LanguageModel to be provided via the R channel.
   */
  const runCritic = (): Effect.Effect<CriticOutput, CoordinatorError, LanguageModel.LanguageModel> =>
    Effect.gen(function* () {
      currentStage = "reviewing";
      const sessionExport = yield* session.exportSession();
      yield* Effect.log(
        `Critic: Reviewing ${sessionExport.insights.length} insights`
      );

      // Log research step
      yield* session.logResearchStep({
        step: "analyze",
        description: `Critic reviewing ${sessionExport.insights.length} insights`,
        findings: [],
        entityMbids: [],
      });

      // Empty session - nothing to review
      if (sessionExport.insights.length === 0) {
        yield* Effect.log("Critic: No insights to review, skipping");
        return {
          reviews: [],
          approvedCount: 0,
          rejectedCount: 0,
          averageScore: 0,
        };
      }

      // Call CriticAgent to review all insights
      const output = yield* criticAgent.reviewAll(sessionExport).pipe(
        Effect.mapError((error) =>
          new CoordinatorError({
            stage: "reviewing",
            message: error instanceof CriticError ? error.message : "Critic review failed",
            cause: error,
          })
        )
      );

      yield* Effect.log(
        `Critic: Approved ${output.approvedCount}/${sessionExport.insights.length}, avg score ${output.averageScore.toFixed(1)}`
      );

      // Checkpoint after critic review
      yield* checkpoint.saveCheckpoint(sessionExport, "running").pipe(
        Effect.mapError((error) =>
          new CoordinatorError({
            stage: "reviewing",
            message: "Failed to save checkpoint after critic review",
            cause: error,
          })
        )
      );

      return output;
    });

  // ==========================================================================
  // Main Pipeline
  // ==========================================================================

  const processBatch = (
    playIds: readonly number[]
  ): Effect.Effect<CoordinatorResult, CoordinatorError | CheckpointError, MusicAgentRequirements | LanguageModel.LanguageModel> =>
    Effect.gen(function* () {
      const startTime = Date.now();
      currentStage = "initializing";

      // Initialize session
      yield* session.reset();
      yield* session.setMode("enrich");
      for (const playId of playIds) {
        yield* session.addPlayId(playId);
      }
      currentSessionId = yield* session.getSessionId();

      yield* Effect.log(`Coordinator: Starting pipeline for ${playIds.length} plays`);
      yield* Effect.log(`Session ID: ${currentSessionId}`);

      // Save initial checkpoint
      yield* checkpoint.saveCheckpoint(
        yield* session.exportSession(),
        "running"
      );

      // Stage timings
      const timings = {
        curator: { start: 0, end: 0 },
        discovery: { start: 0, end: 0 },
        research: { start: 0, end: 0 },
        writer: { start: 0, end: 0 },
        critic: { start: 0, end: 0 },
      };

      // 1. Curator: Prioritize plays
      timings.curator.start = Date.now();
      const curatorOutput = yield* runCurator(playIds);
      timings.curator.end = Date.now();
      yield* checkpoint.saveCheckpoint(
        yield* session.exportSession(),
        "running"
      );

      // 2. Discovery: Find patterns
      timings.discovery.start = Date.now();
      const discoveryOutput = yield* runDiscovery(curatorOutput);
      timings.discovery.end = Date.now();
      yield* checkpoint.saveCheckpoint(
        yield* session.exportSession(),
        "running"
      );

      // 3. Research: Deep dive (existing MusicAgent)
      // This is the core stage where MusicAgent runs the agentic loop
      timings.research.start = Date.now();
      const researchResult = yield* runResearch(discoveryOutput);
      timings.research.end = Date.now();
      // Note: runResearch already saves checkpoint internally

      // 4. Writer: Craft narratives
      timings.writer.start = Date.now();
      const insightsWritten = yield* runWriter();
      timings.writer.end = Date.now();
      yield* checkpoint.saveCheckpoint(
        yield* session.exportSession(),
        "running"
      );

      // 5. Critic: Quality gate
      timings.critic.start = Date.now();
      const criticOutput = yield* runCritic();
      timings.critic.end = Date.now();

      // Final checkpoint
      currentStage = "completed";
      yield* checkpoint.saveCheckpoint(
        yield* session.exportSession(),
        "completed"
      );

      const endTime = Date.now();
      const finalSession = yield* session.exportSession();

      yield* Effect.log(
        `Coordinator: Pipeline complete in ${endTime - startTime}ms`
      );

      // Total insights = research stage (MusicAgent) + writer stage
      const totalInsights = researchResult.insightCount + insightsWritten;

      return {
        sessionId: currentSessionId,
        success: true,
        playIds: [...playIds],
        insightsGenerated: totalInsights,
        insightsApproved: criticOutput.approvedCount,
        durationMs: endTime - startTime,
        stages: {
          curator: {
            durationMs: timings.curator.end - timings.curator.start,
            highPriorityCount: curatorOutput.highPriorityCount,
          },
          discovery: {
            durationMs: timings.discovery.end - timings.discovery.start,
            discoveriesFound: discoveryOutput.totalDiscoveries,
          },
          research: {
            durationMs: timings.research.end - timings.research.start,
            toolCallCount: finalSession.toolCalls.length,
          },
          writer: {
            durationMs: timings.writer.end - timings.writer.start,
            insightsWritten,
          },
          critic: {
            durationMs: timings.critic.end - timings.critic.start,
            approvalRate:
              criticOutput.approvedCount /
              Math.max(1, criticOutput.approvedCount + criticOutput.rejectedCount),
          },
        },
      } satisfies CoordinatorResult;
    }).pipe(
      Effect.tapError((error: CoordinatorError | CheckpointError) =>
        Effect.gen(function* () {
          currentStage = "failed";
          const stage = error._tag === "CoordinatorError" ? error.stage : "checkpoint";
          const message = error._tag === "CoordinatorError" ? error.message : "Checkpoint operation failed";
          yield* Effect.logError(`Coordinator: Pipeline failed at ${stage}: ${message}`);
          // Try to save failed checkpoint (ignore errors since we're already in error state)
          const sessionExport = yield* session.exportSession();
          yield* checkpoint.saveCheckpoint(sessionExport, "failed", {
            message,
          }).pipe(Effect.ignore);
        })
      )
    );

  const runStage = <T>(
    stage: PipelineStage,
    _input: unknown
  ): Effect.Effect<T, CoordinatorError> =>
    Effect.fail(
      new CoordinatorError({
        stage,
        message: `runStage not yet implemented for ${stage}`,
      })
    );

  const getStatus = () =>
    Effect.succeed({
      stage: currentStage,
      sessionId: currentSessionId,
    });

  return {
    processBatch,
    runStage,
    getStatus,
  } satisfies AgentCoordinatorInterface;
});

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for AgentCoordinator
 *
 * Requires InsightSessionService, AgentCheckpointService, MusicAgent,
 * FaissClient, CuratorAgent, WriterAgent, CriticAgent, and DiscoveryAgent.
 *
 * The coordinator uses LanguageModel via the R channel when processing
 * batches (for Curator, Discovery, Writer, and Critic stages).
 */
export const AgentCoordinatorLive: Layer.Layer<
  AgentCoordinator,
  never,
  InsightSessionService | AgentCheckpointService | MusicAgent | FaissClient | CuratorAgent | WriterAgent | CriticAgent | DiscoveryAgent
> = Layer.effect(AgentCoordinator, makeAgentCoordinator);

/**
 * Test layer with mock implementation
 */
export const AgentCoordinatorTest: Layer.Layer<AgentCoordinator> = Layer.succeed(
  AgentCoordinator,
  {
    processBatch: (_playIds) =>
      Effect.succeed({
        sessionId: "test_session",
        success: true,
        playIds: [],
        insightsGenerated: 0,
        insightsApproved: 0,
        durationMs: 0,
        stages: {},
      } as CoordinatorResult),
    runStage: <T>(_stage: PipelineStage, _input: unknown) =>
      Effect.fail(
        new CoordinatorError({
          stage: "initializing",
          message: "Not implemented in test",
        })
      ) as Effect.Effect<T, CoordinatorError>,
    getStatus: () =>
      Effect.succeed({
        stage: "initializing" as PipelineStage,
        sessionId: null,
      }),
  }
);
