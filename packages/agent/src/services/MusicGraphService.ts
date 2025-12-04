/**
 * MusicGraphService
 *
 * In-memory graph cache built on effect/Graph with MBID lookup.
 * Provides fluent expansion via GraphConnectionsService and traversal helpers.
 */

import { Context, Effect, HashMap, Option, Ref, Layer, Graph } from "effect"
import {
  GraphConnectionsService,
  GraphConnectionsServiceFull,
} from "./GraphConnectionsService.js"
import type {
  GraphConnectionsRequest,
  GraphConnectionsResponse,
  GraphQueryType
} from "@crate/domain/graph/schemas"
import { GraphApiError } from "./errors.js"

type Mbid = string

export interface GraphNode {
  readonly mbid: Mbid
  readonly name: string
  readonly nodeType: GraphConnectionsResponse["connections"][number]["node_type"]
}

export interface GraphEdgeData {
  readonly relationshipType: string
  readonly attributes?: readonly string[]
  readonly viaMbid?: string
  readonly viaName?: string
  readonly beginDate?: string
  readonly endDate?: string
}

interface GraphState {
  readonly graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>
  readonly indexByMbid: HashMap.HashMap<Mbid, Graph.NodeIndex>
}

export interface MusicGraphServiceInterface {
  readonly expand: (
    params: GraphConnectionsRequest
  ) => Effect.Effect<
    {
      readonly connections: GraphConnectionsResponse
      readonly newNodes: number
      readonly newEdges: number
    },
    GraphApiError
  >
  readonly neighbors: (mbid: Mbid) => Effect.Effect<readonly GraphNode[]>
  readonly path: (
    from: Mbid,
    to: Mbid
  ) => Effect.Effect<Option.Option<readonly GraphNode[]>>
  readonly snapshot: () => Effect.Effect<{
    readonly nodes: readonly GraphNode[]
    readonly edges: readonly (GraphEdgeData & { readonly from: string; readonly to: string })[]
  }>
  readonly reset: () => Effect.Effect<void>
}

export class MusicGraphService extends Context.Tag("MusicGraphService")<
  MusicGraphService,
  MusicGraphServiceInterface
>() {}

const emptyState = (): GraphState => ({
  graph: Graph.directed<GraphNode, GraphEdgeData>(),
  indexByMbid: HashMap.empty()
})

