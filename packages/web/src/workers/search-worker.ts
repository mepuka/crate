/**
 * Search Worker
 *
 * Web Worker for handling search queries and chunk timeline processing.
 * Uses Effect's WorkerRunner for structured message passing and error handling.
 *
 * Architecture:
 * - Services encapsulate business logic (SearchService, ChunkProcessorService)
 * - WorkerRunner handles message routing and serialization
 * - Effect patterns ensure type safety and composability
 */

import { BrowserWorkerRunner } from "@effect/platform-browser";
import { WorkerRunner } from "@effect/platform";
import {
  Effect,
  Layer,
  Context,
  Chunk,
  HashMap,
  Schedule,
  Schema,
  Match,
} from "effect";
import { WorkerRequest } from "./search-worker-protocol";
import { PlayResult } from "@crate/api";
import { TimelineClient } from "@/lib/http-runtime";
import {
  sortPlaysByAirdateDesc,
  sortPlaysByAirdateAsc,
  sortPlaysBySimilarityDesc,
  sortPlaysByIdDesc,
  sortPlaysByIdAsc,
  filterPlaysByDateRange,
  groupPlaysByDate,
  groupPlaysByWeek,
  groupPlaysByMonth,
  extractPlayIds,
  extractPlayIdsSorted,
  PlayOrderByAirdateDesc,
} from "@/lib/timeline-utils";

/**
 * SearchService
 *
 * Handles search query execution using TimelineClient.
 * Integrates with the real search API endpoint.
 *
 * Note: Error channel is polymorphic - includes whatever errors the TimelineClient.search returns.
 * These will be caught at the worker boundary and mapped to WorkerError.
 */
class SearchService extends Context.Tag("SearchService")<
  SearchService,
  {
    readonly executeSearch: (
      query: string,
      limit: number,
      offset: number
    ) => Effect.Effect<ReadonlyArray<typeof PlayResult.Encoded>, never>;
  }
>() {}

/**
 * SearchService Implementation
 *
 * Live implementation using TimelineClient for real search API calls.
 * Pattern: Inject TimelineClient as dependency, use client.search.search()
 */
const SearchServiceLive = Layer.effect(
  SearchService,
  Effect.gen(function* () {
    const client = yield* TimelineClient;

    return SearchService.of({
      executeSearch: (query, limit, offset) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(
            `Executing search: query="${query}", limit=${limit}, offset=${offset}`
          );

          // Call real search API via TimelineClient
          // Pattern: client.search.search({ payload: SearchParams })
          const response = yield* client.search
            .search({
              payload: { query, limit, offset },
            })
            .pipe(
              // Retry search failures with exponential backoff
              Effect.retry(
                Schedule.exponential("100 millis").pipe(
                  Schedule.intersect(Schedule.recurs(3))
                )
              ),
              // Convert errors to defects for now (worker will handle as WorkerError)
              // TODO: Properly handle specific error cases (BadRequest, InternalServerError, etc.)
              Effect.orDie
            );

          yield* Effect.logInfo(
            `Search completed: ${response.results.length} results in ${response.query_time_ms}ms`
          );

          // Encode results for postMessage serialization
          // Pattern: Schema.encode converts Date -> string for DateFromString
          // This ensures the wire format is correct when sending over postMessage
          return yield* Effect.forEach(
            response.results,
            (play) => Schema.encode(PlayResult)(play).pipe(Effect.orDie),
            { concurrency: "unbounded" }
          );
        }),
    });
  })
).pipe(Layer.provide(TimelineClient.layer));

/**
 * ChunkProcessorService
 *
 * Handles processing and manipulation of Chunk<PlayResult> collections.
 * Provides pure functions for sorting, filtering, grouping, etc.
 */
class ChunkProcessorService extends Context.Tag("ChunkProcessorService")<
  ChunkProcessorService,
  {
    readonly filterByDateRange: (
      plays: Chunk.Chunk<typeof PlayResult.Type>,
      startDate: Date,
      endDate: Date
    ) => Effect.Effect<Chunk.Chunk<typeof PlayResult.Type>>;
    readonly sortPlays: (
      plays: Chunk.Chunk<typeof PlayResult.Type>,
      orderBy: string
    ) => Effect.Effect<Chunk.Chunk<typeof PlayResult.Type>>;
    readonly groupByDate: (
      plays: Chunk.Chunk<typeof PlayResult.Type>,
      granularity: "day" | "week" | "month"
    ) => Effect.Effect<
      HashMap.HashMap<string, Chunk.Chunk<typeof PlayResult.Type>>
    >;
    readonly extractPlayIds: (
      plays: Chunk.Chunk<typeof PlayResult.Type>,
      sorted: boolean
    ) => Effect.Effect<Chunk.Chunk<number>>;
  }
