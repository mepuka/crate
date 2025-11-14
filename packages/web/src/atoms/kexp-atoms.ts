/**
 * KEXP Data State Management
 *
 * Provides state management for KEXP programs and shows data using Effect-based atoms.
 * Uses the main TimelineRuntime for consistent runtime management.
 *
 * Architecture:
 * - Uses TimelineRuntime.atom() for Effect execution
 * - Caching via Effect.cached with proper TTL
 * - Immutable HashMap for O(1) lookups
 * - Result.matchWithWaiting for safe Result handling
 * - Derived atoms for common access patterns
 *
 * Usage:
 * ```tsx
 * import { useAtomValue } from "@effect-atom/atom-react"
 * import { Result } from "@effect-atom/atom"
 * import { programsMapAtom, showsMapAtom } from "@/atoms/kexp-atoms"
 *
 * function MyComponent() {
 *   const programsMap = useAtomValue(programsMapAtom)  // HashMap<number, KexpProgram>
 *   const showsMap = useAtomValue(showsMapAtom)        // HashMap<number, KexpShow>
 *
 *   return <div>Programs: {HashMap.size(programsMap)}</div>
 * }
 * ```
 */

import { Atom, Result } from "@effect-atom/atom"
import { Effect, Layer, HashMap, Option } from "effect"
import { FetchHttpClient } from "@effect/platform"
import type { Kexp } from "@crate/domain"
import type { Play } from "@/domain/Play"
import { KexpApiService, KexpApiServiceLive } from "@/services/kexp-api-service"
import { TimelineRuntime } from "@/lib/http-runtime"

// Re-export types for convenience
type KexpProgram = Kexp.KexpProgram
type KexpShow = Kexp.KexpShow

// === Layer Setup ===

/**
 * Layer providing KEXP API service
 * Will be provided to TimelineRuntime for use in atoms
 */
const KexpLayer = Layer.provide(KexpApiServiceLive, FetchHttpClient.layer)

// === Fetch Effects with Caching ===

/**
 * Effect that fetches programs from KEXP API
 * Pattern: Effect.gen with service access
 */
const fetchProgramsEffect = Effect.gen(function* () {
  yield* Effect.logInfo("Fetching programs from KEXP API")
  const apiService = yield* KexpApiService
  const response = yield* apiService.fetchPrograms

  const programsMap = HashMap.fromIterable(
    response.results.map((p) => [p.id, p] as const)
  )

  yield* Effect.logInfo(`Fetched ${response.results.length} programs`)
  return programsMap
}).pipe(Effect.provide(KexpLayer))

/**
 * Effect that fetches shows from KEXP API
 * Pattern: Effect.gen with service access
 */
const fetchShowsEffect = Effect.gen(function* () {
  const limit = 200
  yield* Effect.logInfo(`Fetching shows from KEXP API (limit: ${limit})`)
  const apiService = yield* KexpApiService
  const response = yield* apiService.fetchShows(limit)

  const showsMap = HashMap.fromIterable(
    response.results.map((s) => [s.id, s] as const)
  )

  yield* Effect.logInfo(`Fetched ${response.results.length} shows`)
  return showsMap
}).pipe(Effect.provide(KexpLayer))

// === Runtime Atoms ===

/**
 * Private atom that executes the cached programs effect
 * Pattern: TimelineRuntime.atom with cachedWithTTL for runtime-scoped caching
 * Cache scoped to runtime lifecycle with 24-hour TTL
 *
 * cachedWithTTL returns Effect<Effect<A>> which needs to be flatMapped
 */
const _programsAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const cached = yield* fetchProgramsEffect.pipe(
      Effect.cachedWithTTL("24 hours")
    )
    return yield* cached
  })
)

/**
 * Private atom that executes the cached shows effect
 * Pattern: TimelineRuntime.atom with cachedWithTTL for runtime-scoped caching
 * Cache scoped to runtime lifecycle with 24-hour TTL
 *
 * cachedWithTTL returns Effect<Effect<A>> which needs to be flatMapped
 */
const _showsAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const cached = yield* fetchShowsEffect.pipe(
      Effect.cachedWithTTL("24 hours")
    )
    return yield* cached
  })
)

// === Public Derived Atoms ===

/**
 * HashMap of program ID -> KexpProgram
 * Pattern: Result.matchWithWaiting for safe Result handling
 * Returns empty HashMap while loading or on error
 */
export const programsMapAtom = Atom.make((get) => {
  const result = get.get(_programsAtom)
  return Result.matchWithWaiting(result, {
    onWaiting: () => HashMap.empty<number, KexpProgram>(),
    onSuccess: (s) => s.value,
    onError: () => HashMap.empty<number, KexpProgram>(),
    onDefect: () => HashMap.empty<number, KexpProgram>()
  })
})

