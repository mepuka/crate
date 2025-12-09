import { Schema } from "effect"

/**
 * Enrichment trigger request (from sync script)
 */
export class EnrichmentTrigger extends Schema.Class<EnrichmentTrigger>("EnrichmentTrigger")({
  play_ids: Schema.Array(Schema.Number)
}) {}

/**
 * Hello world enrichment data structure
 */
export class HelloWorldEnrichment extends Schema.Class<HelloWorldEnrichment>("HelloWorldEnrichment")({
  status: Schema.String,
  timestamp: Schema.String, // ISO 8601 string from DateTime.formatIsoDateUtc
  message: Schema.String,
  agent_version: Schema.String
}) {}

/**
 * Enrichment item (one play's enrichment)
 * 
 * The data field accepts any JSON object to support different enrichment types:
 * - hello_world: HelloWorldEnrichment
 * - insights: Insight objects (ConcertInsight, CoverInsight, etc.)
 * - Future enrichment types can use any JSON structure
 */
export class EnrichmentItem extends Schema.Class<EnrichmentItem>("EnrichmentItem")({
  play_id: Schema.Number,
  data: Schema.Unknown // Accepts any JSON object to support multiple enrichment types
}) {}

/**
 * Request to POST enrichments to FAISS API
 */
export class EnrichmentRequest extends Schema.Class<EnrichmentRequest>("EnrichmentRequest")({
  enrichment_type: Schema.String,
  enrichments: Schema.Array(EnrichmentItem)
}) {}

/**
 * Response from enrichments endpoint
 */
export class EnrichmentResponse extends Schema.Class<EnrichmentResponse>("EnrichmentResponse")({
  status: Schema.String,
  count: Schema.Number
}) {}

/**
 * Batch plays response (for fetching multiple plays)
 */
export class BatchPlaysResponse extends Schema.Class<BatchPlaysResponse>("BatchPlaysResponse")({
  plays: Schema.Array(Schema.Unknown) // Will be PlayResult, but avoid circular dep
}) {}

// =============================================================================
// Typed Insights API Schemas
// =============================================================================
// These match the Python Pydantic models in faiss-search-api/app/models/insights.py
// The actual Insight schema lives in @crate/agent/prompts/insights.ts to avoid
// circular dependencies (agent depends on domain).

/**
 * Request to POST typed insights to /api/insights
 *
 * Uses Schema.Unknown for insights array because the canonical Insight schema
 * lives in @crate/agent to avoid circular dependencies. The Python API validates
 * the insight structure using Pydantic discriminated unions.
 */
export class CreateInsightsRequest extends Schema.Class<CreateInsightsRequest>("CreateInsightsRequest")({
  insights: Schema.Array(Schema.Unknown) // Insight objects validated by Python API
}) {}

/**
 * Response from /api/insights POST
 */
export class InsightsResponse extends Schema.Class<InsightsResponse>("InsightsResponse")({
  // Some deployments may omit status; default to "success" for forward compatibility.
  status: Schema.optionalWith(Schema.String, { default: () => "success" }),
  count: Schema.Number,
  insight_ids: Schema.Array(Schema.Number)
}) {}

/**
 * Single insight record from database (GET response)
 */
export class InsightRecord extends Schema.Class<InsightRecord>("InsightRecord")({
  id: Schema.Number,
  insight_type: Schema.String,
  play_id: Schema.Number,
  confidence: Schema.String,
  source_type: Schema.String,
  data: Schema.Unknown, // Full insight JSON
  summary: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.NullOr(Schema.String),
  // MBID fields for entity queries
  source_recording_mbid: Schema.NullOr(Schema.String),
  source_release_mbid: Schema.NullOr(Schema.String),
  referenced_artist_mbid: Schema.NullOr(Schema.String),
  referenced_recording_mbid: Schema.NullOr(Schema.String),
  referenced_release_mbid: Schema.NullOr(Schema.String),
  referenced_label_mbid: Schema.NullOr(Schema.String)
}) {}

/**
 * Response from /api/insights GET
 */
export class GetInsightsResponse extends Schema.Class<GetInsightsResponse>("GetInsightsResponse")({
  insights: Schema.Array(InsightRecord),
  total: Schema.Number
}) {}

/**
 * Response from /api/insights/plays/{play_id} GET
 */
export class PlayInsightsResponse extends Schema.Class<PlayInsightsResponse>("PlayInsightsResponse")({
  play_id: Schema.Number,
  insights: Schema.Array(InsightRecord),
  total: Schema.Number
}) {}

// =============================================================================
// Evaluation Context Schemas
// =============================================================================
// These schemas capture metadata about how insights were generated,
// enabling evaluation and improvement of the agent.

/**
 * Record of a single tool call during research phase
 *
 * Captures what tool was called, with what parameters, and what it returned.
 * This enables analysis of research patterns and tool effectiveness.
 */
export class ToolCallRecord extends Schema.Class<ToolCallRecord>("ToolCallRecord")({
  /** Which iteration this tool was called in (0-indexed) */
  iteration: Schema.Number,
  /** Name of the tool called */
  tool_name: Schema.String,
  /** Parameters passed to the tool (may be truncated for large params) */
  parameters: Schema.optional(Schema.Unknown),
  /** Summary of the result (e.g., count of results, error message) */
  result_summary: Schema.optional(Schema.String),
  /** Number of results returned (for search-type tools) */
  result_count: Schema.optional(Schema.Number),
  /** Duration in milliseconds */
  duration_ms: Schema.optional(Schema.Number),
  /** ISO timestamp of when the tool was called */
  timestamp: Schema.String
}) {}

