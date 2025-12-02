import { Schema } from "effect"

/**
 * Festival - A multi-day music event (or recurring single-day event)
 *
 * Examples from KEXP DJ comments:
 * - "Bumbershoot on Saturday, August 30th"
 * - "Capitol Hill Block Party in Seattle this year. July 21-23, 2025"
 * - "Psychic Salamander Festival at Remlinger Farms... curated by Modest Mouse"
 */
export class Festival extends Schema.Class<Festival>("Festival")({
  id: Schema.String,                        // UUID or slug: "bumbershoot-2025"
  name: Schema.String,                      // "Bumbershoot Music and Arts Festival"

  // Edition info (for recurring festivals)
  year: Schema.NullOr(Schema.Number),       // 2025
  edition: Schema.NullOr(Schema.String),    // "2025" or "XV" etc

  // Dates
  start_date: Schema.DateFromString,
  end_date: Schema.DateFromString,          // Same as start for single-day

  // Location
  city: Schema.String,
  state: Schema.NullOr(Schema.String),
  country: Schema.String,
  venue_name: Schema.NullOr(Schema.String), // "Seattle Center", "Remlinger Farms"

  // Metadata
  website: Schema.NullOr(Schema.String),
  ticket_url: Schema.NullOr(Schema.String),

  // For matching during extraction
  // e.g., ["CHBP", "Capitol Hill Block Party", "Block Party"]
  aliases: Schema.Array(Schema.String),

  // Curator (some festivals are artist-curated)
  curated_by: Schema.NullOr(Schema.String), // "Modest Mouse" for Psychic Salamander

  // Timestamps
  created_at: Schema.DateFromString,
  updated_at: Schema.DateFromString
}) {}

export type FestivalData = typeof Festival.Type

/**
 * FestivalLineup - Links artists to festivals with performance details
 */
export class FestivalLineup extends Schema.Class<FestivalLineup>("FestivalLineup")({
  festival_id: Schema.String,
  artist_name: Schema.String,
  artist_mbid: Schema.NullOr(Schema.String), // Link to MusicBrainz if known

  // Performance details (if known)
  day: Schema.NullOr(Schema.DateFromString),
  stage: Schema.NullOr(Schema.String),
  set_time: Schema.NullOr(Schema.String),    // "2:40 PM"

  // Billing
  is_headliner: Schema.Boolean,
}) {}

export type FestivalLineupData = typeof FestivalLineup.Type
