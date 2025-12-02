/**
 * Infinite Scroll Timeline Atoms
 *
 * Pull-based, cursor-driven infinite scroll architecture for the timeline.
 * Integrates with TanStack Virtual for efficient rendering.
 *
 * Architecture:
 * - TimelineKVS remains single source of truth for play data
 * - Pages store only metadata (params + response)
 * - Visible IDs derived from loaded pages
 * - Cursor-only pagination after initial jump
 *
 * Based on: packages/web/docs/timeline-atoms-infinite-scroll.md
 */

import { Atom, Result } from "@effect-atom/atom-react";
import {
  TimelineRuntime,
  TimelineClient,
  TimelineKVS,
} from "@/lib/http-runtime";
import { Effect, Array as EffectArray, Option, pipe } from "effect";
import type { TimelineResponse, TimelineParams } from "@crate/api";
import {
  timelineParamsAtom,
  sinceAtom,
  untilAtom,
  percentageAtom,
  anchorIdAtom,
  activeFilterAtom,
  type EntityFilter,
} from "./timeline-url-sync";
import { playIdsAtom } from "./timeline";

/**
 * A single page in the infinite timeline.
 * Tracks both the request params and the response.
 */
export interface TimelinePage {
  readonly params: TimelineParams;
  readonly response: TimelineResponse;
}

/**
 * Navigation method for the initial timeline load.
 * After initial load, all subsequent pagination uses cursor-only.
 */
export type TimelineNavigationMethod =
  | "cursor"
  | "time-range"
  | "percentage"
  | "anchor";

/**
 * State for infinite scroll timeline.
 * Lives in memory (not persisted to KVS).
 * TimelineKVS stores the actual play data.
 */
export interface TimelineInfiniteState {
  readonly pages: ReadonlyArray<TimelinePage>;
  readonly status: "idle" | "loading-initial" | "loading-more" | "error";
  readonly error?: unknown;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
  readonly initialParams: TimelineParams;
  readonly initialMethod: TimelineNavigationMethod;
  // Metadata from special navigation modes
  readonly totalCount?: number; // from percentage queries
  readonly anchorPosition?: {
    readonly pageIndex: number;
    readonly itemIndex: number;
  };
  // Active filter for this state (used to detect filter changes)
  readonly activeFilter?: EntityFilter | null;
}

/**
 * Initial state for infinite timeline.
 */
const initialInfiniteState: TimelineInfiniteState = {
  pages: [],
  status: "idle",
  hasMore: true,
  initialParams: { limit: 50 },
  initialMethod: "cursor",
};

/**
 * Request deduplication: Track in-flight cursors to prevent duplicate requests.
 * Uses a Set outside of atoms for synchronous access during effect execution.
 */
const inFlightCursors = new Set<string>();

/**
 * Generate a unique key for a cursor request (handles undefined cursor for initial)
 */
const getCursorKey = (cursor: string | undefined): string =>
  cursor ?? "__initial__";

/**
 * Atom that holds the infinite scroll state.
 * This is the primary state container for pagination.
 *
 * Pattern: Writable atom created by passing initial value directly to Atom.make()
 * This creates a Writable<TimelineInfiniteState> that can be updated via get.set()
 */
export const timelineInfiniteStateAtom = Atom.make(initialInfiniteState);

/**
 * Derived atom that determines the initial navigation method from URL params.
 */
export const timelineInitialConfigAtom = Atom.make((get) => {
  const params = get(timelineParamsAtom);
  const percentage = Option.getOrUndefined(get(percentageAtom));
  const anchorId = Option.getOrUndefined(get(anchorIdAtom));
  const since = Option.getOrUndefined(get(sinceAtom));
  const until = Option.getOrUndefined(get(untilAtom));

  let method: TimelineNavigationMethod;

  if (percentage !== undefined) {
    method = "percentage";
  } else if (anchorId !== undefined) {
    method = "anchor";
  } else if (since !== undefined || until !== undefined) {
    method = "time-range";
  } else {
    method = "cursor";
  }

  return {
    params,
    method,
  };
});

