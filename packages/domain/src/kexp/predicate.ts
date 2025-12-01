import { Predicate, Duration, Equal, DateTime } from "effect"
import type { PlayResult } from "../faiss/schemas.js"

/**
 * A SemanticPredicate combines a functional predicate with a natural language description.
 * This allows us to filter plays while also being able to describe the filter to an LLM.
 */
export interface SemanticPredicate<A> {
  readonly check: Predicate.Predicate<A>
  readonly description: string
}

/**
 * Create a SemanticPredicate from a check function and a description.
 */
export const make = <A>(check: Predicate.Predicate<A>, description: string): SemanticPredicate<A> => ({
  check,
  description
})

// === Combinators ===

export const and = <A>(self: SemanticPredicate<A>, that: SemanticPredicate<A>): SemanticPredicate<A> =>
  make(
    Predicate.and(self.check, that.check),
    `(${self.description} and ${that.description})`
  )

export const or = <A>(self: SemanticPredicate<A>, that: SemanticPredicate<A>): SemanticPredicate<A> =>
  make(
    Predicate.or(self.check, that.check),
    `(${self.description} or ${that.description})`
  )

export const not = <A>(self: SemanticPredicate<A>): SemanticPredicate<A> =>
  make(
    Predicate.not(self.check),
    `not (${self.description})`
  )

// === KEXP Play Predicates ===

export const artist = (name: string): SemanticPredicate<PlayResult> =>
  make(
    (play) => play.artist.toLowerCase().includes(name.toLowerCase()),
    `artist name contains "${name}"`
  )

export const song = (title: string): SemanticPredicate<PlayResult> =>
  make(
    (play) => play.song.toLowerCase().includes(title.toLowerCase()),
    `song title contains "${title}"`
  )

export const album = (name: string): SemanticPredicate<PlayResult> =>
  make(
    (play) => (play.album ? play.album.toLowerCase().includes(name.toLowerCase()) : false),
    `album name contains "${name}"`
  )

export const isLive: SemanticPredicate<PlayResult> = make(
  (play) => play.is_live,
  "is a live performance"
)

export const isRequest: SemanticPredicate<PlayResult> = make(
  (play) => play.is_request,
  "is a listener request"
)

export const isLocal: SemanticPredicate<PlayResult> = make(
  (play) => play.is_local,
  "is a local artist"
)


export const hasComment: SemanticPredicate<PlayResult> = make(
  (play) => play.comment !== null && play.comment.length > 0,
  "has a comment"
)

// === Temporal Predicates ===

export const after = (date: DateTime.DateTime): SemanticPredicate<PlayResult> =>
  make(
    (play) => {
      const airdate = DateTime.unsafeFromDate(play.airdate)
      return DateTime.greaterThan(airdate, date)
    },
    `aired after ${DateTime.formatIso(date)}`
  )

export const before = (date: DateTime.DateTime): SemanticPredicate<PlayResult> =>
  make(
    (play) => {
      const airdate = DateTime.unsafeFromDate(play.airdate)
      return DateTime.lessThan(airdate, date)
    },
    `aired before ${DateTime.formatIso(date)}`
  )

export const between = (start: DateTime.DateTime, end: DateTime.DateTime): SemanticPredicate<PlayResult> =>
  make(
    (play) => {
      const airdate = DateTime.unsafeFromDate(play.airdate)
      return DateTime.greaterThan(airdate, start) && DateTime.lessThan(airdate, end)
    },
    `aired between ${DateTime.formatIso(start)} and ${DateTime.formatIso(end)}`
  )

export const recent = (duration: Duration.Duration): SemanticPredicate<PlayResult> =>
  make((play) => {
    const now = DateTime.unsafeNow()
    const airdate = DateTime.unsafeFromDate(play.airdate)
    // distanceDuration returns Option in some versions, or Duration.
    // Assuming it returns Duration or we calculate diff manually if needed.
    // Let's try DateTime.distanceDuration(start, end)
    // If distanceDuration is not available, we might need to use toEpochMillis.
    // Let's assume distanceDuration works as I saw it in some docs, or use diff.
    // Actually, let's stick to a safer approach if unsure:
    const diff = Duration.millis(DateTime.toEpochMillis(now) - DateTime.toEpochMillis(airdate))
    return Duration.lessThanOrEqualTo(diff, duration)
  }, `aired in the last ${Duration.format(duration)}`)

