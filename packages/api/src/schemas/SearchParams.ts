import { Schema } from "effect"

/**
 * Reusable URL parameter schemas.
 *
 * These schemas are designed to be used in THREE places:
 * 1. HttpApiEndpoint URL parameters (via .setUrlParams())
 * 2. TanStack Router search params (route definitions)
 * 3. Atom.searchParam() for URL synchronization
 *
 * Pattern: Use Schema.optionalWith for defaults to ensure type safety
 * across all contexts.
 */

/**
 * Timeline endpoint URL parameters.
 *
 * Supports multiple navigation modes:
 * - Cursor pagination (cursor + limit)
 * - Time-based jump (since, until + limit)
 * - Percentage jump (percentage + limit)
 * - Anchor jump (anchor_id + limit)
 *
 * Optional MBID filtering (can be combined with any navigation mode):
 * - artist_mbid: Filter by artist MusicBrainz ID
 * - recording_mbid: Filter by recording MusicBrainz ID
 * - release_mbid: Filter by release MusicBrainz ID
 * - release_group_mbid: Filter by release group MusicBrainz ID
 *
 * Usage with Atom.searchParam():
 * ```typescript
 * const cursorAtom = Atom.searchParam("cursor", {
 *   schema: Schema.optional(Schema.String)
 * })
 * const limitAtom = Atom.searchParam("limit", {
 *   schema: Schema.NumberFromString
 * })
 * ```
 */
export class TimelineParams extends Schema.Class<TimelineParams>("TimelineParams")({
  limit: Schema.optionalWith(Schema.NumberFromString, { default: () => 50 }),
  cursor: Schema.optional(Schema.String),
  since: Schema.optional(Schema.String),
  until: Schema.optional(Schema.String),
  percentage: Schema.optional(Schema.NumberFromString),
  anchor_id: Schema.optional(Schema.NumberFromString),
  // MBID filters
  artist_mbid: Schema.optional(Schema.String),
  recording_mbid: Schema.optional(Schema.String),
  release_mbid: Schema.optional(Schema.String),
  release_group_mbid: Schema.optional(Schema.String)
}) {}

/**
 * Search request body parameters.
 *
 * For POST /api/search body.
 */
export class SearchParams extends Schema.Class<SearchParams>("SearchParams")({
  query: Schema.String,
  limit: Schema.optionalWith(Schema.Number, { default: () => 10 }),
  offset: Schema.optionalWith(Schema.Number, { default: () => 0 })
}) {}

/**
 * Play ID path parameter.
 *
 * For GET /api/plays/:id path param.
 */
export class PlayIdParam extends Schema.Class<PlayIdParam>("PlayIdParam")({
  id: Schema.NumberFromString
}) {}
