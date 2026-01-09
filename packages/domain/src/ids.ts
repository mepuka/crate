import { Schema } from "effect"

// =============================================================================
// Play/Show IDs (KEXP broadcasts)
// =============================================================================

/**
 * Branded ID for individual track plays from KEXP.
 * References the id column in fact_plays table.
 */
export const PlayId = Schema.Number.pipe(Schema.brand("PlayId"))
export type PlayId = typeof PlayId.Type

/**
 * Branded ID for KEXP radio shows.
 * References the show column in fact_plays table.
 */
export const ShowId = Schema.Number.pipe(Schema.brand("ShowId"))
export type ShowId = typeof ShowId.Type

// =============================================================================
// Event IDs (concerts, festivals, venues)
// =============================================================================

/**
 * Branded ID for live music events (concerts, shows, etc).
 */
export const EventId = Schema.String.pipe(Schema.brand("EventId"))
export type EventId = typeof EventId.Type

/**
 * Branded ID for music venues.
 */
export const VenueId = Schema.String.pipe(Schema.brand("VenueId"))
export type VenueId = typeof VenueId.Type

/**
 * Branded ID for music festivals.
 */
export const FestivalId = Schema.String.pipe(Schema.brand("FestivalId"))
export type FestivalId = typeof FestivalId.Type

// =============================================================================
// MusicBrainz IDs (external identifiers from MusicBrainz database)
// =============================================================================

/**
 * MusicBrainz Recording ID - identifies a unique recording of a song.
 * Format: UUID string (e.g., "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d")
 */
export const RecordingMbid = Schema.String.pipe(Schema.brand("RecordingMbid"))
export type RecordingMbid = typeof RecordingMbid.Type

/**
 * MusicBrainz Artist ID - identifies a unique artist.
 * Format: UUID string (e.g., "a74b1b7f-71a5-4011-9441-d0b5e4122711")
 */
export const ArtistMbid = Schema.String.pipe(Schema.brand("ArtistMbid"))
export type ArtistMbid = typeof ArtistMbid.Type

/**
 * MusicBrainz Release ID - identifies a unique release (album, single, EP).
 * Format: UUID string
 */
export const ReleaseMbid = Schema.String.pipe(Schema.brand("ReleaseMbid"))
export type ReleaseMbid = typeof ReleaseMbid.Type

/**
 * MusicBrainz Release Group ID - identifies a group of releases
 * (e.g., original album + deluxe edition + remaster are all in one group).
 * Format: UUID string
 */
export const ReleaseGroupMbid = Schema.String.pipe(Schema.brand("ReleaseGroupMbid"))
export type ReleaseGroupMbid = typeof ReleaseGroupMbid.Type
