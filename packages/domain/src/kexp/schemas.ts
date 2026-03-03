import { Schema } from "effect"

// === Common Types ===

export const RotationStatus = Schema.Literal("Heavy", "Medium", "Light", "R/N", "Library", "R")
export type RotationStatus = Schema.Schema.Type<typeof RotationStatus>

// === Play Entity ===

const filterStringNullSchema = Schema.transform(
  Schema.Array(Schema.NullOr(Schema.String)),
  Schema.Array(Schema.String),
  {
    decode: (value) => value.filter((v) => v !== null),
    encode: (value) => value
  }
)

export const KexpTrackPlay = Schema.Struct({
  id: Schema.Number,
  uri: Schema.String,
  airdate: Schema.String, // ISO datetime with timezone
  show: Schema.Number,
  show_uri: Schema.String,
  image_uri: Schema.NullOr(Schema.String),
  thumbnail_uri: Schema.NullOr(Schema.String),
  song: Schema.NullOr(Schema.String), // Only present for trackplay
  track_id: Schema.NullOr(Schema.String),
  recording_id: Schema.NullOr(Schema.String),
  artist: Schema.NullOr(Schema.String), // Only present for trackplay
  artist_ids: filterStringNullSchema, // Only present for trackplay
  album: Schema.NullOr(Schema.String), // Only present for trackplay
  release_id: Schema.NullOr(Schema.String),
  release_group_id: Schema.NullOr(Schema.String),
  labels: Schema.Array(Schema.String), // Only present for trackplay
  label_ids: Schema.Array(Schema.String), // Only present for trackplay
  release_date: Schema.NullOr(Schema.String), // Only present for trackplay
  rotation_status: Schema.NullOr(RotationStatus), // Only present for trackplay
  is_local: Schema.Boolean,
  is_request: Schema.Boolean,
  is_live: Schema.Boolean,
  comment: Schema.NullOr(Schema.String),
  location: Schema.Number,
  location_name: Schema.String,
  play_type: Schema.Literal("trackplay")
})

export const KexpNonTrackPlay = Schema.Struct({
  ...KexpTrackPlay.fields,
  play_type: Schema.Literal("nontrackplay")
})

export const KexpAirbreak = Schema.Struct({
  id: Schema.Number,
  uri: Schema.String,
  airdate: Schema.String,
  show: Schema.Number,
  show_uri: Schema.String,
  image_uri: Schema.String,
  thumbnail_uri: Schema.String,
  comment: Schema.NullOr(Schema.String),
  location: Schema.Number,
  location_name: Schema.String,
  play_type: Schema.Literal("airbreak")
})

// Union type for plays
export const KexpPlay = Schema.Union(KexpTrackPlay, KexpAirbreak, KexpNonTrackPlay)

// === Program Entity ===

export const KexpProgram = Schema.Struct({
  id: Schema.Number,
  uri: Schema.String,
  name: Schema.String,
  description: Schema.String,
  tags: Schema.String, // Comma-separated tags
  image_uri: Schema.String,
  thumbnail_uri: Schema.String,
  is_active: Schema.Boolean,
  location: Schema.Number,
  location_name: Schema.String
})

// === Timeslot Entity ===

export const KexpTimeslot = Schema.Struct({
  id: Schema.Number,
  uri: Schema.String,
  program: Schema.Number,
  program_uri: Schema.String,
  program_name: Schema.String,
  program_tags: Schema.String, // Comma-separated tags
  hosts: Schema.Array(Schema.Number),
  host_uris: Schema.Array(Schema.String),
  host_names: Schema.Array(Schema.String),
  weekday: Schema.Number, // 1-7 (Monday-Sunday)
  start_date: Schema.String, // YYYY-MM-DD format
  end_date: Schema.NullOr(Schema.String), // YYYY-MM-DD format or null
  start_time: Schema.String, // HH:MM:SS format
  end_time: Schema.String, // HH:MM:SS format
  duration: Schema.String // HH:MM:SS format
})

// === Show Entity ===

export const KexpShow = Schema.Struct({
  id: Schema.Number,
  uri: Schema.String,
  program: Schema.Number,
  program_uri: Schema.String,
  hosts: Schema.Array(Schema.Number),
  host_uris: Schema.Array(Schema.String),
  program_name: Schema.String,
  program_tags: Schema.String, // Comma-separated tags
  host_names: Schema.Array(Schema.String),
  tagline: Schema.String,
  image_uri: Schema.String,
  program_image_uri: Schema.String,
  start_time: Schema.String, // ISO datetime with timezone
  location: Schema.Number,
  location_name: Schema.String
})

export const KexpHost = Schema.Struct({
  id: Schema.Number,
  uri: Schema.String,
  name: Schema.String,
  image_uri: Schema.NullOr(Schema.String),
  thumbnail_uri: Schema.NullOr(Schema.String),
  is_active: Schema.Boolean,
  location: Schema.Number
})

// === API Response Wrappers ===

export const KexpPaginatedResponse = Schema.Struct({
  count: Schema.optional(Schema.Number),
  next: Schema.NullOr(Schema.String),
  previous: Schema.NullOr(Schema.String)
})

export const KexpPlaysResponse = Schema.Struct({
  ...KexpPaginatedResponse.fields,
  results: Schema.Array(KexpPlay)
})

export const KexpProgramsResponse = Schema.Struct({
  ...KexpPaginatedResponse.fields,
  results: Schema.Array(KexpProgram)
})

export const KexpTimeslotsResponse = Schema.Struct({
  ...KexpPaginatedResponse.fields,
  results: Schema.Array(KexpTimeslot)
})

export const KexpShowsResponse = Schema.Struct({
  ...KexpPaginatedResponse.fields,
  results: Schema.Array(KexpShow)
})

export const KexpHostsResponse = Schema.Struct({
  ...KexpPaginatedResponse.fields,
  results: Schema.Array(KexpHost)
})

export const isTrackPlay = (play: KexpPlay): play is KexpTrackPlay => play.play_type === "trackplay"

// Type aliases for better readability
export type KexpPlay = Schema.Schema.Type<typeof KexpPlay>
export type KexpTrackPlay = Schema.Schema.Type<typeof KexpTrackPlay>
export type KexpNonTrackPlay = Schema.Schema.Type<typeof KexpNonTrackPlay>
export type KexpAirbreak = Schema.Schema.Type<typeof KexpAirbreak>
export type KexpProgram = Schema.Schema.Type<typeof KexpProgram>
export type KexpTimeslot = Schema.Schema.Type<typeof KexpTimeslot>
export type KexpShow = Schema.Schema.Type<typeof KexpShow>
export type KexpHost = Schema.Schema.Type<typeof KexpHost>
