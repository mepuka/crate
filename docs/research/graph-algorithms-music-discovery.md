# Graph Algorithms for Music Discovery: Research & Implementation Guide

> **Status**: Research Document
> **Date**: 2025-12-17
> **Purpose**: Survey graph algorithms applicable to music discovery using Effect's Graph module

## Executive Summary

This document surveys graph algorithms that can enhance music discovery in the Crate agent, focusing on practical implementations using Effect's Graph module. The codebase already uses `Graph.DirectedGraph<GraphNode, GraphEdgeData>` with Dijkstra's algorithm for path finding. This research explores additional algorithms for centrality analysis, community detection, similarity metrics, and temporal analysis.

**Key Finding**: Effect's Graph module (v3.18+) provides a rich set of algorithms including DFS/BFS traversal, strongly connected components, topological sorting, multiple pathfinding algorithms (Dijkstra, A*, Bellman-Ford, Floyd-Warshall), and graph analysis primitives that can support music discovery use cases.

## 1. Current Implementation Context

### 1.1 Graph Structure

**Location**: `/Users/pooks/Dev/crate/packages/agent/src/services/MusicGraphService.ts`

```typescript
interface GraphNode {
  readonly mbid: string;
  readonly name: string;
  readonly nodeType: "artist" | "label" | "recording" | "work" | "area" | "place";
}

interface GraphEdgeData {
  readonly relationshipType: string;
  readonly attributes?: readonly string[];
  readonly viaMbid?: string;
  readonly viaName?: string;
  readonly beginDate?: string;
  readonly endDate?: string;
}
```

**Graph Model**: `Graph.DirectedGraph<GraphNode, GraphEdgeData>`

**Scale**: Designed for in-memory graphs of 10K-100K nodes (session-scoped)

**Current Operations**:
- `expand()`: Batch fetch and merge from Graph API
- `neighbors()`: Get adjacent nodes (O(1) lookup via HashMap index)
- `outgoingEdges()`: Get edges with full relationship metadata
- `path()`: Shortest path using `Graph.dijkstra()` with uniform cost=1
- `snapshot()`: Export full graph state

### 1.2 Effect Graph Module Capabilities

**Source**: `/Users/pooks/Dev/crate/docs/effect-source/effect/src/Graph.ts`

Effect's Graph module (3732 lines) provides:

**Core Operations**:
- `Graph.directed()`, `Graph.undirected()` - constructors
- `Graph.mutate()` - scoped mutations for safe graph updates
- `Graph.addNode()`, `Graph.addEdge()`, `Graph.removeNode()`, `Graph.removeEdge()`
- `Graph.getNode()`, `Graph.getEdge()`, `Graph.hasNode()`, `Graph.hasEdge()`
- `Graph.nodeCount()`, `Graph.edgeCount()`
- `Graph.neighbors()`, `Graph.neighborsDirected()` - outgoing/incoming neighbors
- `Graph.findNode()`, `Graph.findNodes()`, `Graph.findEdge()`, `Graph.findEdges()`

