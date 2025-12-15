import { Atom, AtomHttpApi } from "@effect-atom/atom-react";
import { FetchHttpClient } from "@effect/platform";
import { BrowserKeyValueStore } from "@effect/platform-browser";
import { Reactivity } from "@effect/experimental";
import { KeyValueStore } from "@effect/platform";
import {
  Chunk,
  Duration,
  Effect,
  HashSet,
  Layer,
  Option,
  Schedule,
  Schema,
} from "effect";
import { KexpApi, PlayResult } from "@crate/api";
import { sortPlaysByAirdateThenId } from "./timeline-utils";
import { AlbumBarWorkerClient } from "@/workers/album-bar-worker-client";

// Combined runtime with configured HTTP client and Reactivity support

// Note: Endpoint paths already include /api prefix, so baseUrl should be empty for same-origin
// or the full origin URL (e.g., https://cratemusic.duckdns.org) for cross-origin
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

if (import.meta.env.PROD && !API_BASE_URL) {
  // Emit a clear signal when production builds are missing the API origin.
  // Firebase Hosting deployment should set VITE_API_BASE_URL at build time.
  // eslint-disable-next-line no-console
  console.warn(
    "[http-runtime] VITE_API_BASE_URL is empty in production build; API calls will target relative /api"
  );
}

export class TimelineClient extends AtomHttpApi.Tag<TimelineClient>()(
  "TimelineClient",
  {
    api: KexpApi,
    // Provide a Layer that provides the HttpClient
    httpClient: FetchHttpClient.layer,
    baseUrl: API_BASE_URL,
  }
) {}

export class StreamingLinksClient extends AtomHttpApi.Tag<StreamingLinksClient>()(
  "StreamingLinksClient",
  {
    api: KexpApi,
    httpClient: FetchHttpClient.layer,
    baseUrl: API_BASE_URL,
  }
) {}

export class InsightsClient extends AtomHttpApi.Tag<InsightsClient>()(
  "InsightsClient",
  {
    api: KexpApi,
    httpClient: FetchHttpClient.layer,
    baseUrl: API_BASE_URL,
  }
) {}

/**
 * TimelineKVS Service
 *
 * Provides localStorage operations for timeline state using proper Effect data structures:
 * - Chunk<PlayResult> for ordered storage (maintains insertion order, newest first)
 * - HashSet<number> for O(1) fast lookup of play IDs
 * - Individual play storage by ID
 * - Last seen play ID tracking
 * - Reactive streams that update when KVS changes
 */
