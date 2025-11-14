/**
 * Play details state atoms with URL synchronization
 *
 * Pattern: Atom.searchParam() for URL-synchronized state
 * Reference: timeline-url-sync.ts (existing codebase pattern)
 * Reference: https://github.com/tim-smart/effect-atom#atomsearchparam
 *
 * URL Behavior:
 * - No selection: URL = "/" (no playId param, panel closed)
 * - Play selected: URL = "/?playId=123" (panel open)
 * - Browser back: Removes playId from URL, closes panel
 * - Browser forward: Adds playId back to URL, reopens panel
 * - Page refresh: Reopens panel with play from URL
 * - Direct link: Share "/?playId=456" to open specific play
 *
 * Coexists with other URL params:
 * - "/?limit=50&playId=123" ← timeline params + play details
 * - Both atoms work independently, no conflicts
 */

import { Atom } from "@effect-atom/atom-react";
import { Schema, Option } from "effect";

/**
 * URL-synchronized atom for selected play ID
 *
 * Type: Option<number>
 * - Option.none() when no play selected (panel closed)
 * - Option.some(playId) when play selected (panel open)
 *
 * Usage:
 * ```typescript
 * // Read current selection
 * const [selectedId, setSelectedId] = useAtom(selectedPlayIdAtom)
 *
 * // Update selection (open panel)
 * setSelectedId(Option.some(play.id))  // URL becomes /?playId=123
 *
 * // Clear selection (close panel)
 * setSelectedId(Option.none())  // URL becomes / (param removed)
 * ```
 */
export const selectedPlayIdAtom = Atom.searchParam("playId", {
  schema: Schema.NumberFromString,
});

/**
 * Derived atom - computes whether panel should be open
 *
 * Pattern: Derived atom (effect-atom-derived.mdx)
 * Automatically recomputes when selectedPlayIdAtom changes
 * Returns boolean for simpler UI logic
 *
 * Usage:
 * ```typescript
 * const isPanelOpen = useAtomValue(isPanelOpenAtom)
 * ```
 */
export const isPanelOpenAtom = Atom.make((get) => {
  const selectedId = get(selectedPlayIdAtom);
  return Option.isSome(selectedId);
});
