/**
 * New Music Detection Utilities
 *
 * Provides functions to detect and highlight new music based on:
 * - Play date (within one month of current date)
 * - DJ comment containing "new music" keyword
 *
 * Follows the design philosophy of subtle, meaningful indicators that
 * enhance the "late night radio broadcast" aesthetic.
 */

import { Array, Duration, Option } from "effect";
import type { Play } from "@crate/domain/faiss/schemas";

/**
 * Constants
 */

/**
 * Time window for considering a play as "new music".
 * Set to 30 days (approximately one month).
 *
 * Pattern: data-duration.mdx
 * Using Duration for type-safe, human-readable time intervals.
 */
const NEW_MUSIC_TIME_WINDOW = Duration.days(30);

/**
 * Keywords that indicate new music in DJ comments.
 * Case-insensitive matching.
 *
 * Using readonly array for immutability and type safety.
 */
const NEW_MUSIC_KEYWORDS = ["new music", "brand new", "fresh release"] as const;

/**
 * Core Detection Functions
 */

/**
 * Check if a play's airdate is within the new music time window.
 *
 * Pattern: data-duration.mdx
 * Uses Duration API for type-safe time calculations instead of raw milliseconds.
 *
 * @param airdate - The date the track was played
 * @returns true if the play is within one month of the current date
 *
 * @example
 * ```ts
 * const recentPlay = new Date(Date.now() - Duration.toMillis(Duration.days(7)));
 * isWithinOneMonth(recentPlay); // true
 *
 * const oldPlay = new Date(Date.now() - Duration.toMillis(Duration.days(60)));
 * isWithinOneMonth(oldPlay); // false
 * ```
 */
export const isWithinOneMonth = (airdate: Date): boolean => {
  const now = Date.now();
  const playTime = airdate.getTime();
  const timeDiff = Duration.millis(now - playTime);

  return Duration.greaterThanOrEqualTo(timeDiff, Duration.zero) &&
         Duration.lessThanOrEqualTo(timeDiff, NEW_MUSIC_TIME_WINDOW);
};

/**
 * Check if a DJ comment contains new music keywords.
 * Performs case-insensitive matching.
 *
 * Pattern: data-option.mdx
 * Uses Option.fromNullable for type-safe nullable handling.
 *
 * @param comment - The DJ comment text (nullable)
 * @returns true if the comment contains any new music keywords
 *
 * @example
 * ```ts
 * commentContainsNewMusic("Check out this NEW MUSIC from Local Artist!"); // true
 * commentContainsNewMusic("Great track from 2019"); // false
 * commentContainsNewMusic(null); // false
 * ```
 */
export const commentContainsNewMusic = (comment: string | null): boolean => {
  return Option.fromNullable(comment).pipe(
    Option.map((text) => text.toLowerCase()),
    Option.exists((lowerComment) =>
      Array.some(NEW_MUSIC_KEYWORDS, (keyword) =>
        lowerComment.includes(keyword)
      )
    )
  );
};

/**
 * Primary detection function: Check if a play qualifies as "new music".
 * Combines both time-based and comment-based detection.
 *
 * A play is considered "new music" if:
 * 1. The play's airdate is within one month of the current date, AND
 * 2. The DJ's comment contains new music keywords
 *
 * @param play - The play object to check
 * @returns true if the play qualifies as new music
 *
 * @example
 * ```ts
 * const play: Play = {
 *   airdate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
 *   comment: "New music from a local artist!",
 *   // ... other fields
 * };
 * isNewMusic(play); // true
 * ```
 */
export const isNewMusic = (play: Play): boolean => {
  // Both conditions must be met
  return (
    isWithinOneMonth(play.airdate) && commentContainsNewMusic(play.comment)
  );
};

/**
 * Get the appropriate data attribute for new music indication.
 * This can be used for CSS styling and conditional rendering.
 *
 * @param play - The play object to check
 * @returns "new" if the play is new music, undefined otherwise
 *
 * @example
 * ```tsx
 * <div data-new-music={getNewMusicDataAttr(play)}>
 *   {/* content *\/}
 * </div>
 * ```
 */
export const getNewMusicDataAttr = (
  play: Play
): "new" | undefined => {
  return isNewMusic(play) ? "new" : undefined;
};
