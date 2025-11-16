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
 * Re-export domain schemas for backward compatibility.
 * These represent domain request types shared between API and agent.
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
export { SearchParams, TimelineParams } from "@crate/domain/faiss/schemas"

/**
 * Play ID path parameter.
 *
 * For GET /api/plays/:id path param.
 */
export class PlayIdParam extends Schema.Class<PlayIdParam>("PlayIdParam")({
  id: Schema.NumberFromString
}) {}
