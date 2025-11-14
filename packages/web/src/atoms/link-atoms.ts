/**
 * Link Extraction Atoms
 *
 * Provides memoized link extraction per play using Atom.family.
 *
 * CRITICAL PATTERNS:
 * - Uses Atom.family for per-play memoization (like timeline.ts)
 * - Uses Result.matchWithWaiting to handle playAtom results (like kexp-atoms.ts)
 * - Returns PlayLinks model from extraction.ts
 *
 * Reference implementations:
 * - packages/web/src/atoms/kexp-atoms.ts for Result.matchWithWaiting pattern
 * - packages/web/src/atoms/timeline.ts for Atom.family pattern
 * - docs/plans/2025-01-14-link-display-design.md lines 451-530
 *
 * Usage:
 * ```tsx
 * import { useAtomValue } from "@effect-atom/atom-react"
 * import { playLinksAtom, featuredLinkAtom } from "@/atoms/link-atoms"
 *
 * function MyComponent({ playId }: { playId: number }) {
 *   const playLinks = useAtomValue(playLinksAtom(playId))
 *   const featured = useAtomValue(featuredLinkAtom(playId))
 *   // ...
 * }
 * ```
 */

import { Atom, Result } from "@effect-atom/atom"
import { Chunk, HashMap, Option } from "effect"
import { playAtom } from "./timeline"
import { PlayLinks } from "@/lib/links/models"
import { extractLinksFromComment } from "@/lib/links/extraction"

/**
 * Extract links for a specific play.
 *
 * Automatically memoized per playId via Atom.family.
 * Only recomputes when play.comment changes.
 *
 * Pattern: Result.matchWithWaiting handles all 4 cases:
 * - onWaiting: Returns empty PlayLinks while loading
 * - onSuccess: Extracts links from play.comment
 * - onError: Returns empty PlayLinks on error
 * - onDefect: Returns empty PlayLinks on defect
 *
 * CRITICAL: Use get(atom) NOT get.get(atom)
 */
export const playLinksAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const playResult = get(playAtom(playId))

    return Result.matchWithWaiting(playResult, {
      onWaiting: () => new PlayLinks({
        playId,
        links: Chunk.empty(),
        byCategory: HashMap.empty(),
        featuredLink: Option.none()
      }),
      onSuccess: (s) => {
        const playOption = s.value

        // playOption is Option<PlayResult> - need to unwrap it
        return Option.match(playOption, {
          onNone: () => new PlayLinks({
            playId,
            links: Chunk.empty(),
            byCategory: HashMap.empty(),
            featuredLink: Option.none()
          }),
          onSome: (play) => {
            if (!play.comment) {
              return new PlayLinks({
                playId,
                links: Chunk.empty(),
                byCategory: HashMap.empty(),
                featuredLink: Option.none()
              })
            }

            // Extract links using pure utility function
            return extractLinksFromComment(playId, play.comment)
          }
        })
      },
      onError: () => new PlayLinks({
        playId,
        links: Chunk.empty(),
        byCategory: HashMap.empty(),
        featuredLink: Option.none()
      }),
      onDefect: () => new PlayLinks({
        playId,
        links: Chunk.empty(),
        byCategory: HashMap.empty(),
        featuredLink: Option.none()
      })
    })
  })
)

/**
 * Get just the featured link for timeline display.
 * Derived from playLinksAtom for performance.
 *
 * Pattern: Derived atom reads from playLinksAtom and extracts featuredLink field
 */
export const featuredLinkAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const playLinks = get(playLinksAtom(playId))
    return playLinks.featuredLink
  })
)

/**
 * Get links grouped by category for details panel.
 *
 * Pattern: Derived atom reads from playLinksAtom and extracts byCategory field
 */
export const linksByCategoryAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const playLinks = get(playLinksAtom(playId))
    return playLinks.byCategory
  })
)
