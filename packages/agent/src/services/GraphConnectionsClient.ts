/**
 * Graph Connections API Client
 *
 * Typed HTTP client for /api/graph/connections
 */

import { Data, Effect, Layer } from "effect";
import {
  HttpClientResponse,
  HttpBody,
  FetchHttpClient,
} from "@effect/platform";
import {
  GraphConnectionsRequest,
  GraphConnectionsResponse,
} from "@crate/domain";
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
    params: GraphConnectionsRequest
  ) => Effect.Effect<GraphConnectionsResponse, GraphApiError>;
}

export class GraphConnectionsClient extends Effect.Service<GraphConnectionsClient>()(
  "GraphConnectionsClient",
  {
    effect: Effect.gen(function* () {
      const config = yield* FaissConfig;
      const client = yield* makeJsonClient(config.baseUrl);

      const connections = (
        params: GraphConnectionsRequest
      ): Effect.Effect<GraphConnectionsResponse, GraphApiError> =>
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
            Effect.mapError((error) =>
              error instanceof GraphApiError
                ? error
                : new GraphApiError({
                    message: "Graph connections request failed",
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
