/**
 * Search Worker Protocol
 *
 * Defines the typed message protocol between main thread and search worker.
 * Uses Effect Schema for type-safe serialization and validation.
 */

import { Schema } from "effect";
import type { Chunk } from "effect";
import { PlayResult } from "@crate/api";

/**
 * Worker Request Messages
 *
 * All messages sent from main thread to worker.
 * Uses Schema.TaggedRequest for automatic serialization.
 */

/**
 * Execute a search query and return matching plays.
 *
 * Pattern: Schema.TaggedRequest with proper failure/success schemas
 * Reference: docs/effect-source/effect/test/Schema/Schema/Class/TaggedRequest.test.ts
 *
 * Note: Using Schema.Unknown for failure since SearchApiError is a TaggedError (not a Schema).
 * The actual error handling happens in the Effect error channel.
 */
export class SearchRequest extends Schema.TaggedRequest<SearchRequest>()(
  "SearchRequest",
  {
    failure: Schema.Unknown, // SearchApiError flows through Effect error channel
    success: Schema.Array(PlayResult), // Array<PlayResult> - Chunk can't serialize over postMessage
    payload: {
      query: Schema.String,
      limit: Schema.optionalWith(Schema.Number, { default: () => 100 }),
      offset: Schema.optionalWith(Schema.Number, { default: () => 0 }),
    },
  }
) {}

/**
 * Filter plays by date range.
 * Returns a new chunk containing only plays within the specified range.
 */
export class FilterByDateRangeRequest
  extends Schema.TaggedRequest<FilterByDateRangeRequest>()(
    "FilterByDateRange",
    {
      failure: Schema.Never, // Pure operation, no failures
      success: Schema.Array(PlayResult),
      payload: {
        plays: Schema.Array(PlayResult),
        startDate: Schema.DateFromString,
        endDate: Schema.DateFromString,
      },
    }
  ) {}

/**
 * Sort plays by a specific order.
 */
export class SortPlaysRequest extends Schema.TaggedRequest<SortPlaysRequest>()(
  "SortPlays",
  {
    failure: Schema.Never, // Pure operation, no failures
    success: Schema.Array(PlayResult),
    payload: {
      plays: Schema.Array(PlayResult),
      orderBy: Schema.Literal(
        "airdate-desc",
        "airdate-asc",
        "similarity-desc",
        "id-desc",
        "id-asc"
      ),
    },
  }
) {}

/**
 * Group plays by date.
 * Returns a HashMap<dateString, Chunk<Play>>.
 */
export class GroupByDateRequest
  extends Schema.TaggedRequest<GroupByDateRequest>()(
    "GroupByDate",
    {
      failure: Schema.Never, // Pure operation, no failures
      success: Schema.Record({ key: Schema.String, value: Schema.Chunk(PlayResult) }),
      payload: {
        plays: Schema.Chunk(PlayResult),
        granularity: Schema.Literal("day", "week", "month"),
      },
    }
  ) {}

/**
 * Extract play IDs from a chunk of plays.
 */
export class ExtractPlayIdsRequest
  extends Schema.TaggedRequest<ExtractPlayIdsRequest>()(
    "ExtractPlayIds",
    {
      failure: Schema.Never, // Pure operation, no failures
      success: Schema.Array(Schema.Number),
      payload: {
        plays: Schema.Array(PlayResult),
        sorted: Schema.optionalWith(Schema.Boolean, { default: () => false }),
      },
    }
  ) {}

/**
 * Union of all worker requests.
 * This is used for Schema validation and Match.tag dispatching.
 *
 * Pattern: Schema.Union for discriminated union validation
 */
export const WorkerRequest = Schema.Union(
  SearchRequest,
  FilterByDateRangeRequest,
  SortPlaysRequest,
  GroupByDateRequest,
  ExtractPlayIdsRequest
);

export type WorkerRequest =
  | SearchRequest
  | FilterByDateRangeRequest
  | SortPlaysRequest
  | GroupByDateRequest
  | ExtractPlayIdsRequest;

/**
 * Worker Response Types
 *
 * These are the success types for each request.
 * Errors are handled through Effect's error channel.
 *
 * Note: Using ReadonlyArray instead of Chunk because Chunk can't serialize over postMessage.
 * It has internal structure that doesn't survive the structured clone algorithm.
 * Callers can convert to Chunk if needed: Chunk.fromIterable(results)
 */

export type SearchResponse = ReadonlyArray<typeof PlayResult.Type>;
export type FilterByDateRangeResponse = ReadonlyArray<typeof PlayResult.Type>;
export type SortPlaysResponse = ReadonlyArray<typeof PlayResult.Type>;
export type GroupByDateResponse = Record<string, Chunk.Chunk<typeof PlayResult.Type>>;
export type ExtractPlayIdsResponse = ReadonlyArray<number>;
