/**
 * MusicGraphService
 *
 * In-memory graph cache built on effect/Graph with MBID lookup.
 * Provides fluent expansion via GraphConnectionsService and traversal helpers.
 */

import { Context, Effect, HashMap, Option, Ref, Layer, Graph } from "effect";
import {
  GraphConnectionsService,
  GraphConnectionsServiceFull,
  type GraphConnectionsRequest,
  type GraphConnectionsResponse,
} from "./GraphConnectionsService.js";
import { GraphApiError } from "./errors.js";

type Mbid = string;

export interface GraphNode {
  readonly mbid: Mbid;
  readonly name: string;
  readonly nodeType: GraphConnectionsResponse["connections"][number]["node_type"];
}

export interface GraphEdgeData {
  readonly relationshipType: string;
  readonly attributes?: readonly string[];
  readonly viaMbid?: string;
  readonly viaName?: string;
  readonly beginDate?: string;
  readonly endDate?: string;
}

interface GraphState {
  readonly graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>;
  readonly indexByMbid: HashMap.HashMap<Mbid, Graph.NodeIndex>;
}

export interface MusicGraphServiceInterface {
  readonly expand: (params: GraphConnectionsRequest) => Effect.Effect<
    {
      readonly connections: GraphConnectionsResponse;
      readonly newNodes: number;
      readonly newEdges: number;
    },
    GraphApiError
  >;
  readonly neighbors: (mbid: Mbid) => Effect.Effect<readonly GraphNode[]>;
  readonly path: (
    from: Mbid,
    to: Mbid
  ) => Effect.Effect<Option.Option<readonly GraphNode[]>>;
  readonly snapshot: () => Effect.Effect<{
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly (GraphEdgeData & {
      readonly from: string;
      readonly to: string;
    })[];
  }>;
  readonly reset: () => Effect.Effect<void>;
}

export class MusicGraphService extends Context.Tag("MusicGraphService")<
  MusicGraphService,
  MusicGraphServiceInterface
>() {}

const emptyState = (): GraphState => ({
  graph: Graph.directed<GraphNode, GraphEdgeData>(),
  indexByMbid: HashMap.empty(),
});