/**
 * HashMap of show ID -> KexpShow
 * Pattern: Result.matchWithWaiting for safe Result handling
 * Returns empty HashMap while loading or on error
 */
export const showsMapAtom = Atom.make((get) => {
  const result = get.get(_showsAtom)
  return Result.matchWithWaiting(result, {
    onWaiting: () => HashMap.empty<number, KexpShow>(),
    onSuccess: (s) => s.value,
    onError: () => HashMap.empty<number, KexpShow>(),
    onDefect: () => HashMap.empty<number, KexpShow>()
  })
})

/**
 * Loading state for programs data
 * Pattern: Result.matchWithWaiting with boolean return
 */
export const programsLoadingAtom = Atom.make<boolean>((get) => {
  const result = get.get(_programsAtom)
  return Result.matchWithWaiting(result, {
    onWaiting: () => true,
    onSuccess: () => false,
    onError: () => false,
    onDefect: () => false
  })
})

/**
 * Loading state for shows data
 * Pattern: Result.matchWithWaiting with boolean return
 */
export const showsLoadingAtom = Atom.make<boolean>((get) => {
  const result = get.get(_showsAtom)
  return Result.matchWithWaiting(result, {
    onWaiting: () => true,
    onSuccess: () => false,
    onError: () => false,
    onDefect: () => false
  })
})

/**
 * Error message for programs data (null if no error)
 * Pattern: Result.matchWithWaiting for error extraction
 */
export const programsErrorAtom = Atom.make<string | null>((get) => {
  const result = get.get(_programsAtom)
  return Result.matchWithWaiting(result, {
    onWaiting: () => null,
    onSuccess: () => null,
    onError: () => "Failed to load programs",
    onDefect: () => "Unexpected error loading programs"
  })
})

/**
 * Error message for shows data (null if no error)
 * Pattern: Result.matchWithWaiting for error extraction
 */
export const showsErrorAtom = Atom.make<string | null>((get) => {
  const result = get.get(_showsAtom)
  return Result.matchWithWaiting(result, {
    onWaiting: () => null,
    onSuccess: () => null,
    onError: () => "Failed to load shows",
    onDefect: () => "Unexpected error loading shows"
  })
})

/**
 * Derived atom: HashMap from show ID -> program
 * Pattern: HashMap composition with Option.match for safe access
 * Provides O(1) lookup of a show's program without traversing maps
 */
export const showToProgramMapAtom = Atom.make((get) => {
  const shows = get.get(showsMapAtom)
  const programs = get.get(programsMapAtom)

  return HashMap.reduce(
    shows,
    HashMap.empty<number, KexpProgram>(),
    (acc, show) => {
      const programOption = HashMap.get(programs, show.program)
      return Option.match(programOption, {
        onNone: () => acc,
        onSome: (program) => HashMap.set(acc, show.id, program)
      })
    }
  )
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
 * Computes show boundaries for a given array of plays.
 *
 * A boundary is inserted at the first play of each new show,
 * enriched with program/host information from showsMapAtom.
 *
 * Uses Atom.family for automatic memoization per unique plays array.
 *
 * Pattern: HashMap.get returns Option, use Option.match for safe access
 *
 * @example
 * ```tsx
 * import { showBoundariesForPlaysAtom } from "@/atoms/kexp-atoms"
 *
 * function MyComponent() {
 *   const plays = useAtomValue(playsArrayAtom)
 *   const boundaries = useAtomValue(showBoundariesForPlaysAtom(plays))
 *   return <div>{boundaries.length} show transitions</div>
 * }
 * ```
 */
export const showBoundariesForPlaysAtom = Atom.family((plays: readonly Play[]) =>
  Atom.make((get) => {
    const shows = get.get(showsMapAtom)
    const boundaries: ShowBoundary[] = []

    plays.forEach((play, idx) => {
      const prevPlay = plays[idx - 1]
      const isNewShow = !prevPlay || prevPlay.show !== play.show

      if (isNewShow && play.show !== null) {
        const showOption = HashMap.get(shows, play.show)

        Option.match(showOption, {
          onNone: () => {
            // Show data not loaded yet, emit minimal boundary
            boundaries.push({
              timestamp: play.airdate as Date | string,
              showId: play.show!
            })
          },
          onSome: (showInfo) => {
            // Enrich with program/host info
            boundaries.push({
              timestamp: play.airdate as Date | string,
              showId: play.show!,
              programName: showInfo.program_name ?? undefined,
              programId: showInfo.program ?? undefined,
              hostNames: showInfo.host_names ?? undefined
            })
          }
        })
      }
    })

    return boundaries
  })
)
