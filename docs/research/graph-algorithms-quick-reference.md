# Graph Algorithms Quick Reference

> **For**: Quick lookup during implementation
> **See also**: `graph-algorithms-music-discovery.md` (research), `graph-algorithms-implementation-examples.md` (code patterns)

## Effect Graph Module API Reference

### Location
`/Users/pooks/Dev/crate/docs/effect-source/effect/src/Graph.ts` (3732 lines)

### Core Constructors
```typescript
Graph.directed<N, E>() → DirectedGraph<N, E>
Graph.undirected<N, E>() → UndirectedGraph<N, E>
```

### Mutations (Scoped)
```typescript
Graph.mutate(graph, (mutable) => { ... }) → Graph
Graph.beginMutation(graph) → MutableGraph
Graph.endMutation(mutable) → Graph
```

### Node Operations
```typescript
Graph.addNode(mutable, data: N) → NodeIndex
Graph.getNode(graph, idx) → Option<N>
Graph.hasNode(graph, idx) → boolean
Graph.removeNode(mutable, idx) → void
Graph.updateNode(mutable, idx, f: N → N) → void
Graph.nodeCount(graph) → number
Graph.findNode(graph, predicate) → Option<NodeIndex>
Graph.findNodes(graph, predicate) → NodeIndex[]
```

### Edge Operations
```typescript
Graph.addEdge(mutable, from, to, data: E) → EdgeIndex
Graph.getEdge(graph, idx) → Option<Edge<E>>
Graph.hasEdge(graph, from, to) → boolean
Graph.removeEdge(mutable, idx) → void
Graph.updateEdge(mutable, idx, f: E → E) → void
Graph.edgeCount(graph) → number
Graph.findEdge(graph, predicate) → Option<EdgeIndex>
Graph.findEdges(graph, predicate) → EdgeIndex[]
```

### Traversal (Lazy Iterators)
```typescript
Graph.dfs(graph, config?) → NodeWalker<N>
Graph.bfs(graph, config?) → NodeWalker<N>
Graph.dfsPostOrder(graph, config?) → NodeWalker<N>
Graph.topo(graph, config?) → NodeWalker<N>  // Topological sort

// Walker API
Graph.indices(walker) → Iterable<NodeIndex>
Graph.values(walker) → Iterable<N>
Graph.entries(walker) → Iterable<[NodeIndex, N]>
Graph.nodes(graph) → NodeWalker<N>
Graph.edges(graph) → EdgeWalker<E>
```

### Pathfinding
```typescript
Graph.dijkstra(graph, { source, target, cost }) → Option<PathResult<E>>
Graph.astar(graph, { source, target, cost, heuristic }) → Option<PathResult<E>>
Graph.bellmanFord(graph, { source, target, cost }) → Option<PathResult<E>>
Graph.floydWarshall(graph, cost) → AllPairsResult<E>

// PathResult<E> = { path: NodeIndex[], distance: number, costs: E[] }
```

### Structure Analysis
```typescript
Graph.isAcyclic(graph) → boolean
Graph.isBipartite(graph) → boolean  // Undirected only
Graph.connectedComponents(graph) → NodeIndex[][]  // Undirected
Graph.stronglyConnectedComponents(graph) → NodeIndex[][]  // Directed
```

### Neighbors
```typescript
Graph.neighbors(graph, idx) → NodeIndex[]  // Outgoing
Graph.neighborsDirected(graph, idx, "outgoing" | "incoming") → NodeIndex[]
```

### Transformations
```typescript
Graph.mapNodes(mutable, f: N → N) → void
Graph.mapEdges(mutable, f: E → E) → void
Graph.filterNodes(mutable, predicate) → void
Graph.filterEdges(mutable, predicate) → void
Graph.filterMapNodes(mutable, f: N → Option<N>) → void
Graph.filterMapEdges(mutable, f: E → Option<E>) → void
Graph.reverse(mutable) → void  // Reverse all edge directions
```

### Export
```typescript
Graph.toGraphViz(graph, options?) → string  // DOT format
Graph.toMermaid(graph, options?) → string   // Mermaid diagrams
```

## Algorithm Complexity Cheat Sheet

