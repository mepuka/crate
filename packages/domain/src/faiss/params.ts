import { Schema } from "effect"

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
 * Play count endpoint URL parameters.
 *
 * For GET /api/plays/count - at least one MBID filter must be provided.
 */
export class PlayCountParams extends Schema.Class<PlayCountParams>("PlayCountParams")({
  artist_mbid: Schema.optional(Schema.String),
  recording_mbid: Schema.optional(Schema.String),
  release_mbid: Schema.optional(Schema.String),
  release_group_mbid: Schema.optional(Schema.String)
}) {}
