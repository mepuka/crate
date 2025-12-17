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

/**
 * A neighbor node with its connecting edge data
 */
export interface NeighborWithEdge {
  readonly node: GraphNode;
  readonly edge: GraphEdgeData;
}

/**
 * Degree centrality metrics for a node
 */
export interface DegreeCentrality {
  readonly inDegree: number;
  readonly outDegree: number;
  readonly totalDegree: number;
}

/**
 * A node with its distance from the source in k-hop exploration
 */
export interface NodeWithDistance {
  readonly node: GraphNode;
  readonly distance: number;
}

/**
 * Summary of an artist's relationships in the graph
 */
export interface RelationshipSummary {
  readonly totalConnections: number;
  readonly byType: ReadonlyMap<string, number>;
  readonly topCollaborators: readonly string[];
  readonly hasRecentActivity: boolean;
}

/**
 * Stats about a time-windowed subgraph
 */
export interface TimeWindowStats {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly activeRelationships: readonly string[];
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
  /** Get neighbor nodes (without edge data) */
  readonly neighbors: (mbid: Mbid) => Effect.Effect<readonly GraphNode[]>;
  /** Get outgoing edges with full edge data - preserves relationship context */
  readonly outgoingEdges: (mbid: Mbid) => Effect.Effect<readonly NeighborWithEdge[]>;
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

  // ==========================================================================
  // Phase 1 Graph Algorithms
  // ==========================================================================

  /**
   * Get degree centrality metrics for a node
   * - inDegree: number of incoming edges (how many point to this node)
   * - outDegree: number of outgoing edges (how many this node points to)
   * - totalDegree: sum of in and out degree
   */
  readonly degreeCentrality: (mbid: Mbid) => Effect.Effect<DegreeCentrality>;

  /**
   * Get all nodes within K hops of a source node (BFS exploration)
   * Returns nodes sorted by distance, closest first
   */
  readonly kHopNeighborhood: (
    mbid: Mbid,
    k: number
  ) => Effect.Effect<readonly NodeWithDistance[]>;

  /**
   * Summarize an artist's relationships by type
   * Useful for generating artist profile insights
   */
  readonly summarizeRelationships: (mbid: Mbid) => Effect.Effect<RelationshipSummary>;

  /**
   * Get stats about edges active during a time window
   * Filters by beginDate/endDate overlap with [startYear, endYear]
   */
  readonly timeWindowStats: (
    startYear: number,
    endYear: number
  ) => Effect.Effect<TimeWindowStats>;
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

  const outgoingEdges = (mbid: Mbid): Effect.Effect<readonly NeighborWithEdge[]> =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const sourceIdx = HashMap.get(s.indexByMbid, mbid);
        if (Option.isNone(sourceIdx)) return [];

        // Use Graph.findEdges for efficient edge lookup by source
        const edgeIndices = Graph.findEdges(
          s.graph,
          (_, source) => source === sourceIdx.value
        );

