/**
 * Timeline Focus State Atoms
 *
 * Manages focus state for keyboard navigation in the timeline.
 * Enables focus persistence and restoration after panel interactions.
 *
 * Pattern matches the codebase's established atom patterns:
 * - Atom.make for writable state
 * - Option<T> for nullable values
 */

import { Atom } from "@effect-atom/atom-react";
import { Option } from "effect";

// ============================================================================
// Focus State Types
// ============================================================================

export interface SavedFocusPosition {
  readonly playId: number;
  readonly scrollPosition: number;
}

// ============================================================================
// Focus State Atoms
// ============================================================================

/**
 * Currently focused play ID in the timeline.
 * Used for keyboard navigation coordination.
 *
 * Option.none() means no play is focused.
 * Option.some(playId) means that play is focused.
 */
export const focusedPlayIdAtom = Atom.make<Option.Option<number>>(Option.none());

/**
 * Focus position saved for restoration after panel close.
 * Stored separately to handle the "return focus" pattern.
 *
 * When a detail panel opens, we save the current focus.
 * When it closes, we restore focus to where it was.
 */
export const savedFocusPositionAtom = Atom.make<
  Option.Option<SavedFocusPosition>
>(Option.none());

/**
 * Whether keyboard navigation is enabled.
 * Can be disabled during modal interactions or when typing in inputs.
 */
export const keyboardNavEnabledAtom = Atom.make(true);

// ============================================================================
// Focus State Helpers
// ============================================================================

/**
 * Create a focused play ID Option.
 * Use null to clear focus.
 */
export const setFocusedPlayId = (playId: number | null): Option.Option<number> =>
  playId !== null ? Option.some(playId) : Option.none();

/**
 * Create a saved focus position.
 */
export const saveFocusPosition = (
  playId: number,
  scrollPosition: number
): Option.Option<SavedFocusPosition> =>
  Option.some({ playId, scrollPosition });

/**
 * Clear saved focus position.
 */
export const clearSavedFocus = (): Option.Option<SavedFocusPosition> =>
  Option.none();

// ============================================================================
// Derived Atoms
// ============================================================================

/**
 * Whether any play is currently focused.
 */
export const hasFocusedPlayAtom = Atom.make((get) =>
  Option.isSome(get(focusedPlayIdAtom))
);

/**
 * Get the focused play ID as a number or undefined.
 * Useful for components that don't want to work with Option.
 */
export const focusedPlayIdValueAtom = Atom.make((get) =>
  Option.getOrUndefined(get(focusedPlayIdAtom))
);

/**
 * Whether there's a saved focus position to restore.
 */
export const hasSavedFocusAtom = Atom.make((get) =>
  Option.isSome(get(savedFocusPositionAtom))
);
