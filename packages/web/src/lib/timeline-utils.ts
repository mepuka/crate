/**
 * Timeline Utilities
 *
 * Provides reusable Order instances and utility functions for working with
 * Chunk<PlayResult> and HashSet<number> collections in the timeline.
 *
 * Uses Effect's Order type class for type-safe, composable ordering operations.
 */

import { Array, Chunk, HashMap, HashSet, Option, Order } from "effect";
import { type Play } from "@crate/api";

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

/**
 * Date Operations on Chunks
 *
 * Pure functions for working with dates in Chunk<Play> collections.
 * Uses Effect's native data structures (HashMap, HashSet, Chunk) for all operations.
 */

/**
 * Group plays by date string (YYYY-MM-DD format).
 * Returns a HashMap where keys are ISO date strings and values are Chunks of plays for that date.
 *
 * @param plays - Chunk of plays to group
 * @returns HashMap of date strings to Chunks of plays
 *
 * @example
 * ```ts
 * const grouped = groupPlaysByDate(playsChunk)
 * const playsForDate = HashMap.get(grouped, '2024-01-15') // Option<Chunk<Play>>
 * ```
 */
export const groupPlaysByDate = (
  plays: Chunk.Chunk<Play>
): HashMap.HashMap<string, Chunk.Chunk<Play>> =>
  Chunk.reduce(
    plays,
    HashMap.empty<string, Chunk.Chunk<Play>>(),
    (acc, play) => {
      const dateKey = play.airdate.toISOString().split("T")[0]; // YYYY-MM-DD
      const existing = HashMap.get(acc, dateKey);
      const updatedChunk = Option.match(existing, {
        onNone: () => Chunk.of(play),
        onSome: (chunk) => Chunk.append(chunk, play),
      });
      return HashMap.set(acc, dateKey, updatedChunk);
    }
  );

/**
 * Group plays by day (same as groupPlaysByDate, but with explicit day grouping).
 * Alias for groupPlaysByDate for semantic clarity.
 *
 * @param plays - Chunk of plays to group
 * @returns HashMap of date strings to Chunks of plays
 */
export const groupPlaysByDay = (
  plays: Chunk.Chunk<Play>
): HashMap.HashMap<string, Chunk.Chunk<Play>> => groupPlaysByDate(plays);

/**
 * Group plays by week (ISO week format: YYYY-Www).
 * Returns a HashMap where keys are week strings and values are Chunks of plays for that week.
 *
 * @param plays - Chunk of plays to group
 * @returns HashMap of week strings to Chunks of plays
 *
 * @example
 * ```ts
 * const grouped = groupPlaysByWeek(playsChunk)
 * const playsForWeek = HashMap.get(grouped, '2024-W03') // Option<Chunk<Play>>
 * ```
 */
export const groupPlaysByWeek = (
  plays: Chunk.Chunk<Play>
): HashMap.HashMap<string, Chunk.Chunk<Play>> =>
  Chunk.reduce(
    plays,
    HashMap.empty<string, Chunk.Chunk<Play>>(),
    (acc, play) => {
      const weekKey = getISOWeekString(play.airdate);
      const existing = HashMap.get(acc, weekKey);
      const updatedChunk = Option.match(existing, {
        onNone: () => Chunk.of(play),
        onSome: (chunk) => Chunk.append(chunk, play),
      });
      return HashMap.set(acc, weekKey, updatedChunk);
    }
  );

/**
 * Group plays by month (YYYY-MM format).
 * Returns a HashMap where keys are month strings and values are Chunks of plays for that month.
 *
 * @param plays - Chunk of plays to group
 * @returns HashMap of month strings to Chunks of plays
 *
 * @example
 * ```ts
 * const grouped = groupPlaysByMonth(playsChunk)
 * const playsForMonth = HashMap.get(grouped, '2024-01') // Option<Chunk<Play>>
 * ```
 */
export const groupPlaysByMonth = (
  plays: Chunk.Chunk<Play>
): HashMap.HashMap<string, Chunk.Chunk<Play>> =>
  Chunk.reduce(
    plays,
    HashMap.empty<string, Chunk.Chunk<Play>>(),
    (acc, play) => {
      const date = play.airdate;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const existing = HashMap.get(acc, monthKey);
      const updatedChunk = Option.match(existing, {
        onNone: () => Chunk.of(play),
        onSome: (chunk) => Chunk.append(chunk, play),
      });
      return HashMap.set(acc, monthKey, updatedChunk);
    }
  );

/**
 * Get the date range (min and max dates) from a Chunk of plays.
 * Returns Option.none() if the chunk is empty.
 *
 * @param plays - Chunk of plays to analyze
 * @returns Option containing start and end dates, or none if empty
 *
 * @example
 * ```ts
 * const range = getDateRangeFromChunk(playsChunk)
 * Option.match(range, {
 *   onNone: () => console.log('No plays'),
 *   onSome: ({ start, end }) => console.log(`Range: ${start} to ${end}`)
 * })
 * ```
 */
