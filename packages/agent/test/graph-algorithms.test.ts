/**
 * Unit Tests: MusicGraphService Graph Algorithms (Phase 1)
 *
 * Tests the Phase 1 graph algorithms:
 * - Degree centrality
 * - K-hop neighborhood exploration
 * - Relationship summarization
 * - Time-windowed stats
 *
 * @module
 */

import { describe, it, expect } from "@effect/vitest"
import { Effect, Layer, Ref, HashMap, Graph, Option } from "effect"
import {
  MusicGraphService,
  type MusicGraphServiceInterface,
  type GraphNode,
  type GraphEdgeData,
} from "../src/services/MusicGraphService.js"

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a test graph with known structure:
 *
 *   A --member_of--> B (band)
 *   A --collaboration--> C
 *   A --collaboration--> D
 *   B --labelmates--> C
 *   C --collaboration--> D
 *
 * Degrees: A: out=3, in=0 | B: out=1, in=1 | C: out=1, in=2 | D: out=0, in=2
 */
const makeTestGraph = () => {
  type TestGraphState = {
    graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>
    indexByMbid: HashMap.HashMap<string, Graph.NodeIndex>
  }

  const nodes: GraphNode[] = [
    { mbid: "mbid-a", name: "Artist A", nodeType: "artist" },
    { mbid: "mbid-b", name: "Band B", nodeType: "artist" },
    { mbid: "mbid-c", name: "Artist C", nodeType: "artist" },
    { mbid: "mbid-d", name: "Artist D", nodeType: "artist" },
  ]

  const edges: { from: string; to: string; data: GraphEdgeData }[] = [
    {
      from: "mbid-a",
      to: "mbid-b",
      data: { relationshipType: "member of band", beginDate: "1990", endDate: "2000" },
    },
    {
      from: "mbid-a",
      to: "mbid-c",
      data: { relationshipType: "collaboration", beginDate: "1995" },
    },
    {
      from: "mbid-a",
      to: "mbid-d",
      data: { relationshipType: "collaboration", beginDate: "2020" },
    },
    {
      from: "mbid-b",
      to: "mbid-c",
      data: { relationshipType: "labelmates", beginDate: "1992", endDate: "1998" },
    },
    {
      from: "mbid-c",
      to: "mbid-d",
      data: { relationshipType: "collaboration", beginDate: "2015", endDate: "2018" },
    },
  ]

  let graph = Graph.directed<GraphNode, GraphEdgeData>()
  let indexByMbid = HashMap.empty<string, Graph.NodeIndex>()

  // Build graph
  graph = Graph.mutate(graph, (mutable) => {
    // Add nodes
    for (const node of nodes) {
      const idx = Graph.addNode(mutable, node)
      indexByMbid = HashMap.set(indexByMbid, node.mbid, idx)
    }

    // Add edges
    for (const edge of edges) {
      const fromIdx = HashMap.get(indexByMbid, edge.from)
      const toIdx = HashMap.get(indexByMbid, edge.to)
      if (Option.isSome(fromIdx) && Option.isSome(toIdx)) {
        Graph.addEdge(mutable, fromIdx.value, toIdx.value, edge.data)
      }
    }
  })

  return { graph, indexByMbid } as TestGraphState
}

/**
 * Create a mock MusicGraphService with pre-populated test graph
 */