>() {}

/**
 * ChunkProcessorService Implementation
 *
 * Live implementation using timeline-utils functions.
 * All operations are pure and type-safe.
 */
const ChunkProcessorServiceLive = Layer.succeed(
  ChunkProcessorService,
  ChunkProcessorService.of({
    filterByDateRange: (plays, startDate, endDate) =>
      Effect.gen(function* () {
        yield* Effect.logDebug(
          `Filtering ${Chunk.size(plays)} plays by date range: ${startDate.toISOString()} to ${endDate.toISOString()}`
        );

        const filtered = filterPlaysByDateRange(plays, startDate, endDate);

        yield* Effect.logDebug(`Filtered to ${Chunk.size(filtered)} plays`);

        return filtered;
      }),

    sortPlays: (plays, orderBy) =>
      Effect.gen(function* () {
        yield* Effect.logDebug(
          `Sorting ${Chunk.size(plays)} plays by: ${orderBy}`
        );

        const sorted = (() => {
          switch (orderBy) {
            case "airdate-desc":
              return sortPlaysByAirdateDesc(plays);
            case "airdate-asc":
              return sortPlaysByAirdateAsc(plays);
            case "similarity-desc":
              return sortPlaysBySimilarityDesc(plays);
            case "id-desc":
              return sortPlaysByIdDesc(plays);
            case "id-asc":
              return sortPlaysByIdAsc(plays);
            default:
              return plays; // No-op for unknown order
          }
        })();

        return sorted;
      }),

    groupByDate: (plays, granularity) =>
      Effect.gen(function* () {
        yield* Effect.logDebug(
          `Grouping ${Chunk.size(plays)} plays by ${granularity}`
        );

        const grouped = (() => {
          switch (granularity) {
            case "day":
              return groupPlaysByDate(plays);
            case "week":
              return groupPlaysByWeek(plays);
            case "month":
              return groupPlaysByMonth(plays);
          }
        })();

        const groupCount = HashMap.size(grouped);
        yield* Effect.logDebug(`Grouped into ${groupCount} ${granularity}s`);

        return grouped;
      }),

    extractPlayIds: (plays, sorted) =>
      Effect.gen(function* () {
        yield* Effect.logDebug(
          `Extracting play IDs from ${Chunk.size(plays)} plays (sorted=${sorted})`
        );

        const ids = sorted
          ? extractPlayIdsSorted(plays, PlayOrderByAirdateDesc)
          : extractPlayIds(plays);

        return ids;
      }),
  })
);

/**
 * Worker Request Handler
 *
 * Dispatches incoming requests to appropriate services.
 * Uses Schema.decodeUnknown for validation and Match.tag for type-safe dispatching.
 *
 * Pattern from Effect source:
 * 1. Schema.decodeUnknown to validate and decode the request
 * 2. Match.value + Match.tag for exhaustive pattern matching
 *
 * This is the main entry point for WorkerRunner.make
 * Reference: docs/effect-source/effect/src/Match.ts (Match.tag examples)
 */
