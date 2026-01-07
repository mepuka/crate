/**
 * DayDataCollector
 *
 * Gathers and pre-processes all plays for a given date.
 * Provides structured data for the ResearchAgent to analyze.
 *
 * Responsibilities:
 * - Fetch all plays for the target date via timeline pagination
 * - Pre-categorize plays (first plays, rotation status, local artists)
 * - Group plays by show
 * - Extract DJ comments
 * - Calculate basic statistics
 *
 * @module
 */

import { Effect, Data } from "effect"
import { FaissClient, type PlayResult } from "../FaissClient.js"
import type { Play } from "@crate/domain/faiss/schemas"

// =============================================================================
// Types
// =============================================================================

/**
 * A play with pre-computed categorization info
 */
export interface CategorizedPlay {
  readonly play: Play
  readonly isFirstPlay: boolean // First time this recording played on KEXP
  readonly isFirstArtist: boolean // First time this artist played on KEXP
  readonly isRecentRelease: boolean // Released within last 30 days
  readonly hasRotation: boolean // Has rotation_status set
  readonly isLocal: boolean
  readonly isLive: boolean
  readonly isRequest: boolean
  readonly hasComment: boolean
  readonly comment: string | null
}

/**
 * Plays grouped by show
 */
export interface ShowGroup {
  readonly showId: number
  readonly showName: string | null
  readonly startTime: Date
  readonly endTime: Date
  readonly plays: readonly CategorizedPlay[]
  readonly comments: readonly string[]
  readonly localCount: number
  readonly rotationCount: number
  readonly requestCount: number
}

/**
 * Summary statistics for the day
 */
export interface DayStats {
  readonly totalPlays: number
  readonly uniqueArtists: number
  readonly uniqueAlbums: number
  readonly uniqueRecordings: number
  readonly firstPlaysCount: number
  readonly localArtistCount: number
  readonly livePerformanceCount: number
  readonly requestCount: number
  readonly showCount: number
  readonly playsWithComments: number
  readonly rotationPlays: number
}

/**
 * Complete data collected for a day
 */
export interface DayData {
  readonly date: string // YYYY-MM-DD
  readonly plays: readonly CategorizedPlay[]
  readonly showGroups: readonly ShowGroup[]
  readonly stats: DayStats

  // Pre-filtered subsets for research
  readonly firstPlays: readonly CategorizedPlay[] // Never played before
  readonly rotationPlays: readonly CategorizedPlay[] // In rotation
  readonly localPlays: readonly CategorizedPlay[] // Local artists
  readonly livePlays: readonly CategorizedPlay[] // Live performances
  readonly requestPlays: readonly CategorizedPlay[] // Listener requests
  readonly playsWithComments: readonly CategorizedPlay[] // Has DJ comment

  // All unique artists/albums/recordings for deduplication
  readonly uniqueArtistMbids: ReadonlySet<string>
  readonly uniqueRecordingMbids: ReadonlySet<string>
  readonly uniqueReleaseMbids: ReadonlySet<string>
}

// =============================================================================
// Service Interface
// =============================================================================

export interface DayDataCollectorInterface {
  /**
   * Collect all data for a specific date
   */
  readonly collectDay: (date: string) => Effect.Effect<DayData, DayDataCollectorError>
}

/**
 * Error type for collection failures
 */
