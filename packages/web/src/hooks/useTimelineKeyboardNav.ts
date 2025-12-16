/**
 * Timeline Keyboard Navigation Hook
 *
 * Provides keyboard navigation for the timeline with Effect Atom integration.
 * Supports arrow keys, Home/End, vim-style j/k, and focus persistence.
 *
 * Integrates with timeline-focus.ts atoms for state coordination.
 */

import { useCallback, useEffect } from "react";
import { useAtom, useAtomValue } from "@effect-atom/atom-react";
import { Option } from "effect";
import {
  focusedPlayIdAtom,
  savedFocusPositionAtom,
  keyboardNavEnabledAtom,
  setFocusedPlayId,
  saveFocusPosition,
  clearSavedFocus,
} from "@/atoms/timeline-focus";
import { allLoadedPlayIdsAtom } from "@/atoms/timeline-infinite";

// ============================================================================
// Types
// ============================================================================

interface UseTimelineKeyboardNavOptions {
  /** Ref to the scrollable container element */
  containerRef: React.RefObject<HTMLElement>;
  /** Whether keyboard navigation is enabled (default: true) */
  enabled?: boolean;
  /** Callback when a play is selected (Enter/Space) */
  onSelect?: (playId: number) => void;
  /** Callback when escape is pressed */
  onEscape?: () => void;
}

interface UseTimelineKeyboardNavReturn {
  /** Currently focused play ID (or undefined if none) */
  focusedPlayId: number | undefined;
  /** Focus a specific play card by ID */
  focusCard: (playId: number) => void;
  /** Save current focus position for later restoration */
  saveFocus: () => void;
  /** Restore focus from saved position */
  restoreFocus: () => void;
  /** Navigate to the next play */
  navigateNext: () => void;
  /** Navigate to the previous play */
  navigatePrev: () => void;
  /** Navigate to the first play */
  navigateFirst: () => void;
  /** Navigate to the last play */
  navigateLast: () => void;
  /** Clear focus */
  clearFocus: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useTimelineKeyboardNav({
  containerRef,
  enabled = true,
  onSelect,
  onEscape,
}: UseTimelineKeyboardNavOptions): UseTimelineKeyboardNavReturn {
  // Get play IDs from timeline state
  const playIds = useAtomValue(allLoadedPlayIdsAtom);

  // Focus state atoms
  const [focusedPlayIdOption, setFocused] = useAtom(focusedPlayIdAtom);
  const [savedFocus, setSavedFocus] = useAtom(savedFocusPositionAtom);
  const [keyboardEnabled] = useAtom(keyboardNavEnabledAtom);

  // Combine enabled prop with global keyboard nav state
  const isEnabled = enabled && keyboardEnabled;

  // Get current focus as number or undefined
  const focusedPlayId = Option.getOrUndefined(focusedPlayIdOption);

  // Get current focus index
  const currentIndex = Option.match(focusedPlayIdOption, {
    onNone: () => -1,
    onSome: (id) => playIds.indexOf(id),
  });

  // Focus a card element by play ID
  const focusCard = useCallback(
    (playId: number) => {
      const container = containerRef.current;
      if (!container) return;

      const card = container.querySelector(
        `[data-play-id="${playId}"]`
      ) as HTMLElement;
      if (card) {
        card.focus();
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setFocused(setFocusedPlayId(playId));
      }
    },
    [containerRef, setFocused]
  );

  // Clear focus
  const clearFocus = useCallback(() => {
    setFocused(setFocusedPlayId(null));
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement?.blur) {
      activeElement.blur();
    }
  }, [setFocused]);

  // Navigation handlers
  const navigateNext = useCallback(() => {
    if (playIds.length === 0) return;

    if (currentIndex < 0) {
      // No current focus, start at first item
      focusCard(playIds[0]);
    } else if (currentIndex < playIds.length - 1) {
      focusCard(playIds[currentIndex + 1]);
    }
  }, [currentIndex, playIds, focusCard]);

  const navigatePrev = useCallback(() => {
    if (playIds.length === 0) return;

    if (currentIndex < 0) {
      // No current focus, start at first item
      focusCard(playIds[0]);
    } else if (currentIndex > 0) {
      focusCard(playIds[currentIndex - 1]);
    }
  }, [currentIndex, playIds, focusCard]);

  const navigateFirst = useCallback(() => {
    if (playIds.length > 0) {
      focusCard(playIds[0]);
    }
  }, [playIds, focusCard]);

  const navigateLast = useCallback(() => {
    if (playIds.length > 0) {
      focusCard(playIds[playIds.length - 1]);
    }
  }, [playIds, focusCard]);

  // Save focus position (for restoration after panel close)
  const saveFocusHandler = useCallback(() => {
    Option.match(focusedPlayIdOption, {
      onNone: () => {},
      onSome: (playId) => {
        const scrollPos = containerRef.current?.scrollTop ?? 0;
        setSavedFocus(saveFocusPosition(playId, scrollPos));
      },
    });
  }, [focusedPlayIdOption, containerRef, setSavedFocus]);

  // Restore focus from saved position
  const restoreFocus = useCallback(() => {
    Option.match(savedFocus, {
      onNone: () => {},
      onSome: ({ playId, scrollPosition }) => {
        focusCard(playId);
        if (containerRef.current) {
          containerRef.current.scrollTop = scrollPosition;
        }
        setSavedFocus(clearSavedFocus());
      },
    });
  }, [savedFocus, focusCard, containerRef, setSavedFocus]);

  // Keyboard event handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isEnabled) return;

      // Only handle when focus is within the container or on the document body
      const container = containerRef.current;
      const activeElement = document.activeElement;

      // Skip if we're in an input/textarea
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Check if focus is within container or we have a focused play ID
      const isInContainer = container?.contains(activeElement);
      const hasFocus = Option.isSome(focusedPlayIdOption);

      if (!isInContainer && !hasFocus) return;

      switch (e.key) {
        case "ArrowDown":
        case "j": // vim-style
          e.preventDefault();
          navigateNext();
          break;

        case "ArrowUp":
        case "k": // vim-style
          e.preventDefault();
          navigatePrev();
          break;

        case "Home":
          e.preventDefault();
          navigateFirst();
          break;

        case "End":
          e.preventDefault();
          navigateLast();
          break;

        case "Enter":
        case " ": // Space
          e.preventDefault();
          Option.match(focusedPlayIdOption, {
            onNone: () => {},
            onSome: (playId) => onSelect?.(playId),
          });
          break;

        case "Escape":
          e.preventDefault();
          clearFocus();
          onEscape?.();
          break;
      }
    },
    [
      isEnabled,
      containerRef,
      focusedPlayIdOption,
      navigateNext,
      navigatePrev,
      navigateFirst,
      navigateLast,
      onSelect,
      onEscape,
      clearFocus,
    ]
  );

  // Attach keyboard listener
  useEffect(() => {
    if (!isEnabled) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isEnabled, handleKeyDown]);

  return {
    focusedPlayId,
    focusCard,
    saveFocus: saveFocusHandler,
    restoreFocus,
    navigateNext,
    navigatePrev,
    navigateFirst,
    navigateLast,
    clearFocus,
  };
}
