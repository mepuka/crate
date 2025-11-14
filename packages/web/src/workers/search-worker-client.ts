/**
 * Search Worker Client
 *
 * Main thread interface to the search worker.
 * Provides type-safe API for sending requests and receiving responses.
 *
 * Uses Effect's Worker API for structured worker communication with Schema serialization.
 *
 * Pattern from Effect source (docs/effect-source/platform-browser/test/Worker.test.ts):
 * 1. Use Worker.makePoolSerialized with BrowserWorker.layer
 * 2. Provide spawner that creates Worker with URL import
 * 3. Use pool.executeEffect for single-value responses
 */

import { Effect, Chunk } from "effect";
import * as Worker from "@effect/platform/Worker";
import * as BrowserWorker from "@effect/platform-browser/BrowserWorker";
import type { PlayResult } from "@crate/api";
import {
  SearchRequest,
  FilterByDateRangeRequest,
  SortPlaysRequest,
  GroupByDateRequest,
  ExtractPlayIdsRequest,
  type WorkerRequest,
} from "./search-worker-protocol";

/**
 * SearchWorkerClient
 *
 * Service for communicating with the search worker.
 * Provides typed methods for all worker operations.
 *
 * Uses Effect.Service pattern for proper .Default layer support.
 */
export class SearchWorkerClient extends Effect.Service<SearchWorkerClient>()(
  "SearchWorkerClient",
  {
    scoped: Effect.gen(function* () {
      yield* Effect.logInfo("SearchWorkerClient: Initializing worker pool");

      // Create a worker pool with Schema serialization
      // Pattern: Worker.makePoolSerialized<WorkerRequest>({ size, initialMessage? })
      const pool = yield* Worker.makePoolSerialized<WorkerRequest>({
        size: 1, // Single worker for now, can increase for concurrency
      });

      yield* Effect.logInfo("SearchWorkerClient: Worker pool created");

      return {
        search: (
          query: string,
          options?: { limit?: number; offset?: number }
        ) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(
              `SearchWorkerClient: Searching for "${query}"`
            );

            // Create typed request
            const request = new SearchRequest({
              query,
              limit: options?.limit ?? 100,
              offset: options?.offset ?? 0,
            });

            // Send to worker and get response
            // pool.executeEffect automatically handles Schema encoding/decoding
            const results = yield* pool.executeEffect(request);

            yield* Effect.logInfo(
              `SearchWorkerClient: Received ${results.length} results`
            );

            return results;
          }),

        filterByDateRange: (
          plays: ReadonlyArray<typeof PlayResult.Type>,
          startDate: Date,
          endDate: Date
        ) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(
              `SearchWorkerClient: Filtering ${plays.length} plays by date range`
            );

            const request = new FilterByDateRangeRequest({
              plays,
              startDate,
              endDate,
            });

            return yield* pool.executeEffect(request);
          }),

        sortPlays: (
          plays: ReadonlyArray<typeof PlayResult.Type>,
          orderBy:
            | "airdate-desc"
            | "airdate-asc"
            | "similarity-desc"
            | "id-desc"
            | "id-asc"
        ) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(
              `SearchWorkerClient: Sorting ${plays.length} plays by ${orderBy}`
            );

            const request = new SortPlaysRequest({
              plays,
              orderBy,
            });

            return yield* pool.executeEffect(request);
          }),

        groupByDate: (
          plays: ReadonlyArray<typeof PlayResult.Type>,
          granularity: "day" | "week" | "month"
        ) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(
              `SearchWorkerClient: Grouping ${plays.length} plays by ${granularity}`
            );

            const request = new GroupByDateRequest({
              plays: Chunk.fromIterable(plays), // Convert to Chunk for GroupByDate (it needs Chunk)
              granularity,
            });

            return yield* pool.executeEffect(request);
          }),

        extractPlayIds: (
          plays: ReadonlyArray<typeof PlayResult.Type>,
          sorted = false
        ) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(
              `SearchWorkerClient: Extracting IDs from ${plays.length} plays (sorted=${sorted})`
            );

            const request = new ExtractPlayIdsRequest({
              plays,
              sorted,
            });

            return yield* pool.executeEffect(request);
          }),
      } as const;
    }),
    dependencies: [
      BrowserWorker.layer(
        () =>
          new globalThis.Worker(
            new URL("./search-worker.ts", import.meta.url),
            {
              type: "module",
            }
          )
      ),
    ],
  }
) {}

/**
 * Example usage:
 * ```ts
 * const program = Effect.gen(function* () {
 *   const client = yield* SearchWorkerClient
 *   const results = yield* client.search("my query")
 *   return results
 * })
 *
 * Effect.runPromise(
 *   program.pipe(Effect.provide(SearchWorkerClient.Default))
 * )
 * ```
 */

/**
 * Convenience functions for common operations
 *
 * These provide a simplified API for common worker operations.
 */

/**
 * Execute a search query in the worker.
 * Returns Effect that requires SearchWorkerClient layer.
 */
export const searchInWorker = (
  query: string,
  options?: { limit?: number; offset?: number }
) =>
  Effect.gen(function* () {
    const client = yield* SearchWorkerClient;
    return yield* client.search(query, options);
  });

/**
 * Filter plays by date range in the worker.
 * Offloads potentially heavy filtering to background thread.
 */
export const filterInWorker = (
  plays: ReadonlyArray<typeof PlayResult.Type>,
  startDate: Date,
  endDate: Date
) =>
  Effect.gen(function* () {
    const client = yield* SearchWorkerClient;
    return yield* client.filterByDateRange(plays, startDate, endDate);
  });

/**
 * Sort plays in the worker.
 * Useful for large arrays that would block the main thread.
 */
export const sortInWorker = (
  plays: ReadonlyArray<typeof PlayResult.Type>,
  orderBy:
    | "airdate-desc"
    | "airdate-asc"
    | "similarity-desc"
    | "id-desc"
    | "id-asc"
) =>
  Effect.gen(function* () {
    const client = yield* SearchWorkerClient;
    return yield* client.sortPlays(plays, orderBy);
  });