export class DayDataCollectorError extends Data.TaggedError("DayDataCollectorError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// =============================================================================
// Service Definition (Effect.Service pattern)
// =============================================================================

export class DayDataCollector extends Effect.Service<DayDataCollector>()(
  "DayDataCollector",
  {
    effect: Effect.gen(function* () {
      const faiss = yield* FaissClient

      const collectDay = (date: string): Effect.Effect<DayData, DayDataCollectorError> =>
        Effect.gen(function* () {
          yield* Effect.log(`Collecting data for ${date}`)

          const { since, until } = getDayBounds(date)
          const targetDate = new Date(`${date}T12:00:00Z`) // Noon for release date comparison

          // Parse date bounds for client-side filtering
          // (cursor is NOT date-scoped, so we filter client-side)
          const sinceBound = new Date(since)
          const untilBound = new Date(until)

          // Collect all plays via pagination
          // Note: Timeline API doesn't allow combining cursor with since/until
          // First request uses time range, subsequent requests use cursor only
          const allPlays: Play[] = []
          let cursor: string | null = null
          let hasMore = true
          let isFirstRequest = true
          let reachedDateBoundary = false

          while (hasMore && !reachedDateBoundary) {
            // First request: use since/until to set the time range
            // Subsequent requests: use cursor only (cursor encodes position within range)
            const params = isFirstRequest
              ? { since, until, limit: 200 }
              : { cursor: cursor!, limit: 200 }

            const response = yield* faiss.timeline(params).pipe(
              Effect.mapError(e => new DayDataCollectorError({ message: `Timeline fetch failed: ${e.message}`, cause: e }))
            )

            // Filter plays within the target date range (client-side)
            // Cursor is NOT date-scoped, so page 2+ could include plays outside our range
            for (const play of response.results) {
              if (isWithinDateRange(play.airdate, sinceBound, untilBound)) {
                allPlays.push(play)
              } else if (play.airdate < sinceBound) {
                // We've gone past our date range (plays are ordered DESC by airdate)
                // Stop pagination - no more plays will be in range
                reachedDateBoundary = true
                yield* Effect.log(`Reached date boundary at ${play.airdate.toISOString()}, stopping pagination`)
                break
              }
              // If play.airdate > untilBound, skip it but continue (could be ordering edge case)
            }

            cursor = response.next_cursor
            hasMore = response.has_more
            isFirstRequest = false

            yield* Effect.log(`Fetched ${allPlays.length} plays so far...`)
          }

          yield* Effect.log(`Total plays collected: ${allPlays.length}`)

          // Categorize all plays
          const categorizedPlays = allPlays.map(play => categorizePlay(play, targetDate))

          // Group by show
          const showGroups = groupByShow(categorizedPlays)

          // Calculate statistics
          const stats = calculateStats(categorizedPlays)

          // Extract unique MBIDs
          const { artistMbids, recordingMbids, releaseMbids } = extractUniqueMbids(categorizedPlays)

          // Pre-filter subsets
          const firstPlays = categorizedPlays.filter(p => p.isFirstPlay)
          const rotationPlays = categorizedPlays.filter(p => p.hasRotation)
          const localPlays = categorizedPlays.filter(p => p.isLocal)
          const livePlays = categorizedPlays.filter(p => p.isLive)
          const requestPlays = categorizedPlays.filter(p => p.isRequest)
          const playsWithComments = categorizedPlays.filter(p => p.hasComment)

          return {
            date,
            plays: categorizedPlays,
            showGroups,
            stats,
            firstPlays,
            rotationPlays,
            localPlays,
            livePlays,
            requestPlays,
            playsWithComments,
            uniqueArtistMbids: artistMbids,
            uniqueRecordingMbids: recordingMbids,
            uniqueReleaseMbids: releaseMbids
          }
        })

      return { collectDay } satisfies DayDataCollectorInterface
    }),
    dependencies: [FaissClient.Default]
  }
) {}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Check if a release date is within the last N days of the play date
 */
const isRecentRelease = (play: Play, targetDate: Date, daysWindow: number = 30): boolean => {
  if (!play.release_date) return false
  const releaseDate = play.release_date
  const windowStart = new Date(targetDate)
  windowStart.setDate(windowStart.getDate() - daysWindow)
  return releaseDate >= windowStart && releaseDate <= targetDate
}

/**
 * Parse a date string to get start/end of day in UTC
 *
 * Timezone Strategy:
 * - The KEXP API stores all airdates in UTC
 * - We query using UTC date bounds for consistency with the API
 * - Display formatting (in prompts) converts to Pacific timezone
 *   for human readability, since KEXP is in Seattle
 *
 * Note: Returns ISO format with +00:00 suffix instead of Z
 * because Python's datetime.fromisoformat() doesn't accept Z in Python <3.11
 */
const getDayBounds = (dateStr: string): { since: string; until: string } => {
  // Create date at midnight UTC
  // This means a query for "2024-01-15" gets all plays from
  // 2024-01-15T00:00:00Z to 2024-01-16T00:00:00Z
  const date = new Date(`${dateStr}T00:00:00Z`)
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)

  // Replace Z with +00:00 for Python compatibility
  return {
    since: date.toISOString().replace('Z', '+00:00'),
    until: nextDay.toISOString().replace('Z', '+00:00')
  }
}

/**
 * Categorize a single play
 * Note: isFirstPlay/isFirstArtist require historical lookup - set to false initially
 * The ResearchAgent will do deeper analysis using graph queries
 */
