/**
 * SearchPlaysService
 *
 * Wraps the FAISS API /api/plays/timeline and /api/plays/count endpoints.
 * Provides type-safe access to KEXP play history search and count operations.
 *
 * @module
 */

import { Context, Effect, Layer } from "effect"
import { HttpClient, HttpClientResponse, FetchHttpClient } from "@effect/platform"
import { TimelineResponse, PlayCountResponse } from "@crate/domain/faiss/schemas"
import { FaissConfig } from "../config.js"
import { SearchPlaysError } from "./errors.js"
import { makeJsonClient, buildUrlParams } from "./http-utils.js"
import type { MbEntityType } from "../tools/schemas.js"

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Parameters for timeline search
 */
export interface SearchTimelineParams {
  /** Maximum number of results (1-200, default 50) */
  readonly limit?: number;
  /** Cursor from previous response for pagination */
  readonly cursor?: string;
  /** Filter plays after this ISO date */
  readonly since?: string;
  /** Filter plays before this ISO date */
  readonly until?: string;
  /** Jump to percentage position (0.0-1.0) */
  readonly percentage?: number;
  /** Center results around this play ID */
  readonly anchorId?: number;
  /** Filter by artist MusicBrainz ID */
  readonly artistMbid?: string;
  /** Filter by recording MusicBrainz ID */
  readonly recordingMbid?: string;
  /** Filter by release MusicBrainz ID */
  readonly releaseMbid?: string;
  /** Filter by release group MusicBrainz ID */
  readonly releaseGroupMbid?: string;
}

/**
 * SearchPlaysService interface
 */
export interface SearchPlaysServiceInterface {
  /**
   * Search KEXP play timeline with flexible navigation
   */
  readonly timeline: (
    params?: SearchTimelineParams
  ) => Effect.Effect<typeof TimelineResponse.Type, SearchPlaysError>;

  /**
   * Count plays matching MBID filter
   */
  readonly count: (
    mbid: string,
    entityType: MbEntityType
  ) => Effect.Effect<number, SearchPlaysError>;
}

// =============================================================================
// Service Tag
// =============================================================================

/**
 * SearchPlaysService - search KEXP play history via FAISS API
 */
export class SearchPlaysService extends Context.Tag("SearchPlaysService")<
  SearchPlaysService,
  SearchPlaysServiceInterface
>() {}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Map camelCase param names to snake_case URL param names
 */
const timelineParamKeyMap: Partial<Record<keyof SearchTimelineParams, string>> = {
  anchorId: "anchor_id",
  artistMbid: "artist_mbid",
  recordingMbid: "recording_mbid",
  releaseMbid: "release_mbid",
  releaseGroupMbid: "release_group_mbid"
}

/**
 * Create the SearchPlaysService implementation
 */
const makeSearchPlaysService = Effect.gen(function* () {
  const config = yield* FaissConfig
  const client = yield* makeJsonClient(config.baseUrl)

  const timeline = (
    params: SearchTimelineParams = {}
  ): Effect.Effect<typeof TimelineResponse.Type, SearchPlaysError> =>
    client
      .get("/api/plays/timeline", {
        urlParams: buildUrlParams(params, timelineParamKeyMap),
      })
      .pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(TimelineResponse)),
        Effect.mapError(
          (error) =>
            new SearchPlaysError({
              message: "Timeline search failed",
              query: JSON.stringify(params),
              cause: error,
            })
        )
      );

  const count = (
    mbid: string,
    entityType: MbEntityType
  ): Effect.Effect<number, SearchPlaysError> => {
    // Map entity type to the correct URL param
    const paramMap: Record<MbEntityType, string> = {
      artist: "artist_mbid",
      recording: "recording_mbid",
      release: "release_mbid",
      release_group: "release_group_mbid",
      label: "artist_mbid", // Labels use artist_mbid endpoint (fallback)
      place: "artist_mbid", // Places aren't directly searchable in plays, fallback
    };

    const paramName = paramMap[entityType];

    return client
      .get("/api/plays/count", {
        urlParams: { [paramName]: mbid },
      })
      .pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(PlayCountResponse)),
        Effect.map((response) => response.count),
        Effect.mapError(
          (error) =>
            new SearchPlaysError({
              message: `Play count failed for ${entityType}`,
              query: mbid,
              cause: error,
            })
        )
      );
  };

  return {
    timeline,
    count,
  } satisfies SearchPlaysServiceInterface;
});

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for SearchPlaysService
 * Requires FaissConfig and HttpClient
 */
export const SearchPlaysServiceLive: Layer.Layer<
  SearchPlaysService,
  never,
  FaissConfig | HttpClient.HttpClient
> = Layer.effect(SearchPlaysService, makeSearchPlaysService);

/**
 * Fully composed layer with all dependencies
 * Uses FetchHttpClient for cross-platform compatibility (Node, Bun, Browser)
 */
export const SearchPlaysServiceFull = SearchPlaysServiceLive.pipe(
  Layer.provide(FaissConfig.Default),
  Layer.provide(FetchHttpClient.layer)
);

/**
 * Test layer with mock implementation
 */
export const SearchPlaysServiceTest: Layer.Layer<SearchPlaysService> =
  Layer.succeed(SearchPlaysService, {
    timeline: (_params) =>
      Effect.succeed({
        results: [],
        next_cursor: null,
        has_more: false,
        query_time_ms: 0,
        total_count: null,
        anchor_position: null,
      }),
    count: (_mbid, _entityType) => Effect.succeed(0),
  } satisfies SearchPlaysServiceInterface);
