/**
 * Entity Timeline Atoms
 *
 * Filtered timeline state for MBID-based entity pages (artist, recording, release, release_group).
 * Reuses the TimelineClient and TimelineKVS infrastructure from the main timeline.
 *
 * Architecture:
 * - Parameterized by entity type and MBID
 * - Uses atomFamily pattern for independent entity timelines
 * - Shares TimelineKVS for play data storage
 * - Cursor-based pagination after initial load
 */

import { Atom } from "@effect-atom/atom-react";
import {
  TimelineRuntime,
  TimelineClient,
  TimelineKVS,
} from "@/lib/http-runtime";
import { Effect, Array as EffectArray, pipe } from "effect";
import type { TimelineResponse, TimelineParams } from "@crate/api";

/**
 * Entity types that can be filtered by MBID.
 */
export type EntityType = "artist" | "recording" | "release" | "release_group";

/**
 * Entity filter for timeline queries.
 */
export interface EntityFilter {
  readonly type: EntityType;
  readonly mbid: string;
}

/**
 * Convert EntityFilter to a stable string key for atomFamily.
 * Exported for reuse in entity-metadata.ts
 */
export const entityFilterKey = (filter: EntityFilter): string =>
  `${filter.type}:${filter.mbid}`;

/**
 * A single page in the entity timeline.
 */
export interface EntityTimelinePage {
  readonly params: TimelineParams;
  readonly response: TimelineResponse;
}

/**
 * State for entity-filtered infinite timeline.
 */
export interface EntityTimelineState {
  readonly pages: ReadonlyArray<EntityTimelinePage>;
  readonly status: "idle" | "loading-initial" | "loading-more" | "error";
  readonly error?: unknown;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
  readonly filter: EntityFilter;
}

/**
 * Initial state factory for a given entity filter.
 */
const initialEntityTimelineState = (filter: EntityFilter): EntityTimelineState => ({
  pages: [],
  status: "idle",
  hasMore: true,
  filter,
});

/**
 * Request deduplication: Track in-flight entity requests.
 */
const inFlightEntityRequests = new Set<string>();

/**
 * Generate a unique key for an entity request.
 */
const getEntityRequestKey = (filter: EntityFilter, cursor: string | undefined): string =>
  `${entityFilterKey(filter)}:${cursor ?? "__initial__"}`;

/**
 * Writable atom for entity timeline states, keyed by entity filter.
 * Pattern: Use a Map atom that can be updated reactively via get.set()
 */
const entityTimelineStateMapAtom = Atom.make(new Map<string, EntityTimelineState>());

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
 * Helper to update entity timeline state map reactively.
 * Creates a new Map to ensure React detects the change.
 */
const updateEntityStateMap = (
  get: AtomGet,
  key: string,
  state: EntityTimelineState | null // null means delete
): void => {
  const prev = get(entityTimelineStateMapAtom);
  const next = new Map(prev);
  if (state === null) {
    next.delete(key);
  } else {
    next.set(key, state);
  }
  get.set(entityTimelineStateMapAtom, next);
};

/**
 * Derived atom for specific entity - uses get() to subscribe to changes.
 * When the map atom is updated via get.set(), this will re-render.
 */
export const entityTimelineStateAtom = Atom.family((filter: EntityFilter) =>
  Atom.make((get) => {
    const map = get(entityTimelineStateMapAtom);
    return map.get(entityFilterKey(filter)) ?? initialEntityTimelineState(filter);
  })
);

/**
 * Build timeline params with MBID filter.
 * Exported for reuse in entity-metadata.ts
 */