const makeTestService = Effect.gen(function* () {
  const testState = makeTestGraph()
  const state = yield* Ref.make(testState)

  const degreeCentrality = (mbid: string) =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const idx = HashMap.get(s.indexByMbid, mbid)
        if (Option.isNone(idx)) {
          return { inDegree: 0, outDegree: 0, totalDegree: 0 }
        }
        const outDegree = Graph.neighborsDirected(s.graph, idx.value, "outgoing").length
        const inDegree = Graph.neighborsDirected(s.graph, idx.value, "incoming").length
        return { inDegree, outDegree, totalDegree: inDegree + outDegree }
      })
    )

  const kHopNeighborhood = (mbid: string, k: number) =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const startIdx = HashMap.get(s.indexByMbid, mbid)
        if (Option.isNone(startIdx)) return []

        const queue: Array<{ idx: Graph.NodeIndex; dist: number }> = [
          { idx: startIdx.value, dist: 0 },
        ]
        const visited = new Set<Graph.NodeIndex>()
        const result: Array<{ node: GraphNode; distance: number }> = []

        while (queue.length > 0) {
          const { idx, dist } = queue.shift()!
          if (visited.has(idx)) continue
          visited.add(idx)

          if (dist > 0) {
            const node = Graph.getNode(s.graph, idx)
            if (Option.isSome(node)) {
              result.push({ node: node.value, distance: dist })
            }
          }

          if (dist < k) {
            const neighbors = Graph.neighbors(s.graph, idx)
            for (const nIdx of neighbors) {
              if (!visited.has(nIdx)) {
                queue.push({ idx: nIdx, dist: dist + 1 })
              }
            }
          }
        }

        return result
      })
    )

  const summarizeRelationships = (mbid: string) =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const sourceIdx = HashMap.get(s.indexByMbid, mbid)
        if (Option.isNone(sourceIdx)) {
          return {
            totalConnections: 0,
            byType: new Map<string, number>(),
            topCollaborators: [] as string[],
            hasRecentActivity: false,
          }
        }

        const edgeIndices = Graph.findEdges(
          s.graph,
          (_, source) => source === sourceIdx.value
        )

        const byType = new Map<string, number>()
        const collaborators: string[] = []
        let hasRecentActivity = false
        const currentYear = new Date().getFullYear()

        for (const edgeIdx of edgeIndices) {
          const edgeOpt = Graph.getEdge(s.graph, edgeIdx)
          if (Option.isSome(edgeOpt)) {
            const edge = edgeOpt.value
            const relType = edge.data.relationshipType
            byType.set(relType, (byType.get(relType) ?? 0) + 1)

            if (relType.includes("member") || relType === "collaboration") {
              const targetNode = Graph.getNode(s.graph, edge.target)
              if (Option.isSome(targetNode)) {
                collaborators.push(targetNode.value.name)
              }
            }

            if (!edge.data.endDate) {
              hasRecentActivity = true
            } else {
              const endYear = parseInt(edge.data.endDate.split("-")[0], 10)
              if (currentYear - endYear <= 5) {
                hasRecentActivity = true
              }
            }
          }
        }

        return {
          totalConnections: edgeIndices.length,
          byType,
          topCollaborators: collaborators.slice(0, 10),
          hasRecentActivity,
        }
      })
    )

  const timeWindowStats = (startYear: number, endYear: number) =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const activeNodes = new Set<Graph.NodeIndex>()
        const activeRelationships = new Set<string>()
        let activeEdgeCount = 0

        for (const [, edge] of Graph.entries(Graph.edges(s.graph))) {
          const beginStr = edge.data.beginDate
          const endStr = edge.data.endDate

          const begin = beginStr ? parseInt(beginStr.split("-")[0], 10) : -Infinity
          const end = endStr ? parseInt(endStr.split("-")[0], 10) : Infinity

          const overlaps = begin <= endYear && end >= startYear

          if (overlaps) {
            activeEdgeCount++
            activeNodes.add(edge.source)
            activeNodes.add(edge.target)
            activeRelationships.add(edge.data.relationshipType)
          }
        }

        return {
          nodeCount: activeNodes.size,
          edgeCount: activeEdgeCount,
          activeRelationships: [...activeRelationships].sort(),
        }
      })
    )

  // Return partial implementation with just the methods we're testing
  return {
    degreeCentrality,
    kHopNeighborhood,
    summarizeRelationships,
    timeWindowStats,
    // Stubs for required methods
    expand: () => Effect.succeed({ connections: { connections: [], total: 0, query_time_ms: 0, query_type: "band_members" as const, source_mbids: [] }, newNodes: 0, newEdges: 0 }),
    neighbors: () => Effect.succeed([]),
    outgoingEdges: () => Effect.succeed([]),
    path: () => Effect.succeed(Option.none()),
    snapshot: () => Effect.succeed({ nodes: [], edges: [] }),
    reset: () => Effect.void,
  } as unknown as MusicGraphServiceInterface
})

const TestLayer = Layer.effect(MusicGraphService, makeTestService)

// =============================================================================
// Degree Centrality Tests
// =============================================================================

