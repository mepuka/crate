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
export { StreamingLinksApi } from "./endpoints/streaming-links.js"

// Schemas - Play types (re-exported from @crate/domain for convenience)
export { PlayResult, TimelineResponse, SearchResponse } from "@crate/domain/faiss/schemas"
export type { Play, Timeline, SearchResult } from "@crate/domain/faiss/schemas"

// Schemas - Streaming links
export {
  StreamingPlatform,
  StreamingLinkKind,
  StreamingLinkSource,
  StreamingLink,
  StreamingLinksRequest,
  StreamingLinksResponse
} from "@crate/domain/links/streaming"
export type {
  StreamingPlatform as StreamingPlatformType,
  StreamingLinkKind as StreamingLinkKindType,
  StreamingLinkSource as StreamingLinkSourceType,
  StreamingLink as StreamingLinkType,
  StreamingLinksRequest as StreamingLinksRequestType,
  StreamingLinksResponse as StreamingLinksResponseType
} from "@crate/domain/links/streaming"

// Schemas - Health
export { HealthResponse } from "./schemas/Health.js"
export type { Health } from "./schemas/Health.js"

// Schemas - Params (reusable across HttpApi, Router, Atoms)
export { TimelineParams, SearchParams, PlayIdParam, PlayCountParams } from "./schemas/SearchParams.js"

// Schemas - Count response
export { PlayCountResponse } from "@crate/domain/faiss/schemas"

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
