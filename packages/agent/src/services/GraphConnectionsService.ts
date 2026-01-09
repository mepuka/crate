/**
 * GraphConnectionsService
 *
 * Service layer for MusicBrainz graph queries. Wraps GraphConnectionsClient
 * to provide a stable service tag for dependency injection.
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
 * **Extended queries:**
 * - `collaborators_direct` - Direct collaborations (supports collaboration_type filter)
 * - `members_by_instrument` - Band members by instrument (supports instrument filter)
 * - `works_by_creator` - Works by composer/lyricist (supports creator_type filter)
 * - `work_credits` - Who composed/wrote a work
 *
 * ## Filter Parameters
 *
 * - `version_type`: "cover" | "live" | "medley" | "instrumental"
 * - `collaboration_type`: "featured" | "production" | "writing"
 * - `instrument`: "vocals" | "guitar" | "bass" | "drums" | "keys"
 * - `creator_type`: "composer" | "lyricist" | "writer" | "arranger"
 *
 * @see GraphConnectionsClient for HTTP implementation details
 */

import { Context, Effect, Layer } from "effect"
import {
  GraphConnectionsClient,
  GraphConnectionsClientLive,
  type GraphConnectionsRequestType as GraphConnectionsRequest,
  type GraphConnectionsResponseType as GraphConnectionsResponse
} from "./GraphConnectionsClient.js"
import { GraphApiError } from "./errors.js"

export type { GraphConnectionsRequest, GraphConnectionsResponse }

export interface GraphConnectionsServiceInterface {
  readonly connections: (
    params: GraphConnectionsRequest
  ) => Effect.Effect<GraphConnectionsResponse, GraphApiError, never>
}

export class GraphConnectionsService extends Context.Tag("GraphConnectionsService")<
  GraphConnectionsService,
  GraphConnectionsServiceInterface
>() {}

const makeGraphConnectionsService = Effect.gen(function* () {
  const client = yield* GraphConnectionsClient

  const connections = Effect.fn("GraphConnectionsService.connections")(function* (
    params: GraphConnectionsRequest
  ) {
    return yield* client.connections(params)
  }) as (
    params: GraphConnectionsRequest
  ) => Effect.Effect<GraphConnectionsResponse, GraphApiError, never>

  return { connections } satisfies GraphConnectionsServiceInterface
})

export const GraphConnectionsServiceLive: Layer.Layer<
  GraphConnectionsService,
  never,
  GraphConnectionsClient
> = Layer.effect(GraphConnectionsService, makeGraphConnectionsService)

export const GraphConnectionsServiceFull = GraphConnectionsServiceLive.pipe(
  Layer.provide(GraphConnectionsClientLive)
)
