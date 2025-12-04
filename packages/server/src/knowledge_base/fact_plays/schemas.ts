import { Kexp } from "@crate/domain"
import { Model } from "@effect/sql"
import { DateTime, Equal, Hash, Schema } from "effect"

// Play ID branded type
export const PlayId = Schema.Number.pipe(Schema.brand("play_id"))
export type PlayId = Schema.Schema.Type<typeof PlayId>

// Show ID branded type
export const ShowId = Schema.Number.pipe(Schema.brand("show_id"))
export type ShowId = Schema.Schema.Type<typeof ShowId>

// Play type literal
export const PlayType = Schema.Literal("trackplay", "nontrackplay")
export type PlayType = Schema.Schema.Type<typeof PlayType>

// MB IDs for joining

// Main FactPlay model matching the database schema
export class FactPlay extends Model.Class<FactPlay>("FactPlay")({
  id: PlayId,
  airdate: Schema.String,
  show: ShowId,
  show_uri: Schema.String,
  image_uri: Schema.NullOr(Schema.String),
  thumbnail_uri: Schema.NullOr(Schema.String),
  song: Schema.NullOr(Schema.String),
  track_id: Schema.NullOr(Schema.String),
  recording_id: Schema.NullOr(Schema.String),
  artist: Schema.NullOr(Schema.String),
  artist_ids: Schema.NullOr(Schema.String), // JSON string of array
  album: Schema.NullOr(Schema.String),
  release_id: Schema.NullOr(Schema.String),
  release_group_id: Schema.NullOr(Schema.String),
  labels: Schema.NullOr(Schema.String),
  label_ids: Schema.NullOr(Schema.String), // JSON string of array
  release_date: Schema.NullOr(Schema.String),
  rotation_status: Schema.NullOr(Schema.String),
  is_local: Model.BooleanFromNumber,
  is_request: Model.BooleanFromNumber,
  is_live: Model.BooleanFromNumber,
  comment: Schema.NullOr(Schema.String),
  play_type: Schema.NullOr(PlayType),
  created_at: Model.DateTimeInsert,
  updated_at: Model.DateTimeUpdate
}) implements Equal.Equal {
  [Equal.symbol](that: Equal.Equal): boolean {
    if (that instanceof FactPlay) {
      return this.id === that.id
    }
    return false
  }

  [Hash.symbol](): number {
    return Hash.hash(this.id)
  }

  // Helper to parse artist_ids JSON
  get parsedArtistIds(): Array<string> {
    if (!this.artist_ids) return []
    try {
      return JSON.parse(this.artist_ids) as Array<string>
    } catch {
      return []
    }
  }

  // Helper to parse label_ids JSON
  get parsedLabelIds(): Array<string> {
    if (!this.label_ids) return []
    try {
      return JSON.parse(this.label_ids) as Array<string>
    } catch {
      return []
    }
  }
}

export const factPlayFromKexpPlay = Schema.transform(Kexp.KexpTrackPlay, Schema.asSchema(FactPlay.insert), {
  decode: (play) => ({
    id: play.id,
    airdate: play.airdate,
    show: play.show,
    show_uri: play.show_uri,
    image_uri: play.image_uri,
    thumbnail_uri: play.thumbnail_uri,
    song: play.song,
    track_id: play.track_id,
    recording_id: play.recording_id,
    artist: play.artist,
    artist_ids: play.artist_ids.length > 0 ? JSON.stringify(play.artist_ids) : null,
    album: play.album,
    release_id: play.release_id,
    release_group_id: play.release_group_id,
    labels: play.labels.length > 0 ? JSON.stringify(play.labels) : null,
    label_ids: play.label_ids.length > 0 ? JSON.stringify(play.label_ids) : null,
    release_date: play.release_date,
    rotation_status: play.rotation_status,
    is_local: play.is_local ? 1 as const : 0 as const,
    is_request: play.is_request ? 1 as const : 0 as const,
    is_live: play.is_live ? 1 as const : 0 as const,
    comment: play.comment,
    play_type: play.play_type,
    created_at: DateTime.formatIsoDateUtc(DateTime.unsafeNow()),
    updated_at: DateTime.formatIsoDateUtc(DateTime.unsafeNow())
  }),
  encode: (play) => ({
    id: play.id,
    uri: play.show_uri,
    airdate: play.airdate,
    show: play.show,
    show_uri: play.show_uri,
    image_uri: play.image_uri,
    thumbnail_uri: play.thumbnail_uri,
    artist_ids: play.artist_ids ? JSON.parse(play.artist_ids) : null,
    song: play.song,
    track_id: play.track_id,
    recording_id: play.recording_id,
    artist: play.artist,
    album: play.album,
    release_id: play.release_id,
    release_group_id: play.release_group_id,
    labels: play.labels ? JSON.parse(play.labels) : null,
    label_ids: play.label_ids ? JSON.parse(play.label_ids) : null,
    release_date: play.release_date,
    rotation_status: play.rotation_status as Kexp.RotationStatus,
    is_local: play.is_local === 1,
    is_request: play.is_request === 1,
    is_live: play.is_live === 1,
    comment: play.comment,
    play_type: "trackplay" as const,
    created_at: play.created_at,
    updated_at: play.updated_at,
    location: 1,
    location_name: "Default"
  }),
  strict: true
})

// Date range schema for queries
export const DateRange = Schema.Struct({
  start_date: Schema.String,
  end_date: Schema.String
})
export type DateRange = Schema.Schema.Type<typeof DateRange>

// Pagination schema
export const Pagination = Schema.Struct({
  limit: Schema.Int.pipe(Schema.positive()),
  offset: Schema.Int.pipe(Schema.nonNegative())
})
export type Pagination = Schema.Schema.Type<typeof Pagination>
