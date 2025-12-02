import { Atom } from "@effect-atom/atom-react";
import { Effect, Chunk } from "effect";
import { AlbumBarWorkerClient } from "@/workers/album-bar-worker-client";
import type { AlbumArtworkData } from "@/workers/album-bar-worker-protocol";
import { TimelineKVS, TimelineRuntime } from "@/lib/http-runtime";

/**
 * Re-export AlbumArtworkData type from worker protocol
 */
export type { AlbumArtworkData };

/**
 * Number of recent plays to show in the scrolling album bar
 * Using 250 for better visual variety across the full-screen grid
 * Higher count = less visible repetition, especially on large displays
 */
export const ALBUM_BAR_PLAY_COUNT = 250;

/**
 * Static atom that loads album artwork once on mount.
 *
 * Processing happens off the main thread:
 * 1. Fetches newest N plays from timeline KVS
 * 2. Sends to worker for filtering and processing
 * 3. Worker returns structured artwork data
 *
 * NOTE: Does NOT use Atom.withReactivity() - the background grid should
 * remain stable during navigation/filtering. It only needs to load once
 * on initial page load.
 *
 * Uses shared TimelineRuntime to ensure consistent state with timeline atoms.
 */
export const recentAlbumArtAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const workerClient = yield* AlbumBarWorkerClient;
    const timelineKVS = yield* TimelineKVS;

    // Get plays chunk from KVS
    const playsChunk = yield* timelineKVS.getPlaysChunk();

    // Convert to array - worker will handle sorting and filtering
    const playsArray = Chunk.toReadonlyArray(playsChunk);

    // Send to worker for sorting, filtering, and processing
    const artwork = yield* workerClient.loadArtwork(
      playsArray,
      ALBUM_BAR_PLAY_COUNT
    );

    return artwork;
  })
);
// Removed: .pipe(Atom.withReactivity(["timeline:plays_chunk"]))
// The background should stay stable - no need to refresh on timeline changes

/**
 * Animation speed for the scrolling bar (pixels per second)
 */
export const scrollSpeedAtom = Atom.make(() => {
  return 25; // pixels per second - adjust for desired speed
});
