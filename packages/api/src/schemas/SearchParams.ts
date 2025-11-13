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
  anchor_id: Schema.optional(Schema.NumberFromString)
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
