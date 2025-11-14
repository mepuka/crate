import { Atom, Result } from "@effect-atom/atom-react";
import { FetchLatestLive, TimelineKVS } from "@/lib/http-runtime";
import { Chunk, Effect, Layer } from "effect";
import { TimelineRuntime } from "@/lib/http-runtime";
import {
  sortPlaysByAirdateDesc,
  sortPlaysByAirdateAsc,
  sortPlaysByIdDesc,
  getNewestPlay,
  getOldestPlay,
  getNewestNPlays,
  extractPlayIds,
} from "@/lib/timeline-utils";
import { createShowBoundariesAtom } from "@/atoms/kexp-atoms";
import type { Play } from "@/domain/Play";

// Atom that launches the background fetching service
export const latestItemAtom = Atom.runtime((_get) =>
  Effect.gen(function* () {
    yield* Layer.launch(FetchLatestLive);
  }).pipe(Layer.effectDiscard)
);

/**
 * Reactive atom for the last seen play.
 * Automatically updates when TimelineKVS invalidates "timeline:last_seen_id" or "timeline:play" keys.
 *
 * According to Effect Atom docs: https://github.com/tim-smart/effect-atom?tab=readme-ov-file#integration-with-reactivity-from-effectexperimental
 * We use runtime.atom(effect) with Atom.withReactivity() - the effect should be a regular Effect, not a Stream.
 */
export const lastSeenPlayAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const timelineKVS = yield* TimelineKVS;
    return yield* timelineKVS.getLastSeenPlay();
  })
).pipe(Atom.withReactivity(["timeline:last_seen_id", "timeline:play"]));

/**
 * Reactive atom for a specific play by ID.
 * Automatically updates when TimelineKVS invalidates the play's reactivity key.
 */
export const playAtom = Atom.family((id: number) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const timelineKVS = yield* TimelineKVS;
      return yield* timelineKVS.getPlay(id);
    })
  ).pipe(Atom.withReactivity([`timeline:play:${id}`]))
);

/**
 * Reactive atom for the last seen play ID.
 * Automatically updates when TimelineKVS invalidates "timeline:last_seen_id" key.
 */
export const lastSeenIdAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const timelineKVS = yield* TimelineKVS;
    return yield* timelineKVS.getLastSeenId();
  })
).pipe(Atom.withReactivity(["timeline:last_seen_id"]));

/**
 * Unified atom that reads the Chunk<PlayResult> directly from KVS.
 * This is the source of truth for all play data.
 * Automatically updates when TimelineKVS invalidates "timeline:plays_chunk" key.
 */
export const playsChunkAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const timelineKVS = yield* TimelineKVS;
    return yield* timelineKVS.getPlaysChunk();
  })
).pipe(Atom.withReactivity(["timeline:plays_chunk"]));

/**
 * Reactive atom that reads the accumulated play IDs from KVS.
 * Automatically updates when TimelineKVS invalidates "timeline:plays_chunk" key.
 * New plays are prepended by the background service (newest first).
 * Uses Chunk<PlayResult> for ordered storage with HashSet<number> for fast lookups.
 */
export const playIdsAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const timelineKVS = yield* TimelineKVS;
    return yield* timelineKVS.getPlayIds();
  })
).pipe(Atom.withReactivity(["timeline:plays_chunk"]));

/**
 * Derived Atoms using Timeline Utilities
 *
 * These atoms derive their values from playsChunkAtom using the timeline utilities.
 * They automatically update when playsChunkAtom updates.
 */

/**
 * Plays sorted by airdate (newest first) using Order utilities.
 */
export const playsSortedByAirdateDescAtom = Atom.make((get) => {
  const chunk = get(playsChunkAtom);
  return Result.map(chunk, (chunkValue) => sortPlaysByAirdateDesc(chunkValue));
});

/**
 * Plays sorted by airdate (oldest first) using Order utilities.
 */
export const playsSortedByAirdateAscAtom = Atom.make((get) => {
  const chunk = get(playsChunkAtom);
  return Result.map(chunk, (chunkValue) => sortPlaysByAirdateAsc(chunkValue));
});

/**
 * Plays sorted by ID (newest first) using Order utilities.
 */
export const playsSortedByIdDescAtom = Atom.make((get) => {
  const chunk = get(playsChunkAtom);
  return Result.map(chunk, (chunkValue) => sortPlaysByIdDesc(chunkValue));
});

/**
 * Play IDs extracted from the chunk, maintaining order.
 */
export const playIdsFromChunkAtom = Atom.make((get) => {
  const chunk = get(playsChunkAtom);
  return Result.map(chunk, (chunkValue) => {
    const ids = extractPlayIds(chunkValue);
    return Chunk.toReadonlyArray(ids);
  });
});