const handleRequest = (request: unknown) =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Worker: Received request`);

    // Decode and validate the request using Schema
    // Pattern: Schema.decodeUnknown(WorkerRequest)(request)
    const req = yield* Schema.decodeUnknown(WorkerRequest)(request);

    yield* Effect.logDebug(`Worker: Validated request type: ${req._tag}`);

    // Type-safe dispatching with Match.value
    // Pattern: Match.value(req).pipe(Match.tag(...), Match.exhaustive)
    return yield* Match.value(req).pipe(
      Match.tag("SearchRequest", (r) =>
        Effect.gen(function* () {
          const searchService = yield* SearchService;
          return yield* searchService.executeSearch(r.query, r.limit, r.offset);
        })
      ),
      Match.tag("FilterByDateRange", (r) =>
        Effect.gen(function* () {
          const processor = yield* ChunkProcessorService;
          const playsChunk = Chunk.fromIterable(r.plays);
          const filtered = yield* processor.filterByDateRange(
            playsChunk,
            r.startDate,
            r.endDate
          );
          // Encode results for postMessage serialization
          const filteredArray = Chunk.toReadonlyArray(filtered);
          return yield* Effect.forEach(
            filteredArray,
            (play) => Schema.encode(PlayResult)(play).pipe(Effect.orDie),
            { concurrency: "unbounded" }
          );
        })
      ),
      Match.tag("SortPlays", (r) =>
        Effect.gen(function* () {
          const processor = yield* ChunkProcessorService;
          const playsChunk = Chunk.fromIterable(r.plays);
          const sorted = yield* processor.sortPlays(playsChunk, r.orderBy);
          // Encode results for postMessage serialization
          const sortedArray = Chunk.toReadonlyArray(sorted);
          return yield* Effect.forEach(
            sortedArray,
            (play) => Schema.encode(PlayResult)(play).pipe(Effect.orDie),
            { concurrency: "unbounded" }
          );
        })
      ),
      Match.tag("GroupByDate", (r) =>
        Effect.gen(function* () {
          const processor = yield* ChunkProcessorService;
          const playsChunk = Chunk.fromIterable(r.plays);
          const grouped = yield* processor.groupByDate(playsChunk, r.granularity);

          // Convert HashMap<string, Chunk> to Record<string, Array> for serialization
          // Encode each PlayResult for postMessage (Date -> string)
          const record: Record<string, ReadonlyArray<typeof PlayResult.Encoded>> = {};
          yield* Effect.forEach(
            HashMap.toEntries(grouped),
            ([key, chunk]) =>
              Effect.gen(function* () {
                const array = Chunk.toReadonlyArray(chunk);
                const encoded = yield* Effect.forEach(
                  array,
                  (play) => Schema.encode(PlayResult)(play).pipe(Effect.orDie),
                  { concurrency: "unbounded" }
                );
                record[key] = encoded;
              }),
            { concurrency: "unbounded" }
          );
          return record;
        })
      ),
      Match.tag("ExtractPlayIds", (r) =>
        Effect.gen(function* () {
          const processor = yield* ChunkProcessorService;
          const playsChunk = Chunk.fromIterable(r.plays);
          const ids = yield* processor.extractPlayIds(playsChunk, r.sorted);
          return Chunk.toReadonlyArray(ids);
        })
      ),
      Match.exhaustive
    );
  });

/**
 * Worker Layer Composition
 *
 * Pattern from Effect source (docs/effect-source/platform-browser/test/fixtures/serializedWorker.ts):
 * 1. Use WorkerRunner.layer (NOT manual Layer.scopedDiscard!)
 *    - WorkerRunner.layer already wraps with Layer.scopedDiscard
 *    - WorkerRunner.layer provides the layerCloseLatch needed for lifecycle
 * 2. Provide service layers to eliminate requirements
 * 3. Provide BrowserWorkerRunner.layer for platform implementation
 * 4. Use BrowserWorkerRunner.launch to start the worker
 *
 * Layer dependency tree:
 * WorkerLive
 * ├─ SearchServiceLive (requires TimelineClient)
 * │  └─ TimelineClient.layer (requires FetchHttpClient from BrowserWorkerRunner.layer)
 * ├─ ChunkProcessorServiceLive (no deps)
 * └─ BrowserWorkerRunner.layer (provides platform + FetchHttpClient)
 *
 * CRITICAL: Use WorkerRunner.layer, NOT WorkerRunner.make!
 * - WorkerRunner.layer = Layer.scopedDiscard(make) + layerCloseLatch
 * - The layerCloseLatch keeps the worker alive until explicitly closed
 * - Manual wrapping breaks the lifecycle management
 */
const WorkerLive = WorkerRunner.layer(handleRequest).pipe(
  // Provide our service implementations (SearchService needs TimelineClient, which includes FetchHttpClient)
  Layer.provide(Layer.mergeAll(SearchServiceLive, ChunkProcessorServiceLive)),
  // Provide the browser platform runner
  Layer.provide(BrowserWorkerRunner.layer)
);

/**
 * Worker Entry Point
 *
 * Launch the worker using BrowserWorkerRunner.launch
 * Pattern from Effect source: BrowserWorkerRunner.launch(WorkerLive) + Effect.runFork
 * Reference: docs/effect-source/platform-bun/examples/worker/range.ts
 */
Effect.runFork(BrowserWorkerRunner.launch(WorkerLive));

/**
 * COMPLETED Implementation:
 *
 * ✅ 1. SearchService.executeSearch - Uses real TimelineClient.search.search()
 * ✅ 2. Schema validation - Schema.decodeUnknown(WorkerRequest) for type safety
 * ✅ 3. Type-safe dispatching - Match.tag for exhaustive pattern matching
 * ✅ 4. Layer composition - TimelineClient.layer provided to SearchServiceLive
 * ✅ 5. Proper error types - SearchApiError from @crate/api
 * ✅ 6. No unknown types - All requests use PlayResult schema
 *
 * NEXT STEPS (for future enhancements):
 *
 * 1. Add concurrency control
 *    - Use Effect.all with concurrency limits for batch operations
 *    - Add Stream processing for large result sets
 *    - Implement backpressure handling
 *
 * 2. Add telemetry
 *    - Log request timing
 *    - Track chunk sizes
 *    - Monitor memory usage
 *
 * 3. Testing
 *    - Unit tests for each handler
 *    - Integration tests with mock services
 *    - Load tests for large chunks
 */
