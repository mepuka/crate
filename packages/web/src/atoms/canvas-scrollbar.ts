/**
 * Canvas Scrollbar Atoms
 *
 * State management for the canvas-based virtual scrollbar with date scrubbing.
 * Uses Effect atoms for reactive state management.
 *
 * Architecture:
 * - Basic state atoms for scroll position and scrubbing state
 * - Derived atoms for timeline range and current scroll date
 * - All atoms follow the patterns established in timeline.ts
 */

import { Atom, Result } from "@effect-atom/atom-react";
import { playsChunkAtom } from "./timeline";
import { getNewestPlay, getOldestPlay } from "@/lib/timeline-utils";
import { Chunk, Option } from "effect";

// ===== Basic State Atoms =====

/**
 * Canvas Scroll Position Atom
 *
 * Represents the current scroll position in the canvas scrollbar as a percentage (0.0 to 1.0).
 * - 0.0 = top of timeline (newest)
 * - 1.0 = bottom of timeline (oldest)
 *
 * This is a basic state atom that can be updated via setSelf in interactions.
 */
export const canvasScrollPositionAtom = Atom.make<number>(0.0);

/**
 * Is Canvas Scrubbing Atom
 *
 * Tracks whether the user is actively scrubbing (dragging) the canvas scrollbar.
 * Used to show tooltips and prevent navigation during drag.
 */
export const isCanvasScrubbingAtom = Atom.make<boolean>(false);

// ===== Derived Atoms =====

/**
 * Canvas Timeline Range Atom (Derived)
 *
 * Derives the date range from the currently loaded plays in playsChunkAtom.
 * Returns the oldest and newest dates available in the local cache.
 *
 * Note: This represents the LOCAL range (what's currently loaded), not the full
 * timeline extent. For full timeline extent, we'd need to query the API.
 *
 * Returns:
 * - startDate: Date of oldest play (earliest airdate)
 * - endDate: Date of newest play (latest airdate)
 * - totalCount: Number of plays currently loaded
 * - isEmpty: Whether there are any plays loaded
 */
export const canvasTimelineRangeAtom = Atom.make((get) => {
  const chunk = get(playsChunkAtom);

  return Result.map(chunk, (chunkValue) => {
    // Handle empty chunk
    if (Chunk.isEmpty(chunkValue)) {
      return {
        startDate: null,
        endDate: null,
        totalCount: 0,
        isEmpty: true,
      } as const;
    }

    // Get newest and oldest plays using timeline utilities
    const newestPlayOption = getNewestPlay(chunkValue);
    const oldestPlayOption = getOldestPlay(chunkValue);

    // Extract dates from Options
    const endDate = Option.match(newestPlayOption, {
      onNone: () => null,
      onSome: (play) => play.airdate,
    });

    const startDate = Option.match(oldestPlayOption, {
      onNone: () => null,
      onSome: (play) => play.airdate,
    });

    return {
      startDate,
      endDate,
      totalCount: Chunk.size(chunkValue),
      isEmpty: false,
    } as const;
  });
});

/**
 * Canvas Scroll Date Atom (Derived)
 *
 * Derives the current date based on the scroll position and timeline range.
 * This is the date that the user is currently viewing/scrubbing in the scrollbar.
 *
 * Calculation:
 * - position 0.0 (top) = endDate (newest)
 * - position 1.0 (bottom) = startDate (oldest)
 * - position 0.5 (middle) = midpoint between start and end
 *
 * Returns null if:
 * - Timeline range is not available yet (still loading)
 * - Timeline is empty (no plays loaded)
 * - Dates are invalid
 */
export const canvasScrollDateAtom = Atom.make((get) => {
  const position = get(canvasScrollPositionAtom);
  const rangeResult = get(canvasTimelineRangeAtom);

  // Handle Result type from timeline range atom
  return Result.map(rangeResult, (range) => {
    // If timeline is empty or dates are missing, return null
    if (range.isEmpty || !range.startDate || !range.endDate) {
      return null;
    }

    // Calculate interpolated date based on position
    // position 0.0 = newest (endDate)
    // position 1.0 = oldest (startDate)
    const startTime = range.startDate.getTime();
    const endTime = range.endDate.getTime();
    const timeSpan = endTime - startTime;

    // Interpolate: newer dates at position 0, older dates at position 1
    const currentTime = endTime - timeSpan * position;

    return new Date(currentTime);
  });
});
