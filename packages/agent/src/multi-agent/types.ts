/**
 * Multi-Agent Pipeline Types
 *
 * Schemas and types for the multi-agent coordination system.
 * These define the handoff contracts between agents.
 *
 * @module
 */

import { Schema } from "effect";

// =============================================================================
// Discovery Intents
// =============================================================================

/**
 * Types of discovery research to pursue
 */
export const DiscoveryIntentType = Schema.Literal(
  "lineage",
  "collaboration",
  "covers",
  "geographic",
  "label",
  "creator",
  "surprise"
);
export type DiscoveryIntentType = typeof DiscoveryIntentType.Type;

/**
 * Discovery intent with context
 */
export const DiscoveryIntent = Schema.Struct({
  type: DiscoveryIntentType,
  seedMbid: Schema.String,
  description: Schema.optional(Schema.String),
});
export type DiscoveryIntent = typeof DiscoveryIntent.Type;

// =============================================================================
// Curator Output
// =============================================================================

/**
 * Priority levels for play research
 */
export const PriorityLevel = Schema.Literal("high", "medium", "low", "skip");
export type PriorityLevel = typeof PriorityLevel.Type;

/**
 * Curator's prioritization decision for a single play
 */
export const CuratorPrioritization = Schema.Struct({
  playId: Schema.Number,
  priority: PriorityLevel,
  suggestedIntents: Schema.Array(DiscoveryIntent),
  estimatedValue: Schema.Number, // 0-100
  rationale: Schema.String,
});
export type CuratorPrioritization = typeof CuratorPrioritization.Type;

/**
 * Full output from CuratorAgent
 */
export const CuratorOutput = Schema.Struct({
  prioritizations: Schema.Array(CuratorPrioritization),
  totalPlays: Schema.Number,
  highPriorityCount: Schema.Number,
  skipCount: Schema.Number,
});
export type CuratorOutput = typeof CuratorOutput.Type;

// =============================================================================
// Discovery Output
// =============================================================================

/**
 * A single discovery found by the DiscoveryAgent
 */
export const Discovery = Schema.Struct({
  type: Schema.String,
  description: Schema.String,
  relatedMbids: Schema.Array(Schema.String),
  interestScore: Schema.Number, // 0-100
  evidence: Schema.optional(Schema.String),
});
export type Discovery = typeof Discovery.Type;

/**
 * Discovery results for a single play
 */
export const DiscoveryResult = Schema.Struct({
  playId: Schema.Number,
  discoveries: Schema.Array(Discovery),
  suggestedResearchPaths: Schema.Array(Schema.String),
});
export type DiscoveryResult = typeof DiscoveryResult.Type;

/**
 * Full output from DiscoveryAgent
 */
export const DiscoveryOutput = Schema.Struct({
  results: Schema.Array(DiscoveryResult),
  totalDiscoveries: Schema.Number,
});
export type DiscoveryOutput = typeof DiscoveryOutput.Type;

// =============================================================================
// Critic Output
// =============================================================================

/**
 * Issue severity levels
 */
export const IssueSeverity = Schema.Literal("error", "warning", "suggestion");
export type IssueSeverity = typeof IssueSeverity.Type;

/**
 * An issue found during review
 */
export const ReviewIssue = Schema.Struct({
  severity: IssueSeverity,
  description: Schema.String,
  insightIndex: Schema.optional(Schema.Number),
});
export type ReviewIssue = typeof ReviewIssue.Type;

/**
 * Critic's review of insights for a single play
 */
export const CriticReview = Schema.Struct({
  playId: Schema.Number,
  approved: Schema.Boolean,
  qualityScore: Schema.Number, // 0-100
  issues: Schema.Array(ReviewIssue),
  revisionSuggestions: Schema.Array(Schema.String),
});
export type CriticReview = typeof CriticReview.Type;

/**
 * Full output from CriticAgent
 */
export const CriticOutput = Schema.Struct({
  reviews: Schema.Array(CriticReview),
  approvedCount: Schema.Number,
  rejectedCount: Schema.Number,
  averageScore: Schema.Number,
});
export type CriticOutput = typeof CriticOutput.Type;

// =============================================================================
// Pipeline State
// =============================================================================

/**
 * Stage in the multi-agent pipeline
 */
export const PipelineStage = Schema.Literal(
  "initializing",
  "curating",
  "discovering",
  "researching",
  "writing",
  "reviewing",
  "completed",
  "failed"
);
export type PipelineStage = typeof PipelineStage.Type;

/**
 * Current state of a pipeline run
 */
export const PipelineState = Schema.Struct({
  sessionId: Schema.String,
  stage: PipelineStage,
  startedAt: Schema.Number,
  playIds: Schema.Array(Schema.Number),
  curatorOutput: Schema.optional(CuratorOutput),
  discoveryOutput: Schema.optional(DiscoveryOutput),
  criticOutput: Schema.optional(CriticOutput),
  error: Schema.optional(Schema.String),
});
export type PipelineState = typeof PipelineState.Type;

// =============================================================================
// Token Usage Tracking
// =============================================================================

/**
 * Token usage metrics for cost attribution and cache optimization
 */
export const TokenUsage = Schema.Struct({
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  totalTokens: Schema.Number,
  cacheReadTokens: Schema.Number,     // Tokens read from prompt cache
  cacheCreationTokens: Schema.Number, // Tokens used to create cache
});
export type TokenUsage = typeof TokenUsage.Type;

/**
 * Mutable version of TokenUsage for accumulation during processing
 */
export interface MutableTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/**
 * Create an empty token usage object
 */
export const emptyTokenUsage = (): TokenUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
});

/**
 * Create a mutable token usage object for accumulation
 */
export const mutableTokenUsage = (): MutableTokenUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
});

/**
 * Add two token usage objects together
 */
export const addTokenUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  totalTokens: a.totalTokens + b.totalTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
});

// =============================================================================
// Coordinator Result
// =============================================================================

/**
 * Final result from the AgentCoordinator
 */
export const CoordinatorResult = Schema.Struct({
  sessionId: Schema.String,
  success: Schema.Boolean,
  playIds: Schema.Array(Schema.Number),
  insightsGenerated: Schema.Number,
  insightsApproved: Schema.Number,
  durationMs: Schema.Number,
  tokenUsage: Schema.optional(TokenUsage), // Aggregate token usage across all stages
  stages: Schema.Struct({
    curator: Schema.optional(Schema.Struct({
      durationMs: Schema.Number,
      highPriorityCount: Schema.Number,
      tokenUsage: Schema.optional(TokenUsage),
    })),
    discovery: Schema.optional(Schema.Struct({
      durationMs: Schema.Number,
      discoveriesFound: Schema.Number,
      tokenUsage: Schema.optional(TokenUsage),
    })),
    research: Schema.optional(Schema.Struct({
      durationMs: Schema.Number,
      toolCallCount: Schema.Number,
      tokenUsage: Schema.optional(TokenUsage),
    })),
    writer: Schema.optional(Schema.Struct({
      durationMs: Schema.Number,
      insightsWritten: Schema.Number,
      tokenUsage: Schema.optional(TokenUsage),
    })),
    critic: Schema.optional(Schema.Struct({
      durationMs: Schema.Number,
      approvalRate: Schema.Number,
      tokenUsage: Schema.optional(TokenUsage),
    })),
  }),
});
export type CoordinatorResult = typeof CoordinatorResult.Type;
