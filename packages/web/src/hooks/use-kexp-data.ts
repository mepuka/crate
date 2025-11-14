/**
 * KEXP Data Hooks
 *
 * Composable hooks for accessing KEXP programs and shows data.
 * These hooks read from reactive atoms and provide convenient
 * interfaces for components.
 *
 * Architecture:
 * - Thin wrappers around atom reads
 * - Type-safe access to KEXP data
 * - Memoized computations for derived data
 *
 * Usage:
 * ```tsx
 * import { useShowInfo, useProgramForShow, useShowBoundaries } from "@/hooks/use-kexp-data"
 *
 * function MyComponent({ showId, plays }) {
 *   const { show, program } = useShowInfo(showId)
 *   const boundaries = useShowBoundaries(plays)
 *
 *   return (
 *     <div>
 *       <h1>{program?.name}</h1>
 *       <p>Hosted by: {show?.host_names.join(", ")}</p>
 *     </div>
 *   )
 * }
 * ```
 */

import { useMemo } from "react"
import { useAtomValue } from "@effect-atom/atom-react"
import { showsMapAtom, programsMapAtom } from "@/atoms/kexp-atoms"
import type { Kexp } from "@crate/domain"
import type { Play } from "@/domain/Play"

type KexpShow = Kexp.KexpShow
type KexpProgram = Kexp.KexpProgram

/**
 * Get show and program information for a specific show ID
 *
 * @param showId - KEXP show ID
 * @returns Object containing show and program, or undefined if not found
 *
 * @example
 * ```tsx
 * function ShowCard({ showId }: { showId: number }) {
 *   const { show, program } = useShowInfo(showId)
 *
 *   if (!show) return <div>Loading...</div>
 *
 *   return (
 *     <div>
 *       <h2>{program?.name}</h2>
 *       <p>Hosts: {show.host_names.join(", ")}</p>
 *     </div>
 *   )
 * }
 * ```
 */
export function useShowInfo(showId: number): {
  show: KexpShow | undefined
  program: KexpProgram | undefined
} {
  const showsMap = useAtomValue(showsMapAtom)
  const programsMap = useAtomValue(programsMapAtom)

  return useMemo(() => {
    const show = showsMap.get(showId)
    const program = show ? programsMap.get(show.program) : undefined
    return { show, program }
  }, [showsMap, programsMap, showId])
}

/**
 * Get just the program for a specific show ID
 *
 * Convenience hook that extracts only the program from show info.
 *
 * @param showId - KEXP show ID
 * @returns The program associated with the show, or undefined
 *
 * @example
 * ```tsx
 * function ProgramBadge({ showId }: { showId: number }) {
 *   const program = useProgramForShow(showId)
 *   return <span>{program?.name}</span>
 * }
 * ```
 */
export function useProgramForShow(showId: number): KexpProgram | undefined {
  const { program } = useShowInfo(showId)
  return program
}

/**
 * Show boundary data for timeline visualization
 */
export interface ShowBoundary {
  timestamp: Date | string
  showId: number
  programName?: string
  hostNames?: readonly string[]
}

/**
 * Compute show boundaries from a list of plays
 *
 * Show boundaries are points where the show changes in the timeline.
 * They're used to render visual markers indicating show transitions.
 *
 * @param plays - Array of plays (must be sorted by airdate)
 * @returns Array of show boundaries
 *
 * @example
 * ```tsx
 * function Timeline({ plays }: { plays: Play[] }) {
 *   const boundaries = useShowBoundaries(plays)
 *
 *   return (
 *     <div>
 *       {boundaries.map((boundary) => (
 *         <ShowMarker
 *           key={boundary.showId}
 *           timestamp={boundary.timestamp}
 *           programName={boundary.programName}
 *         />
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useShowBoundaries(plays: readonly Play[]): ShowBoundary[] {
  const showsMap = useAtomValue(showsMapAtom)

  return useMemo(() => {
    const boundaries: ShowBoundary[] = []

    plays.forEach((play, idx) => {
      const prevPlay = plays[idx - 1]
      const isNewShow = !prevPlay || prevPlay.show !== play.show

      if (isNewShow) {
        const showInfo = showsMap.get(play.show)
        boundaries.push({
          timestamp: play.airdate as Date | string,
          showId: play.show as number,
          programName: showInfo?.program_name ?? undefined,
          hostNames: showInfo?.host_names ?? undefined
        } as ShowBoundary)
      }
    })

    return boundaries
  }, [plays, showsMap])
}
