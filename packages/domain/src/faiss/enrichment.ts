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
 */
export class EnrichmentItem extends Schema.Class<EnrichmentItem>("EnrichmentItem")({
  play_id: Schema.Number,
  data: HelloWorldEnrichment
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