const makeMusicGraphService = Effect.gen(function* () {
  const connections = yield* GraphConnectionsService;
  const state = yield* Ref.make<GraphState>(emptyState());

  // Optimized: get or add node, mutating the index map in place
  const getOrAddNode = (
    mutable: Graph.MutableDirectedGraph<GraphNode, GraphEdgeData>,
    indexByMbid: HashMap.HashMap<Mbid, Graph.NodeIndex>,
    mbid: string,
    name: string,
    nodeType: GraphNode["nodeType"]
  ): [HashMap.HashMap<Mbid, Graph.NodeIndex>, Graph.NodeIndex] => {
    const existing = HashMap.get(indexByMbid, mbid);
    if (Option.isSome(existing)) {
      return [indexByMbid, existing.value];
    }
    const idx = Graph.addNode(mutable, { mbid, name, nodeType });
    return [HashMap.set(indexByMbid, mbid, idx), idx];
  };

  const expand = (
    params: GraphConnectionsRequest
  ): Effect.Effect<
    {
      readonly connections: GraphConnectionsResponse;
      readonly newNodes: number;
      readonly newEdges: number;
    },
    GraphApiError
  > =>
    Effect.gen(function* () {
      const response = yield* connections.connections(params);

      const result = yield* Ref.modify(state, (current) => {
        const beforeNodes = Graph.nodeCount(current.graph);
        const beforeEdges = Graph.edgeCount(current.graph);

        let indexByMbid = current.indexByMbid;
        const nextGraph = Graph.mutate(current.graph, (mutable) => {
          // Pre-compute source indices to avoid repeated HashMap lookups
          const sourceIndices = new Map<Mbid, Graph.NodeIndex>();
          for (const source of response.source_mbids) {
            const [updatedIndex, idx] = getOrAddNode(
              mutable,
              indexByMbid,
              source,
              "unknown",
              "artist"
            );
            indexByMbid = updatedIndex;
            sourceIndices.set(source, idx);
          }

          for (const conn of response.connections) {
            const [updatedIndex, targetIdx] = getOrAddNode(
              mutable,
              indexByMbid,
              conn.mbid,
              conn.name,
              conn.node_type
            );
            indexByMbid = updatedIndex;

            // Build edge data once
            const edgeData: GraphEdgeData = {
              relationshipType: conn.relationship_type,
              ...(conn.attributes &&
                conn.attributes.length > 0 && { attributes: conn.attributes }),
              ...(conn.via_mbid && { viaMbid: conn.via_mbid }),
              ...(conn.via_name && { viaName: conn.via_name }),
              ...(conn.begin_date && { beginDate: conn.begin_date }),
              ...(conn.end_date && { endDate: conn.end_date }),
            };

            // Add edges from all sources to this connection
            for (const sourceIdx of sourceIndices.values()) {
              if (!Graph.hasEdge(mutable, sourceIdx, targetIdx)) {
                Graph.addEdge(mutable, sourceIdx, targetIdx, edgeData);
              }
            }
          }
        });

        const afterNodes = Graph.nodeCount(nextGraph);
        const afterEdges = Graph.edgeCount(nextGraph);

        return [
          {
            connections: response,
            newNodes: afterNodes - beforeNodes,
            newEdges: afterEdges - beforeEdges,
          },
          { graph: nextGraph, indexByMbid },
        ];
      });

      return result;
    });

  const neighbors = (mbid: Mbid): Effect.Effect<readonly GraphNode[]> =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const idx = HashMap.get(s.indexByMbid, mbid);
        if (Option.isNone(idx)) return [];
        // Single pass: collect valid nodes without intermediate arrays
        const result: GraphNode[] = [];
        for (const nIdx of Graph.neighbors(s.graph, idx.value)) {
          const nodeOpt = Graph.getNode(s.graph, nIdx);
          if (Option.isSome(nodeOpt)) {
            result.push(nodeOpt.value);
          }
        }
        return result;
      })
    );

  const path = (
    from: Mbid,
    to: Mbid
  ): Effect.Effect<Option.Option<readonly GraphNode[]>> =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const fromIdx = HashMap.get(s.indexByMbid, from);
        const toIdx = HashMap.get(s.indexByMbid, to);
        if (Option.isNone(fromIdx) || Option.isNone(toIdx))
          return Option.none();
        const maybePath = Graph.dijkstra(s.graph, {
          source: fromIdx.value,
          target: toIdx.value,
          cost: () => 1,
        });
        if (Option.isNone(maybePath)) return Option.none();
        // Single pass: collect valid nodes without intermediate arrays
        const nodes: GraphNode[] = [];
        for (const idx of maybePath.value.path) {
          const nodeOpt = Graph.getNode(s.graph, idx);
          if (Option.isSome(nodeOpt)) {
            nodes.push(nodeOpt.value);
          }
        }
        return Option.some(nodes);
      })
    );

  const snapshot = () =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        // Collect nodes in single pass without intermediate arrays
        const nodes: GraphNode[] = [];
        for (const [, node] of Graph.entries(Graph.nodes(s.graph))) {
          nodes.push(node);
        }

        // Collect edges in single pass
        const edges: (GraphEdgeData & {
          readonly from: string;
          readonly to: string;
        })[] = [];
        for (const [, edge] of Graph.entries(Graph.edges(s.graph))) {
          const sourceNode = Graph.getNode(s.graph, edge.source);
          const targetNode = Graph.getNode(s.graph, edge.target);
          edges.push({
            from:
              Option.getOrUndefined(sourceNode)?.mbid ?? String(edge.source),
            to: Option.getOrUndefined(targetNode)?.mbid ?? String(edge.target),
            ...edge.data,
          });
        }
        return { nodes, edges };
      })
    );

  const reset = () => Ref.set(state, emptyState());

  return {
    expand,
    neighbors,
    path,
    snapshot,
    reset,
  } satisfies MusicGraphServiceInterface;
});

export const MusicGraphServiceLive: Layer.Layer<
  MusicGraphService,
  never,
  GraphConnectionsService
> = Layer.effect(MusicGraphService, makeMusicGraphService);

export const MusicGraphServiceFull = MusicGraphServiceLive.pipe(
  Layer.provide(GraphConnectionsServiceFull)
);