export const releasedAfter = (date: DateTime.DateTime): SemanticPredicate<PlayResult> =>
  make(
    (play) => {
      if (!play.release_date) return false
      const releaseDate = DateTime.unsafeFromDate(play.release_date)
      return DateTime.greaterThan(releaseDate, date)
    },
    `released after ${DateTime.formatIso(date)}`
  )


export const releasedBefore = (date: DateTime.DateTime): SemanticPredicate<PlayResult> =>
  make(
    (play) => {
      if (!play.release_date) return false
      const releaseDate = DateTime.unsafeFromDate(play.release_date)
      return DateTime.lessThan(releaseDate, date)
    },
    `released before ${DateTime.formatIso(date)}`
  )


// === MBID Predicates ===

export const hasArtistMbid = (mbid: string): SemanticPredicate<PlayResult> =>
  make(
    (play) => play.artist_mbid.some((id) => Equal.equals(id, mbid)),
    `has artist MBID "${mbid}"`
  )

export const hasRecordingMbid = (mbid: string): SemanticPredicate<PlayResult> =>
  make(
    (play) => Equal.equals(play.recording_mbid, mbid),
    `has recording MBID "${mbid}"`
  )

export const hasReleaseMbid = (mbid: string): SemanticPredicate<PlayResult> =>
  make(
    (play) => Equal.equals(play.release_mbid, mbid),
    `has release MBID "${mbid}"`
  )

export const hasReleaseGroupMbid = (mbid: string): SemanticPredicate<PlayResult> =>
  make(
    (play) => Equal.equals(play.release_group_mbid, mbid),
    `has release group MBID "${mbid}"`
  )

export const hasAnyArtistMbid: SemanticPredicate<PlayResult> = make(
  (play) => play.artist_mbid.length > 0,
  "has any artist MBID"
)

export const hasAnyRecordingMbid: SemanticPredicate<PlayResult> = make(
  (play) => play.recording_mbid !== null,
  "has any recording MBID"
)

export const hasAnyReleaseMbid: SemanticPredicate<PlayResult> = make(
  (play) => play.release_mbid !== null,
  "has any release MBID"
)


export const hasAnyReleaseGroupMbid: SemanticPredicate<PlayResult> = make(
  (play) => play.release_group_mbid !== null,
  "has any release group MBID"
)

// === Label Predicates ===

export const hasLabel = (name: string): SemanticPredicate<PlayResult> =>
  make(
    (play) => play.labels.some((label) => label.toLowerCase().includes(name.toLowerCase())),
    `released on label "${name}"`
  )

export const hasAnyLabel: SemanticPredicate<PlayResult> = make(
  (play) => play.labels.length > 0,
  "has any label"
)

// === Additional Temporal Predicates ===


export const releasedBetween = (start: Date, end: Date): SemanticPredicate<PlayResult> =>
  make(
    (play) => (play.release_date ? play.release_date >= start && play.release_date <= end : false),
    `released between ${start.toISOString()} and ${end.toISOString()}`
  )

// === Existence Predicates ===

export const hasAlbum: SemanticPredicate<PlayResult> = make(
  (play) => play.album !== null && play.album.length > 0,
  "has an album"
)

export const hasReleaseDate: SemanticPredicate<PlayResult> = make(
  (play) => play.release_date !== null,
  "has a release date"
)

export const hasImage: SemanticPredicate<PlayResult> = make(
  (play) => play.image_uri !== null && play.image_uri.length > 0,
  "has an image"
)

export const hasThumbnail: SemanticPredicate<PlayResult> = make(
  (play) => play.thumbnail_uri !== null && play.thumbnail_uri.length > 0,
  "has a thumbnail"
)

export const hasRotationStatus: SemanticPredicate<PlayResult> = make(
  (play) => play.rotation_status !== null && play.rotation_status.length > 0,
  "has a rotation status"
)

// === Rotation Predicates ===

export const isHeavyRotation: SemanticPredicate<PlayResult> = make(
  (play) => Equal.equals(play.rotation_status, "Heavy"),
  "is in heavy rotation"
)

export const isMediumRotation: SemanticPredicate<PlayResult> = make(
  (play) => Equal.equals(play.rotation_status, "Medium"),
  "is in medium rotation"
)

