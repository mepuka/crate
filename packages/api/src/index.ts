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

// Schemas - Play types
export { PlayResult, TimelineResponse, SearchResponse } from "./schemas/Play.js"
export type { Play, Timeline, SearchResult } from "./schemas/Play.js"

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