export const getDateRangeFromChunk = (
  plays: Chunk.Chunk<Play>
): Option.Option<{ readonly start: Date; readonly end: Date }> => {
  if (Chunk.isEmpty(plays)) {
    return Option.none();
  }

  const oldest = getOldestPlay(plays);
  const newest = getNewestPlay(plays);

  return Option.match(oldest, {
    onNone: () => Option.none(),
    onSome: (oldestPlay) =>
      Option.match(newest, {
        onNone: () => Option.none(),
        onSome: (newestPlay) =>
          Option.some({
            start: oldestPlay.airdate,
            end: newestPlay.airdate,
          } as const),
      }),
  });
};

/**
 * Get plays for a specific date (same day, ignoring time).
 *
 * @param plays - Chunk of plays to filter
 * @param targetDate - The target date to filter by
 * @returns Chunk of plays for that date
 *
 * @example
 * ```ts
 * const playsForDate = getPlaysForDate(playsChunk, new Date('2024-01-15'))
 * ```
 */
export const getPlaysForDate = (
  plays: Chunk.Chunk<Play>,
  targetDate: Date
): Chunk.Chunk<Play> => {
  const targetDateStr = targetDate.toISOString().split("T")[0];
  return Chunk.filter(plays, (play) => {
    const playDateStr = play.airdate.toISOString().split("T")[0];
    return playDateStr === targetDateStr;
  });
};

/**
 * Map dates in plays using a transformation function.
 *
 * @param plays - Chunk of plays to transform
 * @param fn - Function to transform dates
 * @returns Chunk of plays with transformed dates
 *
 * @example
 * ```ts
 * const adjusted = mapPlayDates(
 *   playsChunk,
 *   (date) => new Date(date.getTime() + 60 * 60 * 1000) // Add 1 hour
 * )
 * ```
 */
export const mapPlayDates = (
  plays: Chunk.Chunk<Play>,
  fn: (date: Date) => Date
): Chunk.Chunk<Play> =>
  Chunk.map(plays, (play) => ({
    ...play,
    airdate: fn(play.airdate),
  }));

/**
 * Extract unique dates from a Chunk of plays, sorted ascending.
 *
 * @param plays - Chunk of plays to extract dates from
 * @returns Chunk of unique dates, sorted oldest to newest
 *
 * @example
 * ```ts
 * const uniqueDates = extractUniqueDates(playsChunk)
 * // Returns Chunk<Date> with unique dates, sorted oldest to newest
 * ```
 */
export const extractUniqueDates = (
  plays: Chunk.Chunk<Play>
): Chunk.Chunk<Date> => {
  // Build HashSet of unique date strings
  const dateStringSet = Chunk.reduce(
    plays,
    HashSet.empty<string>(),
    (acc, play) => HashSet.add(acc, play.airdate.toISOString())
  );

  // Convert HashSet to Chunk of dates, then sort
  const uniqueDates = HashSet.toValues(dateStringSet).map(
    (dateStr) => new Date(dateStr)
  );

  return Chunk.sort(Chunk.fromIterable(uniqueDates), Order.Date);
};

/**
 * Filter plays by date range (alias for filterPlaysByDateRange for consistency).
 * This is a pure function that filters plays within the specified date range.
 *
 * @param plays - Chunk of plays to filter
 * @param startDate - Start date (inclusive)
 * @param endDate - End date (inclusive)
 * @returns Filtered Chunk of plays
 *
 * @example
 * ```ts
 * const filtered = filterPlaysByDateRange(
 *   playsChunk,
 *   new Date('2024-01-01'),
 *   new Date('2024-01-31')
 * )
 * ```
 */
export const filterPlaysByDateRangeEffect = (
  plays: Chunk.Chunk<Play>,
  startDate: Date,
  endDate: Date
): Chunk.Chunk<Play> => filterPlaysByDateRange(plays, startDate, endDate);

/**
 * Filter plays by a date predicate function.
 *
 * @param plays - Chunk of plays to filter
 * @param predicate - Function that takes a date and returns a boolean
 * @returns Filtered Chunk of plays
 *
 * @example
 * ```ts
 * const weekendPlays = filterPlaysByDatePredicate(
 *   playsChunk,
 *   (date) => {
 *     const day = date.getDay()
 *     return day === 0 || day === 6 // Saturday or Sunday
 *   }
 * )
 * ```
 */
export const filterPlaysByDatePredicate = (
  plays: Chunk.Chunk<Play>,
  predicate: (date: Date) => boolean
): Chunk.Chunk<Play> => Chunk.filter(plays, (play) => predicate(play.airdate));

/**
 * Helper function to get ISO week string (YYYY-Www format).
 */
const getISOWeekString = (date: Date): string => {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
};
