/**
 * Events domain types for venues, festivals, and shows
 *
 * Used by:
 * - AI agent for extracting structured event data from DJ comments
 * - Frontend for displaying upcoming shows and event information
 */

// Venue types
export {
  Venue,
  VenueType,
  type VenueData
} from "./Venue.js"

// Festival types
export {
  Festival,
  FestivalLineup,
  type FestivalData,
  type FestivalLineupData
} from "./Festival.js"

// Event types
export {
  Event,
  EventType,
  TicketStatus,
  BillingType,
  EventArtist,
  EventMention,
  type EventData,
  type EventArtistData,
  type EventMentionData
} from "./Event.js"

// Extraction metadata
export {
  ExtractionMeta,
  ExtractionConfidence,
  ExtractionSource,
  TemporalReference,
  type ExtractionMetaData,
  type TemporalReferenceData
} from "./extraction.js"
