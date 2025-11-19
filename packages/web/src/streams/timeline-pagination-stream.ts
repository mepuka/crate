/**
 * Pure Timeline Pagination Stream
 *
 * Cursor-based pagination using Stream.paginateEffect pattern.
 * No state management, no React - pure business logic.
 *
 * Pattern Reference:
 * - Local Effect source: docs/effect-source/effect/src/internal/stream.ts
 * - Stream.paginateEffect signature:
 *   <S, A, E, R>(s: S, f: (s: S) => Effect<[A, Option<S>], E, R>) => Stream<A, E, R>
 *
 * Based on existing timeline-infinite.ts patterns.
 */

import { Effect, Option, Stream, Schedule, Duration } from "effect";
import type { TimelineParams, TimelineResponse } from "@crate/api";
import { TimelineClient, TimelineKVS } from "@/lib/http-runtime";

/**
 * State for cursor-based pagination.
 * Tracks the current cursor and limit for fetching next page.
 */
export interface PaginationState {
  readonly cursor?: string;
  readonly limit: number;
}

/**
 * Result of a single page fetch.
 * Contains the response and metadata needed for next iteration.
 */
export interface PageResult {
  readonly response: TimelineResponse;
  readonly params: TimelineParams;
}

/**
 * Create a cursor-based pagination stream that fetches timeline pages.
 *
 * This stream will:
 * - Start with initial params (cursor, limit, time range, etc.)
 * - Fetch each page via TimelineClient
 * - Store plays in TimelineKVS (normalize into KVS)
 * - Emit the TimelineResponse for each page
 * - Continue until has_more is false
 * - Include retry logic with exponential backoff
 *
 * @param initialParams - Initial timeline parameters (can include time range, anchor, etc.)
 * @returns Stream of TimelineResponse objects, one per page
 *
 * @example
 * ```typescript
 * const stream = createTimelinePaginationStream({ limit: 50 })
 *
 * // Consume with Effect.gen
 * const program = Effect.gen(function* () {
 *   const client = yield* TimelineClient
 *   const kvs = yield* TimelineKVS
 *
 *   yield* Stream.runForEach(
 *     createTimelinePaginationStream({ limit: 50 }),
 *     (response) => Effect.log(`Fetched ${response.results.length} plays`)
 *   )
 * })
 * ```
 */
export const createTimelinePaginationStream = (
  initialParams: TimelineParams
) => {
  type State = { readonly params: TimelineParams; readonly isFirst: boolean };

  return Stream.paginateEffect(
    { params: initialParams, isFirst: true } as State,
    (state: State) =>
      Effect.gen(function* () {
        const client = yield* TimelineClient;
        const kvs = yield* TimelineKVS;

        yield* Effect.log(
          `Fetching timeline page: limit=${state.params.limit}, cursor=${state.params.cursor ?? "none"}, isFirst=${state.isFirst}`
        );

        // Fetch from API with retry logic
        const response = yield* client.timeline.getTimeline({
          urlParams: state.params,
        }).pipe(
          Effect.retry(
            Schedule.exponential(Duration.millis(100)).pipe(
              Schedule.intersect(Schedule.recurs(3))
            )
          ),
          Effect.tap(() =>
            Effect.log(`Received ${state.params.limit} plays from API`)
          )
        );

        // Normalize all plays into KVS (single source of truth)
        yield* Effect.all(
          response.results.map((play) => kvs.storePlay(play)),
          { concurrency: 50 }
        );

        yield* Effect.log(
          `Stored ${response.results.length} plays in KVS, has_more=${response.has_more}, next_cursor=${response.next_cursor ?? "none"}`
        );

        // Build page result
        const pageResult: PageResult = {
          response,
          params: state.params,
        };

        // Determine next state
        // If has_more is true and we have a cursor, continue pagination
        // For initial params with special navigation (time range, anchor, percentage),
        // subsequent pages use only cursor-based pagination
        const nextState: Option.Option<State> = response.has_more &&
          response.next_cursor
          ? Option.some({
              params: {
                limit: state.params.limit,
                cursor: response.next_cursor,
              },
              isFirst: false,
            } as State)
          : Option.none();

        yield* Effect.log(
          nextState._tag === "Some"
            ? `Pagination continues with cursor: ${response.next_cursor}`
            : "Pagination complete (no more pages)"
        );

        return [pageResult, nextState] as const;
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError(
              `Timeline page fetch failed: ${error}`
            );
            // Fail the stream - caller can add retry/fallback logic
            return yield* Effect.fail(error);
          })
        )
      )
  );
};

/**
 * Create a limited pagination stream that stops after N pages.
 * Useful for testing or when you only want a fixed number of pages.
 *
 * @param initialParams - Initial timeline parameters
 * @param maxPages - Maximum number of pages to fetch
 * @returns Stream of PageResult objects, limited to maxPages
 */
export const createLimitedPaginationStream = (
  initialParams: TimelineParams,
  maxPages: number
) => createTimelinePaginationStream(initialParams).pipe(Stream.take(maxPages));

/**
 * Helper: Extract all play IDs from a pagination stream.
 * Useful for getting a list of all play IDs without loading full Play objects.
 *
 * @param stream - Timeline pagination stream
 * @returns Effect that collects all play IDs from the stream
 */
export const collectPlayIds = (stream: ReturnType<typeof createTimelinePaginationStream>) =>
  Stream.runFold(stream, [] as number[], (acc, page) => [
    ...acc,
    ...page.response.results.map((play) => play.id),
  ]);

/**
 * Helper: Count total plays across all pages in stream.
 *
 * @param stream - Timeline pagination stream
 * @returns Effect that counts total plays
 */
export const countTotalPlays = (stream: ReturnType<typeof createTimelinePaginationStream>) =>
  Stream.runFold(stream, 0, (count, page) => count + page.response.results.length);
