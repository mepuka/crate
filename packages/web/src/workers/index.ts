/**
 * Workers Module
 *
 * Web Workers for offloading heavy computations from the main thread.
 */

// Client API (for main thread)
export {
  SearchWorkerClient,
  searchInWorker,
  filterInWorker,
  sortInWorker,
} from "./search-worker-client";

// Protocol types (shared between main thread and worker)
export type {
  SearchRequest,
  FilterByDateRangeRequest,
  SortPlaysRequest,
  GroupByDateRequest,
  ExtractPlayIdsRequest,
  WorkerRequest,
  SearchResponse,
  FilterByDateRangeResponse,
  SortPlaysResponse,
  GroupByDateResponse,
  ExtractPlayIdsResponse,
} from "./search-worker-protocol";

// Error types
export {
  SearchError,
  DateRangeError,
  ChunkProcessingError,
  WorkerInitError,
  SerializationError,
} from "./search-worker-errors";
