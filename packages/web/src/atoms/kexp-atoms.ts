/**
 * KEXP Data State Management
 *
 * Provides state management for KEXP programs and shows data using a backing store.
 * These values are populated by the KEXP worker and used throughout the application.
 *
 * Architecture:
 * - Singleton state object that holds all KEXP data
 * - Update functions to modify state from worker messages
 * - Atoms that read from the state object
 * - Derived computations for show-to-program lookup
 *
 * Usage:
 * ```tsx
 * import { useAtomValue } from "@effect-atom/atom-react"
 * import { programsMapAtom, showsMapAtom } from "@/atoms/kexp-atoms"
 *
 * function MyComponent() {
 *   const programs = useAtomValue(programsMapAtom)
 *   const shows = useAtomValue(showsMapAtom)
 *   // ...
 * }
 * ```
 */

import { Atom } from "@effect-atom/atom"
import type { Kexp } from "@crate/domain"
import type { Play } from "@/domain/Play"

// Re-export types for convenience
type KexpProgram = Kexp.KexpProgram
type KexpShow = Kexp.KexpShow

// === Backing Store ===

/**
 * Internal state object that holds all KEXP data
 * This is the source of truth that atoms read from
 */
const kexpState = {
  programsMap: new Map<number, KexpProgram>(),
  showsMap: new Map<number, KexpShow>(),
  programsLoading: false,
  showsLoading: false,
  programsError: null as string | null,
  showsError: null as string | null,
  programsTimestamp: null as string | null,
  showsTimestamp: null as string | null,
  programsCached: false,
  showsCached: false,
  // Increment this to trigger atom updates
  version: 0
}

/**
 * Update the programs data
 */
export function updatePrograms(programs: readonly KexpProgram[], timestamp: string, cached: boolean) {
  kexpState.programsMap = new Map(programs.map((p) => [p.id, p]))
  kexpState.programsTimestamp = timestamp
  kexpState.programsCached = cached
  kexpState.programsLoading = false
  kexpState.programsError = null
  kexpState.version++
}

/**
 * Update the shows data
 */
export function updateShows(shows: readonly KexpShow[], timestamp: string, cached: boolean) {
  kexpState.showsMap = new Map(shows.map((s) => [s.id, s]))
  kexpState.showsTimestamp = timestamp
  kexpState.showsCached = cached
  kexpState.showsLoading = false
  kexpState.showsError = null
  kexpState.version++
}

/**
 * Set programs loading state
 */
export function setProgramsLoading(loading: boolean) {
  kexpState.programsLoading = loading
  kexpState.version++
}

/**
 * Set shows loading state
 */
export function setShowsLoading(loading: boolean) {
  kexpState.showsLoading = loading
  kexpState.version++
}

/**
 * Set programs error state
 */
export function setProgramsError(error: string | null) {
  kexpState.programsError = error
  kexpState.programsLoading = false
  kexpState.version++
}

/**
 * Set shows error state
 */
export function setShowsError(error: string | null) {
  kexpState.showsError = error
  kexpState.showsLoading = false
  kexpState.version++
}

// === Atoms (Read from state) ===

/**
 * Map of program ID -> KexpProgram
 * Populated by the KEXP worker when programs are fetched
 */
export const programsMapAtom = Atom.make<Map<number, KexpProgram>>(() => {
  // Read current version to trigger re-evaluation
  kexpState.version
  return kexpState.programsMap
})

/**
 * Map of show ID -> KexpShow
 * Populated by the KEXP worker when shows are fetched
 */
export const showsMapAtom = Atom.make<Map<number, KexpShow>>(() => {
  // Read current version to trigger re-evaluation
  kexpState.version
  return kexpState.showsMap
})

/**
 * Loading state for programs data
 */
export const programsLoadingAtom = Atom.make<boolean>(() => {
  kexpState.version
  return kexpState.programsLoading
})

/**
 * Loading state for shows data
 */
export const showsLoadingAtom = Atom.make<boolean>(() => {
  kexpState.version
  return kexpState.showsLoading
})

/**
 * Timestamp of the programs data (ISO string)
 */
export const programsTimestampAtom = Atom.make<string | null>(() => {
  kexpState.version
  return kexpState.programsTimestamp
})

/**
 * Timestamp of the shows data (ISO string)
 */
export const showsTimestampAtom = Atom.make<string | null>(() => {
  kexpState.version
  return kexpState.showsTimestamp
})

/**
 * Whether the current programs data came from cache
 */
export const programsCachedAtom = Atom.make<boolean>(() => {
  kexpState.version
  return kexpState.programsCached
})

/**
 * Whether the current shows data came from cache
 */
export const showsCachedAtom = Atom.make<boolean>(() => {
  kexpState.version
  return kexpState.showsCached
})

/**
 * Error message for programs data (null if no error)
 */
export const programsErrorAtom = Atom.make<string | null>(() => {
  kexpState.version
  return kexpState.programsError
})

/**
 * Error message for shows data (null if no error)
 */
export const showsErrorAtom = Atom.make<string | null>(() => {
  kexpState.version
  return kexpState.showsError
})

// === Derived Atoms ===

/**
 * Derived atom: Map from show ID -> program
 * Provides O(1) lookup of a show's program without traversing maps
 */
export const showToProgramMapAtom = Atom.make((get) => {
  const shows = get.get(showsMapAtom)
  const programs = get.get(programsMapAtom)
  const map = new Map<number, KexpProgram>()

  shows.forEach((show) => {
    const program = programs.get(show.program)
    if (program) {
      map.set(show.id, program)
    }
  })

  return map
})

// === Show Boundaries Types ===

/**
 * Represents a show transition point in the timeline
 */
export interface ShowBoundary {
  timestamp: Date | string
  showId: number
  programName?: string
  programId?: number
  hostNames?: readonly string[]
}

/**
 * Factory function to create a derived atom for computing show boundaries
 * from a plays atom.
 *
 * Show boundaries are points in the timeline where the show changes.
 * They're used to render visual markers indicating show transitions.
 *
 * @param playsAtom - An atom that provides an array of plays
 * @returns An atom that computes show boundaries
 *
 * @example
 * ```tsx
 * import { playsChunkAtom } from "@/atoms/timeline"
 * import { Chunk } from "effect"
 *
 * const playsArrayAtom = Atom.make((get) => {
 *   const chunk = get.get(playsChunkAtom)
 *   return Chunk.toReadonlyArray(chunk)
 * })
 *
 * const boundaries = createShowBoundariesAtom(playsArrayAtom)
 * ```
 */
export function createShowBoundariesAtom(
  playsAtom: Atom.Atom<readonly Play[]>
): Atom.Atom<ShowBoundary[]> {
  return Atom.make((get) => {
    const plays = get.get(playsAtom)
    const shows = get.get(showsMapAtom)
    const boundaries: ShowBoundary[] = []

    plays.forEach((play, idx) => {
      const prevPlay = plays[idx - 1]
      const isNewShow = !prevPlay || prevPlay.show !== play.show

      if (isNewShow) {
        const showInfo = shows.get(play.show)
        boundaries.push({
          timestamp: play.airdate as Date | string,
          showId: play.show as number,
          programName: showInfo?.program_name ?? undefined,
          programId: showInfo?.program ?? undefined,
          hostNames: showInfo?.host_names ?? undefined
        } as ShowBoundary)
      }
    })

    return boundaries
  })
}
