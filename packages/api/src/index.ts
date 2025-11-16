/**
 * @crate/api - KEXP Radio Crate API Client
 *
 * Type-safe HTTP API client for the KEXP backend.
 * Built with Effect HttpApi for compile-time safety.
 */

// Main API
export { KexpApi } from "./api.js"

// Endpoint groups
export { HealthApi } from "./endpoints/health.js"
export { SearchApi } from "./endpoints/search.js"
export { TimelineApi } from "./endpoints/timeline.js"
export { PlayApi } from "./endpoints/play.js"

// Schemas - Play types (re-exported from @crate/domain for convenience)
export { PlayResult, TimelineResponse, SearchResponse } from "@crate/domain/faiss/schemas"
export type { Play, Timeline, SearchResult } from "@crate/domain/faiss/schemas"

// Schemas - Health
export { HealthResponse } from "./schemas/Health.js"
export type { Health } from "./schemas/Health.js"

// Schemas - Params (reusable across HttpApi, Router, Atoms)
export { TimelineParams, SearchParams, PlayIdParam } from "./schemas/SearchParams.js"

// Error types
export {
  TimelineApiError,
  SearchApiError,
  PlayNotFoundError,
  NetworkError,
  InvalidCursorError,
  InvalidPercentageError,
  ValidationError
} from "./schemas/errors.js"
