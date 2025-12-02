import { Schema } from "effect"

/**
 * Event type classification
 */
export const EventType = Schema.Literal(
  "concert",        // Standard venue show
  "festival-set",   // Performance at a festival
  "in-store",       // Record store performance/signing
  "radio-session",  // KEXP Live on KEXP, Live at Home
  "residency",      // Multi-night same venue
  "tour-stop"       // Part of a tour
)
export type EventType = typeof EventType.Type

/**
 * Ticket availability status
 */
export const TicketStatus = Schema.Literal(
  "on-sale",
  "sold-out",
  "presale",
  "free",
  "unknown"
)
export type TicketStatus = typeof TicketStatus.Type

/**
 * Artist billing type
 */
export const BillingType = Schema.Literal(
  "headliner",
  "support",
  "opener",
  "special-guest"
)
export type BillingType = typeof BillingType.Type

/**
 * Event - A specific performance occurrence
 *
 * Examples from KEXP DJ comments:
 * - "Kurt Vile with Pixies at Paramount Theater tonight"
 * - "Death Cab hometown shows October 26th and 27th at The Historic Paramount Theatre"
 * - "supporting Death Cab for Cutie's hometown shows"
 */
export class Event extends Schema.Class<Event>("Event")({
  id: Schema.String,
  type: EventType,

  // When
  date: Schema.DateFromString,
  time: Schema.NullOr(Schema.String),       // "8:00 PM" - often not specified
  doors_time: Schema.NullOr(Schema.String),

  // Where (one of these will be set)
  venue_id: Schema.NullOr(Schema.String),    // Reference to Venue
  festival_id: Schema.NullOr(Schema.String), // Reference to Festival

  // Denormalized for display (avoids joins for common UI)
  venue_name: Schema.NullOr(Schema.String),
  city: Schema.String,

  // Tickets
  ticket_url: Schema.NullOr(Schema.String),
  ticket_status: Schema.NullOr(TicketStatus),

  // Tour context
  tour_name: Schema.NullOr(Schema.String),   // "I Quit Tour 2025"

  // Timestamps
  created_at: Schema.DateFromString,
  updated_at: Schema.DateFromString
}) {}

export type EventData = typeof Event.Type

/**
 * EventArtist - Links artists to events with billing info
 *
 * Captures relationships like:
 * - "Pixies with Kurt Vile" (headliner + support)
 * - "Chong the Nomad supporting Death Cab" (opener)
 */
export class EventArtist extends Schema.Class<EventArtist>("EventArtist")({
  event_id: Schema.String,
  artist_name: Schema.String,
  artist_mbid: Schema.NullOr(Schema.String),

  // Billing order
  billing: BillingType,
  billing_order: Schema.Number,  // 1 = headliner, 2 = direct support, etc.
}) {}

export type EventArtistData = typeof EventArtist.Type

/**
 * EventMention - Links events to plays where they were mentioned
 *
 * Tracks provenance: which DJ comment mentioned this event
 */
export class EventMention extends Schema.Class<EventMention>("EventMention")({
  event_id: Schema.String,
  play_id: Schema.Number,          // Reference to fact_plays.id
  mentioned_at: Schema.DateFromString, // When the DJ mentioned it (play airdate)
  extracted_at: Schema.DateFromString, // When agent extracted this
}) {}

export type EventMentionData = typeof EventMention.Type