**Traversal Algorithms**:
- `Graph.dfs()` - depth-first search with lazy evaluation
- `Graph.bfs()` - breadth-first search with lazy evaluation
- `Graph.dfsPostOrder()` - postorder traversal
- `Graph.topo()` - topological sort (Kahn's algorithm)

**Pathfinding Algorithms**:
- `Graph.dijkstra()` - shortest path, O((V+E) log V), non-negative weights
- `Graph.astar()` - heuristic-guided shortest path
- `Graph.bellmanFord()` - shortest path with negative weights
- `Graph.floydWarshall()` - all-pairs shortest paths, O(V³)

**Structure Analysis**:
- `Graph.isAcyclic()` - cycle detection via DFS
- `Graph.isBipartite()` - bipartite checking via BFS coloring
- `Graph.connectedComponents()` - undirected graph components
- `Graph.stronglyConnectedComponents()` - Kosaraju's algorithm for directed graphs

**Transformations**:
- `Graph.mapNodes()`, `Graph.mapEdges()` - transform node/edge data
- `Graph.filterNodes()`, `Graph.filterEdges()` - filter with removal
- `Graph.filterMapNodes()`, `Graph.filterMapEdges()` - filter and transform
- `Graph.reverse()` - reverse all edge directions
- `Graph.updateNode()`, `Graph.updateEdge()` - in-place updates

**Iterators (Walker API)**:
- `Graph.indices()` - iterate node/edge indices
- `Graph.values()` - iterate node/edge data
- `Graph.entries()` - iterate [index, data] pairs
- `Graph.nodes()`, `Graph.edges()` - full node/edge walkers
- `Graph.externals()` - nodes with no incoming/outgoing edges

**Export/Debug**:
- `Graph.toGraphViz()` - DOT format export
- `Graph.toMermaid()` - Mermaid diagram export

## 2. Centrality Algorithms

Centrality measures identify "important" nodes in a network. In music discovery, these reveal influential artists, genre-bridging figures, and community hubs.

### 2.1 Degree Centrality

**Definition**: Count of incoming/outgoing edges per node.

**Music Use Case**: Find highly collaborative artists (high out-degree) or artists frequently covered/sampled (high in-degree).

**Implementation** (directly supported by Effect Graph):

```typescript
// Pseudocode using Effect Graph primitives
const degreeCentrality = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  mbid: string
): Effect.Effect<{ inDegree: number; outDegree: number }> =>
  Effect.gen(function* () {
    const idx = yield* lookupNodeIndex(mbid);

    // Out-degree: count outgoing edges
    const outgoing = Graph.neighborsDirected(graph, idx, "outgoing");
    const outDegree = outgoing.length;

    // In-degree: count incoming edges
    const incoming = Graph.neighborsDirected(graph, idx, "incoming");
    const inDegree = incoming.length;

    return { inDegree, outDegree };
  });
```

**Complexity**: O(1) for single node (adjacency lists are pre-computed)

**Agent Integration**:
- Tool: `analyze_artist_influence` returns centrality metrics
- Insight: "Artist X has collaborated with 47 artists (top 5% in graph)"
- Prompt: Use high out-degree artists for "who should I explore next?"

### 2.2 Betweenness Centrality

**Definition**: Fraction of shortest paths passing through a node. Identifies "bridge" artists connecting different musical communities.

**Music Use Case**: David Bowie as bridge between glam rock, soul, electronic, industrial (per research findings).

**Implementation** (requires custom algorithm on Effect Graph):

```typescript
// Pseudocode: Brandes' algorithm adaptation
const betweennessCentrality = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>
): Effect.Effect<HashMap.HashMap<string, number>> =>
  Effect.gen(function* () {
    const centrality = HashMap.empty<string, number>();
    const nodes = Array.from(Graph.indices(Graph.nodes(graph)));

    // For each node as source
    for (const source of nodes) {
      // BFS to build shortest path DAG
      const queue = [source];
      const distances = new Map([[source, 0]]);
      const paths = new Map([[source, 1]]);
      const predecessors = new Map<NodeIndex, NodeIndex[]>();
      const stack: NodeIndex[] = [];

      while (queue.length > 0) {
        const current = queue.shift()!;
        stack.push(current);

        const neighbors = Graph.neighborsDirected(graph, current, "outgoing");
        for (const neighbor of neighbors) {
          // First visit to neighbor
          if (!distances.has(neighbor)) {
            distances.set(neighbor, distances.get(current)! + 1);
            queue.push(neighbor);
          }

          // Shortest path to neighbor via current
          if (distances.get(neighbor) === distances.get(current)! + 1) {
            paths.set(neighbor, paths.get(neighbor)! + paths.get(current)!);
            if (!predecessors.has(neighbor)) predecessors.set(neighbor, []);
            predecessors.get(neighbor)!.push(current);
          }
        }
      }

      // Back-propagation phase
      const delta = new Map<NodeIndex, number>();
      while (stack.length > 0) {
        const w = stack.pop()!;
        const preds = predecessors.get(w) || [];
        for (const v of preds) {
          const c = (paths.get(v)! / paths.get(w)!) * (1 + (delta.get(w) || 0));
          delta.set(v, (delta.get(v) || 0) + c);
        }
        if (w !== source) {
          const node = Graph.getNode(graph, w);
          if (Option.isSome(node)) {
            const current = HashMap.get(centrality, node.value.mbid);
            const updated = Option.getOrElse(current, () => 0) + delta.get(w)!;
            centrality = HashMap.set(centrality, node.value.mbid, updated);
          }
        }
      }
    }

    return centrality;
  });
```

**Complexity**: O(VE) for unweighted graphs, O(VE + V² log V) for weighted

**Feasibility**: For 10K nodes, ~100M operations. Feasible but should be cached/precomputed.

**Agent Integration**:
- Run on graph snapshot periodically
- Tool: `find_bridge_artists` returns top-K by betweenness
- Insight: "Artist X connects the Seattle grunge scene to UK electronic music (bridging score: 0.82)"

### 2.3 PageRank

**Definition**: Iterative importance measure considering neighbor importance (used by Google, Neo4j music recommendations).

**Music Use Case**: Discover influential artists whose collaborators are also influential.

**Research Context**:
- [Neo4j PageRank documentation](https://neo4j.com/docs/graph-data-science/current/algorithms/page-rank/) describes music recommendation applications
- [Hybrid music recommendation with GNNs](https://link.springer.com/article/10.1007/s11257-024-09410-4) uses Personalized PageRank for playlist continuation

**Implementation** (custom on Effect Graph):

```typescript
// Pseudocode: Power iteration method
const pageRank = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  options?: { dampingFactor?: number; maxIterations?: number; tolerance?: number }
): Effect.Effect<HashMap.HashMap<string, number>> =>
  Effect.gen(function* () {
    const { dampingFactor = 0.85, maxIterations = 100, tolerance = 1e-6 } = options || {};

    const nodes = Array.from(Graph.indices(Graph.nodes(graph)));
    const N = nodes.length;
    const initialRank = 1 / N;

    let ranks = HashMap.empty<NodeIndex, number>();
    for (const node of nodes) {
      ranks = HashMap.set(ranks, node, initialRank);
    }

    for (let iter = 0; iter < maxIterations; iter++) {
      let newRanks = HashMap.empty<NodeIndex, number>();
      let diff = 0;

      for (const node of nodes) {
        const incoming = Graph.neighborsDirected(graph, node, "incoming");
        let rank = (1 - dampingFactor) / N;

        for (const inNode of incoming) {
          const inRank = HashMap.get(ranks, inNode);
          const outDegree = Graph.neighborsDirected(graph, inNode, "outgoing").length;
          if (Option.isSome(inRank) && outDegree > 0) {
            rank += dampingFactor * (inRank.value / outDegree);
          }
        }

        newRanks = HashMap.set(newRanks, node, rank);
        const oldRank = HashMap.get(ranks, node);
        if (Option.isSome(oldRank)) {
          diff += Math.abs(rank - oldRank.value);
        }
      }

      ranks = newRanks;
      if (diff < tolerance) break; // Converged
    }

    // Convert to MBID-keyed map
    let result = HashMap.empty<string, number>();
    for (const [idx, rank] of HashMap.entries(ranks)) {
      const node = Graph.getNode(graph, idx);
      if (Option.isSome(node)) {
        result = HashMap.set(result, node.value.mbid, rank);
      }
    }

    return result;
  });
```

**Complexity**: O(k × E) where k = iteration count (typically 20-50)

**Feasibility**: For 100K edges, ~5M operations. Very feasible.

**Agent Integration**:
- Precompute on graph snapshots
- Tool: `rank_artists_by_influence` returns top-K by PageRank
- Insight: "Based on their collaboration network, Artist X ranks in the top 1% of influential artists"

**Personalized PageRank Variant**: Start with non-uniform initialization (e.g., bias toward user's listening history) for personalized recommendations.

## 3. Community Detection

Identify clusters of densely connected artists (genres, scenes, eras).

### 3.1 Connected Components (Undirected)

**Definition**: Maximal sets of mutually reachable nodes.

**Music Use Case**: Find isolated musical subgraphs (e.g., regional scenes with no mainstream crossover).

**Implementation** (directly supported by Effect Graph):

```typescript
// Effect Graph provides this out-of-the-box for undirected graphs
const components = Graph.connectedComponents(undirectedGraph);
// Returns Array<Array<NodeIndex>>

// For directed graphs, use strongly connected components
const sccComponents = Graph.stronglyConnectedComponents(directedGraph);
```

**Complexity**: O(V + E) via DFS

**Agent Integration**:
- Tool: `find_isolated_scenes` identifies disconnected subgraphs
- Insight: "This 1970s krautrock scene has 12 artists with no direct connections to mainstream US/UK artists"

### 3.2 Strongly Connected Components (Directed)

**Definition**: Maximal sets where every node can reach every other node.

**Music Use Case**: Identify tightly-knit collaboration circles (e.g., Radiohead + side projects form an SCC).

**Implementation** (directly supported by Effect Graph):

```typescript
const findCollaborationCircles = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>
): Effect.Effect<Array<{ artists: string[]; size: number }>> =>
  Effect.gen(function* () {
    const sccs = Graph.stronglyConnectedComponents(graph);

    return sccs
      .filter(scc => scc.length > 1) // Ignore singleton components
      .map(scc => ({
        artists: scc.map(idx => {
          const node = Graph.getNode(graph, idx);
          return Option.isSome(node) ? node.value.name : "Unknown";
        }),
        size: scc.length
      }))
      .sort((a, b) => b.size - a.size); // Largest first
  });
```

**Complexity**: O(V + E) via Kosaraju's algorithm (already implemented in Effect Graph)

**Agent Integration**:
- Tool: `find_collaboration_circles`
- Insight: "Radiohead, Thom Yorke solo, Atoms for Peace, and The Smile form a tight collaboration circle"

### 3.3 Label Propagation

**Definition**: Nodes adopt the most common label among their neighbors (simple, fast community detection).

**Music Use Case**: Discover emergent genre clusters without predefined categories.

**Implementation** (custom on Effect Graph):

```typescript
const labelPropagation = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  maxIterations = 10
): Effect.Effect<HashMap.HashMap<string, string>> =>
  Effect.gen(function* () {
    const nodes = Array.from(Graph.indices(Graph.nodes(graph)));

    // Initialize: each node gets its own label (MBID)
    let labels = HashMap.empty<NodeIndex, string>();
    for (const idx of nodes) {
      const node = Graph.getNode(graph, idx);
      if (Option.isSome(node)) {
        labels = HashMap.set(labels, idx, node.value.mbid);
      }
    }

    // Iterate: adopt most frequent neighbor label
    for (let iter = 0; iter < maxIterations; iter++) {
      let changed = false;

      // Randomize order to avoid bias
      const shuffled = [...nodes].sort(() => Math.random() - 0.5);

      for (const idx of shuffled) {
        const neighbors = Graph.neighbors(graph, idx);
        if (neighbors.length === 0) continue;

        // Count neighbor labels
        const counts = new Map<string, number>();
        for (const nIdx of neighbors) {
          const label = HashMap.get(labels, nIdx);
          if (Option.isSome(label)) {
            counts.set(label.value, (counts.get(label.value) || 0) + 1);
          }
        }

        // Find most frequent
        let maxLabel = "";
        let maxCount = 0;
        for (const [label, count] of counts) {
          if (count > maxCount) {
            maxLabel = label;
            maxCount = count;
          }
        }

        const currentLabel = HashMap.get(labels, idx);
        if (Option.isSome(currentLabel) && currentLabel.value !== maxLabel) {
          labels = HashMap.set(labels, idx, maxLabel);
          changed = true;
        }
      }

      if (!changed) break; // Converged
    }

    // Convert to MBID -> community leader map
    let communities = HashMap.empty<string, string>();
    for (const [idx, leader] of HashMap.entries(labels)) {
      const node = Graph.getNode(graph, idx);
      if (Option.isSome(node)) {
        communities = HashMap.set(communities, node.value.mbid, leader);
      }
    }

    return communities;
  });
```

**Complexity**: O(k × E) where k = iterations (typically < 10)

**Feasibility**: Very fast, works well even for 100K+ edges.

**Agent Integration**:
- Tool: `detect_musical_communities`
- Insight: "27 artists cluster around Radiohead as a community leader, including Portishead, Massive Attack, and Björk"

### 3.4 Modularity-Based Clustering (Future)

**Definition**: Optimize graph partitioning to maximize intra-community edges vs inter-community edges.

**Limitation**: Requires more complex algorithms (Louvain, Leiden). Not directly supported by Effect Graph.

**Feasibility**: Medium complexity. Consider external library or Python microservice if needed.

## 4. Path & Traversal Enhancements

### 4.1 Weighted Shortest Path

**Current State**: `Graph.dijkstra()` already supports custom cost functions.

**Enhancement**: Use edge metadata for meaningful weights.

**Implementation**:

```typescript
// Weight by temporal recency: prefer recent collaborations
const recentCollaborationPath = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  from: string,
  to: string
): Effect.Effect<Option.Option<PathResult<GraphEdgeData>>> =>
  Effect.gen(function* () {
    const fromIdx = yield* lookupNodeIndex(from);
    const toIdx = yield* lookupNodeIndex(to);

    const result = Graph.dijkstra(graph, {
      source: fromIdx,
      target: toIdx,
      cost: (edge) => {
        // Prefer edges with end_date in last 5 years
        if (!edge.endDate) return 1; // Ongoing relationship
        const year = parseInt(edge.endDate.split("-")[0]);
        const age = 2025 - year;
        return Math.max(1, age / 5); // Older = higher cost
      }
    });

    return result;
  });

// Weight by relationship strength: prefer certain types
const strongRelationshipPath = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  from: string,
  to: string,
  preferredTypes: string[] // e.g., ["member of band", "collaboration"]
): Effect.Effect<Option.Option<PathResult<GraphEdgeData>>> =>
  Effect.gen(function* () {
    const fromIdx = yield* lookupNodeIndex(from);
    const toIdx = yield* lookupNodeIndex(to);

    const result = Graph.dijkstra(graph, {
      source: fromIdx,
      target: toIdx,
      cost: (edge) => {
        return preferredTypes.includes(edge.relationshipType) ? 0.5 : 1.5;
      }
    });

    return result;
  });
```

**Agent Integration**:
- Extend `path` method with optional weight function
- Tool parameter: `path_preference: "recent" | "strong" | "shortest"`

### 4.2 All Paths (K-Shortest Paths)

**Definition**: Find multiple paths, not just the shortest.

**Music Use Case**: "Show me 3 different ways Artist A connects to Artist B"

**Implementation** (Yen's algorithm adaptation):

```typescript
// Pseudocode: simplified Yen's K-shortest paths
const kShortestPaths = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  from: string,
  to: string,
  k: number
): Effect.Effect<Array<PathResult<GraphEdgeData>>> =>
  Effect.gen(function* () {
    const fromIdx = yield* lookupNodeIndex(from);
    const toIdx = yield* lookupNodeIndex(to);

    const paths: Array<PathResult<GraphEdgeData>> = [];

    // Find first shortest path
    const firstPath = Graph.dijkstra(graph, {
      source: fromIdx,
      target: toIdx,
      cost: () => 1
    });

    if (Option.isNone(firstPath)) return [];
    paths.push(firstPath.value);

    // Find k-1 more paths by temporarily removing edges
    for (let i = 1; i < k; i++) {
      const candidates: PathResult<GraphEdgeData>[] = [];
      const prevPath = paths[i - 1];

      // For each edge in previous path
      for (let j = 0; j < prevPath.path.length - 1; j++) {
        const spurNode = prevPath.path[j];

        // Create modified graph with removed edges
        const modifiedGraph = Graph.mutate(graph, (mutable) => {
          // Remove edges from previous paths that start at spurNode
          for (const path of paths) {
            const idx = path.path.indexOf(spurNode);
            if (idx !== -1 && idx < path.path.length - 1) {
              const edgeIndices = Graph.findEdges(
                mutable,
                (_, source, target) => source === spurNode && target === path.path[idx + 1]
              );
              for (const edgeIdx of edgeIndices) {
                Graph.removeEdge(mutable, edgeIdx);
              }
            }
          }
        });

        // Find path in modified graph
        const spurPath = Graph.dijkstra(modifiedGraph, {
          source: spurNode,
          target: toIdx,
          cost: () => 1
        });

        if (Option.isSome(spurPath)) {
          // Combine root path + spur path
          const rootPath = prevPath.path.slice(0, j + 1);
          const combinedPath = {
            path: [...rootPath, ...spurPath.value.path.slice(1)],
            distance: j + spurPath.value.distance,
            costs: [...prevPath.costs.slice(0, j), ...spurPath.value.costs]
          };
          candidates.push(combinedPath);
        }
      }

      if (candidates.length === 0) break;

      // Select best candidate
      candidates.sort((a, b) => a.distance - b.distance);
      paths.push(candidates[0]);
    }

    return paths;
  });
```

**Complexity**: O(k × V × (E + V log V)) - expensive but feasible for small k (< 10)

**Agent Integration**:
- Tool: `find_connection_paths` with `max_paths: number` parameter
- Insight: "3 ways to connect Artist A to B: via collaboration (2 hops), via shared label (3 hops), via cover song (4 hops)"

### 4.3 Constrained Paths

**Definition**: Paths using only certain edge types or satisfying predicates.

**Music Use Case**: "Find path using only 'member of band' relationships" or "path through artists born in Seattle"

**Implementation**:

```typescript
const constrainedPath = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  from: string,
  to: string,
  edgeFilter: (edge: GraphEdgeData) => boolean,
  nodeFilter?: (node: GraphNode) => boolean
): Effect.Effect<Option.Option<PathResult<GraphEdgeData>>> =>
  Effect.gen(function* () {
    // Filter graph to only matching edges/nodes
    const filteredGraph = Graph.mutate(graph, (mutable) => {
      // Remove non-matching edges
      Graph.filterMapEdges(mutable, (edge) =>
        edgeFilter(edge) ? Option.some(edge) : Option.none()
      );

      // Remove non-matching nodes
      if (nodeFilter) {
        Graph.filterMapNodes(mutable, (node) =>
          nodeFilter(node) ? Option.some(node) : Option.none()
        );
      }
    });

    const fromIdx = yield* lookupNodeIndex(from, filteredGraph);
    const toIdx = yield* lookupNodeIndex(to, filteredGraph);

    return Graph.dijkstra(filteredGraph, {
      source: fromIdx,
      target: toIdx,
      cost: () => 1
    });
  });
```

**Agent Integration**:
- Tool parameter: `relationship_types: string[]` to filter edges
- Prompt guidance: "Use constrained paths when user asks 'how are they connected through bands?'"

### 4.4 K-Hop Neighborhoods

**Definition**: All nodes within K edges of a source node.

**Music Use Case**: "Show me all artists within 2 hops of Radiohead"

**Implementation** (using Effect Graph BFS):

```typescript
const kHopNeighborhood = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  mbid: string,
  k: number
): Effect.Effect<Array<{ node: GraphNode; distance: number }>> =>
  Effect.gen(function* () {
    const startIdx = yield* lookupNodeIndex(mbid);

    // BFS with distance tracking
    const queue: Array<{ idx: NodeIndex; dist: number }> = [{ idx: startIdx, dist: 0 }];
    const visited = new Set<NodeIndex>();
    const result: Array<{ node: GraphNode; distance: number }> = [];

    while (queue.length > 0) {
      const { idx, dist } = queue.shift()!;

      if (visited.has(idx)) continue;
      visited.add(idx);

      if (dist > 0) { // Don't include source node
        const node = Graph.getNode(graph, idx);
        if (Option.isSome(node)) {
          result.push({ node: node.value, distance: dist });
        }
      }

      if (dist < k) {
        const neighbors = Graph.neighbors(graph, idx);
        for (const nIdx of neighbors) {
          if (!visited.has(nIdx)) {
            queue.push({ idx: nIdx, dist: dist + 1 });
          }
        }
      }
    }

    return result;
  });
```

**Complexity**: O(V + E) but limited by k (typically small)

**Agent Integration**:
- Tool: `explore_neighborhood` with `max_hops: number`
- Insight: "Within 2 hops of Radiohead: 73 artists including Massive Attack, Portishead, Björk..."

## 5. Similarity & Recommendation Algorithms

### 5.1 Jaccard Similarity (Shared Neighbors)

**Definition**: `|neighbors(A) ∩ neighbors(B)| / |neighbors(A) ∪ neighbors(B)|`

**Music Use Case**: "Artists A and B are similar because they collaborate with many of the same people"

**Implementation**:

```typescript
const jaccardSimilarity = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  mbidA: string,
  mbidB: string
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const idxA = yield* lookupNodeIndex(mbidA);
    const idxB = yield* lookupNodeIndex(mbidB);

    const neighborsA = new Set(Graph.neighbors(graph, idxA));
    const neighborsB = new Set(Graph.neighbors(graph, idxB));

    const intersection = [...neighborsA].filter(n => neighborsB.has(n)).length;
    const union = new Set([...neighborsA, ...neighborsB]).size;

    return union === 0 ? 0 : intersection / union;
  });

// Find most similar artists to a given artist
const findSimilarArtists = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  mbid: string,
  topK = 10
): Effect.Effect<Array<{ artist: GraphNode; similarity: number }>> =>
  Effect.gen(function* () {
    const idx = yield* lookupNodeIndex(mbid);
    const allNodes = Array.from(Graph.indices(Graph.nodes(graph)));

    const similarities = yield* Effect.all(
      allNodes
        .filter(i => i !== idx)
        .map(i =>
          Effect.gen(function* () {
            const node = Graph.getNode(graph, i);
            if (Option.isNone(node)) return null;

            const sim = yield* jaccardSimilarity(graph, mbid, node.value.mbid);
            return { artist: node.value, similarity: sim };
          })
        ),
      { concurrency: 10 }
    );

    return similarities
      .filter((s): s is { artist: GraphNode; similarity: number } => s !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  });
```

**Complexity**: O(V × avg_degree) for all-pairs, O(avg_degree) for single pair

**Agent Integration**:
- Tool: `find_similar_artists` with `similarity_metric: "jaccard"`
- Insight: "Based on shared collaborators, Artist X is 78% similar to Artist Y"

### 5.2 Adamic-Adar Index

**Definition**: Weighted common neighbors, giving more weight to uncommon shared neighbors.

**Formula**: `Σ(1 / log(degree(z)))` for each common neighbor z

**Music Use Case**: Sharing a niche collaborator is more meaningful than sharing a prolific one.

**Implementation**:

```typescript
const adamicAdarIndex = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  mbidA: string,
  mbidB: string
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const idxA = yield* lookupNodeIndex(mbidA);
    const idxB = yield* lookupNodeIndex(mbidB);

    const neighborsA = new Set(Graph.neighbors(graph, idxA));
    const neighborsB = new Set(Graph.neighbors(graph, idxB));

    const commonNeighbors = [...neighborsA].filter(n => neighborsB.has(n));

    let score = 0;
    for (const commonIdx of commonNeighbors) {
      const degree = Graph.neighbors(graph, commonIdx).length;
      if (degree > 1) { // Avoid log(1) = 0
        score += 1 / Math.log(degree);
      }
    }

    return score;
  });
```

**Complexity**: O(avg_degree) per pair

**Agent Integration**:
- Use as alternative to Jaccard for niche artist discovery
- Higher scores indicate rare/meaningful connections

### 5.3 Common Neighbors Count

**Definition**: Simple count of shared neighbors.

**Music Use Case**: Fast approximation of similarity.

**Implementation**:

```typescript
const commonNeighborsCount = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  mbidA: string,
  mbidB: string
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const idxA = yield* lookupNodeIndex(mbidA);
    const idxB = yield* lookupNodeIndex(mbidB);

    const neighborsA = new Set(Graph.neighbors(graph, idxA));
    const neighborsB = new Set(Graph.neighbors(graph, idxB));

    return [...neighborsA].filter(n => neighborsB.has(n)).length;
  });
```

**Complexity**: O(avg_degree)

**Agent Integration**:
- Quick metric for "how connected are these artists?"

### 5.4 SimRank (Future)

**Definition**: Iterative structural similarity (nodes are similar if their neighbors are similar).

**Limitation**: Computationally expensive (O(V² × iterations)), requires matrix operations.

**Feasibility**: Low for in-memory graphs > 10K nodes. Consider precomputation or approximation.

## 6. Temporal Analysis

Edge data includes `beginDate` and `endDate`, enabling time-windowed queries.

### 6.1 Time-Windowed Graph Extraction

**Use Case**: "Seattle grunge scene in 1991-1994"

**Implementation**:

```typescript
const extractTimeWindow = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  startYear: number,
  endYear: number
): Effect.Effect<Graph.DirectedGraph<GraphNode, GraphEdgeData>> =>
  Effect.gen(function* () {
    return Graph.mutate(graph, (mutable) => {
      Graph.filterMapEdges(mutable, (edge) => {
        // Keep edge if it overlaps with time window
        const begin = edge.beginDate ? parseInt(edge.beginDate.split("-")[0]) : -Infinity;
        const end = edge.endDate ? parseInt(edge.endDate.split("-")[0]) : Infinity;

        const overlaps = (begin <= endYear) && (end >= startYear);
        return overlaps ? Option.some(edge) : Option.none();
      });

      // Remove nodes with no remaining edges
      const nodesToRemove: NodeIndex[] = [];
      for (const [idx] of Graph.entries(Graph.nodes(mutable))) {
        const hasEdges =
          Graph.neighborsDirected(mutable, idx, "outgoing").length > 0 ||
          Graph.neighborsDirected(mutable, idx, "incoming").length > 0;
        if (!hasEdges) nodesToRemove.push(idx);
      }
      for (const idx of nodesToRemove) {
        Graph.removeNode(mutable, idx);
      }
    });
  });
```

**Agent Integration**:
- Tool: `analyze_time_period` with `start_year`, `end_year`
- Insight: "In 1991-1994, the Seattle scene had 23 active bands with 47 collaboration edges"

### 6.2 Temporal Paths

**Use Case**: "Find path where all relationships existed simultaneously"

**Implementation**:

```typescript
const temporalPath = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  from: string,
  to: string,
  atYear: number
): Effect.Effect<Option.Option<PathResult<GraphEdgeData>>> =>
  Effect.gen(function* () {
    // Filter to edges active at given year
    const filteredGraph = yield* extractTimeWindow(graph, atYear, atYear);

    const fromIdx = yield* lookupNodeIndex(from, filteredGraph);
    const toIdx = yield* lookupNodeIndex(to, filteredGraph);

    return Graph.dijkstra(filteredGraph, {
      source: fromIdx,
      target: toIdx,
      cost: () => 1
    });
  });
```

**Agent Integration**:
- Parameter: `at_year: number` for temporal queries
- Insight: "In 1995, Artist A and B were connected via C, but that path broke when C left the band in 1996"

### 6.3 Evolution Tracking

**Use Case**: "How did this collaboration network change over time?"

**Implementation**:

```typescript
const trackNetworkEvolution = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  mbid: string,
  years: number[]
): Effect.Effect<Array<{ year: number; neighbors: number; avgDegree: number }>> =>
  Effect.gen(function* () {
    const snapshots = yield* Effect.all(
      years.map(year =>
        Effect.gen(function* () {
          const snapshot = yield* extractTimeWindow(graph, year, year);
          const idx = HashMap.get(
            yield* buildMbidIndex(snapshot),
            mbid
          );

          if (Option.isNone(idx)) {
            return { year, neighbors: 0, avgDegree: 0 };
          }

          const neighbors = Graph.neighbors(snapshot, idx.value).length;
          const allNodes = Graph.nodeCount(snapshot);
          const allEdges = Graph.edgeCount(snapshot);
          const avgDegree = allNodes > 0 ? allEdges / allNodes : 0;

          return { year, neighbors, avgDegree };
        })
      ),
      { concurrency: 5 }
    );

    return snapshots;
  });
```

**Agent Integration**:
- Tool: `track_artist_evolution` with `years: number[]`
- Insight: "Artist X's collaboration network grew from 5 neighbors in 1990 to 47 in 2000, peaking during their major label era"

## 7. Semantic Enhancement for LLM Generation

### 7.1 Subgraph Extraction for Prompts

**Use Case**: Pull relevant context for agent prompt without overwhelming token budget.

**Implementation**:

```typescript
const extractRelevantSubgraph = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  focusMbids: string[],
  maxHops = 2,
  maxNodes = 50
): Effect.Effect<{
  nodes: GraphNode[];
  edges: Array<{ from: string; to: string; type: string }>;
  summary: string;
}> =>
  Effect.gen(function* () {
    // BFS from focus nodes up to maxHops
    const queue: Array<{ idx: NodeIndex; dist: number }> = [];
    const visited = new Set<NodeIndex>();

    for (const mbid of focusMbids) {
      const idx = yield* lookupNodeIndex(mbid);
      queue.push({ idx, dist: 0 });
    }

    const relevantNodes: GraphNode[] = [];
    const relevantEdges: Array<{ from: string; to: string; type: string }> = [];

    while (queue.length > 0 && relevantNodes.length < maxNodes) {
      const { idx, dist } = queue.shift()!;

      if (visited.has(idx)) continue;
      visited.add(idx);

      const node = Graph.getNode(graph, idx);
      if (Option.isSome(node)) {
        relevantNodes.push(node.value);
      }

      if (dist < maxHops) {
        const outgoing = Graph.findEdges(
          graph,
          (_, source) => source === idx
        );

        for (const edgeIdx of outgoing) {
          const edge = Graph.getEdge(graph, edgeIdx);
          if (Option.isSome(edge)) {
            const target = edge.value.target;
            const targetNode = Graph.getNode(graph, target);
            const sourceNode = Graph.getNode(graph, idx);

            if (Option.isSome(targetNode) && Option.isSome(sourceNode)) {
              relevantEdges.push({
                from: sourceNode.value.mbid,
                to: targetNode.value.mbid,
                type: edge.value.data.relationshipType
              });
            }

            if (!visited.has(target)) {
              queue.push({ idx: target, dist: dist + 1 });
            }
          }
        }
      }
    }

    const summary = `Subgraph: ${relevantNodes.length} nodes, ${relevantEdges.length} edges, ${maxHops} hops from ${focusMbids.length} focus nodes`;

    return { nodes: relevantNodes, edges: relevantEdges, summary };
  });
```

**Agent Integration**:
- Before generating insight, extract 2-hop subgraph around query artists
- Include in prompt as structured context
- Token budget: ~50 nodes × 50 chars = 2500 tokens (manageable)

### 7.2 Path Narratives

**Use Case**: Turn graph paths into natural language stories.

**Implementation**:

```typescript
const narratePath = (
  path: PathResult<GraphEdgeData>,
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const segments: string[] = [];

    for (let i = 0; i < path.path.length - 1; i++) {
      const fromNode = Graph.getNode(graph, path.path[i]);
      const toNode = Graph.getNode(graph, path.path[i + 1]);
      const edge = path.costs[i];

      if (Option.isSome(fromNode) && Option.isSome(toNode)) {
        const fromName = fromNode.value.name;
        const toName = toNode.value.name;
        const rel = edge.relationshipType;

        // Generate natural language segment
        let segment = "";
        if (rel === "member of band") {
          segment = `${fromName} was a member of ${toName}`;
        } else if (rel === "collaboration") {
          segment = `${fromName} collaborated with ${toName}`;
        } else if (rel === "cover") {
          segment = `${fromName} covered a song by ${toNode.value.name}`;
        } else {
          segment = `${fromName} has a ${rel} relationship with ${toName}`;
        }

        // Add temporal context if available
        if (edge.beginDate && edge.endDate) {
          segment += ` (${edge.beginDate} to ${edge.endDate})`;
        } else if (edge.beginDate) {
          segment += ` (from ${edge.beginDate})`;
        }

        segments.push(segment);
      }
    }

    return segments.join(", then ");
  });
```

**Agent Integration**:
- Use for `path` tool responses
- Example output: "Thom Yorke was a member of Radiohead, then Radiohead collaborated with Nigel Godrich (1995 to present), then Nigel Godrich produced for Beck"

### 7.3 Relationship Summarization

**Use Case**: Aggregate edge types for an artist into a concise summary.

**Implementation**:

```typescript
const summarizeArtistRelationships = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  mbid: string
): Effect.Effect<{
  totalConnections: number;
  byType: HashMap.HashMap<string, number>;
  topCollaborators: string[];
}> =>
  Effect.gen(function* () {
    const idx = yield* lookupNodeIndex(mbid);
    const edges = yield* MusicGraphService.outgoingEdges(mbid);

    let byType = HashMap.empty<string, number>();
    const collaborators: string[] = [];

    for (const { node, edge } of edges) {
      const count = HashMap.get(byType, edge.relationshipType);
      byType = HashMap.set(
        byType,
        edge.relationshipType,
        Option.getOrElse(count, () => 0) + 1
      );

      if (edge.relationshipType === "collaboration" || edge.relationshipType === "member of band") {
        collaborators.push(node.name);
      }
    }

    return {
      totalConnections: edges.length,
      byType,
      topCollaborators: collaborators.slice(0, 10)
    };
  });
```

**Agent Integration**:
- Use in artist profile generation
- Example: "Artist X has 47 connections: 12 band memberships, 23 collaborations, 8 label relationships, 4 covers"

### 7.4 Discovery Scoring

**Use Case**: Rank entities by "interestingness" for insights.

**Implementation**:

```typescript
const scoreDiscoveryInterest = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  mbid: string
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const idx = yield* lookupNodeIndex(mbid);

    // Factors: centrality, diversity, temporal activity
    const degree = Graph.neighbors(graph, idx).length;
    const edges = yield* MusicGraphService.outgoingEdges(mbid);

    // Diversity: unique relationship types
    const relationshipTypes = new Set(edges.map(e => e.edge.relationshipType));
    const diversity = relationshipTypes.size;

    // Temporal: has recent activity
    const hasRecent = edges.some(e => {
      if (!e.edge.endDate) return true; // Ongoing
      const year = parseInt(e.edge.endDate.split("-")[0]);
      return year >= 2020;
    });
    const recencyBonus = hasRecent ? 2 : 1;

    // Betweenness (approximate via 2-hop reach)
    const twoHopNeighbors = new Set<NodeIndex>();
    for (const nIdx of Graph.neighbors(graph, idx)) {
      for (const nnIdx of Graph.neighbors(graph, nIdx)) {
        twoHopNeighbors.add(nnIdx);
      }
    }
    const reach = twoHopNeighbors.size;

    // Composite score
    const score = (degree * 1.0) + (diversity * 2.0) + (reach * 0.5) * recencyBonus;

    return score;
  });

const findInterestingArtists = (
  graph: Graph.DirectedGraph<GraphNode, GraphEdgeData>,
  topK = 10
): Effect.Effect<Array<{ artist: GraphNode; score: number }>> =>
  Effect.gen(function* () {
    const allNodes = Array.from(Graph.indices(Graph.nodes(graph)));

    const scored = yield* Effect.all(
      allNodes.map(idx =>
        Effect.gen(function* () {
          const node = Graph.getNode(graph, idx);
          if (Option.isNone(node)) return null;

          const score = yield* scoreDiscoveryInterest(graph, node.value.mbid);
          return { artist: node.value, score };
        })
      ),
      { concurrency: 10 }
    );

    return scored
      .filter((s): s is { artist: GraphNode; score: number } => s !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  });
```

**Agent Integration**:
- Tool: `discover_interesting_artists`
- Use to populate "you might like" suggestions
- Insight: "Based on network position and activity, Artist X is a high-interest discovery (score: 42.5)"

## 8. Implementation Roadmap

### Phase 1: Low-Hanging Fruit (Week 1-2)
- **Degree centrality**: Extend `neighbors()` to return counts, add to tool responses
- **K-hop neighborhoods**: Implement `kHopNeighborhood()` for discovery
- **Weighted paths**: Add weight function parameter to existing `path()` method
- **Time-windowed extraction**: Implement `extractTimeWindow()` for temporal queries
- **Relationship summarization**: Add `summarizeArtistRelationships()` for artist profiles

**Effort**: Low (uses existing Effect Graph primitives)

**Impact**: High (immediate value for agent insights)

### Phase 2: Community & Similarity (Week 3-4)
- **Strongly connected components**: Wrap `Graph.stronglyConnectedComponents()` for collaboration circles
- **Label propagation**: Implement simple community detection
- **Jaccard similarity**: Implement `jaccardSimilarity()` and `findSimilarArtists()`
- **Common neighbors**: Fast similarity approximation

**Effort**: Medium (custom algorithms on Effect Graph)

**Impact**: High (enables "artists like X" queries)

### Phase 3: Advanced Centrality (Week 5-6)
- **Betweenness centrality**: Implement Brandes' algorithm
- **PageRank**: Implement power iteration method
- **Discovery scoring**: Composite interestingness metric

**Effort**: Medium-High (complex but well-documented algorithms)

**Impact**: Medium (valuable for influencer detection, may need caching)

**Optimization**: Precompute on graph snapshots, store in Ref

### Phase 4: Advanced Paths (Week 7-8)
- **K-shortest paths**: Implement Yen's algorithm (simplified)
- **Constrained paths**: Edge/node filtering for specialized queries
- **Temporal paths**: Time-aware pathfinding

**Effort**: High (complex algorithms)

**Impact**: Medium (niche use cases, nice-to-have)

### Phase 5: Integration & Tooling (Ongoing)
- Add algorithm results to agent tool responses
- Update system prompt with algorithm guidance
- Add caching layer for expensive computations
- Implement background precomputation for centrality metrics
- Add graph export for visualization (using `Graph.toMermaid()`)

## 9. Performance Considerations

### 9.1 Complexity Analysis

| Algorithm | Complexity | 10K Nodes | 100K Nodes | Notes |
|-----------|------------|-----------|------------|-------|
| Degree centrality | O(1) | Instant | Instant | Adjacency lists pre-computed |
| BFS/DFS | O(V+E) | < 1ms | < 10ms | Very fast |
| Dijkstra | O((V+E) log V) | < 5ms | < 50ms | Acceptable |
| Floyd-Warshall | O(V³) | ~1s | ~1000s | Only for small subgraphs |
| Betweenness | O(VE) | ~100ms | ~10s | Precompute & cache |
| PageRank | O(k×E) | < 10ms | < 100ms | Fast, 20-50 iterations |
| Label propagation | O(k×E) | < 10ms | < 100ms | Very fast, <10 iterations |
| Jaccard (single pair) | O(deg) | < 1ms | < 1ms | Instant |
| Jaccard (all pairs) | O(V²×deg) | ~1s | ~100s | Only for top-K |

### 9.2 Optimization Strategies

**1. Lazy Evaluation**
- Use Effect Graph's Walker API for streaming results
- Don't materialize full result sets unnecessarily

**2. Caching**
- Store precomputed centrality metrics in `Ref`
- Invalidate on graph mutations
- Use `Effect.cached()` for expensive computations

**3. Batching**
- Compute centrality for all nodes in single pass
- Amortize iteration costs

**4. Subgraph Extraction**
- For expensive algorithms (Floyd-Warshall), extract relevant subgraph first
- Use `Graph.filterMapNodes()` to prune

**5. Concurrency**
- Use `Effect.all(..., { concurrency: N })` for parallel computations
- Be mindful of memory with large fan-outs

**6. Approximation**
- For PageRank, use fewer iterations for quick estimates
- For betweenness, sample subset of source nodes

## 10. Research References

### Academic Papers & Documentation

1. **Graph-based Music Recommendation** (2024)
   - [An Effective Graph-based Music Recommendation Algorithm](https://dl.acm.org/doi/10.1145/3625007.3627322)
   - [Hybrid music recommendation with graph neural networks](https://link.springer.com/article/10.1007/s11257-024-09410-4)

2. **MusicBrainz Graph Analysis**
   - [MusicBrainz in Neo4j](https://neo4j.com/blog/musicbrainz-in-neo4j-part-1/)
   - [Music Artist Collaborations from MusicBrainz](https://wiki.cs.umd.edu/cmsc734_09/index.php?title=Music_Artist_Collaborations_from_MusicBrainz)

3. **Centrality Algorithms**
   - [Neo4j Centrality Algorithms](https://neo4j.com/developer/graph-data-science/centrality-graph-algorithms/)
   - [PageRank in Neo4j](https://neo4j.com/blog/graph-data-science/graph-algorithms-neo4j-pagerank/)
   - [TigerGraph PageRank](https://docs.tigergraph.com/graph-ml/3.10/centrality-algorithms/pagerank)

4. **Artist Similarity & Networks**
   - [GATSY: Graph Attention Network for Music Artist Similarity](https://arxiv.org/html/2311.00635)
   - [Modeling Artist Influence for Music Selection](https://hdsr.mitpress.mit.edu/pub/t4txmd81/release/2)

5. **Music Knowledge Graphs**
   - [Music recommendation algorithms based on knowledge graph](https://www.nature.com/articles/s41598-024-52463-z)
   - [MUSIGAIN: Adaptive Graph Attention Network](https://www.mdpi.com/2079-9292/14/24/4892)

6. **Musical Structure Analysis**
   - [Analysis and Visualization of Musical Structure using Networks](https://arxiv.org/html/2404.15208v1)

7. **Music Information Retrieval**
   - [Music Information Retrieval: Recent Developments](https://dl.acm.org/doi/abs/10.1561/1500000042)

### Key Findings from Research

**David Bowie as Bridge Artist**: Research identified David Bowie with "extremely high betweenness centrality while having a very low degree", representing a bridge between musical communities through genre-crossing collaborations.

**Personalized PageRank in Music**: The PinSage algorithm uses Personalized PageRank to define influential neighborhoods in playlist-song bipartite graphs, improving recommendation quality.

**Classical Centrality Limitations**: Traditional centrality measures "treat all edges equally, ignoring semantic differences between relationship types" - important consideration for MusicBrainz heterogeneous graphs.

**MusicBrainz Scale**: "Around 800,000 artists, 75,000 record labels, 1,200,000 releases, 12,000,000 tracks" with MBID as "closest to a universal UUID for the music recording industry".

## 11. Conclusion

Effect's Graph module provides a rich foundation for music discovery algorithms. The immediate opportunity is in:

1. **Centrality metrics** (degree, betweenness, PageRank) for influencer detection
2. **Community detection** (SCCs, label propagation) for scene analysis
3. **Similarity measures** (Jaccard, Adamic-Adar) for "artists like X"
4. **Temporal analysis** (time windows, evolution) for historical context
5. **Semantic enhancement** (subgraph extraction, narratives) for LLM prompts

The codebase's existing architecture (Effect-based, immutable graph, HashMap MBID index) makes these extensions natural. Start with Phase 1 (low-hanging fruit) to deliver immediate value, then iterate based on agent performance and user queries.

**Next Steps**:
1. Implement degree centrality and k-hop neighborhoods (Week 1)
2. Add relationship summarization to artist profiles (Week 1)
3. Prototype time-windowed queries for temporal insights (Week 2)
4. Test Jaccard similarity for "similar artists" tool (Week 2)
5. Evaluate PageRank precomputation strategy (Week 3)

---

**Document Maintainer**: Update this document as algorithms are implemented and new research emerges.
