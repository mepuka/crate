/**
 * Stream-Based Timeline Atoms (EXPERIMENTAL)
 *
 * New atoms that consume timeline streams directly.
 * These are experimental atoms for Phase 1 stream layer refactoring.
 *
 * IMPORTANT: Existing timeline atoms remain unchanged.
 * These atoms demonstrate the new stream-based pattern.
 *
 * Architecture:
 * - Streams are the source of truth (not state atoms)
 * - Atoms reactively consume stream updates
 * - TimelineKVS still stores data (shared with existing atoms)
 * - Can be toggled between pagination stream and mock SSE stream
 */

import { Atom } from "@effect-atom/atom-react";
import { Effect, Stream, Chunk } from "effect";
import { TimelineRuntime, TimelineKVS } from "@/lib/http-runtime";
import type { PlayResult, TimelineParams } from "@crate/api";
import type { MockSSEConfig } from "@/streams/timeline-mock-sse-stream";
import { createTimelinePaginationStream } from "@/streams/timeline-pagination-stream";
import { createMockSSEStream, createBurstMockSSEStream } from "@/streams/timeline-mock-sse-stream";
import { playAtom } from "@/atoms/timeline";

/**
 * Stream mode for testing different patterns
 */
export type StreamMode = "pagination" | "mock-sse" | "burst-sse" | "off";

/**
 * Configuration for stream-based timeline
 */
export interface StreamTimelineConfig {
  readonly mode: StreamMode;
  readonly paginationParams?: TimelineParams;
  readonly sseConfig?: MockSSEConfig;
  readonly maxPages?: number; // For pagination mode
}

/**
 * Default stream configuration
 */
const defaultStreamConfig: StreamTimelineConfig = {
  mode: "off",
  paginationParams: { limit: 20 },
  sseConfig: { emitIntervalMs: 2000, maxPlays: 100 },
  maxPages: 5,
};

/**
 * Atom: Stream configuration (writable)
 * Users can update this to switch between stream modes.
 */
export const streamTimelineConfigAtom = Atom.make(defaultStreamConfig);

/**
 * Atom: Current stream mode (derived from config)
 */
export const streamModeAtom = Atom.make((get) => {
  const config = get(streamTimelineConfigAtom);
  return config.mode;
});

/**
 * Atom: Collected play IDs from stream (writable)
 * This gets updated as the stream runs and emits plays.
 */
export const streamPlayIdsAtom = Atom.make<readonly number[]>([]);

/**
 * Atom: Count of plays from stream
 */
export const streamPlayCountAtom = Atom.make((get) => {
  const ids = get(streamPlayIdsAtom);
  return ids.length;
});

/**
 * Atom: Stream status (writable)
 */
export type StreamStatus =
  | { readonly status: "off" }
  | { readonly status: "loading" }
  | { readonly status: "complete"; readonly count: number }
  | { readonly status: "error"; readonly error: unknown };

export const streamStatusAtom = Atom.make<StreamStatus>({ status: "off" });

/**
 * Action atom: Start/restart stream with config.
 * Actually runs the stream and collects results.
 * Uses Effect patterns for proper error handling.
 */