/**
 * Atom family for fetching a single timeline page.
 * Pulls data from API and normalizes into TimelineKVS.
 *
 * Returns TimelineResponse wrapped in Result.
 */
export const timelinePageAtom = Atom.family((params: TimelineParams) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const client = yield* TimelineClient;
      const kvs = yield* TimelineKVS;

      yield* Effect.log(
        `Fetching timeline page: limit=${params.limit}, cursor=${params.cursor ?? "none"}`
      );

      // Fetch from API
      const response = yield* client.timeline.getTimeline({
        urlParams: params,
      });

      yield* Effect.log(`Received ${response.results.length} plays from API`);

      // PERF: Batch store for single reactivity invalidation
      yield* kvs.storePlays(response.results);

      yield* Effect.log(
        `Batch stored ${response.results.length} plays in KVS, has_more=${response.has_more}`
      );

      return response;
    })
  )
);

/**
 * Internal effect for loading initial page.
 * Separated from the atom so we can handle state management cleanly.
 */
const loadInitialPageEffect = (config: {
  params: TimelineParams;
  method: TimelineNavigationMethod;
}) =>
  Effect.gen(function* () {
    const client = yield* TimelineClient;
    const kvs = yield* TimelineKVS;

    yield* Effect.log(
      `Loading initial timeline page (method: ${config.method})`
    );

    // Fetch from API
    const response = yield* client.timeline.getTimeline({
      urlParams: config.params,
    });

    yield* Effect.log(`Received ${response.results.length} plays from API`);

    // PERF: Batch store for single reactivity invalidation
    yield* kvs.storePlays(response.results);

    // Find anchor position if anchor method was used
    let anchorPosition: TimelineInfiniteState["anchorPosition"];
    if (config.method === "anchor" && config.params.anchor_id) {
      const itemIndex = response.results.findIndex(
        (play) => play.id === config.params.anchor_id
      );
      if (itemIndex >= 0) {
        anchorPosition = { pageIndex: 0, itemIndex };
      }
    }

    yield* Effect.log(
      `Initial page loaded: ${response.results.length} plays, has_more=${response.has_more}`
    );

    return {
      response,
      params: config.params,
      method: config.method,
      anchorPosition,
    };
  });

/**
 * Action atom: Load initial timeline page.
 * Reads URL params, fetches first page, and initializes infinite state.
 */
export const loadInitialTimelinePageAtom = TimelineRuntime.fn<void>()(
  (_, get) =>
    Effect.gen(function* () {
      const config = get(timelineInitialConfigAtom);
      const filter = get(activeFilterAtom);

      // Update state to loading-initial
      const loadingState: TimelineInfiniteState = {
        ...initialInfiniteState,
        status: "loading-initial",
        initialParams: config.params,
        initialMethod: config.method,
        activeFilter: filter,
      };
      get.set(timelineInfiniteStateAtom, loadingState);

      // Execute the load (will throw if error)
      const result = yield* loadInitialPageEffect(config);

      // Update state with successful page
      // Note: With exactOptionalPropertyTypes, we build the object conditionally
      const successState: TimelineInfiniteState = {
        pages: [{ params: result.params, response: result.response }],
        status: "idle",
        hasMore: result.response.has_more,
        initialParams: result.params,
        initialMethod: result.method,
        activeFilter: filter,
        ...(result.response.next_cursor && { nextCursor: result.response.next_cursor }),
        ...(result.response.total_count !== null && result.response.total_count !== undefined && {
          totalCount: result.response.total_count
        }),
        ...(result.anchorPosition && { anchorPosition: result.anchorPosition }),
      };
      get.set(timelineInfiniteStateAtom, successState);
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logError(`Initial page load failed`);
          console.error("Timeline load error:", error);
          const errorState: TimelineInfiniteState = {
            ...get(timelineInfiniteStateAtom),
            status: "error",
            error,
          };
          get.set(timelineInfiniteStateAtom, errorState);
        })
      )
    )
);