export class TimelineKVS extends Effect.Service<TimelineKVS>()("TimelineKVS", {
  effect: Effect.gen(function* () {
    const kvs = yield* KeyValueStore.KeyValueStore;

    // Schema version for cache invalidation
    const SCHEMA_VERSION = 4; // Increment when PlayResult schema changes (v4: StringOrNull for empty strings)
    const versionStore = kvs.forSchema(Schema.Number);

    // Check schema version and clear cache if outdated
    const currentVersion = yield* versionStore.get("timeline:schema_version");
    if (
      Option.isNone(currentVersion) ||
      currentVersion.value !== SCHEMA_VERSION
    ) {
      yield* Effect.log(
        `Schema version mismatch (current: ${Option.getOrElse(currentVersion, () => 0)}, expected: ${SCHEMA_VERSION}). Clearing cache...`
      );
      yield* kvs.clear;
      yield* versionStore.set("timeline:schema_version", SCHEMA_VERSION);
    }

    // Create schema-based stores
    const playStore = kvs.forSchema(PlayResult);
    const lastSeenIdStore = kvs.forSchema(Schema.Number);

    // Use Chunk for ordered storage and HashSet for fast lookups
    const playsChunkStore = kvs.forSchema(Schema.Chunk(PlayResult));
    const playIdsHashSetStore = kvs.forSchema(Schema.HashSet(Schema.Number));

    // Initialize semaphore to serialize writes and prevent race conditions
    const semaphore = yield* Effect.makeSemaphore(1);

    // Reconstruct chunk from all individual plays in KVS
    // This is the single source of truth - loads ALL plays stored individually
    // Uses the HashSet stored in KVS to get all play IDs (no direct localStorage access)
    const reconstructChunkFromAllPlays = () =>
      Effect.gen(function* () {
        // Get the HashSet of play IDs from KVS (our source of truth for which plays exist)
        const playIdsHashSetOption = yield* playIdsHashSetStore.get(
          "timeline:play_ids_set"
        );

        // Get play IDs from HashSet, or start with empty if HashSet doesn't exist yet
        const playIds = Option.match(playIdsHashSetOption, {
          onNone: () => [] as number[],
          onSome: (hashSet) => HashSet.toValues(hashSet),
        });

        if (playIds.length === 0) {
          yield* Effect.log(
            "No plays found in HashSet, starting with empty chunk"
          );
          const emptyChunk = Chunk.empty<PlayResult>();
          yield* playsChunkStore.set("timeline:plays_chunk", emptyChunk);
          return emptyChunk;
        }

        yield* Effect.log(
          `Reconstructing chunk from ${playIds.length} play IDs in HashSet`
        );

        // Load all plays in parallel using the play IDs from HashSet
        const playOptions = yield* Effect.all(
          playIds.map((id) => playStore.get(`timeline:play:${id}`)),
          { concurrency: "unbounded" }
        );

        // Filter out None values and extract plays
        // (Some plays might have been removed from KVS but still in HashSet)
        const plays = playOptions
          .filter((opt): opt is Option.Some<PlayResult> => Option.isSome(opt))
          .map((opt) => opt.value);

        // Update HashSet to remove any IDs that no longer have plays
        const validPlayIds = plays.map((play) => play.id);
        const validPlayIdsSet = HashSet.fromIterable(validPlayIds);

        // Sort by airdate (newest first) using Order utilities
        const sortedPlays = sortPlaysByAirdateThenId(Chunk.fromIterable(plays));

        // Persist the reconstructed chunk and updated HashSet
        yield* playsChunkStore.set("timeline:plays_chunk", sortedPlays);
        yield* playIdsHashSetStore.set(
          "timeline:play_ids_set",
          validPlayIdsSet
        );

        // Don't invalidate reactivity here - atoms aren't created yet during initialization
        yield* Effect.log(
          `Reconstructed chunk with ${Chunk.size(sortedPlays)} plays from KVS`
        );

        return sortedPlays;
      });

    // FAST STARTUP: Try to use cached chunk directly, defer reconstruction
    // This prevents blocking the main thread on startup with large play counts
    yield* Effect.log("Initializing TimelineKVS: Checking for cached chunk");

    const cachedChunkOption = yield* playsChunkStore.get(
      "timeline:plays_chunk"
    );
    const initialChunk = yield* Option.match(cachedChunkOption, {
      onSome: (cached) =>
        Effect.gen(function* () {
          const playCount = Chunk.size(cached);
          yield* Effect.log(
            `TimelineKVS: Using cached chunk with ${playCount} plays (fast path)`
          );
          return cached;
        }),
      onNone: () =>
        Effect.gen(function* () {
          // Only reconstruct if no cached chunk exists
          yield* Effect.log(
            "TimelineKVS: No cached chunk, reconstructing (slow path)"
          );
          return yield* reconstructChunkFromAllPlays();
        }),
    });

    const playCount = Chunk.size(initialChunk);
    yield* Effect.log(`TimelineKVS initialized with ${playCount} plays`);

    // Store a play by ID and maintain both HashSet and cached Chunk
    // Uses incremental chunk updates instead of full reconstruction for better performance
    const storePlay = (play: PlayResult) =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          // Store individual play (single source of truth)
          yield* playStore.set(`timeline:play:${play.id}`, play);

          // Get current HashSet from KVS
          const currentHashSetOption = yield* playIdsHashSetStore.get(
            "timeline:play_ids_set"
          );

          // Initialize with empty HashSet if not present
          const currentHashSet = Option.getOrElse(currentHashSetOption, () =>
            HashSet.empty<number>()
          );

          // Fast O(1) lookup to check if play already exists
          const isNewInSet = !HashSet.has(currentHashSet, play.id);

          // Get current cached chunk (if exists)
          const currentChunkOption = yield* playsChunkStore.get(
            "timeline:plays_chunk"
          );

          let currentChunk = Option.getOrElse(currentChunkOption, () =>
            Chunk.empty<PlayResult>()
          );

          // SAFETY CHECK: Ensure play isn't already in chunk even if Set says it's new
          // This handles cases where Set and Chunk got out of sync
          const isAlreadyInChunk = Chunk.some(
            currentChunk,
            (p) => p.id === play.id
          );

          if (isNewInSet && isAlreadyInChunk) {
            yield* Effect.logWarning(
              `[TimelineKVS] Play ${play.id} missing from Set but present in Chunk. Repairing Set.`
            );
          }

          const isNew = isNewInSet && !isAlreadyInChunk;

          if (isNew) {
            // New play - add to HashSet
            const newHashSet = HashSet.add(currentHashSet, play.id);
            yield* playIdsHashSetStore.set("timeline:play_ids_set", newHashSet);

            // Incremental update to cached chunk (prepend new play)
            // PERF OPTIMIZATION: Skip sorting if new play is clearly newest
            const firstPlay = Chunk.head(currentChunk);
            const needsSort = Option.match(firstPlay, {
              onNone: () => false, // Empty chunk, no sort needed
              onSome: (first) => {
                // Only sort if new play is older than first play
                // (airdate comparison: newer = larger timestamp)
                const newTime = play.airdate?.getTime() ?? 0;
                const firstTime = first.airdate?.getTime() ?? 0;
                return newTime < firstTime;
              },
            });

            const updatedChunk = needsSort
              ? sortPlaysByAirdateThenId(Chunk.prepend(currentChunk, play))
              : Chunk.prepend(currentChunk, play);

            // Persist updated chunk
            yield* playsChunkStore.set("timeline:plays_chunk", updatedChunk);

            yield* Effect.logDebug(
              `[TimelineKVS] New play added: ${play.id}, chunk size: ${Chunk.size(updatedChunk)}, sorted: ${needsSort}`
            );
          } else {
            // Existing play - update in chunk if cached (metadata update, enrichment, etc.)
            if (Option.isSome(currentChunkOption) || isAlreadyInChunk) {
              // Replace the play in the chunk
              const updatedChunk = Chunk.map(currentChunk, (p) =>
                p.id === play.id ? play : p
              );

              // Persist updated chunk
              yield* playsChunkStore.set("timeline:plays_chunk", updatedChunk);

              // If we repaired the set, save it too
              if (isNewInSet && isAlreadyInChunk) {
                const newHashSet = HashSet.add(currentHashSet, play.id);
                yield* playIdsHashSetStore.set(
                  "timeline:play_ids_set",
                  newHashSet
                );
              }

              yield* Effect.logDebug(
                `[TimelineKVS] Play updated: ${play.id}, chunk size: ${Chunk.size(updatedChunk)}`
              );
            } else {
              // No cached chunk - will be reconstructed on next read
              yield* Effect.logDebug(
                `[TimelineKVS] Play updated: ${play.id}, no cached chunk (will reconstruct)`
              );
            }
          }

          // Always invalidate reactivity keys, even for metadata updates to existing plays
          // This ensures chunk atoms stay in sync with KV store (artist corrections, enrichment, etc.)
          yield* Reactivity.invalidate([
            "timeline:plays_chunk",
            `timeline:play:${play.id}`,
          ]);

          yield* Effect.logTrace(
            `[TimelineKVS] Reactivity invalidated for play ${play.id}`
          );
        })
      );

    // BATCH STORE: Store multiple plays efficiently with single reactivity invalidation
    // This is much faster than calling storePlay() for each play individually
    const storePlays = (plays: readonly PlayResult[]) =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          if (plays.length === 0) return;

          yield* Effect.log(
            `[TimelineKVS] Batch storing ${plays.length} plays`
          );

          // Get current state once
          const currentHashSetOption = yield* playIdsHashSetStore.get(
            "timeline:play_ids_set"
          );
          let currentHashSet = Option.getOrElse(currentHashSetOption, () =>
            HashSet.empty<number>()
          );

          const currentChunkOption = yield* playsChunkStore.get(
            "timeline:plays_chunk"
          );
          let currentChunk = Option.getOrElse(currentChunkOption, () =>
            Chunk.empty<PlayResult>()
          );

          const newPlayIds: number[] = [];

          // Store each play and track new IDs
          for (const play of plays) {
            yield* playStore.set(`timeline:play:${play.id}`, play);

            const isNewInSet = !HashSet.has(currentHashSet, play.id);

            // SAFETY CHECK: Ensure play isn't already in chunk
            // We use find because we might have added it in this very batch loop if duplicates exist in input
            // But input duplicates should be handled by logic below?
            // Actually, let's check currentChunk.
            // Note: Chunk.some is O(N). For batch of 200, doing this 200 times is 200*N.
            // But N can be large (thousands). This is slow.
            // Optimization: Build a Set of IDs from currentChunk once?
            // But currentChunk changes in the loop.

            // Better: We rely on HashSet for speed, but if HashSet says NEW, we verify with Chunk once?
            // Or we trust the Semaphore to keep them in sync.
            // The Semaphore guarantees no other writers.
            // So if we maintain the invariant that Set and Chunk are in sync, we are good.
            // But we want "fool proof".

            // Let's trust HashSet BUT handle the case where we might have duplicates in the INPUT `plays` array.
            // And also check if we already added it in this batch.

            if (isNewInSet) {
              // Check if we already added it in this batch (e.g. input has duplicates)
              if (newPlayIds.includes(play.id)) {
                continue;
              }

              // Check if it's in the chunk (repair logic)
              const isInChunk = Chunk.some(
                currentChunk,
                (p) => p.id === play.id
              );

              if (isInChunk) {
                // Repair Set
                currentHashSet = HashSet.add(currentHashSet, play.id);
                // Update play in chunk
                currentChunk = Chunk.map(currentChunk, (p) =>
                  p.id === play.id ? play : p
                );
              } else {
                // Truly new
                currentHashSet = HashSet.add(currentHashSet, play.id);
                currentChunk = Chunk.prepend(currentChunk, play);
                newPlayIds.push(play.id);
              }
            } else {
              // Update existing play in chunk
              currentChunk = Chunk.map(currentChunk, (p) =>
                p.id === play.id ? play : p
              );
            }
          }

          // Sort once at the end (instead of per-play)
          if (newPlayIds.length > 0) {
            currentChunk = sortPlaysByAirdateThenId(currentChunk);
          }

          // Persist updated state
          yield* playIdsHashSetStore.set(
            "timeline:play_ids_set",
            currentHashSet
          );
          yield* playsChunkStore.set("timeline:plays_chunk", currentChunk);

          // Single reactivity invalidation for all plays
          yield* Reactivity.invalidate(["timeline:plays_chunk"]);

          yield* Effect.log(
            `[TimelineKVS] Batch stored ${plays.length} plays (${newPlayIds.length} new), chunk size: ${Chunk.size(currentChunk)}`
          );
        })
      );

    // Get a play by ID (for use in atoms - Effect Atom handles reactivity)
    const getPlay = (id: number) => playStore.get(`timeline:play:${id}`);

    // Store last seen play ID
    const setLastSeenId = (id: number) =>
      Effect.gen(function* () {
        yield* lastSeenIdStore.set("timeline:last_seen_id", id);
        // Invalidate reactivity key
        yield* Reactivity.invalidate(["timeline:last_seen_id"]);
      });

    // Get last seen play ID (for use in atoms - Effect Atom handles reactivity)
    const getLastSeenId = () => lastSeenIdStore.get("timeline:last_seen_id");

    // Get last seen play - combines ID lookup with play lookup
    // (for use in atoms - Effect Atom handles reactivity via Atom.withReactivity)
    const getLastSeenPlay = () =>
      Effect.gen(function* () {
        const idOption = yield* lastSeenIdStore.get("timeline:last_seen_id");
        return yield* Option.match(idOption, {
          onNone: () => Effect.succeed(Option.none<PlayResult>()),
          onSome: (id) => playStore.get(`timeline:play:${id}`),
        });
      });

    // Get the list of play IDs in order (from Chunk, maintaining insertion order)
    // Reads from cached chunk, only reconstructs if cache miss
    const getPlayIds = () =>
      Effect.gen(function* () {
        // Try to read from cached chunk first
        const cachedChunkOption = yield* playsChunkStore.get(
          "timeline:plays_chunk"
        );

        const chunk = yield* Option.match(cachedChunkOption, {
          // Cache hit - use stored chunk
          onSome: (cachedChunk) =>
            Effect.gen(function* () {
              yield* Effect.logDebug(
                `Using cached chunk with ${Chunk.size(cachedChunk)} plays`
              );
              return cachedChunk;
            }),
          // Cache miss - reconstruct and store
          onNone: () =>
            Effect.gen(function* () {
              yield* Effect.logInfo(
                "Cache miss for plays_chunk, reconstructing from all plays"
              );
              return yield* reconstructChunkFromAllPlays();
            }),
        });

        // Extract IDs from Chunk in order (newest first)
        return Chunk.toReadonlyArray(chunk).map((play) => play.id);
      });

    // Get the Chunk of plays directly (for advanced use cases)
    // Reads from cached chunk, only reconstructs if cache miss
    const getPlaysChunk = () =>
      Effect.gen(function* () {
        // Try to read from cached chunk first
        const cachedChunkOption = yield* playsChunkStore.get(
          "timeline:plays_chunk"
        );

        return yield* Option.match(cachedChunkOption, {
          // Cache hit - use stored chunk
          onSome: (cachedChunk) =>
            Effect.gen(function* () {
              yield* Effect.logDebug(
                `Using cached chunk with ${Chunk.size(cachedChunk)} plays`
              );
              return cachedChunk;
            }),
          // Cache miss - reconstruct and store
          onNone: () =>
            Effect.gen(function* () {
              yield* Effect.logInfo(
                "Cache miss for plays_chunk, reconstructing from all plays"
              );
              return yield* reconstructChunkFromAllPlays();
            }),
        });
      });

    return {
      storePlay,
      storePlays, // Batch store for performance
      getPlay,
      setLastSeenId,
      getLastSeenId,
      getLastSeenPlay,
      getPlayIds,
      getPlaysChunk,
    } as const;
  }),
  dependencies: [BrowserKeyValueStore.layerLocalStorage, Reactivity.layer],
}) {}