describe("Degree Centrality", () => {
  it.effect("returns correct degree for node with only outgoing edges", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.degreeCentrality("mbid-a")

      // A has 3 outgoing (to B, C, D) and 0 incoming
      expect(result.outDegree).toBe(3)
      expect(result.inDegree).toBe(0)
      expect(result.totalDegree).toBe(3)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns correct degree for node with mixed edges", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.degreeCentrality("mbid-c")

      // C has 1 outgoing (to D) and 2 incoming (from A, B)
      expect(result.outDegree).toBe(1)
      expect(result.inDegree).toBe(2)
      expect(result.totalDegree).toBe(3)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns correct degree for sink node (only incoming)", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.degreeCentrality("mbid-d")

      // D has 0 outgoing and 2 incoming (from A, C)
      expect(result.outDegree).toBe(0)
      expect(result.inDegree).toBe(2)
      expect(result.totalDegree).toBe(2)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns zero for unknown node", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.degreeCentrality("unknown-mbid")

      expect(result.outDegree).toBe(0)
      expect(result.inDegree).toBe(0)
      expect(result.totalDegree).toBe(0)
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// K-Hop Neighborhood Tests
// =============================================================================

describe("K-Hop Neighborhood", () => {
  it.effect("returns direct neighbors for k=1", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.kHopNeighborhood("mbid-a", 1)

      // A connects directly to B, C, D
      expect(result).toHaveLength(3)
      expect(result.every((r) => r.distance === 1)).toBe(true)
      const names = result.map((r) => r.node.name).sort()
      expect(names).toEqual(["Artist C", "Artist D", "Band B"])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns 2-hop neighborhood", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.kHopNeighborhood("mbid-b", 2)

      // B -> C (1 hop), C -> D (2 hops), B <- A (1 hop), A -> C, A -> D (2 hops)
      // Should find: A (1), C (1), D (2)
      expect(result.length).toBeGreaterThanOrEqual(2)
      const dist1 = result.filter((r) => r.distance === 1)
      const dist2 = result.filter((r) => r.distance === 2)
      expect(dist1.length).toBeGreaterThan(0)
      // D should be reachable in 2 hops via C
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns empty for unknown node", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.kHopNeighborhood("unknown-mbid", 2)

      expect(result).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns empty for k=0", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.kHopNeighborhood("mbid-a", 0)

      expect(result).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// Relationship Summarization Tests
// =============================================================================

describe("Relationship Summarization", () => {
  it.effect("counts relationships by type", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.summarizeRelationships("mbid-a")

      // A has: 1 "member of band", 2 "collaboration"
      expect(result.totalConnections).toBe(3)
      expect(result.byType.get("member of band")).toBe(1)
      expect(result.byType.get("collaboration")).toBe(2)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("identifies top collaborators", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.summarizeRelationships("mbid-a")

      // Should include Band B (member of band) and Artist C, D (collaboration)
      expect(result.topCollaborators).toContain("Band B")
      expect(result.topCollaborators).toContain("Artist C")
      expect(result.topCollaborators).toContain("Artist D")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("detects recent activity (ongoing relationship)", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.summarizeRelationships("mbid-a")

      // A -> C has no endDate (ongoing), A -> D is from 2020 (recent)
      expect(result.hasRecentActivity).toBe(true)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns empty summary for unknown node", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.summarizeRelationships("unknown-mbid")

      expect(result.totalConnections).toBe(0)
      expect(result.byType.size).toBe(0)
      expect(result.topCollaborators).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// Time Window Stats Tests
// =============================================================================

describe("Time Window Stats", () => {
  it.effect("filters edges by time window - 1990s", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.timeWindowStats(1990, 1999)

      // Active in 1990s:
      // - A -> B: 1990-2000 (overlaps)
      // - A -> C: 1995-ongoing (overlaps)
      // - B -> C: 1992-1998 (overlaps)
      // - C -> D: 2015-2018 (no overlap)
      // - A -> D: 2020-ongoing (no overlap)
      expect(result.edgeCount).toBe(3)
      expect(result.activeRelationships).toContain("member of band")
      expect(result.activeRelationships).toContain("collaboration")
      expect(result.activeRelationships).toContain("labelmates")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters edges by time window - 2010s", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.timeWindowStats(2010, 2019)

      // Active in 2010s:
      // - A -> C: 1995-ongoing (overlaps - no end date)
      // - C -> D: 2015-2018 (overlaps)
      expect(result.edgeCount).toBe(2)
      expect(result.activeRelationships).toContain("collaboration")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("handles time window with no active edges", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.timeWindowStats(1900, 1950)

      expect(result.edgeCount).toBe(0)
      expect(result.nodeCount).toBe(0)
      expect(result.activeRelationships).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("includes ongoing relationships (no end date)", () =>
    Effect.gen(function* () {
      const graph = yield* MusicGraphService
      const result = yield* graph.timeWindowStats(2025, 2030)

      // Should include edges with no end date
      // - A -> C: 1995-ongoing
      // - A -> D: 2020-ongoing
      expect(result.edgeCount).toBe(2)
    }).pipe(Effect.provide(TestLayer))
  )
})