/**
 * Internal effect for loading next page.
 */
const loadNextPageEffect = (params: TimelineParams) =>
  Effect.gen(function* () {
    const client = yield* TimelineClient;
    const kvs = yield* TimelineKVS;

    yield* Effect.log(`Loading next page with cursor: ${params.cursor}`);

    // Fetch from API
    const response = yield* client.timeline.getTimeline({ urlParams: params });

    yield* Effect.log(`Received ${response.results.length} plays from API`);

    // PERF: Batch store for single reactivity invalidation
    yield* kvs.storePlays(response.results);

    yield* Effect.log(
      `Next page batch stored: ${response.results.length} plays, has_more=${response.has_more}`
    );

    return { response, params };
  });

/**
 * Action atom: Load next timeline page (cursor pagination).
 * Only works after initial page is loaded.
 * Includes request deduplication to prevent race conditions.
 */
export const loadNextTimelinePageAtom = TimelineRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const state = get(timelineInfiniteStateAtom);

    // Guard: don't load if already loading or no more pages
    if (state.status === "loading-more" || !state.hasMore) {
      yield* Effect.log(
        `Skipping load-more: status=${state.status}, hasMore=${state.hasMore}`
      );
      return;
    }

    // Build cursor-based params (ignore special navigation fields)
    const nextCursor = state.nextCursor ?? undefined;
    const cursorKey = getCursorKey(nextCursor);

    // Request deduplication: skip if this cursor is already in flight
    if (inFlightCursors.has(cursorKey)) {
      yield* Effect.log(
        `Skipping load-more: cursor ${cursorKey} already in flight`
      );
      return;
    }

    // Mark cursor as in-flight
    inFlightCursors.add(cursorKey);

    // Include MBID filters from initialParams for consistent filtering across pages
    const nextParams: TimelineParams = {
      limit: state.initialParams.limit,
      cursor: nextCursor,
      // Preserve filter params from initial load
      ...(state.initialParams.artist_mbid && { artist_mbid: state.initialParams.artist_mbid }),
      ...(state.initialParams.recording_mbid && { recording_mbid: state.initialParams.recording_mbid }),
      ...(state.initialParams.release_mbid && { release_mbid: state.initialParams.release_mbid }),
      ...(state.initialParams.release_group_mbid && { release_group_mbid: state.initialParams.release_group_mbid }),
    };

    // Set loading state
    const loadingState: TimelineInfiniteState = {
      ...state,
      status: "loading-more",
    };
    get.set(timelineInfiniteStateAtom, loadingState);

    // Execute the load (will throw if error)
    const result = yield* loadNextPageEffect(nextParams);

    // Remove from in-flight tracking
    inFlightCursors.delete(cursorKey);

    // Append page to existing pages
    const currentState = get(timelineInfiniteStateAtom);
    const successState: TimelineInfiniteState = {
      ...currentState,
      pages: [
        ...currentState.pages,
        { params: result.params, response: result.response },
      ],
      status: "idle",
      hasMore: result.response.has_more,
      ...(result.response.next_cursor && { nextCursor: result.response.next_cursor }),
    };
    get.set(timelineInfiniteStateAtom, successState);
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        // Clean up in-flight tracking on error
        const state = get(timelineInfiniteStateAtom);
        const cursorKey = getCursorKey(state.nextCursor ?? undefined);
        inFlightCursors.delete(cursorKey);

        yield* Effect.logError(`Next page load failed: ${error}`);
        const currentState = get(timelineInfiniteStateAtom);
        const errorState: TimelineInfiniteState = {
          ...currentState,
          status: "error",
          error,
        };
        get.set(timelineInfiniteStateAtom, errorState);
      })
    )
  )
);

/**
 * Action atom: Reset infinite state.
 * Call this when URL params change significantly (e.g., user changes date range).
 */
