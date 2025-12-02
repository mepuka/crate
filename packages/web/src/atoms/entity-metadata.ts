/**
 * Entity Metadata Atoms
 *
 * Fetches and caches metadata for MBID-based entity pages.
 * Combines data from:
 * - First matching play (for name, image)
 * - Play count endpoint (for total plays)
 *
 * Architecture:
 * - Uses atomFamily pattern keyed by entity filter
 * - Fetches count in parallel with initial timeline load
 * - Derives display name from first play's relevant field
 */

import { Atom } from "@effect-atom/atom-react";
import { TimelineRuntime, TimelineClient } from "@/lib/http-runtime";
import { Effect } from "effect";
import { type EntityFilter } from "./timeline-url-sync";
import type { PlayCountParams } from "@crate/api";

/**
 * Entity type alias for backwards compatibility with EntityHeader.
 */
export type EntityType = EntityFilter["type"];

/**
 * Convert EntityFilter to a stable string key for atomFamily.
 */
const entityFilterKey = (filter: EntityFilter): string =>
  `${filter.type}:${filter.mbid}`;

/**
 * Build timeline params with MBID filter for a given entity.
 */
const buildEntityTimelineParams = (
  filter: EntityFilter,
  cursor?: string,
  limit: number = 50
) => {
  const base = { limit, cursor };

  switch (filter.type) {
    case "artist":
      return { ...base, artist_mbid: filter.mbid };
    case "recording":
      return { ...base, recording_mbid: filter.mbid };
    case "release":
      return { ...base, release_mbid: filter.mbid };
    case "release_group":
      return { ...base, release_group_mbid: filter.mbid };
  }
};

/**
 * Entity metadata for display in headers.
 */
export interface EntityMetadata {
  readonly mbid: string;
  readonly type: EntityType;
  readonly name: string;
  readonly imageUri?: string;
  readonly playCount: number;
  readonly status: "idle" | "loading" | "loaded" | "error";
  readonly error?: unknown;
}

/**
 * Writable atom for entity metadata, keyed by entity filter.
 * Pattern: Use a Map atom that can be updated reactively via get.set()
 */
const entityMetadataMapAtom = Atom.make(new Map<string, EntityMetadata>());

/**
 * Initial metadata state for a given filter.
 */
const initialEntityMetadata = (filter: EntityFilter): EntityMetadata => ({
  mbid: filter.mbid,
  type: filter.type,
  name: "",
  playCount: 0,
  status: "idle",
});

/**
 * Type for the get parameter from TimelineRuntime.fn
 * - Callable to read atom values: get(atom)
 * - Has .set method to update writable atoms: get.set(atom, value)
 */
type AtomGet = {
  <T>(atom: Atom.Atom<T>): T;
  set: <T>(atom: Atom.Writable<T>, value: T) => void;
};

/**
 * Helper to update entity metadata map reactively.
 * Creates a new Map to ensure React detects the change.
 */
const updateMetadataMap = (
  get: AtomGet,
  key: string,
  metadata: EntityMetadata
): void => {
  const prev = get(entityMetadataMapAtom);
  const next = new Map(prev);
  next.set(key, metadata);
  get.set(entityMetadataMapAtom, next);
};

/**
 * Derived atom for specific entity metadata - uses get() to subscribe to changes.
 * When the map atom is updated via get.set(), this will re-render.
 */
export const entityMetadataAtom = Atom.family((filter: EntityFilter) =>
  Atom.make((get) => {
    const map = get(entityMetadataMapAtom);
    return map.get(entityFilterKey(filter)) ?? initialEntityMetadata(filter);
  })
);

/**
 * Build count params for the entity type.
 */
const buildCountParams = (filter: EntityFilter): PlayCountParams => {
  switch (filter.type) {
    case "artist":
      return { artist_mbid: filter.mbid };
    case "recording":
      return { recording_mbid: filter.mbid };
    case "release":
      return { release_mbid: filter.mbid };
    case "release_group":
      return { release_group_mbid: filter.mbid };
  }
};

/**
 * Extract entity name from a play result based on entity type.
 */
const extractEntityName = (
  play: {
    artist: string;
    song: string;
    album: string | null;
  },
  type: EntityType
): string => {
  switch (type) {
    case "artist":
      return play.artist;
    case "recording":
      return `${play.artist} - ${play.song}`;
    case "release":
    case "release_group":
      return play.album ?? "Unknown Album";
  }
};

/**
 * Action atom: Load entity metadata.
 * Fetches count and first play info.
 * Uses get.set() to update state reactively.
 */
export const loadEntityMetadataAtom = Atom.family((filter: EntityFilter) =>
  TimelineRuntime.fn<void>()((_, get) =>
    Effect.gen(function* () {
      const client = yield* TimelineClient;
      const key = entityFilterKey(filter);

      // Set loading state reactively
      const loadingState: EntityMetadata = {
        ...initialEntityMetadata(filter),
        status: "loading",
      };
      updateMetadataMap(get, key, loadingState);

      yield* Effect.log(
        `Loading entity metadata: type=${filter.type}, mbid=${filter.mbid}`
      );

      // Fetch count and first play in parallel
      const countParams = buildCountParams(filter);

      // Use shared utility for timeline params (limit: 1 for first play only)
      const timelineParams = buildEntityTimelineParams(filter, undefined, 1);

      // Parallel fetch
      const [countResult, timelineResult] = yield* Effect.all([
        client.timeline.getPlayCount({ urlParams: countParams }),
        client.timeline.getTimeline({ urlParams: timelineParams }),
      ], { concurrency: 2 });

      yield* Effect.log(
        `Entity metadata loaded: count=${countResult.count}, firstPlay=${timelineResult.results[0]?.id}`
      );

      // Extract name and image from first play
      const firstPlay = timelineResult.results[0];
      const name = firstPlay ? extractEntityName(firstPlay, filter.type) : "Unknown";
      const imageUri = firstPlay?.image_uri ?? null;

      // Update with loaded data
      const successState: EntityMetadata = {
        mbid: filter.mbid,
        type: filter.type,
        name,
        playCount: countResult.count,
        status: "loaded",
        ...(imageUri && { imageUri }),
      };
      updateMetadataMap(get, key, successState);
    }).pipe(
      Effect.catchAll((error) =>
        Effect.logError(`Entity metadata load failed: ${error}`).pipe(
          Effect.andThen(Effect.sync(() => {
            const key = entityFilterKey(filter);
            const errorState: EntityMetadata = {
              ...initialEntityMetadata(filter),
              status: "error",
              error,
            };
            updateMetadataMap(get, key, errorState);
          }))
        )
      )
    )
  )
);

/**
 * Type labels for display.
 */
export const entityTypeLabels: Record<EntityType, string> = {
  artist: "Artist",
  recording: "Track",
  release: "Release",
  release_group: "Album",
};

/**
 * Derived atom: Loading state for entity metadata.
 */
export const entityMetadataLoadingAtom = Atom.family((filter: EntityFilter) =>
  Atom.make((get) => {
    const metadata = get(entityMetadataAtom(filter));
    return {
      isLoading: metadata.status === "loading",
      isLoaded: metadata.status === "loaded",
      isError: metadata.status === "error",
      error: metadata.error,
    };
  })
);