        const result: NeighborWithEdge[] = [];
        for (const edgeIdx of edgeIndices) {
          const edgeOpt = Graph.getEdge(s.graph, edgeIdx);
          if (Option.isSome(edgeOpt)) {
            const edge = edgeOpt.value;
            const targetNode = Graph.getNode(s.graph, edge.target);
            if (Option.isSome(targetNode)) {
              result.push({
                node: targetNode.value,
                edge: edge.data,
              });
            }
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

  // ==========================================================================
  // Phase 1 Graph Algorithms
  // ==========================================================================

  /**
   * Get degree centrality metrics for a node
   * O(1) complexity - adjacency lists are pre-computed
   */
  const degreeCentrality = (mbid: Mbid): Effect.Effect<DegreeCentrality> =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const idx = HashMap.get(s.indexByMbid, mbid);
        if (Option.isNone(idx)) {
          return { inDegree: 0, outDegree: 0, totalDegree: 0 };
        }

        const outDegree = Graph.neighborsDirected(s.graph, idx.value, "outgoing").length;
        const inDegree = Graph.neighborsDirected(s.graph, idx.value, "incoming").length;

        return {
          inDegree,
          outDegree,
          totalDegree: inDegree + outDegree,
        };
      })
    );

  /**
   * Get all nodes within K hops of a source node using BFS
   * O(V+E) but limited by k - typically small
   */
  const kHopNeighborhood = (
    mbid: Mbid,
    k: number
  ): Effect.Effect<readonly NodeWithDistance[]> =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const startIdx = HashMap.get(s.indexByMbid, mbid);
        if (Option.isNone(startIdx)) return [];

        // BFS with distance tracking
        const queue: Array<{ idx: Graph.NodeIndex; dist: number }> = [
          { idx: startIdx.value, dist: 0 },
        ];
        const visited = new Set<Graph.NodeIndex>();
        const result: NodeWithDistance[] = [];

        while (queue.length > 0) {
          const { idx, dist } = queue.shift()!;

          if (visited.has(idx)) continue;
          visited.add(idx);

          // Don't include source node in results
          if (dist > 0) {
            const node = Graph.getNode(s.graph, idx);
            if (Option.isSome(node)) {
              result.push({ node: node.value, distance: dist });
            }
          }

          // Continue BFS if within k hops
          if (dist < k) {
            const neighbors = Graph.neighbors(s.graph, idx);
            for (const nIdx of neighbors) {
              if (!visited.has(nIdx)) {
                queue.push({ idx: nIdx, dist: dist + 1 });
              }
            }
          }
        }

        return result;
      })
    );

  /**
   * Summarize an artist's relationships by type
   * Aggregates edge types and identifies top collaborators
   */
  const summarizeRelationships = (mbid: Mbid): Effect.Effect<RelationshipSummary> =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const sourceIdx = HashMap.get(s.indexByMbid, mbid);
        if (Option.isNone(sourceIdx)) {
          return {
            totalConnections: 0,
            byType: new Map(),
            topCollaborators: [],
            hasRecentActivity: false,
          };
        }

        // Get all outgoing edges
        const edgeIndices = Graph.findEdges(
          s.graph,
          (_, source) => source === sourceIdx.value
        );

        const byType = new Map<string, number>();
        const collaborators: string[] = [];
        let hasRecentActivity = false;
        const currentYear = new Date().getFullYear();

        for (const edgeIdx of edgeIndices) {
          const edgeOpt = Graph.getEdge(s.graph, edgeIdx);
          if (Option.isSome(edgeOpt)) {
            const edge = edgeOpt.value;
            const relType = edge.data.relationshipType;

            // Count by type
            byType.set(relType, (byType.get(relType) ?? 0) + 1);

            // Track collaborators (band memberships and collaborations)
            if (
              relType === "member of band" ||
              relType === "collaboration" ||
              relType.includes("member")
            ) {
              const targetNode = Graph.getNode(s.graph, edge.target);
              if (Option.isSome(targetNode)) {
                collaborators.push(targetNode.value.name);
              }
            }

            // Check for recent activity (ongoing or ended within last 5 years)
            if (!edge.data.endDate) {
              hasRecentActivity = true;
            } else {
              const endYear = parseInt(edge.data.endDate.split("-")[0], 10);
              if (currentYear - endYear <= 5) {
                hasRecentActivity = true;
              }
            }
          }
        }

        return {
          totalConnections: edgeIndices.length,
          byType,
          topCollaborators: collaborators.slice(0, 10),
          hasRecentActivity,
        };
      })
    );

  /**
   * Get stats about edges active during a time window
   * Filters by beginDate/endDate overlap with [startYear, endYear]
   */
  const timeWindowStats = (
    startYear: number,
    endYear: number
  ): Effect.Effect<TimeWindowStats> =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const activeNodes = new Set<Graph.NodeIndex>();
        const activeRelationships = new Set<string>();
        let activeEdgeCount = 0;

        for (const [, edge] of Graph.entries(Graph.edges(s.graph))) {
          // Parse dates - treat missing dates as unbounded
          const beginStr = edge.data.beginDate;
          const endStr = edge.data.endDate;

          const begin = beginStr ? parseInt(beginStr.split("-")[0], 10) : -Infinity;
          const end = endStr ? parseInt(endStr.split("-")[0], 10) : Infinity;

          // Check if edge overlaps with time window
          // Edge [begin, end] overlaps [startYear, endYear] if begin <= endYear && end >= startYear
          const overlaps = begin <= endYear && end >= startYear;

          if (overlaps) {
            activeEdgeCount++;
            activeNodes.add(edge.source);
            activeNodes.add(edge.target);
            activeRelationships.add(edge.data.relationshipType);
          }
        }

        return {
          nodeCount: activeNodes.size,
          edgeCount: activeEdgeCount,
          activeRelationships: [...activeRelationships].sort(),
        };
      })
    );

  return {
    expand,
    neighbors,
    outgoingEdges,
    path,
    snapshot,
    reset,
    // Phase 1 algorithms
    degreeCentrality,
    kHopNeighborhood,
    summarizeRelationships,
    timeWindowStats,
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
