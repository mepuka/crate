/**
 * Graph Connections API Client
 *
 * Typed HTTP client for /api/graph/connections endpoint.
 *
 * ## 13 Query Types
 *
 * **Basic queries:**
 * - `band_members` - Get members of a band
 * - `member_of` - Get bands an artist is member of
 * - `labelmates` - Get artists on same label(s)
 * - `label_hierarchy` - Get label ownership tree
 * - `covers` - Get cover/live/other versions (supports version_type filter)
 * - `artist_origin` - Get artist's origin area
 * - `artists_from_area` - Get artists from an area
 * - `recorded_at` - Get recordings from a place
 * - `collaborators` - Get artists who shared bands (2-hop)
 *
 * **Extended queries (NEW):**
 * - `collaborators_direct` - Direct collaborations (supports collaboration_type filter)
 * - `members_by_instrument` - Band members by instrument (supports instrument filter)
 * - `works_by_creator` - Works by composer/lyricist (supports creator_type filter)
 * - `work_credits` - Who composed/wrote a work
 *
 * ## Filter Parameters
 *
 * - `version_type`: "cover" | "live" | "medley" | "instrumental" (for covers)
 * - `collaboration_type`: "featured" | "production" | "writing" (for collaborators_direct)
 * - `instrument`: "vocals" | "guitar" | "bass" | "drums" | "keys" (for members_by_instrument)
 * - `creator_type`: "composer" | "lyricist" | "writer" | "arranger" (for works_by_creator)
 *
 * @example
 * ```ts
 * // Basic query
 * client.connections({ query_type: "band_members", mbids: ["band-mbid"] })
 *
 * // With filter
 * client.connections({
 *   query_type: "covers",
 *   mbids: ["recording-mbid"],
 *   version_type: "live"
 * })
 * ```
 */

import { Data, Effect, Layer } from "effect";
import {
  HttpClientResponse,
  HttpBody,
  FetchHttpClient,
} from "@effect/platform";
// Import directly from graph subpath to work around Bun barrel export bug
import {
  GraphConnectionsRequest,
  GraphConnectionsResponse,
} from "@crate/domain/graph/schemas";
import { makeJsonClient } from "./http-utils.js";
import { FaissConfig } from "../config.js";
import { GraphApiError } from "./errors.js";

export type GraphConnectionsRequestType = typeof GraphConnectionsRequest.Type;
export type GraphConnectionsResponseType = typeof GraphConnectionsResponse.Type;

/**
 * Tagged error for graph API failures
 */
export class GraphApiClientError extends Data.TaggedError(
  "GraphApiClientError"
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface GraphConnectionsClientInterface {
  readonly connections: (
    params: GraphConnectionsRequestType
  ) => Effect.Effect<GraphConnectionsResponseType, GraphApiError, never>;
}

export class GraphConnectionsClient extends Effect.Service<GraphConnectionsClient>()(
  "GraphConnectionsClient",
  {
    effect: Effect.gen(function* () {
      const config = yield* FaissConfig;
      const client = yield* makeJsonClient(config.baseUrl);

      const connections = (
        params: GraphConnectionsRequestType
      ): Effect.Effect<GraphConnectionsResponseType, GraphApiError, never> =>
        client
          .post("/api/graph/connections", {
            body: HttpBody.unsafeJson(params),
          })
          .pipe(
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": HttpClientResponse.schemaBodyJson(
                  GraphConnectionsResponse
                ),
                orElse: (response) =>
                  response.text.pipe(
                    Effect.flatMap((body) =>
                      Effect.fail(
                        new GraphApiError({
                          message: `Graph connections HTTP ${response.status}`,
                          query: JSON.stringify({
                            query_type: params.query_type,
                            mbids: params.mbids,
                          }),
                          cause: body,
                        })
                      )
                    )
                  ),
              })
            ),
            Effect.tapError((error: unknown) =>
              Effect.gen(function* () {
                // For ParseError, try to extract more details
                const err = error as { _tag?: string; message?: string; issue?: unknown };
                const errorTag = err._tag ?? "Unknown";
                let details = error instanceof Error ? error.message : String(error);

                // Effect Schema ParseError has .issue with details
                if (err.issue) {
                  try {
                    details = JSON.stringify(err.issue, null, 2).slice(0, 2000);
                  } catch {
                    // ignore stringify errors
                  }
                }

                yield* Effect.logDebug(`GraphConnectionsClient error [${errorTag}]: ${details}`);
              })
            ),
            Effect.mapError((error: unknown) =>
              error instanceof GraphApiError
                ? error
                : new GraphApiError({
                    message: `Graph connections request failed: ${(error as { _tag?: string })._tag ?? "Unknown"}`,
                    query: JSON.stringify({
                      query_type: params.query_type,
                      mbids: params.mbids,
                    }),
                    cause: error,
                  })
            )
          );

      return { connections } satisfies GraphConnectionsClientInterface;
    }),
    dependencies: [FaissConfig.Default, FetchHttpClient.layer],
  }
) {}

export const GraphConnectionsClientLive = GraphConnectionsClient.Default.pipe(
  Layer.provide(FetchHttpClient.layer)
);
