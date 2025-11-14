/**
 * Search Worker Atoms
 *
 * Effect Atom integration for the search worker.
 * Creates a separate runtime with SearchWorkerClient.
 *
 * IMPORTANT: SearchWorkerClient is NOT in TimelineRuntime's layers,
 * so we create atoms using Atom.runtime with SearchWorkerClient.Default.
 */

import { Atom } from "@effect-atom/atom-react";
import { Effect, Chunk, Layer } from "effect";
import type { PlayResult } from "@crate/api";
import { SearchWorkerClient } from "@/workers/search-worker-client";
import { Reactivity } from "@effect/experimental";
import { BrowserKeyValueStore } from "@effect/platform-browser";

/**
 * Runtime for search worker atoms.
 * Includes SearchWorkerClient and necessary platform layers.
 */
const SearchWorkerRuntime = Atom.runtime(
  Layer.mergeAll(
    Reactivity.layer,
    BrowserKeyValueStore.layerLocalStorage,
    SearchWorkerClient.Default
  )
);

/**
 * Search Query Atom
 *
 * Executes a search query in the worker and returns results.
 * Uses Atom.family to create separate atoms for each query.
 *
 * Pattern: TimelineRuntime.atom(Effect.provide(SearchWorkerClient.Default))
 *
 * Usage:
 * ```tsx
 * const results = Atom.use(searchQueryAtom("funk soul"))
 * ```
 */
export const searchQueryAtom = Atom.family((query: string) =>
  SearchWorkerRuntime.atom(
    Effect.gen(function* () {
      const client = yield* SearchWorkerClient;
      return yield* client.search(query, { limit: 50, offset: 0 });
    })
  )
);

/**
 * Search Query Atom with Options
 *
 * More flexible version that accepts limit and offset.
 *
 * Usage:
 * ```tsx
 * const results = Atom.use(searchWithOptionsAtom({ query: "jazz", limit: 100, offset: 0 }))
 * ```
 */
export const searchWithOptionsAtom = Atom.family(
  (params: { query: string; limit?: number; offset?: number }) =>
    SearchWorkerRuntime.atom(
      Effect.gen(function* () {
        const client = yield* SearchWorkerClient;
        return yield* client.search(params.query, {
          limit: params.limit ?? 50,
          offset: params.offset ?? 0,
        });
      })
    )
);

/**
 * Sort Plays Atom
 *
 * Sorts plays in the worker (offloading from main thread).
 *
 * Note: Accepts Chunk or ReadonlyArray. Converts to Array for worker communication.
 * Returns ReadonlyArray (callers can convert to Chunk if needed).
 *
 * Usage:
 * ```tsx
 * const sorted = useAtomValue(sortPlaysAtom({ plays, orderBy: "airdate-desc" }))
 * ```
 */
export const sortPlaysAtom = Atom.family(
  (params: {
    plays: Chunk.Chunk<typeof PlayResult.Type> | ReadonlyArray<typeof PlayResult.Type>;
    orderBy:
      | "airdate-desc"
      | "airdate-asc"
      | "similarity-desc"
      | "id-desc"
      | "id-asc";
  }) =>
    SearchWorkerRuntime.atom(
      Effect.gen(function* () {
        const client = yield* SearchWorkerClient;
        // Convert Chunk to Array if needed
        const playsArray = Chunk.isChunk(params.plays)
          ? Chunk.toReadonlyArray(params.plays)
          : params.plays;
        return yield* client.sortPlays(playsArray, params.orderBy);
      })
    )
);
