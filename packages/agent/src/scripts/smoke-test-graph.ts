#!/usr/bin/env bun
/**
 * Smoke Test: Graph Exploration
 *
 * Exercises the /api/graph/connections endpoint against the production FAISS API.
 * Builds a simple graph structure by exploring Radiohead's band members and their
 * other projects.
 *
 * Usage:
 *   FAISS_API_URL=https://cratemusic.duckdns.org bun src/scripts/smoke-test-graph.ts
 *
 * Or via npm script:
 *   pnpm smoke:graph  (uses .env for FAISS_API_URL)
 */

import { Effect, Console, Layer, Data, Config, Duration } from "effect"
import { BunRuntime } from "@effect/platform-bun"
import {
  FetchHttpClient,
  HttpClientRequest,
  HttpClient
} from "@effect/platform"

// =============================================================================
// Inline Types (self-contained, no domain package dependency)
// =============================================================================

type GraphQueryType =
  | "band_members"
  | "member_of"
  | "labelmates"
  | "label_hierarchy"
  | "covers"
  | "artist_origin"
  | "artists_from_area"
  | "recorded_at"
  | "collaborators"

interface ConnectionNode {
  mbid: string
  name: string
  node_type: string
  relationship_type: string
  attributes?: string[]
  begin_date?: string
  end_date?: string
  via_mbid?: string
  via_name?: string
}

interface GraphConnectionsRequest {
  query_type: GraphQueryType
  mbids: string[]
  limit?: number
  include_attributes?: boolean
}

interface GraphConnectionsResponse {
  query_type: GraphQueryType
  source_mbids: string[]
  connections: ConnectionNode[]
  total: number
  query_time_ms: number
}

class GraphApiError extends Data.TaggedError("GraphApiError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// =============================================================================
// Configuration
// =============================================================================

interface FaissConfigShape {
  readonly baseUrl: string
  readonly timeout: Duration.Duration
}

class FaissConfig extends Effect.Service<FaissConfig>()("FaissConfig", {
  effect: Effect.gen(function* () {
    const { baseUrl, timeoutMs } = yield* Config.all({
      baseUrl: Config.string("FAISS_API_URL").pipe(
        Config.withDefault("http://localhost:8000")
      ),
      timeoutMs: Config.number("FAISS_TIMEOUT_MS").pipe(Config.withDefault(30000))
    })
    return { baseUrl, timeout: Duration.millis(timeoutMs) } satisfies FaissConfigShape
  })
}) {}

// =============================================================================
// HTTP Client
// =============================================================================

const queryConnections = (
  request: GraphConnectionsRequest
): Effect.Effect<GraphConnectionsResponse, GraphApiError, FaissConfig | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const config = yield* FaissConfig
    const client = yield* HttpClient.HttpClient

    const httpRequest = HttpClientRequest.post(
      `${config.baseUrl}/api/graph/connections`
    ).pipe(
      HttpClientRequest.bodyJson(request)
    )

    const response = yield* Effect.flatMap(httpRequest, client.execute).pipe(
      Effect.flatMap((res) => res.json),
      Effect.mapError(
        (error) =>
          new GraphApiError({
            message: `Graph API request failed: ${String(error)}`,
            cause: error
          })
      )
    )

    return response as GraphConnectionsResponse
  })

// =============================================================================
// Constants
// =============================================================================

/** Radiohead MBID - our seed artist */
const RADIOHEAD_MBID = "a74b1b7f-71a5-4011-9441-d0b5e4122711"

// =============================================================================
// Graph Data Structures
// =============================================================================

interface GraphNode {
  readonly mbid: string
  readonly name: string
  readonly nodeType: string
}

interface GraphEdge {
  readonly source: string
  readonly target: string
  readonly relationshipType: string
  readonly queryType: GraphQueryType
}

interface GraphStats {
  readonly totalNodes: number
  readonly totalEdges: number
  readonly nodesByType: Record<string, number>
  readonly edgesByType: Record<string, number>
}

// Mutable state for graph building (inside Effect.gen)
interface GraphState {
  nodes: Map<string, GraphNode>
  edges: Array<GraphEdge>
  visited: Set<string>
}

// =============================================================================
// Graph Operations
// =============================================================================

const createGraphState = (): GraphState => ({
  nodes: new Map(),
  edges: [],
  visited: new Set()
})

const addNode = (state: GraphState, node: GraphNode): void => {
  if (!state.nodes.has(node.mbid)) {
    state.nodes.set(node.mbid, node)
  }
}