/**
 * Token usage for a single API call or aggregated across calls
 *
 * Tracks input, output, and cache tokens for cost calculation.
 * Based on Anthropic's usage response format.
 */
export class TokenUsage extends Schema.Class<TokenUsage>("TokenUsage")({
  /** Input tokens sent to the model */
  input_tokens: Schema.optional(Schema.Number),
  /** Output tokens generated by the model */
  output_tokens: Schema.optional(Schema.Number),
  /** Total tokens (may differ from input + output due to reasoning tokens) */
  total_tokens: Schema.optional(Schema.Number),
  /** Input tokens read from prompt cache (discounted pricing) */
  cache_read_tokens: Schema.optional(Schema.Number),
  /** Input tokens written to prompt cache (premium pricing) */
  cache_creation_tokens: Schema.optional(Schema.Number)
}) {}

/**
 * Anthropic pricing per million tokens (as of 2025)
 * https://www.anthropic.com/pricing
 */
export const ANTHROPIC_PRICING = {
  // Claude 4 models
  "claude-sonnet-4-20250514": {
    input: 3.00,           // $3.00 per 1M input tokens
    output: 15.00,         // $15.00 per 1M output tokens
    cache_read: 0.30,      // $0.30 per 1M cache read tokens (90% discount)
    cache_write: 3.75,     // $3.75 per 1M cache write tokens (25% premium)
  },
  "claude-haiku-4-5": {
    input: 1.00,           // $1.00 per 1M input tokens
    output: 5.00,          // $5.00 per 1M output tokens
    cache_read: 0.10,      // $0.10 per 1M cache read tokens
    cache_write: 1.25,     // $1.25 per 1M cache write tokens
  },
  // Claude 3.5 models
  "claude-3-5-sonnet-20241022": {
    input: 3.00,
    output: 15.00,
    cache_read: 0.30,
    cache_write: 3.75,
  },
  "claude-3-5-haiku-20241022": {
    input: 1.00,
    output: 5.00,
    cache_read: 0.10,
    cache_write: 1.25,
  },
  // Claude 3 models
  "claude-3-haiku-20240307": {
    input: 0.25,
    output: 1.25,
    cache_read: 0.03,
    cache_write: 0.30,
  },
} as const

export type AnthropicModel = keyof typeof ANTHROPIC_PRICING

/**
 * Calculate estimated cost in USD from token usage
 *
 * @param usage - Token usage metrics
 * @param model - Model identifier for pricing lookup
 * @returns Cost in USD (e.g., 0.0042 = $0.0042)
 */
export const calculateCost = (
  usage: typeof TokenUsage.Type,
  model: string
): number => {
  // Default to sonnet pricing if model not found
  const pricing = ANTHROPIC_PRICING[model as AnthropicModel] ?? ANTHROPIC_PRICING["claude-sonnet-4-20250514"]

  const inputTokens = usage.input_tokens ?? 0
  const outputTokens = usage.output_tokens ?? 0
  const cacheReadTokens = usage.cache_read_tokens ?? 0
  const cacheWriteTokens = usage.cache_creation_tokens ?? 0

  // Non-cached input tokens = total input - cache read - cache write
  const regularInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens)

  const cost =
    (regularInputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (cacheReadTokens / 1_000_000) * pricing.cache_read +
    (cacheWriteTokens / 1_000_000) * pricing.cache_write

  return cost
}

/**
 * Evaluation context for an insight
 *
 * Captures metadata about the research process that produced the insight.
 * This enables:
 * - Understanding which tools contributed to the insight
 * - Measuring research efficiency (iterations, tool calls)
 * - A/B testing of prompt variations
 * - Debugging and improvement of the agent
 * - Cost tracking and optimization
 */
export class EvalContext extends Schema.Class<EvalContext>("EvalContext")({
  /** Unique session ID for this enrichment run */
  session_id: Schema.String,
  /** Total number of research iterations before output phase */
  iteration_count: Schema.Number,
  /** Ordered list of tools called across all iterations */
  tools_called: Schema.Array(Schema.String),
  /** Total number of tool calls */
  total_tool_calls: Schema.Number,
  /** Duration of research phase in milliseconds */
  research_duration_ms: Schema.optional(Schema.Number),
  /** Model used for generation (e.g., "claude-sonnet-4-20250514") */
  model: Schema.optional(Schema.String),
  /** Whether existing insights were found for this play */
  had_existing_insights: Schema.optional(Schema.Boolean),
  /** Count of existing insights pre-seeded */
  existing_insight_count: Schema.optional(Schema.Number),
  /** Detailed tool call records (optional, can be expensive to store) */
  tool_calls: Schema.optional(Schema.Array(ToolCallRecord)),
  /** Aggregated token usage across all API calls */
  token_usage: Schema.optional(TokenUsage),
  /** Estimated cost in USD */
  estimated_cost_usd: Schema.optional(Schema.Number)
}) {}

/**
 * Extended insight with eval context for POST /api/insights
 *
 * The eval_context is optional to maintain backwards compatibility.
 * New enrichments should include it for evaluation support.
 */
export const InsightWithEvalContext = Schema.Struct({
  /** The insight data (will be validated by Python discriminated union) */
  insight: Schema.Unknown,
  /** Optional evaluation context */
  eval_context: Schema.optional(EvalContext)
})
export type InsightWithEvalContext = typeof InsightWithEvalContext.Type

/**
 * Extended request to POST insights with eval context
 */
export class CreateInsightsWithEvalRequest extends Schema.Class<CreateInsightsWithEvalRequest>("CreateInsightsWithEvalRequest")({
  /** Array of insights with optional eval context */
  insights: Schema.Array(InsightWithEvalContext)
}) {}
