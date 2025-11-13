/**
 * Play domain types - re-exported from @crate/api for backwards compatibility.
 *
 * The schemas are now defined in the @crate/api package as the single source of truth.
 * This ensures type consistency between frontend and backend API contracts.
 */

export {
  PlayResult,
  TimelineResponse,
  SearchResponse,
  type Play,
  type Timeline,
  type SearchResult
} from "@crate/api"