export const isLightRotation: SemanticPredicate<PlayResult> = make(
  (play) => Equal.equals(play.rotation_status, "Light"),
  "is in light rotation"
)

export const isLibraryRotation: SemanticPredicate<PlayResult> = make(
  (play) => Equal.equals(play.rotation_status, "Library"),
  "is in library rotation"
)


export const isRNRotation: SemanticPredicate<PlayResult> = make(
  (play) => Equal.equals(play.rotation_status, "R/N"),
  "is in R/N rotation"
)

// === Program Predicates ===

import type { KexpProgram, KexpShow, KexpHost, KexpTimeslot } from "./schemas.js"

export const programHasName = (name: string): SemanticPredicate<KexpProgram> =>
  make(
    (program) => program.name.toLowerCase().includes(name.toLowerCase()),
    `program name contains "${name}"`
  )

export const programIsActive: SemanticPredicate<KexpProgram> = make(
  (program) => program.is_active,
  "program is active"
)

export const programHasTag = (tag: string): SemanticPredicate<KexpProgram> =>
  make(
    (program) => program.tags.toLowerCase().includes(tag.toLowerCase()),
    `program has tag "${tag}"`
  )

// === Show Predicates ===

export const showHasProgramName = (name: string): SemanticPredicate<KexpShow> =>
  make(
    (show) => show.program_name.toLowerCase().includes(name.toLowerCase()),
    `show program name contains "${name}"`
  )

export const showHasHost = (name: string): SemanticPredicate<KexpShow> =>
  make(
    (show) => show.host_names.some((host) => host.toLowerCase().includes(name.toLowerCase())),
    `show has host "${name}"`
  )

export const showHasTagline = (tagline: string): SemanticPredicate<KexpShow> =>
  make(
    (show) => show.tagline.toLowerCase().includes(tagline.toLowerCase()),
    `show tagline contains "${tagline}"`
  )

// === Host Predicates ===

export const hostHasName = (name: string): SemanticPredicate<KexpHost> =>
  make(
    (host) => host.name.toLowerCase().includes(name.toLowerCase()),
    `host name contains "${name}"`
  )

export const hostIsActive: SemanticPredicate<KexpHost> = make(
  (host) => host.is_active,
  "host is active"
)

// === Timeslot Predicates ===

export const timeslotHasProgramName = (name: string): SemanticPredicate<KexpTimeslot> =>
  make(
    (timeslot) => timeslot.program_name.toLowerCase().includes(name.toLowerCase()),
    `timeslot program name contains "${name}"`
  )

export const timeslotHasHost = (name: string): SemanticPredicate<KexpTimeslot> =>
  make(
    (timeslot) => timeslot.host_names.some((host) => host.toLowerCase().includes(name.toLowerCase())),
    `timeslot has host "${name}"`
  )

export const timeslotIsOnWeekday = (weekday: number): SemanticPredicate<KexpTimeslot> =>
  make(
    (timeslot) => Equal.equals(timeslot.weekday, weekday),
    `timeslot is on weekday ${weekday}`
  )

// Helper to parse "HH:MM:SS" to Duration
const parseDurationString = (s: string): Duration.Duration => {
  const [hours, minutes, seconds] = s.split(":").map(Number)
  return Duration.sum(
    Duration.hours(hours),
    Duration.sum(Duration.minutes(minutes), Duration.seconds(seconds))
  )
}

export const timeslotHasDuration = (duration: Duration.Duration): SemanticPredicate<KexpTimeslot> =>
  make(
    (timeslot) => Equal.equals(parseDurationString(timeslot.duration), duration),
    `timeslot duration is ${Duration.format(duration)}`
  )

export const timeslotLongerThan = (duration: Duration.Duration): SemanticPredicate<KexpTimeslot> =>
  make(
    (timeslot) => Duration.greaterThan(parseDurationString(timeslot.duration), duration),
    `timeslot longer than ${Duration.format(duration)}`
  )

export const timeslotShorterThan = (duration: Duration.Duration): SemanticPredicate<KexpTimeslot> =>
  make(
    (timeslot) => Duration.lessThan(parseDurationString(timeslot.duration), duration),
    `timeslot shorter than ${Duration.format(duration)}`
  )