| Algorithm | Time | Space | Use When |
|-----------|------|-------|----------|
| **Traversal** |
| DFS/BFS | O(V+E) | O(V) | Exploring graph, reachability |
| Topological sort | O(V+E) | O(V) | DAG ordering, dependency resolution |
| **Pathfinding** |
| Dijkstra | O((V+E) log V) | O(V) | Shortest path, non-negative weights |
| A* | O((V+E) log V) | O(V) | Heuristic-guided search |
| Bellman-Ford | O(VE) | O(V) | Negative weights allowed |
| Floyd-Warshall | O(V³) | O(V²) | All-pairs, small graphs only |
| **Centrality** |
| Degree | O(1) | O(1) | Per-node centrality |
| Betweenness | O(VE) | O(V²) | Bridge detection, precompute |
| PageRank | O(kE) | O(V) | Influence, k=20-50 iterations |
| **Community** |
| Connected components | O(V+E) | O(V) | Undirected clustering |
| SCCs (Kosaraju) | O(V+E) | O(V) | Directed clustering |
| Label propagation | O(kE) | O(V) | Fast communities, k<10 |
| **Similarity** |
| Jaccard | O(deg) | O(deg) | Shared neighbors |
| Adamic-Adar | O(deg) | O(deg) | Weighted common neighbors |
| Common neighbors | O(deg) | O(deg) | Fast approximation |

**Legend**: V=vertices, E=edges, k=iterations, deg=average degree

## Music Discovery Use Cases

### Centrality
- **Degree**: "Most collaborative artists", "Most covered artists"
- **Betweenness**: "Bridge artists connecting scenes/genres"
- **PageRank**: "Most influential artists (network-wide)"

### Community
- **SCCs**: "Tight collaboration circles", "Band + side projects"
- **Label propagation**: "Emergent genre clusters"
- **Connected components**: "Isolated scenes"

### Similarity
- **Jaccard**: "Artists with similar collaborators"
- **Adamic-Adar**: "Artists sharing rare collaborators"
- **Common neighbors**: "Quick similarity estimate"

### Paths
- **Shortest path**: "How are these artists connected?"
- **Weighted path**: "Recent collaborations" or "Strong relationships"
- **K-shortest paths**: "Multiple connection pathways"
- **Constrained path**: "Connected only through bands"

### Temporal
- **Time window**: "Seattle scene in 1991-1994"
- **Temporal path**: "Connections that existed simultaneously"
- **Evolution**: "How did this network change over time?"

### Exploration
- **K-hop neighborhood**: "All artists within 2 hops"
- **Subgraph extraction**: "Relevant context for LLM prompt"
- **Discovery scoring**: "Rank by interestingness"

## MusicBrainz Graph Context

### Node Types
- `artist`, `band`, `label`, `recording`, `work`, `area`, `place`

### Common Relationship Types
- `member of band`, `collaboration`, `cover`, `composer`, `lyricist`
- `produced by`, `recorded at`, `label`, `origin`

### Edge Metadata
- `beginDate`, `endDate` (temporal analysis)
- `attributes` (e.g., instruments: "guitar", "vocals")
- `viaMbid`, `viaName` (indirect relationships)

### Scale Estimates
- 800K artists, 75K labels, 1.2M releases, 12M tracks
- Session graph: 10K-100K nodes (manageable in-memory)

## Implementation Checklist

### Before Starting
- [ ] Read Effect Graph source: `/Users/pooks/Dev/crate/docs/effect-source/effect/src/Graph.ts`
- [ ] Review current MusicGraphService: `/Users/pooks/Dev/crate/packages/agent/src/services/MusicGraphService.ts`
- [ ] Check existing tests: `/Users/pooks/Dev/crate/packages/agent/test/graph-expanded-queries.test.ts`

### Adding New Algorithm
- [ ] Add method to `MusicGraphServiceInterface`
- [ ] Implement using Effect Graph primitives
- [ ] Use `Ref.get(state)` for graph access
- [ ] Use `lookupIndex(mbid)` helper for MBID→NodeIndex
- [ ] Return `Effect.Effect<Result, GraphApiError>`
- [ ] Handle `Option.none()` cases gracefully
- [ ] Add unit tests with small graph fixtures
- [ ] Document complexity and use cases

### Performance Optimization
- [ ] Profile with realistic graph size (10K nodes)
- [ ] Cache expensive computations in `Ref`
- [ ] Invalidate cache on graph mutations
- [ ] Use `Effect.all(..., { concurrency: N })` for parallelism
- [ ] Consider precomputation for centrality (background task)
- [ ] Use subgraph extraction for O(V³) algorithms