export const FetchLatestLive = Effect.gen(function* () {
  const client = yield* TimelineClient;
  const timelineKVS = yield* TimelineKVS;

  // Fetch latest 200 plays on every request to ensure we don't miss any due to ordering changes
  // This guarantees we're in sync even if the order of recent plays changes
  // Larger limit helps recover from cache clears due to schema version bumps
  yield* Effect.log("Fetching latest 200 plays to ensure sync");

  const result = yield* Effect.either(
    client.timeline.getTimeline({
      urlParams: { limit: 200 },
    })
  );

  if (result._tag === "Left") {
    yield* Effect.logError(`ERROR fetching timeline: ${result.left}`);
    return;
  }

  const latestTimeline = result.right;
  yield* Effect.log(`Received ${latestTimeline.results.length} plays from API`);

  if (latestTimeline.results.length > 0) {
    // PERF: Use batch store for single reactivity invalidation
    // This is MUCH faster than storing each play individually (200 invalidations -> 1)
    const storeResult = yield* Effect.either(
      timelineKVS.storePlays(latestTimeline.results)
    );

    if (storeResult._tag === "Left") {
      yield* Effect.logError(`ERROR storing plays: ${storeResult.left}`);
      return;
    }

    // Get the latest play (first in the results, sorted by airdate newest first)
    const latestPlay = latestTimeline.results[0];

    // Update last seen to latest play
    yield* timelineKVS.setLastSeenId(latestPlay.id);

    yield* Effect.log(
      `Batch stored ${latestTimeline.results.length} plays, latest: play ${latestPlay.id} at ${latestPlay.airdate.toISOString()}`
    );
  } else {
    yield* Effect.log("No plays returned from timeline API");
  }
}).pipe(
  // Poll every 30 seconds for responsive live updates
  Effect.repeat(Schedule.spaced(Duration.seconds(30))),
  Effect.forever,
  Effect.forkScoped,
  Effect.uninterruptible,
  Layer.scopedDiscard,
  Layer.provide(Layer.mergeAll(TimelineClient.layer, TimelineKVS.Default))
);

// Note: SearchWorkerClient is imported at runtime to avoid circular deps
// It will be added to the runtime when the atoms module loads
export const TimelineRuntime = Atom.runtime(
  Layer.mergeAll(
    Reactivity.layer,
    BrowserKeyValueStore.layerLocalStorage,
    FetchHttpClient.layer,
    TimelineKVS.Default,
    AlbumBarWorkerClient.Default,
    TimelineClient.layer,
    StreamingLinksClient.layer,
    InsightsClient.layer
  )
);

/**
 * Type-safe KEXP API client.
 *
 * Provides compile-time type safety for all API calls.
 * Automatically handles schema validation.
 *
 * Usage in atoms:
 * ```typescript
 * export const fetchTimelineAtom = httpRuntime.fn()(
 *   () => Effect.gen(function* () {
 *     const client = yield* kexpApiClient
 *     const timeline = yield* client.timeline.getTimeline({
 *       urlParams: { limit: 50 }
 *     })
 *     return timeline
 *   })
 * )
 * ```
 */

// localStorage runtime for persisting state
