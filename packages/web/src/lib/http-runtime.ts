import { Atom, AtomHttpApi } from "@effect-atom/atom-react";
import { FetchHttpClient } from "@effect/platform";
import { BrowserKeyValueStore } from "@effect/platform-browser";
import { Reactivity } from "@effect/experimental";
import { KeyValueStore } from "@effect/platform";
import {
  Duration,
  Effect,
  Layer,
  Option,
  Schedule,
  Schema,
  Stream,
} from "effect";
import { KexpApi, PlayResult } from "@crate/api";

// Get base URL from Vite environment variable
const getBaseUrl = (): string => {
  const meta = import.meta as {
    env?: { DEV?: boolean; VITE_API_BASE_URL?: string };
  };

  if (meta.env?.VITE_API_BASE_URL) {
    return meta.env.VITE_API_BASE_URL;
  }

  if (meta.env?.DEV) {
    // Use Vite proxy so dev traffic stays same-origin
    return "/api";
  }

  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost") {
      return "/api";
    }

    if (window.location.host.includes("duckdns.org")) {
      return "/api";
    }
  }

  // Fallback to the public API domain for static builds / SSR
  return "https://cratemusic.duckdns.org";
};

// Combined runtime with configured HTTP client and Reactivity support

class TimelineClient extends AtomHttpApi.Tag<TimelineClient>()(
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
 * Provides localStorage operations for timeline state:
 * - Store/retrieve plays by ID
 * - Store/retrieve last seen play ID
 * - Reactive streams that update when KVS changes
 */
export class TimelineKVS extends Effect.Service<TimelineKVS>()("TimelineKVS", {
  effect: Effect.gen(function* () {
    const kvs = yield* KeyValueStore.KeyValueStore;

    // Create schema-based stores
    const playStore = kvs.forSchema(PlayResult);
    const lastSeenIdStore = kvs.forSchema(Schema.Number);

    // Store a play by ID
    const storePlay = (play: PlayResult) =>
      Effect.gen(function* () {
        yield* playStore.set(`timeline:play:${play.id}`, play);
        // Invalidate reactivity key so reactive streams refetch
        yield* Reactivity.invalidate([`timeline:play:${play.id}`]);
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

    return {
      storePlay,
      getPlay,
      setLastSeenId,
      getLastSeenId,
      getLastSeenPlay,
    } as const;
  }),
  dependencies: [BrowserKeyValueStore.layerLocalStorage, Reactivity.layer],
}) {}

export const FetchLatestLive = Effect.gen(function* () {
  const client = yield* TimelineClient;
  const timelineKVS = yield* TimelineKVS;

  // Get last seen play ID from KVS
  const lastSeenIdOption = yield* timelineKVS.getLastSeenId();

  // Fetch latest play
  const latestTimeline = yield* client.timeline.getTimeline({
    urlParams: { limit: 1 },
  });

  const latestPlay = latestTimeline.results[0];

  if (latestPlay) {
    // Store the latest play
    yield* timelineKVS.storePlay(latestPlay);

    // Check if we need to fetch plays since last seen
    yield* Option.match(lastSeenIdOption, {
      onNone: () =>
        Effect.gen(function* () {
          yield* Effect.log(
            "No last seen play, fetching most recent 200 plays"
          );

          // Fetch the most recent 200 plays
          const recentTimeline = yield* client.timeline.getTimeline({
            urlParams: { limit: 200 },
          });

          // Store all fetched plays
          yield* Effect.all(
            recentTimeline.results.map((play) => timelineKVS.storePlay(play)),
            { concurrency: "unbounded" }
          );

          yield* Effect.log(
            `Stored ${recentTimeline.results.length} recent plays`
          );

          // Set latest play as last seen
          yield* timelineKVS.setLastSeenId(latestPlay.id);
        }),
      onSome: (lastSeenId) =>
        Effect.gen(function* () {
          // Get the last seen play to check its timestamp
          const lastSeenPlayOption = yield* timelineKVS.getPlay(lastSeenId);

          yield* Option.match(lastSeenPlayOption, {
            onNone: () =>
              Effect.gen(function* () {
                yield* Effect.log(
                  `Last seen ID ${lastSeenId} not found in KVS, updating to latest play`
                );
                yield* timelineKVS.setLastSeenId(latestPlay.id);
              }),
            onSome: (lastSeenPlay) =>
              Effect.gen(function* () {
                // Check if latest play is newer than last seen
                if (latestPlay.airdate > lastSeenPlay.airdate) {
                  // Fetch all plays since last seen timestamp
                  yield* Effect.log(
                    `Fetching plays since ${lastSeenPlay.airdate.toISOString()}`
                  );

                  const sinceTimeline = yield* client.timeline.getTimeline({
                    urlParams: {
                      limit: 200,
                      since: lastSeenPlay.airdate.toISOString(),
                    },
                  });

                  // Store all fetched plays
                  yield* Effect.all(
                    sinceTimeline.results.map((play) =>
                      timelineKVS.storePlay(play)
                    ),
                    { concurrency: "unbounded" }
                  );

                  yield* Effect.log(
                    `Stored ${sinceTimeline.results.length} plays since last seen`
                  );
                }

                // Update last seen to latest play
                yield* timelineKVS.setLastSeenId(latestPlay.id);
                yield* Effect.log(
                  `Updated last seen: play ${latestPlay.id} at ${latestPlay.airdate.toISOString()}`
                );
              }),
          });
        }),
    });
  }
}).pipe(
  Effect.repeat(Schedule.spaced(Duration.millis(3000))),
  Effect.forever,
  Effect.forkScoped,
  Effect.uninterruptible,
  Layer.scopedDiscard,
  Layer.provide(Layer.mergeAll(TimelineClient.layer, TimelineKVS.Default))
);

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