export const buildEntityTimelineParams = (
  filter: EntityFilter,
  cursor?: string,
  limit: number = 50
): TimelineParams => {
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
 * Internal effect for loading initial entity page.
 */
const loadInitialEntityPageEffect = (filter: EntityFilter) =>
  Effect.gen(function* () {
    const client = yield* TimelineClient;
    const kvs = yield* TimelineKVS;

    const params = buildEntityTimelineParams(filter);

    yield* Effect.log(
      `Loading initial entity timeline: type=${filter.type}, mbid=${filter.mbid}`
    );

    // Fetch from API with MBID filter
    const response = yield* client.timeline.getTimeline({
      urlParams: params,
    });

    yield* Effect.log(`Received ${response.results.length} plays for entity`);

    // Store plays in KVS (shared with main timeline)
    yield* kvs.storePlays(response.results);

    yield* Effect.log(
      `Entity initial page loaded: ${response.results.length} plays, has_more=${response.has_more}`
    );

    return { response, params };
  });

/**
 * Action atom: Load initial entity timeline page.
 * Uses get.set() to update state reactively.
 */
export const loadInitialEntityPageAtom = Atom.family((filter: EntityFilter) =>
  TimelineRuntime.fn<void>()((_, get) =>
    Effect.gen(function* () {
      const key = entityFilterKey(filter);

      // Set loading state reactively
      const loadingState: EntityTimelineState = {
        ...initialEntityTimelineState(filter),
        status: "loading-initial",
      };
      updateEntityStateMap(get, key, loadingState);

      // Execute the load
      const result = yield* loadInitialEntityPageEffect(filter);

      // Update state with successful page
      const successState: EntityTimelineState = {
        pages: [{ params: result.params, response: result.response }],
        status: "idle",
        hasMore: result.response.has_more,
        filter,
        ...(result.response.next_cursor && { nextCursor: result.response.next_cursor }),
      };
      updateEntityStateMap(get, key, successState);
    }).pipe(
      Effect.catchAll((error) =>
        Effect.logError(`Entity initial page load failed: ${error}`).pipe(
          Effect.andThen(Effect.sync(() => {
            const key = entityFilterKey(filter);
            const errorState: EntityTimelineState = {
              ...initialEntityTimelineState(filter),
              status: "error",
              error,
            };
            updateEntityStateMap(get, key, errorState);
          }))
        )
      )
    )
  )
);

/**
 * Internal effect for loading next entity page.
 */
const loadNextEntityPageEffect = (_filter: EntityFilter, params: TimelineParams) =>
  Effect.gen(function* () {
    const client = yield* TimelineClient;
    const kvs = yield* TimelineKVS;

    yield* Effect.log(`Loading next entity page with cursor: ${params.cursor}`);

    // Fetch from API
    const response = yield* client.timeline.getTimeline({ urlParams: params });

    yield* Effect.log(`Received ${response.results.length} plays for entity`);

    // Store plays in KVS
    yield* kvs.storePlays(response.results);

    yield* Effect.log(
      `Entity next page loaded: ${response.results.length} plays, has_more=${response.has_more}`
    );

    return { response, params };
  });

/**
 * Action atom: Load next entity timeline page (cursor pagination).
 * Uses Effect.ensuring for guaranteed cleanup of in-flight tracking.
 */
export const loadNextEntityPageAtom = Atom.family((filter: EntityFilter) =>
  TimelineRuntime.fn<void>()((_, get) =>
    Effect.gen(function* () {
      const key = entityFilterKey(filter);
      const map = get(entityTimelineStateMapAtom);
      const state = map.get(key) ?? initialEntityTimelineState(filter);

      // Guard: don't load if already loading or no more pages
      if (state.status === "loading-more" || !state.hasMore) {
        yield* Effect.log(
          `Skipping entity load-more: status=${state.status}, hasMore=${state.hasMore}`
        );
        return;
      }

      // Request deduplication
      const requestKey = getEntityRequestKey(filter, state.nextCursor);
      if (inFlightEntityRequests.has(requestKey)) {
        yield* Effect.log(`Skipping entity load-more: request ${requestKey} already in flight`);
        return;
      }

      inFlightEntityRequests.add(requestKey);

      // Build cursor-based params with MBID filter
      const nextParams = buildEntityTimelineParams(filter, state.nextCursor);

      // Set loading state
      const loadingState: EntityTimelineState = {
        ...state,
        status: "loading-more",
      };
      updateEntityStateMap(get, key, loadingState);

      // Execute load with guaranteed cleanup via Effect.ensuring
      yield* pipe(
        Effect.gen(function* () {
          const result = yield* loadNextEntityPageEffect(filter, nextParams);

          // Append page to existing pages
          const currentMap = get(entityTimelineStateMapAtom);
          const currentState = currentMap.get(key) ?? initialEntityTimelineState(filter);
          const successState: EntityTimelineState = {
            ...currentState,
            pages: [
              ...currentState.pages,
              { params: result.params, response: result.response },
            ],
            status: "idle",
            hasMore: result.response.has_more,
            ...(result.response.next_cursor && { nextCursor: result.response.next_cursor }),
          };
          updateEntityStateMap(get, key, successState);
        }),
        Effect.catchAll((error) =>
          Effect.logError(`Entity next page load failed: ${error}`).pipe(
            Effect.andThen(Effect.sync(() => {
              const currentMap = get(entityTimelineStateMapAtom);
              const currentState = currentMap.get(key) ?? initialEntityTimelineState(filter);
              const errorState: EntityTimelineState = {
                ...currentState,
                status: "error",
                error,
              };
              updateEntityStateMap(get, key, errorState);
            }))
          )
        ),
        Effect.ensuring(Effect.sync(() => {
          inFlightEntityRequests.delete(requestKey);
        }))
      );
    })
  )
);

/**
 * Action atom: Reset entity timeline state.
 */
export const resetEntityTimelineAtom = Atom.family((filter: EntityFilter) =>
  TimelineRuntime.fn<void>()((_, get) =>
    Effect.gen(function* () {
      const key = entityFilterKey(filter);
      yield* Effect.log(`Resetting entity timeline: ${key}`);

      // Clear in-flight tracking
      for (const requestKey of inFlightEntityRequests) {
        if (requestKey.startsWith(key)) {
          inFlightEntityRequests.delete(requestKey);
        }
      }

      // Remove from state map reactively
      updateEntityStateMap(get, key, null);
    })
  )
);

/**
 * Derived atom: Play IDs from loaded entity pages.
 */
export const entityPlayIdsAtom = Atom.family((filter: EntityFilter) =>
  Atom.make((get) => {
    const state = get(entityTimelineStateAtom(filter));

    return pipe(
      state.pages,
      EffectArray.flatMap((page) => page.response.results),
      EffectArray.map((play) => play.id),
      EffectArray.dedupe
    );
  })
);

/**
 * Derived atom: Loading state flags for entity UI.
 */
export const entityLoadingStateAtom = Atom.family((filter: EntityFilter) =>
  Atom.make((get) => {
    const state = get(entityTimelineStateAtom(filter));
    return {
      isLoadingInitial: state.status === "loading-initial",
      isLoadingMore: state.status === "loading-more",
      isError: state.status === "error",
      error: state.error,
      hasMore: state.hasMore,
    };
  })
);

/**
 * Derived atom: Total loaded play count for entity.
 */
export const entityLoadedCountAtom = Atom.family((filter: EntityFilter) =>
  Atom.make((get) => {
    const ids = get(entityPlayIdsAtom(filter));
    return ids.length;
  })
);
