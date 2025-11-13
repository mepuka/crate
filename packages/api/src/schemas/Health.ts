import { Schema } from "effect"

/**
 * HealthResponse schema - matches FastAPI backend HealthResponse model.
 *
 * Response for GET /api/health endpoint.
 */
export class HealthResponse extends Schema.Class<HealthResponse>("HealthResponse")({
  status: Schema.String,
  index_loaded: Schema.Boolean,
  database_connected: Schema.Boolean,
  total_vectors: Schema.Number,
  embedding_dimension: Schema.Number,
  memory_usage_mb: Schema.Number,
  uptime_seconds: Schema.Number
}) {}

export type Health = typeof HealthResponse.Type