const categorizePlay = (play: Play, targetDate: Date): CategorizedPlay => ({
  play,
  isFirstPlay: false, // Will be determined by ResearchAgent via graph
  isFirstArtist: false, // Will be determined by ResearchAgent via graph
  isRecentRelease: isRecentRelease(play, targetDate),
  hasRotation: play.rotation_status !== null && play.rotation_status !== "",
  isLocal: play.is_local,
  isLive: play.is_live,
  isRequest: play.is_request,
  hasComment: play.comment !== null && play.comment.trim() !== "",
  comment: play.comment
})

/**
 * Group plays by show ID
 */
const groupByShow = (plays: readonly CategorizedPlay[]): readonly ShowGroup[] => {
  const groupsMap = new Map<number, CategorizedPlay[]>()

  for (const play of plays) {
    const showId = play.play.show
    const existing = groupsMap.get(showId) || []
    existing.push(play)
    groupsMap.set(showId, existing)
  }

  const groups: ShowGroup[] = []

  for (const [showId, showPlays] of groupsMap) {
    // Sort plays by airdate within show
    const sorted = [...showPlays].sort(
      (a, b) => a.play.airdate.getTime() - b.play.airdate.getTime()
    )

    const comments = sorted
      .filter(p => p.hasComment && p.comment)
      .map(p => p.comment!)

    groups.push({
      showId,
      showName: null, // Would need show metadata lookup
      startTime: sorted[0].play.airdate,
      endTime: sorted[sorted.length - 1].play.airdate,
      plays: sorted,
      comments,
      localCount: sorted.filter(p => p.isLocal).length,
      rotationCount: sorted.filter(p => p.hasRotation).length,
      requestCount: sorted.filter(p => p.isRequest).length
    })
  }

  // Sort shows by start time
  return groups.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
}

/**
 * Calculate statistics from plays
 */
const calculateStats = (plays: readonly CategorizedPlay[]): DayStats => {
  const uniqueArtists = new Set<string>()
  const uniqueAlbums = new Set<string>()
  const uniqueRecordings = new Set<string>()
  const uniqueShows = new Set<number>()

  for (const { play } of plays) {
    // Track unique artists via MBIDs
    for (const mbid of play.artist_mbid) {
      uniqueArtists.add(mbid)
    }
    // Track unique recordings
    if (play.recording_mbid) uniqueRecordings.add(play.recording_mbid)
    // Track unique albums
    if (play.release_mbid) uniqueAlbums.add(play.release_mbid)
    // Track shows
    uniqueShows.add(play.show)
  }

  return {
    totalPlays: plays.length,
    uniqueArtists: uniqueArtists.size,
    uniqueAlbums: uniqueAlbums.size,
    uniqueRecordings: uniqueRecordings.size,
    firstPlaysCount: plays.filter(p => p.isFirstPlay).length,
    localArtistCount: plays.filter(p => p.isLocal).length,
    livePerformanceCount: plays.filter(p => p.isLive).length,
    requestCount: plays.filter(p => p.isRequest).length,
    showCount: uniqueShows.size,
    playsWithComments: plays.filter(p => p.hasComment).length,
    rotationPlays: plays.filter(p => p.hasRotation).length
  }
}

/**
 * Extract unique MBIDs
 */
const extractUniqueMbids = (plays: readonly CategorizedPlay[]) => {
  const artistMbids = new Set<string>()
  const recordingMbids = new Set<string>()
  const releaseMbids = new Set<string>()

  for (const { play } of plays) {
    for (const mbid of play.artist_mbid) {
      artistMbids.add(mbid)
    }
    if (play.recording_mbid) recordingMbids.add(play.recording_mbid)
    if (play.release_mbid) releaseMbids.add(play.release_mbid)
  }

  return { artistMbids, recordingMbids, releaseMbids }
}

/**
 * Check if a play's airdate falls within the target date (inclusive)
 *
 * @param playAirdate - The play's airdate as a Date object
 * @param sinceBound - Start of target date (midnight UTC)
 * @param untilBound - End of target date (midnight UTC next day)
 */
const isWithinDateRange = (playAirdate: Date, sinceBound: Date, untilBound: Date): boolean => {
  return playAirdate >= sinceBound && playAirdate < untilBound
}

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for DayDataCollector
 * Uses Effect.Service.Default which auto-composes FaissClient dependency
 */
export const DayDataCollectorLive = DayDataCollector.Default