/**
 * Play IDs extracted from sorted plays (by airdate, newest first).
 */
export const playIdsSortedAtom = Atom.make((get) => {
  const sorted = get(playsSortedByAirdateDescAtom);
  return Result.map(sorted, (sortedValue) => {
    const ids = extractPlayIds(sortedValue);
    return Chunk.toReadonlyArray(ids);
  });
});

/**
 * The newest play (by airdate) from the chunk.
 * Returns Option<PlayResult> wrapped in Result.
 */
export const newestPlayAtom = Atom.make((get) => {
  const chunk = get(playsChunkAtom);
  return Result.map(chunk, (chunkValue) => getNewestPlay(chunkValue));
});

/**
 * The oldest play (by airdate) from the chunk.
 * Returns Option<PlayResult> wrapped in Result.
 */
export const oldestPlayAtom = Atom.make((get) => {
  const chunk = get(playsChunkAtom);
  return Result.map(chunk, (chunkValue) => getOldestPlay(chunkValue));
});

/**
 * The first N newest plays (by airdate).
 * Takes N as a parameter.
 */
export const newestNPlaysAtom = Atom.family((n: number) =>
  Atom.make((get) => {
    const chunk = get(playsChunkAtom);
    return Result.map(chunk, (chunkValue) => {
      const newest = getNewestNPlays(chunkValue, n);
      return Chunk.toReadonlyArray(newest);
    });
  })
);

export const PullAtom = TimelineRuntime.pull((_get) => {
  return Effect.gen(function* () {
    const timelineKVS = yield* TimelineKVS;
    return yield* timelineKVS.getPlayIds();
  });
});

// This is a simple Atom that will emit the current scroll position of the
// window.
export const scrollYAtom: Atom.Atom<number> = Atom.make((get) => {
  // The handler will use `get.setSelf` to update the value of itself
  const onScroll = () => {
    get.setSelf(window.scrollY);
  };
  // We need to use `get.addFinalizer` to remove the event listener when the
  // Atom is no longer used.
  window.addEventListener("scroll", onScroll);
  get.addFinalizer(() => window.removeEventListener("scroll", onScroll));

  // Return the current scroll position
  return window.scrollY;
});

// Viewport height (pixels)
// This atom automatically updates when the window is resized
export const viewportHeightAtom: Atom.Atom<number> = Atom.make((get) => {
  // The handler will use `get.setSelf` to update the value of itself
  const onResize = () => {
    get.setSelf(window.innerHeight);
  };
  // We need to use `get.addFinalizer` to remove the event listener when the
  // Atom is no longer used.
  window.addEventListener("resize", onResize);
  get.addFinalizer(() => window.removeEventListener("resize", onResize));

  // Return the current viewport height
  return window.innerHeight;
});

/**
 * Atom for plays as a readonly array (for show boundary computation).
 * Converts the Chunk<PlayResult> to readonly Play[] for use with createShowBoundariesAtom.
 */
const playsArrayAtom = Atom.make((get) => {
  const chunk = get(playsChunkAtom);
  return Result.map(chunk, (chunkValue) => {
    return Chunk.toReadonlyArray(chunkValue) as readonly Play[];
  });
});

/**
 * Reactive atom for show boundaries in the timeline.
 * Automatically updates when plays chunk or shows data changes.
 * Returns Result-wrapped show boundaries.
 */
export const showBoundariesAtom = Atom.make((get) => {
  const playsResult = get(playsArrayAtom);

  return Result.map(playsResult, (plays) => {
    // Create a temporary atom for this plays array and compute boundaries
    const boundariesAtom = createShowBoundariesAtom(Atom.make(() => plays));
    return get(boundariesAtom);
  });
});

/**
 * Map of play ID -> show boundary
 * This allows efficient lookup of which plays should have a show marker before them
 */
export const playIdToBoundaryMapAtom = Atom.make((get) => {
  const playsResult = get(playsArrayAtom);
  const boundariesResult = get(showBoundariesAtom);

  return Result.map(playsResult, (plays) => {
    return Result.matchWithWaiting(boundariesResult, {
      onWaiting: () => new Map(),
      onError: () => new Map(),
      onDefect: () => new Map(),
      onSuccess: (s) => {
        const map = new Map();
        // Each boundary corresponds to the first play of a show
        // Find the play ID for each boundary by matching timestamp and showId
        s.value.forEach(boundary => {
          const play = plays.find(p =>
            p.show === boundary.showId &&
            p.airdate?.toString() === boundary.timestamp.toString()
          );
          if (play && play.id) {
            map.set(play.id, boundary);
          }
        });
        return map;
      }
    });
  });
});