### Agent Integration
- [ ] Add tool definition to `tools/definitions.ts`
- [ ] Define Schema for parameters
- [ ] Add prompt guidance to `prompts/system-prompt.ts`
- [ ] Include example queries
- [ ] Format results for natural language generation
- [ ] Test with real MBIDs (Radiohead, Thom Yorke, etc.)

## Common Patterns

### Pattern 1: Iterate Over All Nodes
```typescript
const s = yield* Ref.get(state);
for (const [idx, node] of Graph.entries(Graph.nodes(s.graph))) {
  // Process node
}
```

### Pattern 2: Iterate Over Edges
```typescript
for (const [edgeIdx, edge] of Graph.entries(Graph.edges(s.graph))) {
  const source = Graph.getNode(s.graph, edge.source);
  const target = Graph.getNode(s.graph, edge.target);
  // Process edge
}
```

### Pattern 3: MBID Lookup
```typescript
const lookupIndex = (mbid: Mbid): Effect.Effect<NodeIndex, GraphApiError> =>
  Ref.get(state).pipe(
    Effect.flatMap((s) => {
      const idx = HashMap.get(s.indexByMbid, mbid);
      return Option.match(idx, {
        onNone: () => Effect.fail(new GraphApiError({ message: `Node not found: ${mbid}` })),
        onSome: (i) => Effect.succeed(i)
      });
    })
  );
```

### Pattern 4: Filter Graph
```typescript
const filtered = Graph.mutate(graph, (mutable) => {
  Graph.filterMapEdges(mutable, (edge) =>
    predicate(edge) ? Option.some(edge) : Option.none()
  );
});
```

### Pattern 5: Parallel Processing
```typescript
const results = yield* Effect.all(
  items.map((item) => processItem(item)),
  { concurrency: 10 }
);
```

## Testing Fixtures

### Small Graph for Unit Tests
```typescript
// A → B → C
// A → C
const testGraph = Graph.directed<GraphNode, GraphEdgeData>((mutable) => {
  const a = Graph.addNode(mutable, { mbid: "a", name: "Artist A", nodeType: "artist" });
  const b = Graph.addNode(mutable, { mbid: "b", name: "Artist B", nodeType: "artist" });
  const c = Graph.addNode(mutable, { mbid: "c", name: "Artist C", nodeType: "artist" });
  Graph.addEdge(mutable, a, b, { relationshipType: "collaboration" });
  Graph.addEdge(mutable, b, c, { relationshipType: "collaboration" });
  Graph.addEdge(mutable, a, c, { relationshipType: "member of band" });
});
```

### Well-Known MBIDs (Integration Tests)
```typescript
const RADIOHEAD_MBID = "a74b1b7f-71a5-4011-9441-d0b5e4122711";
const THOM_YORKE_MBID = "8ed2e0b3-aa4c-4e13-bec3-dc7393ed4d6b";
const DAVE_GROHL_MBID = "b7ffd2af-418f-4be2-bdd1-22f8b48613da";
const FOO_FIGHTERS_MBID = "67f66c07-6e61-4026-ade5-7e782fad3a5d";
```

## Research Sources

- [Effect Graph source code](file:///Users/pooks/Dev/crate/docs/effect-source/effect/src/Graph.ts)
- [Neo4j Centrality Algorithms](https://neo4j.com/developer/graph-data-science/centrality-graph-algorithms/)
- [GATSY: Graph Attention for Artist Similarity](https://arxiv.org/html/2311.00635)
- [MusicBrainz in Neo4j](https://neo4j.com/blog/musicbrainz-in-neo4j-part-1/)
- [Music Knowledge Graph Recommendation](https://www.nature.com/articles/s41598-024-52463-z)

## Next Steps by Priority

### Week 1-2 (Low-Hanging Fruit)
1. Degree centrality → Extend `neighbors()` method
2. K-hop neighborhoods → BFS with distance tracking
3. Relationship summarization → Aggregate edge types
4. Time-windowed extraction → Filter edges by date

### Week 3-4 (Medium Effort, High Impact)
5. Jaccard similarity → Shared neighbors
6. SCCs → Wrap `Graph.stronglyConnectedComponents()`
7. Label propagation → Simple community detection
8. Weighted paths → Add cost function to `path()`

### Week 5-6 (Advanced)
9. PageRank → Power iteration implementation
10. Betweenness → Brandes' algorithm
11. Discovery scoring → Composite metric

### Ongoing
12. Caching layer for expensive algorithms
13. Agent tool integration
14. Graph visualization exports
15. Background precomputation tasks