const addEdge = (
  state: GraphState,
  source: string,
  target: string,
  relationshipType: string,
  queryType: GraphQueryType
): void => {
  state.edges.push({ source, target, relationshipType, queryType })
}

const computeStats = (state: GraphState): GraphStats => {
  const nodesByType: Record<string, number> = {}
  const edgesByType: Record<string, number> = {}

  for (const node of state.nodes.values()) {
    nodesByType[node.nodeType] = (nodesByType[node.nodeType] || 0) + 1
  }

  for (const edge of state.edges) {
    edgesByType[edge.relationshipType] = (edgesByType[edge.relationshipType] || 0) + 1
  }

  return {
    totalNodes: state.nodes.size,
    totalEdges: state.edges.length,
    nodesByType,
    edgesByType
  }
}

// =============================================================================
// Main Program
// =============================================================================

const program = Effect.gen(function* () {
  yield* Console.log("=".repeat(60))
  yield* Console.log("Graph Exploration Smoke Test")
  yield* Console.log("=".repeat(60))
  yield* Console.log("")

  const graph = createGraphState()

  // Step 1: Add Radiohead as seed node
  yield* Console.log("Step 1: Starting with Radiohead")
  yield* Console.log(`  Seed MBID: ${RADIOHEAD_MBID}`)
  addNode(graph, {
    mbid: RADIOHEAD_MBID,
    name: "Radiohead",
    nodeType: "band"
  })
  graph.visited.add(RADIOHEAD_MBID)
  yield* Console.log("")

  // Step 2: Query band_members for Radiohead
  yield* Console.log("Step 2: Querying band_members for Radiohead...")
  const membersResponse = yield* queryConnections({
    query_type: "band_members",
    mbids: [RADIOHEAD_MBID],
    limit: 20
  })

  yield* Console.log(`  Found ${membersResponse.total} band members`)
  yield* Console.log(`  Query time: ${membersResponse.query_time_ms.toFixed(1)}ms`)

  const memberMbids: string[] = []
  for (const member of membersResponse.connections) {
    addNode(graph, {
      mbid: member.mbid,
      name: member.name,
      nodeType: member.node_type
    })
    addEdge(graph, RADIOHEAD_MBID, member.mbid, member.relationship_type, "band_members")
    memberMbids.push(member.mbid)

    const attrs = member.attributes?.join(", ") || "unknown role"
    yield* Console.log(`    - ${member.name} (${attrs})`)
  }
  yield* Console.log("")

  // Step 3: For each member, query member_of to find their other projects
  yield* Console.log("Step 3: Querying member_of for each band member...")
  yield* Console.log("")

  for (const memberMbid of memberMbids) {
    const memberNode = graph.nodes.get(memberMbid)
    if (!memberNode) continue

    if (graph.visited.has(memberMbid)) {
      // Already queried, skip
      continue
    }
    graph.visited.add(memberMbid)

    yield* Console.log(`  Querying other projects for: ${memberNode.name}`)

    const projectsResponse = yield* queryConnections({
      query_type: "member_of",
      mbids: [memberMbid],
      limit: 10
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Console.log(`    [Error] ${error._tag}: ${error.message}`)
          return {
            query_type: "member_of" as const,
            source_mbids: [memberMbid],
            connections: [] as ConnectionNode[],
            total: 0,
            query_time_ms: 0
          }
        })
      )
    )

    if (projectsResponse.total > 0) {
      yield* Console.log(`    Found ${projectsResponse.total} other projects (${projectsResponse.query_time_ms.toFixed(1)}ms)`)

      for (const project of projectsResponse.connections) {
        // Skip Radiohead (we already have it)
        if (project.mbid === RADIOHEAD_MBID) continue

        addNode(graph, {
          mbid: project.mbid,
          name: project.name,
          nodeType: project.node_type
        })
        addEdge(graph, memberMbid, project.mbid, project.relationship_type, "member_of")

        yield* Console.log(`      - ${project.name} (${project.node_type})`)
      }
    } else {
      yield* Console.log(`    No other projects found`)
    }

    // Add a small delay between queries to be nice to the API
    yield* Effect.sleep("100 millis")
  }

  yield* Console.log("")

  // Step 4: Try collaborators query for one member
  yield* Console.log("Step 4: Testing collaborators query...")
  if (memberMbids.length > 0) {
    const testMbid = memberMbids[0]
    const testNode = graph.nodes.get(testMbid)

    yield* Console.log(`  Querying collaborators for: ${testNode?.name || testMbid}`)

    const collabResponse = yield* queryConnections({
      query_type: "collaborators",
      mbids: [testMbid],
      limit: 10
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Console.log(`    [Error] ${error._tag}: ${error.message}`)
          return {
            query_type: "collaborators" as const,
            source_mbids: [testMbid],
            connections: [] as ConnectionNode[],
            total: 0,
            query_time_ms: 0
          }
        })
      )
    )

    if (collabResponse.total > 0) {
      yield* Console.log(`    Found ${collabResponse.total} collaborators (${collabResponse.query_time_ms.toFixed(1)}ms)`)
      for (const collab of collabResponse.connections.slice(0, 5)) {
        const via = collab.via_name ? ` via ${collab.via_name}` : ""
        yield* Console.log(`      - ${collab.name}${via}`)

        addNode(graph, {
          mbid: collab.mbid,
          name: collab.name,
          nodeType: collab.node_type
        })
        addEdge(graph, testMbid, collab.mbid, collab.relationship_type, "collaborators")
      }
    } else {
      yield* Console.log(`    No collaborators found`)
    }
  }

  yield* Console.log("")

  // Step 5: Test artist_origin query
  yield* Console.log("Step 5: Testing artist_origin query...")
  const originResponse = yield* queryConnections({
    query_type: "artist_origin",
    mbids: [RADIOHEAD_MBID],
    limit: 5
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Console.log(`  [Error] ${error._tag}: ${error.message}`)
        return {
          query_type: "artist_origin" as const,
          source_mbids: [RADIOHEAD_MBID],
          connections: [] as ConnectionNode[],
          total: 0,
          query_time_ms: 0
        }
      })
    )
  )

  if (originResponse.total > 0) {
    yield* Console.log(`  Found origin info (${originResponse.query_time_ms.toFixed(1)}ms):`)
    for (const origin of originResponse.connections) {
      yield* Console.log(`    - ${origin.name} (${origin.node_type})`)
      addNode(graph, {
        mbid: origin.mbid,
        name: origin.name,
        nodeType: origin.node_type
      })
      addEdge(graph, RADIOHEAD_MBID, origin.mbid, origin.relationship_type, "artist_origin")
    }
  } else {
    yield* Console.log(`  No origin info found`)
  }

  yield* Console.log("")

  // Final Summary
  yield* Console.log("=".repeat(60))
  yield* Console.log("GRAPH SUMMARY")
  yield* Console.log("=".repeat(60))

  const stats = computeStats(graph)

  yield* Console.log(`Total Nodes: ${stats.totalNodes}`)
  yield* Console.log(`Total Edges: ${stats.totalEdges}`)
  yield* Console.log("")

  yield* Console.log("Nodes by Type:")
  for (const [type, count] of Object.entries(stats.nodesByType).sort((a, b) => b[1] - a[1])) {
    yield* Console.log(`  ${type}: ${count}`)
  }
  yield* Console.log("")

  yield* Console.log("Edges by Relationship Type:")
  for (const [type, count] of Object.entries(stats.edgesByType).sort((a, b) => b[1] - a[1])) {
    yield* Console.log(`  ${type}: ${count}`)
  }
  yield* Console.log("")

  yield* Console.log("Sample Discovered Artists/Bands:")
  const sampleNodes = Array.from(graph.nodes.values())
    .filter(n => n.nodeType === "artist" || n.nodeType === "band")
    .slice(0, 10)
  for (const node of sampleNodes) {
    yield* Console.log(`  - ${node.name} (${node.nodeType})`)
  }

  yield* Console.log("")
  yield* Console.log("=".repeat(60))
  yield* Console.log("Smoke test completed successfully!")
  yield* Console.log("=".repeat(60))

  return stats
})

// =============================================================================
// Layer Composition
// =============================================================================

/**
 * Full application layer:
 * - FetchHttpClient for HTTP requests
 * - FaissConfig for base URL configuration
 */
const AppLive = Layer.mergeAll(
  FetchHttpClient.layer,
  FaissConfig.Default
)

// =============================================================================
// Run
// =============================================================================

const runnable = program.pipe(
  Effect.provide(AppLive),
  Effect.catchAll((error) =>
    Console.error(`Fatal error: ${String(error)}`).pipe(
      Effect.flatMap(() => Effect.fail(error))
    )
  )
)

BunRuntime.runMain(runnable)
