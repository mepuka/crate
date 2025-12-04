/**
 * GraphConnectionsService
 *
 * Thin wrapper over GraphConnectionsClient to provide a stable service tag
 * and isolation from HTTP details.
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
  ) => Effect.Effect<GraphConnectionsResponse, GraphApiError>
}

export class GraphConnectionsService extends Context.Tag("GraphConnectionsService")<
  GraphConnectionsService,
  GraphConnectionsServiceInterface
>() {}

const makeGraphConnectionsService = Effect.gen(function* () {
  const client = yield* GraphConnectionsClient

  const connections = (
    params: GraphConnectionsRequest
  ): Effect.Effect<GraphConnectionsResponse, GraphApiError> =>
    client.connections(params)

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
