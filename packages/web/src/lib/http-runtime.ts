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
import { sortPlaysByAirdateDesc } from "./timeline-utils";

// Combined runtime with configured HTTP client and Reactivity support

export class TimelineClient extends AtomHttpApi.Tag<TimelineClient>()(
  "TimelineClient",
  {
    api: KexpApi,
    // Provide a Layer that provides the HttpClient
    httpClient: FetchHttpClient.layer,
    baseUrl: "/api",
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

    // Create schema-based stores
    const playStore = kvs.forSchema(PlayResult);
    const lastSeenIdStore = kvs.forSchema(Schema.Number);

    // Use Chunk for ordered storage and HashSet for fast lookups
    const playsChunkStore = kvs.forSchema(Schema.Chunk(PlayResult));
    const playIdsHashSetStore = kvs.forSchema(Schema.HashSet(Schema.Number));

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
        const sortedPlays = sortPlaysByAirdateDesc(Chunk.fromIterable(plays));

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

    // Initialize: Reconstruct chunk on service creation (before atoms are created)
    yield* Effect.log(
      "Initializing TimelineKVS: Reconstructing chunk from all plays"
    );
    yield* reconstructChunkFromAllPlays();

    // Store a play by ID and maintain HashSet for fast lookups
    // The chunk is always reconstructed from the HashSet, so we only update the HashSet here
    const storePlay = (play: PlayResult) =>
      Effect.gen(function* () {
        // Store individual play (single source of truth)
        yield* playStore.set(`timeline:play:${play.id}`, play);
        // Invalidate reactivity key so reactive streams refetch
        yield* Reactivity.invalidate([`timeline:play:${play.id}`]);

        // Get current HashSet from KVS
        const currentHashSetOption = yield* playIdsHashSetStore.get(
          "timeline:play_ids_set"
        );

        // Initialize with empty HashSet if not present
        const currentHashSet = Option.getOrElse(currentHashSetOption, () =>
          HashSet.empty<number>()
        );

        // Fast O(1) lookup to check if play already exists
        if (!HashSet.has(currentHashSet, play.id)) {
          // Add to HashSet (this is the source of truth for which plays exist)
          const newHashSet = HashSet.add(currentHashSet, play.id);

          // Persist HashSet - chunk will be reconstructed when needed
          yield* playIdsHashSetStore.set("timeline:play_ids_set", newHashSet);

          // Invalidate reactivity key for the plays chunk
          // This triggers atoms to refetch, which will reconstruct the chunk from HashSet
          yield* Reactivity.invalidate(["timeline:plays_chunk"]);
        }
      });

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
    // Reconstructs from all plays to ensure single source of truth
    const getPlayIds = () =>
      Effect.gen(function* () {
        const chunk = yield* reconstructChunkFromAllPlays();
        // Extract IDs from Chunk in order (newest first)
        return Chunk.toReadonlyArray(chunk).map((play) => play.id);
      });

    // Get the Chunk of plays directly (for advanced use cases)
    // Reconstructs from all individual plays to ensure single source of truth
    const getPlaysChunk = () =>
      Effect.gen(function* () {
        // Reconstruct from all individual plays to ensure we have the complete set
        // This is the single source of truth
        return yield* reconstructChunkFromAllPlays();
      });

    return {
      storePlay,
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

  // Fetch latest 50 plays on every request to ensure we don't miss any due to ordering changes
  // This guarantees we're in sync even if the order of recent plays changes
  yield* Effect.log("Fetching latest 50 plays to ensure sync");

  const latestTimeline = yield* client.timeline.getTimeline({
    urlParams: { limit: 50 },
  });

  if (latestTimeline.results.length > 0) {
    // Store all fetched plays (storePlay handles deduplication via HashSet)
    yield* Effect.all(
      latestTimeline.results.map((play) => timelineKVS.storePlay(play)),
      { concurrency: "unbounded" }
    );

    // Get the latest play (first in the results, sorted by airdate newest first)
    const latestPlay = latestTimeline.results[0];

    // Update last seen to latest play
    yield* timelineKVS.setLastSeenId(latestPlay.id);

    yield* Effect.log(
      `Stored ${latestTimeline.results.length} plays, latest: play ${latestPlay.id} at ${latestPlay.airdate.toISOString()}`
    );
  } else {
    yield* Effect.log("No plays returned from timeline API");
  }
}).pipe(
  Effect.repeat(Schedule.spaced(Duration.millis(10000))),
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
    TimelineKVS.Default
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
