/**
 * Search Worker Error Types
 *
 * Tagged errors for the search worker using Effect's Data.TaggedError.
 * These represent expected error conditions in worker operations.
 */

import { Data } from "effect";

/**
 * Search failed due to invalid query or backend error.
 */
export class SearchError extends Data.TaggedError("SearchError")<{
  readonly query: string;
  readonly reason: string;
}> {}

/**
 * Date filtering failed due to invalid date range.
 */
export class DateRangeError extends Data.TaggedError("DateRangeError")<{
  readonly startDate: Date;
  readonly endDate: Date;
  readonly reason: string;
}> {}

/**
 * Chunk processing failed (e.g., empty chunk, invalid data).
 */
export class ChunkProcessingError extends Data.TaggedError(
  "ChunkProcessingError"
)<{
  readonly operation: string;
  readonly reason: string;
  readonly chunkSize: number;
}> {}

/**
 * Worker initialization failed.
 */
export class WorkerInitError extends Data.TaggedError("WorkerInitError")<{
  readonly reason: string;
}> {}

/**
 * Message serialization/deserialization failed.
 */
export class SerializationError extends Data.TaggedError("SerializationError")<{
  readonly message: string;
  readonly direction: "encode" | "decode";
}> {}