export const resetTimelineInfiniteStateAtom = TimelineRuntime.fn<void>()(
  (_, get) =>
    Effect.gen(function* () {
      yield* Effect.log("Resetting infinite timeline state");

      // Clear in-flight tracking to prevent stale requests
      inFlightCursors.clear();

      const resetState: TimelineInfiniteState = { ...initialInfiniteState };
      get.set(timelineInfiniteStateAtom, resetState);
    })
);

/**
 * Derived atom: Play IDs from loaded pages only (newest first).
 * Used internally for pagination tracking.
 */
const paginatedPlayIdsAtom = Atom.make((get) => {
  const state = get(timelineInfiniteStateAtom);

  return pipe(
    state.pages,
    EffectArray.flatMap((page) => page.response.results),
    EffectArray.map((play) => play.id),
    // Dedupe in case of overlaps (e.g., anchor queries)
    EffectArray.dedupe
  );
});

/**
 * Derived atom: All play IDs combining live KVS updates with paginated pages.
 * Live updates from FetchLatestLive appear immediately at the top.
 * Paginated plays follow below, deduped against live updates.
 */
export const allLoadedPlayIdsAtom = Atom.make((get) => {
  const paginatedIds = get(paginatedPlayIdsAtom);
  const kvsIdsResult = get(playIdsAtom);

  // Get KVS IDs if available, otherwise use empty array
  const kvsIds = Result.matchWithWaiting(kvsIdsResult, {
    onWaiting: () => [] as readonly number[],
    onError: () => [] as readonly number[],
    onDefect: () => [] as readonly number[],
    onSuccess: (s) => s.value,
  });

  // If no paginated pages loaded yet, use KVS data
  if (paginatedIds.length === 0) {
    return kvsIds as number[];
  }

  // Find the split point: where does the paginated history start in the KVS?
  // We assume both lists are sorted by airdate (descending).
  // We want to take everything from KVS that is NEWER than the first paginated play.
  const newestPaginatedId = paginatedIds[0];
  const splitIndex = kvsIds.indexOf(newestPaginatedId);

  if (splitIndex === -1) {
    // Edge case: Newest paginated play is not in KVS yet.
    // Fallback to just returning paginatedIds to be safe and avoid showing older plays at the top.
    return paginatedIds;
  }

  // Take plays from KVS that are strictly newer than the paginated start
  const newerFromKvs = kvsIds.slice(0, splitIndex);

  // Prepend newer KVS plays to paginated plays
  return [...newerFromKvs, ...paginatedIds];
});

/**
 * Derived atom: Count of loaded plays across all pages.
 */
export const loadedPlayCountAtom = Atom.make((get) => {
  const ids = get(allLoadedPlayIdsAtom);
  return ids.length;
});

/**
 * Derived atom: Loading state flags for UI.
 */
export const timelineLoadingStateAtom = Atom.make((get) => {
  const state = get(timelineInfiniteStateAtom);
  return {
    isLoadingInitial: state.status === "loading-initial",
    isLoadingMore: state.status === "loading-more",
    isError: state.status === "error",
    error: state.error,
    hasMore: state.hasMore,
  };
});

/**
 * Helper to compare filters for equality
 */
const filtersEqual = (a: EntityFilter | null | undefined, b: EntityFilter | null | undefined): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.type === b.type && a.mbid === b.mbid;
};

/**
 * Derived atom: Detects when the URL filter differs from the loaded state filter.
 * This is used by VirtualizedTimeline to trigger transition animations.
 */
export const filterNeedsReloadAtom = Atom.make((get) => {
  const urlFilter = get(activeFilterAtom);
  const state = get(timelineInfiniteStateAtom);
  const stateFilter = state.activeFilter;

  // If we have no pages yet, we need to load (but not a "reload")
  if (state.pages.length === 0) {
    return false;
  }

  // Check if filter changed from what we loaded
  return !filtersEqual(urlFilter, stateFilter);
});

// Re-export activeFilterAtom for components to use
export { activeFilterAtom };