const makeMusicGraphService = Effect.gen(function* () {
  const connections = yield* GraphConnectionsService
  const state = yield* Ref.make<GraphState>(emptyState())

  const getOrAddNode = (
    mutable: Graph.MutableDirectedGraph<GraphNode, GraphEdgeData>,
    indexByMbid: HashMap.HashMap<Mbid, Graph.NodeIndex>,
    mbid: string,
    name: string,
    nodeType: GraphNode["nodeType"]
  ): [Graph.MutableDirectedGraph<GraphNode, GraphEdgeData>, HashMap.HashMap<Mbid, Graph.NodeIndex>, Graph.NodeIndex] => {
    const existing = HashMap.get(indexByMbid, mbid)
    if (Option.isSome(existing)) {
      return [mutable, indexByMbid, existing.value]
    }
    const idx = Graph.addNode(mutable, { mbid, name, nodeType })
    return [mutable, HashMap.set(indexByMbid, mbid, idx), idx]
  }

  const expand = (
    params: GraphConnectionsRequest
  ): Effect.Effect<
    { readonly connections: GraphConnectionsResponse; readonly newNodes: number; readonly newEdges: number },
    GraphApiError
  > =>
    Effect.gen(function* () {
      const response = yield* connections.connections(params)

      const result = yield* Ref.modify(state, (current) => {
        const beforeNodes = Graph.nodeCount(current.graph)
        const beforeEdges = Graph.edgeCount(current.graph)

        let indexByMbid = current.indexByMbid
        const nextGraph = Graph.mutate(current.graph, (mutable) => {
          // ensure sources exist even if we lack names
          for (const source of response.source_mbids) {
            const name = "unknown"
            ;[mutable, indexByMbid] = getOrAddNode(mutable, indexByMbid, source, name, "artist")
          }

          for (const conn of response.connections) {
            ;[mutable, indexByMbid] = getOrAddNode(
              mutable,
              indexByMbid,
              conn.mbid,
              conn.name,
              conn.node_type
            )

            // source edge for each seed mbid
            for (const source of response.source_mbids) {
              const sourceIdxOpt = HashMap.get(indexByMbid, source)
              const targetIdxOpt = HashMap.get(indexByMbid, conn.mbid)
              if (Option.isNone(sourceIdxOpt) || Option.isNone(targetIdxOpt)) continue
              const sourceIdx = sourceIdxOpt.value
              const targetIdx = targetIdxOpt.value
              if (!Graph.hasEdge(mutable, sourceIdx, targetIdx)) {
                Graph.addEdge(mutable, sourceIdx, targetIdx, {
                  relationshipType: conn.relationship_type,
                  attributes: conn.attributes,
                  viaMbid: conn.via_mbid,
                  viaName: conn.via_name,
                  beginDate: conn.begin_date ?? undefined,
                  endDate: conn.end_date ?? undefined
                })
              }
            }
          }
        })

        const afterNodes = Graph.nodeCount(nextGraph)
        const afterEdges = Graph.edgeCount(nextGraph)

        return [
          {
            connections: response,
            newNodes: afterNodes - beforeNodes,
            newEdges: afterEdges - beforeEdges
          },
          { graph: nextGraph, indexByMbid }
        ]
      })

      return result
    })

  const neighbors = (mbid: Mbid): Effect.Effect<readonly GraphNode[]> =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const idx = HashMap.get(s.indexByMbid, mbid)
        if (Option.isNone(idx)) return []
        return Graph.neighbors(s.graph, idx.value)
          .map((nIdx) => Graph.getNode(s.graph, nIdx))
          .filter(Option.isSome)
          .map((opt) => opt.value)
      })
    )

  const path = (
    from: Mbid,
    to: Mbid
  ): Effect.Effect<Option.Option<readonly GraphNode[]>> =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const fromIdx = HashMap.get(s.indexByMbid, from)
        const toIdx = HashMap.get(s.indexByMbid, to)
        if (Option.isNone(fromIdx) || Option.isNone(toIdx)) return Option.none()
        const maybePath = Graph.dijkstra(s.graph, {
          source: fromIdx.value,
          target: toIdx.value,
          cost: () => 1
        })
        if (Option.isNone(maybePath)) return Option.none()
        const nodes = maybePath.value.path
          .map((idx) => Graph.getNode(s.graph, idx))
          .filter(Option.isSome)
          .map((opt) => opt.value)
        return Option.some(nodes)
      })
    )

  const snapshot = () =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const nodes = Array.from(Graph.entries(Graph.nodes(s.graph))).map(([, node]) => node)
        const edges = Array.from(Graph.entries(Graph.edges(s.graph))).map(([idx, edge]) => {
          const sourceNode = Graph.getNode(s.graph, edge.source)
          const targetNode = Graph.getNode(s.graph, edge.target)
          return {
            from: Option.getOrUndefined(sourceNode)?.mbid ?? String(edge.source),
            to: Option.getOrUndefined(targetNode)?.mbid ?? String(edge.target),
            ...edge.data
          }
        })
        return { nodes, edges }
      })
    )

  const reset = () => Ref.set(state, emptyState())

  return {
    expand,
    neighbors,
    path,
    snapshot,
    reset
  } satisfies MusicGraphServiceInterface
})

export const MusicGraphServiceLive: Layer.Layer<
  MusicGraphService,
  never,
  GraphConnectionsService
> = Layer.effect(MusicGraphService, makeMusicGraphService)

export const MusicGraphServiceFull = MusicGraphServiceLive.pipe(
  Layer.provide(GraphConnectionsServiceFull)
)
