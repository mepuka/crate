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
  status: Schema.String,
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
