import { Schema } from "effect"

/**
 * Venue type classification based on capacity/character
 */
export const VenueType = Schema.Literal(
  "arena",          // Climate Pledge, WaMu Theater (10k+)
  "theater",        // Paramount, Moore, Neptune (1-5k)
  "club",           // Showbox, Crocodile, Neumos (200-1500)
  "bar",            // Tractor Tavern, Madame Lou's (<500)
  "record-store",   // Easy Street, Sonic Boom
  "outdoor",        // Outdoor amphitheaters, parks
  "festival-grounds", // Dedicated festival spaces
  "other"
)
export type VenueType = typeof VenueType.Type

/**
 * Venue - A physical location where music events occur
 *
 * Examples from KEXP DJ comments:
 * - "Playing at the Paramount Theatre on September 23rd"
 * - "Showbox SoDo on October 28th"
 * - "Record release show at Sonic Boom Records"
 */
export class Venue extends Schema.Class<Venue>("Venue")({
  id: Schema.String,                        // UUID or slug: "showbox-sodo"
  name: Schema.String,                      // "The Showbox SoDo"
  type: VenueType,

  // Location
  city: Schema.String,                      // "Seattle"
  state: Schema.NullOr(Schema.String),      // "WA"
  country: Schema.String,                   // "US"
  address: Schema.NullOr(Schema.String),

  // Metadata
  capacity: Schema.NullOr(Schema.Number),
  website: Schema.NullOr(Schema.String),

  // Aliases for fuzzy matching during extraction
  // e.g., ["Showbox SoDo", "SoDo Showbox", "The Showbox at SoDo"]
  aliases: Schema.Array(Schema.String),

  // Timestamps
  created_at: Schema.DateFromString,
  updated_at: Schema.DateFromString
}) {}

export type VenueData = typeof Venue.Type
