/**
 * Timeline Utilities
 *
 * Provides reusable Order instances and utility functions for working with
 * Chunk<PlayResult> and HashSet<number> collections in the timeline.
 *
 * Uses Effect's Order type class for type-safe, composable ordering operations.
 */

import { Array, Chunk, HashSet, Option, Order } from "effect";
import { PlayResult, type Play } from "@crate/api";

/**
 * Order Instances for PlayResult
 *
 * These Order instances define how PlayResult values should be compared and sorted.
 */

/**
 * Order by airdate (newest first - descending)
 * Most recent plays come first in the timeline.
 */
export const PlayOrderByAirdateDesc: Order.Order<Play> = Order.reverse(
  Order.mapInput(Order.Date, (play: Play) => play.airdate)
);

/**
 * Order by airdate (oldest first - ascending)
 * Chronological order from oldest to newest.
 */
export const PlayOrderByAirdateAsc: Order.Order<Play> = Order.mapInput(
  Order.Date,
  (play: Play) => play.airdate
);

/**
 * Order by play ID (newest first - descending)
 * Higher IDs typically indicate newer plays.
 */
export const PlayOrderByIdDesc: Order.Order<Play> = Order.reverse(
  Order.mapInput(Order.number, (play: Play) => play.id)
);

/**
 * Order by play ID (oldest first - ascending)
 * Lower IDs typically indicate older plays.
 */
export const PlayOrderByIdAsc: Order.Order<Play> = Order.mapInput(
  Order.number,
  (play: Play) => play.id
);

/**
 * Order by similarity score (highest first - descending)
 * Most similar plays come first (useful for search results).
 */
export const PlayOrderBySimilarityDesc: Order.Order<Play> = Order.reverse(
  Order.mapInput(Order.number, (play: Play) => play.similarity)
);

/**
 * Order by similarity score (lowest first - ascending)
 */
export const PlayOrderBySimilarityAsc: Order.Order<Play> = Order.mapInput(
  Order.number,
  (play: Play) => play.similarity
);

/**
 * Combined order: first by airdate (newest first), then by ID (newest first) as tiebreaker
 * Useful for maintaining consistent ordering when airdates are identical.
 */
export const PlayOrderByAirdateThenId: Order.Order<Play> = Order.combine(
  PlayOrderByAirdateDesc,
  PlayOrderByIdDesc
);

/**
 * Combined order: first by similarity (highest first), then by airdate (newest first)
 * Useful for search results where relevance matters most, but recency is a tiebreaker.
 */
export const PlayOrderBySimilarityThenAirdate: Order.Order<Play> =
  Order.combine(PlayOrderBySimilarityDesc, PlayOrderByAirdateDesc);

/**
 * Chunk<PlayResult> Utility Functions
 *
 * Functions for working with ordered Chunk collections of plays.
 */

/**
 * Sort a Chunk of plays by airdate (newest first).
 */
export const sortPlaysByAirdateDesc = (
  plays: Chunk.Chunk<Play>
): Chunk.Chunk<Play> => Chunk.sort(plays, PlayOrderByAirdateDesc);

/**
 * Sort a Chunk of plays by airdate (oldest first).
 */
export const sortPlaysByAirdateAsc = (
  plays: Chunk.Chunk<Play>
): Chunk.Chunk<Play> => Chunk.sort(plays, PlayOrderByAirdateAsc);

/**
 * Sort a Chunk of plays by ID (newest first).
 */
export const sortPlaysByIdDesc = (
  plays: Chunk.Chunk<Play>
): Chunk.Chunk<Play> => Chunk.sort(plays, PlayOrderByIdDesc);

/**
 * Sort a Chunk of plays by ID (oldest first).
 */
export const sortPlaysByIdAsc = (plays: Chunk.Chunk<Play>): Chunk.Chunk<Play> =>
  Chunk.sort(plays, PlayOrderByIdAsc);

/**
 * Sort a Chunk of plays by similarity (highest first).
 */
export const sortPlaysBySimilarityDesc = (
  plays: Chunk.Chunk<Play>
): Chunk.Chunk<Play> => Chunk.sort(plays, PlayOrderBySimilarityDesc);

/**
 * Sort a Chunk of plays by airdate then ID (newest first, with ID as tiebreaker).
 */
export const sortPlaysByAirdateThenId = (
  plays: Chunk.Chunk<Play>
): Chunk.Chunk<Play> => Chunk.sort(plays, PlayOrderByAirdateThenId);

/**
 * Sort a Chunk of plays by similarity then airdate (highest similarity first).
 */
export const sortPlaysBySimilarityThenAirdate = (
  plays: Chunk.Chunk<Play>
): Chunk.Chunk<Play> => Chunk.sort(plays, PlayOrderBySimilarityThenAirdate);

/**
 * Get the newest play from a Chunk (by airdate).
 * Returns Option.none() if the chunk is empty.
 */
export const getNewestPlay = (plays: Chunk.Chunk<Play>) => {
  if (Chunk.isEmpty(plays)) {
    return Option.none<Play>();
  }
  const sorted = sortPlaysByAirdateDesc(plays);
  return Option.some(Chunk.unsafeGet(sorted, 0));
};

/**
 * Get the oldest play from a Chunk (by airdate).
 * Returns Option.none() if the chunk is empty.
 */