export const restartStreamAtom = TimelineRuntime.fn<StreamTimelineConfig>()(
  (config, get) => {
    // Track collected play IDs using a mutable ref that survives across Effect steps
    let collectedIds: number[] = [];

    return Effect.gen(function* () {
      yield* Effect.log(
        `[Stream Atoms] Restarting stream with mode: ${config.mode}`
      );

      // Update config
      get.set(streamTimelineConfigAtom, config);

      // Clear previous results
      get.set(streamPlayIdsAtom, []);
      collectedIds = [];

      // If mode is off, just update status and return
      if (config.mode === "off") {
        get.set(streamStatusAtom, { status: "off" });
        return;
      }

      // Set loading status
      get.set(streamStatusAtom, { status: "loading" });

      // Get KVS for storing plays
      const kvs = yield* TimelineKVS;

      // Create appropriate stream based on mode
      const stream = (() => {
        switch (config.mode) {
          case "pagination": {
            const paginationStream = createTimelinePaginationStream(
              config.paginationParams ?? { limit: 20 }
            );
            // Limit to maxPages if specified
            return config.maxPages
              ? paginationStream.pipe(Stream.take(config.maxPages))
              : paginationStream;
          }
          case "mock-sse":
            return createMockSSEStream(
              config.sseConfig ?? { emitIntervalMs: 2000, maxPlays: 100 }
            );
          case "burst-sse":
            return createBurstMockSSEStream(5, 10000, 100).pipe(
              Stream.take(config.sseConfig?.maxPlays ?? 100)
            );
          default:
            return Stream.empty;
        }
      })();

      // Run the stream - handle different types appropriately
      if (config.mode === "pagination") {
        // Pagination mode returns PageResult objects
        const paginationStream = stream as ReturnType<typeof createTimelinePaginationStream>;

        yield* Stream.runForEach(
          paginationStream,
          (pageResult) =>
            Effect.gen(function* () {
              // Extract plays from PageResult
              const plays = pageResult.response.results;

              // Plays are already stored in KVS by the pagination stream
              // Just collect the IDs
              const pageIds = plays.map((play) => play.id);
              collectedIds.push(...pageIds);

              // Update atom with accumulated IDs
              get.set(streamPlayIdsAtom, [...collectedIds]);

              yield* Effect.log(
                `[Stream Atoms] Collected ${collectedIds.length} plays so far`
              );
            })
        );
      } else {
        // SSE modes return PlayResult objects directly
        const playStream = stream as Stream.Stream<PlayResult, never, never>;

        yield* Stream.runForEach(
          playStream,
          (play) =>
            Effect.gen(function* () {
              // Store play in KVS
              yield* kvs.storePlay(play);

              // Collect ID
              collectedIds.push(play.id);

              // Update atom with accumulated IDs
              get.set(streamPlayIdsAtom, [...collectedIds]);

              yield* Effect.log(
                `[Stream Atoms] Received play: ${play.artist} - ${play.song} (${collectedIds.length} total)`
              );
            })
        );
      }

      // Stream completed successfully
      get.set(streamStatusAtom, {
        status: "complete",
        count: collectedIds.length,
      });

      yield* Effect.log(
        `[Stream Atoms] Stream completed with ${collectedIds.length} plays`
      );
    }).pipe(
      // Use Effect.catchAll for proper error handling
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          // Stream failed - update status with error
          get.set(streamStatusAtom, { status: "error", error });
          yield* Effect.logError(
            `[Stream Atoms] Stream failed: ${String(error)}`
          );
        })
      )
    );
  }
);

/**
 * Action atom: Stop stream
 */
export const stopStreamAtom = TimelineRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    yield* Effect.log("[Stream Atoms] Stopping stream");
    get.set(streamTimelineConfigAtom, { ...defaultStreamConfig, mode: "off" });
    get.set(streamStatusAtom, { status: "off" });
  })
);

/**
 * Action atom: Switch stream mode
 */
export const switchStreamModeAtom = TimelineRuntime.fn<StreamMode>()(
  (mode, get) =>
    Effect.gen(function* () {
      const currentConfig = get(streamTimelineConfigAtom);
      const newConfig: StreamTimelineConfig = {
        ...currentConfig,
        mode,
      };

      yield* Effect.log(`[Stream Atoms] Switching to mode: ${mode}`);
      get.set(streamTimelineConfigAtom, newConfig);
    })
);

/**
 * Derived atom: Stream play IDs as a Chunk for UI consumption.
 * Components should use these IDs with playAtom(id) to get actual play data.
 * Only returns IDs collected during the current stream session.
 */
export const streamPlaysAtom = Atom.make((get) => {
  const streamStatus = get(streamStatusAtom);
  const streamIds = get(streamPlayIdsAtom);

  // Return empty if stream is off or no IDs collected
  if (streamStatus.status === "off" || streamIds.length === 0) {
    return Chunk.empty<number>();
  }

  return Chunk.fromIterable(streamIds);
});

/**
 * Derived atom: Full play data for stream plays.
 * Reads each play via playAtom(id) and returns array of Result<Option<PlayResult>>.
 * This atom solves the React Rules of Hooks violation by doing the mapping at the atom level
 * instead of in a component render function.
 */
export const streamPlaysDataAtom = Atom.make((get) => {
  const playIdsChunk = get(streamPlaysAtom);
  const playIds = Chunk.toReadonlyArray(playIdsChunk);
  // Read each play using playAtom - this is safe at the atom level
  return playIds.map((id) => get(playAtom(id)));
});

/**
 * Atom: Recent N plays from stream (for display)
 */
export const streamRecentPlaysAtom = Atom.family((n: number) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const kvs = yield* TimelineKVS;

      // Get the full plays chunk from KVS
      const playsChunk = yield* kvs.getPlaysChunk();

      // Take first N plays (already sorted newest first)
      return Chunk.take(playsChunk, n);
    })
  ).pipe(Atom.withReactivity(["timeline:play", "timeline:plays_chunk"]))
);
