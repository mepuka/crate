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

import { Atom } from "@effect-atom/atom-react";
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
} from "./timeline-url-sync";

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

      // Normalize all plays into KVS (single source of truth)
      yield* Effect.all(
        response.results.map((play) => kvs.storePlay(play)),
        { concurrency: 50 }
      );

      yield* Effect.log(
        `Stored ${response.results.length} plays in KVS, has_more=${response.has_more}`
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

    // Normalize all plays into KVS (single source of truth)
    yield* Effect.all(
      response.results.map((play) => kvs.storePlay(play)),
      { concurrency: 50 }
    );

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

      // Update state to loading-initial
      const loadingState: TimelineInfiniteState = {
        ...initialInfiniteState,
        status: "loading-initial",
        initialParams: config.params,
        initialMethod: config.method,
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

    // Normalize all plays into KVS
    yield* Effect.all(
      response.results.map((play) => kvs.storePlay(play)),
      { concurrency: 50 }
    );

    yield* Effect.log(
      `Next page loaded: ${response.results.length} plays, has_more=${response.has_more}`
    );

    return { response, params };
  });

/**
 * Action atom: Load next timeline page (cursor pagination).
 * Only works after initial page is loaded.
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
    const nextParams: TimelineParams = {
      limit: state.initialParams.limit,
      cursor: state.nextCursor ?? undefined,
    };

    // Set loading state
    const loadingState: TimelineInfiniteState = {
      ...state,
      status: "loading-more",
    };
    get.set(timelineInfiniteStateAtom, loadingState);

    // Execute the load (will throw if error)
    const result = yield* loadNextPageEffect(nextParams);

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
      const resetState: TimelineInfiniteState = { ...initialInfiniteState };
      get.set(timelineInfiniteStateAtom, resetState);
    })
);

/**
 * Derived atom: All play IDs from loaded pages (newest first).
 * Concatenates all pages in order.
 */
export const allLoadedPlayIdsAtom = Atom.make((get) => {
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