export const getOldestPlay = (plays: Chunk.Chunk<Play>) => {
  if (Chunk.isEmpty(plays)) {
    return Option.none<Play>();
  }
  const sorted = sortPlaysByAirdateAsc(plays);
  return Option.some(Chunk.unsafeGet(sorted, 0));
};

/**
 * Get the first N plays sorted by airdate (newest first).
 */
export const getNewestNPlays = (
  plays: Chunk.Chunk<Play>,
  n: number
): Chunk.Chunk<Play> => Chunk.take(sortPlaysByAirdateDesc(plays), n);

/**
 * Get the last N plays sorted by airdate (oldest first).
 */
export const getOldestNPlays = (
  plays: Chunk.Chunk<Play>,
  n: number
): Chunk.Chunk<Play> => Chunk.take(sortPlaysByAirdateAsc(plays), n);

/**
 * Filter plays within a date range (inclusive).
 * Returns plays where airdate >= startDate && airdate <= endDate.
 */
export const filterPlaysByDateRange = (
  plays: Chunk.Chunk<Play>,
  startDate: Date,
  endDate: Date
): Chunk.Chunk<Play> =>
  Chunk.filter(
    plays,
    (play) => play.airdate >= startDate && play.airdate <= endDate
  );

/**
 * Filter plays after a specific date (exclusive).
 * Returns plays where airdate > sinceDate.
 */
export const filterPlaysSince = (
  plays: Chunk.Chunk<Play>,
  sinceDate: Date
): Chunk.Chunk<Play> => Chunk.filter(plays, (play) => play.airdate > sinceDate);

/**
 * Filter plays before a specific date (exclusive).
 * Returns plays where airdate < beforeDate.
 */
export const filterPlaysBefore = (
  plays: Chunk.Chunk<Play>,
  beforeDate: Date
): Chunk.Chunk<Play> =>
  Chunk.filter(plays, (play) => play.airdate < beforeDate);

/**
 * HashSet<number> Utility Functions
 *
 * Functions for working with HashSet collections of play IDs.
 * Note: HashSet is unordered, but we can convert to ordered collections.
 */

/**
 * Convert a HashSet of play IDs to a Chunk sorted by ID (newest first).
 */
export const playIdsHashSetToChunkDesc = (
  ids: HashSet.HashSet<number>
): Chunk.Chunk<number> => {
  const array = HashSet.toValues(ids);
  const sorted = Array.sort(array, Order.reverse(Order.number));
  return Chunk.fromIterable(sorted);
};

/**
 * Convert a HashSet of play IDs to a Chunk sorted by ID (oldest first).
 */
export const playIdsHashSetToChunkAsc = (
  ids: HashSet.HashSet<number>
): Chunk.Chunk<number> => {
  const array = HashSet.toValues(ids);
  const sorted = Array.sort(array, Order.number);
  return Chunk.fromIterable(sorted);
};

/**
 * Convert a HashSet of play IDs to a sorted array (newest first).
 */
export const playIdsHashSetToArrayDesc = (
  ids: HashSet.HashSet<number>
): number[] => {
  const array = HashSet.toValues(ids);
  return Array.sort(array, Order.reverse(Order.number));
};

/**
 * Convert a HashSet of play IDs to a sorted array (oldest first).
 */
export const playIdsHashSetToArrayAsc = (
  ids: HashSet.HashSet<number>
): number[] => {
  const array = HashSet.toValues(ids);
  return Array.sort(array, Order.number);
};

/**
 * Get the maximum (newest) play ID from a HashSet.
 * Returns Option.none() if the set is empty.
 */
export const getMaxPlayId = (ids: HashSet.HashSet<number>) => {
  if (HashSet.size(ids) === 0) {
    return Option.none<number>();
  }
  const array = HashSet.toValues(ids);
  const max = Math.max(...array);
  return Option.some(max);
};

/**
 * Get the minimum (oldest) play ID from a HashSet.
 * Returns Option.none() if the set is empty.
 */
export const getMinPlayId = (ids: HashSet.HashSet<number>) => {
  if (HashSet.size(ids) === 0) {
    return Option.none<number>();
  }
  const array = HashSet.toValues(ids);
  const min = Math.min(...array);
  return Option.some(min);
};

/**
 * Combined Operations
 *
 * Functions that work with both Chunk and HashSet together.
 */

/**
 * Extract play IDs from a Chunk of plays, maintaining order.
 * Returns a Chunk of numbers in the same order as the plays.
 */
export const extractPlayIds = (plays: Chunk.Chunk<Play>): Chunk.Chunk<number> =>
  Chunk.map(plays, (play) => play.id);

/**
 * Extract play IDs from a Chunk of plays, sorted by play order (newest first).
 * Useful when you want IDs in the same order as the sorted plays.
 */
export const extractPlayIdsSorted = (
  plays: Chunk.Chunk<Play>,
  order: Order.Order<Play> = PlayOrderByAirdateDesc
): Chunk.Chunk<number> => {
  const sorted = Chunk.sort(plays, order);
  return extractPlayIds(sorted);
};

/**
 * Create a HashSet of play IDs from a Chunk of plays.
 * Useful for fast O(1) membership checks.
 */
export const playIdsChunkToHashSet = (
  plays: Chunk.Chunk<Play>
): HashSet.HashSet<number> => {
  const ids = extractPlayIds(plays);
  return HashSet.fromIterable(Chunk.toReadonlyArray(ids));
};
