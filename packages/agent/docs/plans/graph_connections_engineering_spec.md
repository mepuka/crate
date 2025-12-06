# Engineering Specification: Graph Connections (Effect, Python, Agent Integration)

> **Status**: Draft for implementation  
> **Owner**: Antigravity  
> **Date**: 2025-12-XX  
> **Version**: 3.0.0 (Graph Connections with Graph-First cache)  
> **Scope**: Python FastAPI, `@crate/domain`, `@crate/agent`, prompt/tooling alignment

---

## 1) Goals & Non‑Goals

- **Goals**
  - Provide a stateless, batched `POST /api/graph/connections` in FastAPI for multi-entity graph lookups.
  - Expose shared request/response schemas in `@crate/domain` for TS/Python contract parity.
  - Add agent-side client/service + optional in-memory graph cache (graph-first) with Effect-TS patterns (data-first pipe, `Effect.gen`, tagged errors, explicit channels).
  - Integrate a `graph_connections` tool (remote) and `explore_graph` tool (cached expansion) with prompt guidance to avoid hallucination and ensure MBID-grounded answers.
  - Preserve Crate philosophy (formal graph edges, provenance, “cite reality”), KEXP ethos, and existing MBID guardrails.
- **Non‑Goals**
  - No DB migrations (edge tables already exist).
  - No UI changes; agent-only surface.
  - No streaming/WS support; HTTP only.

## 2) Current State (References)

- Domain graph schemas (edges/results only): `packages/domain/src/graph/schemas.ts`
- FAISS API service patterns: `faiss-search-api/app/services/db_service.py`
- Agent HTTP patterns: `packages/agent/src/services/SearchPlaysService.ts`, `packages/agent/src/FaissClient.ts`
- Agent tools & schemas (no graph tool yet): `packages/agent/src/tools/definitions.ts`, `packages/agent/src/tools/schemas.ts`
- System prompt MBID/connection guidance: `packages/agent/src/prompts/system-prompt.ts` (`MBID_INSTRUCTION`, “Musical Connections” section)

## 3) Architecture Overview

```
Client (LLM via tools)
  ├─ graph_connections (remote, stateless)
  └─ explore_graph (local cache expansion)
        │
        ▼
Agent (Effect)
  ├─ GraphConnectionsClient (HTTP, FaissConfig)
  ├─ GraphConnectionsService (thin wrapper, tagged errors)
  └─ MusicGraphService (Ref-backed cache, neighbors/path)
        │
        ▼
Python FastAPI
  ├─ Graph models (Pydantic)
  ├─ Graph router POST /api/graph/connections
  └─ DatabaseService graph queries (batched IN lookups)
        │
        ▼
SQLite edge tables (artist_edges, label_edges, etc.)
```

## 4) API Contract (Python FastAPI)

- **Endpoint**: `POST /api/graph/connections`
- **Request** (`GraphConnectionsRequest`):
  - `query_type`: `"band_members" | "member_of" | "labelmates" | "label_hierarchy" | "covers" | "artist_origin" | "recorded_at" | "collaborators"`
  - `mbids`: string[] (1–50)
  - `limit?`: number (default 20, max 100)
  - `include_attributes?`: boolean (default true; when false, omit attributes blob for perf)
- **Response** (`GraphConnectionsResponse`):
  - `query_type`: same as request
  - `source_mbids`: string[]
  - `connections`: `ConnectionNode[]` (mbid, name, node_type, relationship_type, attributes?, begin_date?, end_date?, via_mbid?, via_name?)
  - `total`: number
  - `query_time_ms`: number
- **Errors**
  - 422: validation (empty mbids, limit > 100, unknown query_type)
  - 400: unsupported query_type dispatch
  - 503: DB errors (wrap sqlite errors)
- **Performance**: batched `IN` queries; use covering PK/idx; order by stable fields; limit applied after filters; optional projection of attributes to reduce payload.
- **Observability**: log query_type, source_mbids count, rows, query_time_ms.

## 5) Shared Data Model (`@crate/domain`)

- Add to `packages/domain/src/graph/schemas.ts` and re-export in `packages/domain/src/index.ts`:
  - `GraphQueryType` literal union (values above).
  - `GraphConnectionsRequest`: `Schema.Struct` with primitive fields only (tool-safe).
  - `ConnectionNode`: `Schema.Class` with optional provenance (`via_*`) and dates.
  - `GraphConnectionsResponse`: `Schema.Struct` as above.
- Keep existing edge/result classes intact; do not pipe transforms in tool-facing structs to maintain JSON Schema compatibility.

## 6) Agent Implementation (Effect)

### 6.1 Client
- `GraphConnectionsClient` (new): HTTP POST to `/api/graph/connections`.
- Dependencies: `FaissConfig` (`baseUrl`, timeout) and `HttpClient`.
- Use `HttpClientResponse.schemaBodyJson(GraphConnectionsResponse)` for decode; errors wrapped in `GraphApiError` (Data.TaggedError).
- Timeouts/retries: short timeout (reuse FaissConfig), limited retry with backoff on network/timeouts only (no retry on 4xx).

### 6.2 Service
- `GraphConnectionsService` (Context.Tag): `connections(params): Effect<GraphConnectionsResponse, GraphApiError, never>`.
- No requirement leakage in interface (`R = never`), provide `FaissConfig + HttpClient` via layer.
- Helpers: group-by-source, filter by node_type if needed, but keep core thin.

### 6.3 Graph Cache (Graph-First)
- `MusicGraphService` (Context.Tag):
  - State: `Ref<{ graph: Graph.DirectedGraph<GraphNode, GraphEdge>; indexByMbid: HashMap<Mbid, Graph.NodeIndex> }>` — use the **Effect Graph module as the backing store** (no custom edge sets), plus an MBID→NodeIndex map for lookups.
  - API: `expand(mbids, queryType?, limit?)`, `neighbors(mbid)`, `path(from,to)`, `snapshot()`, `reset()`.
  - Concurrency: gate concurrent expansions per mbid (memoize in-flight), use `Ref.update` + `Graph.mutate` to merge idempotently.
  - Merging rules: inside `Graph.mutate`, ensure nodes exist via `indexByMbid` + `Graph.addNode`; check `Graph.hasEdge` before `Graph.addEdge`; preserve provenance (`relationship_type`, `via_*`, dates, attributes when present).
  - Observability: `Effect.annotateCurrentSpan` with query_type/mbids/new_nodes/new_edges; structured logs on expansions.
  - **Effect Graph APIs explicitly used**
    - Models: `Graph.DirectedGraph<N, E>`, `Graph.NodeIndex`, `Graph.Edge<E>`, `Graph.Kind = "directed"`.
    - Mutations: `Graph.mutate`, `Graph.addNode`, `Graph.addEdge`, `Graph.updateNode/Edge`, `Graph.removeNode/Edge` (rare), `Graph.filterNodes/Edges` (prune), `Graph.filterMapNodes/Edges` (strip attributes if needed).
    - Transformations: `Graph.mapNodes/Edges` (optional normalization), `Graph.reverse` (for inverse projections when useful).
    - Queries / Iterators: `Graph.neighbors`, `Graph.neighborsDirected` (incoming/outgoing), `Graph.hasNode/hasEdge`, `Graph.getNode/getEdge`, `Graph.nodeCount/edgeCount`; traversals via `Graph.dfs`/`Graph.bfs` (reachability) with `Graph.NodeWalker` helpers (`Graph.indices`, `Graph.values`, `Graph.entries`).
    - Algorithms: `Graph.dijkstra` (shortest hop path; cost=1 or weighted by relation), `Graph.bellmanFord` (if negative weights ever appear), `Graph.floydWarshall` (all-pairs later if needed), `Graph.isAcyclic` (sanity), `Graph.stronglyConnectedComponents` (optional analysis).
    - Utilities: `Graph.toGraphViz` / `Graph.toMermaid` for debug/inspection exports.
    - Rationale: we rely on the official Graph module for algebraic guarantees and avoid bespoke graph logic while keeping MBID identity via the side map.

### 6.4 Tools
- `graph_connections` tool:
  - Params: `GraphConnectionsRequest.fields`.
  - Success: `GraphConnectionsResponse`.
  - Description: when to use (remote, batched lookup), examples for band members/labelmates/covers/origin.
- `explore_graph` tool:
  - Params: `{ mbids: string[]; query_type?: GraphQueryType; limit?: number }`.
  - Success: `{ summary: string; new_nodes_count: number; new_edges_count: number; neighbors?: ConnectionNode[] }`.
  - Semantics: expands cache, returns delta + nearby nodes for user-facing narrative.

### 6.5 Prompt & Agent Loop Integration
- Update `packages/agent/src/tools/definitions.ts` to register new tools in `CrateToolkit`.
- `MusicAgent` research loop: allow `graph_connections` (and optionally `explore_graph`) in required/auto toolChoice sets when questions mention relationships, bands, labels, origins, collaborations, covers.
- System prompt (`packages/agent/src/prompts/system-prompt.ts`):
  - Add concise instruction: “Use `graph_connections` for band/label/origin/collaboration queries; prefer real MBIDs; do not fabricate edges. For follow-up hops, use `explore_graph` to reuse cached context.”
  - Keep MBID guardrails: prefer null over fabricated MBIDs; cite source MBIDs and relationship_type in answers.
- Ensure prompt “Musical Connections” section explicitly references the tool names and expected outputs for coherence.

## 7) Effect Composition Notes (Why This Design)

- **Data-first pipes**: client/service compose as `client.post(...).pipe(Effect.flatMap(...))` (see `packages/agent/src/FaissClient.ts`) to remain consistent with Crate patterns.
- **`Effect.gen` for business logic**: expansions and merges use `Effect.gen` for sequential steps (fetch → merge → log), avoiding long pipe chains.
- **Explicit channels**: all public signatures should be `Effect<A, E, R>` with explicit `E` (tagged) and `R` (`never` for services after provisioning).
- **Tagged errors**: `GraphApiError` mirrors existing `SearchPlaysError` style (`packages/agent/src/services/errors.ts`) for catchTag compatibility.
- **State safety**: `Ref` + `Graph` as the core immutable store (with MBID→NodeIndex side map) guarantees idempotent merges; avoid imperative loops by using `Effect.all` or immutable reductions.
- **Graph algebra**: Surface matches `effect/Graph` ops (`neighbors`, shortest path via `dijkstra`, traversals via `dfs`/`bfs`, merges via `Graph.mutate`), inheriting algebraic laws (associativity/idempotence/commutativity of edge-set union) and avoiding bespoke graph code. Law tests map directly to Graph properties.

## 8) File Changes (Planned)

1. **Domain**
   - `packages/domain/src/graph/schemas.ts`: add GraphQueryType, GraphConnectionsRequest/Response, ConnectionNode.
   - `packages/domain/src/index.ts`: export new graph schemas.
2. **Python FastAPI**
   - `faiss-search-api/app/models/graph.py`: Pydantic models for request/response/node.
   - `faiss-search-api/app/routes/graph.py`: router with POST /api/graph/connections.
   - `faiss-search-api/app/services/db_service.py`: add graph query functions; reuse connection; batched SQL.
   - Tests: `faiss-search-api/tests/test_graph_api.py` (fixture graph + scenarios).
3. **Agent (TS)**
   - `packages/agent/src/tools/schemas.ts`: add GraphQueryType, request/response, node; ensure tool-safe (no transform pipes).
   - `packages/agent/src/tools/definitions.ts`: add `graph_connections`, `explore_graph`, include in `CrateToolkit`.
   - `packages/agent/src/services/GraphConnectionsClient.ts` (new).
   - `packages/agent/src/services/GraphConnectionsService.ts` (new).
   - `packages/agent/src/services/MusicGraphService.ts` (new, Ref cache).
   - Add to `packages/agent/src/services/index.ts` exports.
   - `packages/agent/src/prompts/system-prompt.ts`: weave tool guidance into “Musical Connections” + MBID sections.
   - Tests: `packages/agent/src/tools/test-handlers.ts` (handlers for new tools), `packages/agent/src/services/__tests__/MusicGraphService.test.ts` (merge/idempotence/path), `packages/agent/src/services/__tests__/GraphConnectionsClient.test.ts` (mock HTTP).

## 9) Testing Strategy

- **Python**: pytest with in-memory sqlite + seed mini graph (Radiohead/The Smile/Sub Pop). Cases: direct, inverse, labelmates, empty, batching, attributes off.
- **TS unit**: MusicGraph merge laws (identity/associativity/idempotence), neighbor/path queries, cache gating for concurrent expands.
- **TS integration**: mock HTTP (test handlers) to validate tool wiring and schema decode errors.
- **Smoke**: curl against running FastAPI with live DB; agent run with `graph_connections` question (“members of Radiohead and their other projects”) to verify prompt/tool coherence.

## 10) Deployment & Migration

- No DB migration. Deploy FastAPI changes, restart service.
- Agent: publish package changes; ensure env `FAISS_API_URL` reachable.
- Backward compatibility: new endpoint additive; existing tools unaffected.

## 11) Open Questions / Decisions

- Do we expose `relationships` filter array in request now or later? (default: not yet; keep simple query_type dispatch).
- Pathfinding: short-term local path in cache only; remote path API deferred.
- Cache persistence: keep per-session Ref; optional session storage via InsightSessionService if cross-turn persistence desired.

## 12) Acceptance Checklist

- [ ] Domain schemas exported; JSON Schema-safe tool structs.  
- [ ] FastAPI route returns validated responses with timing logs.  
- [ ] Agent client/service layers compile and use tagged errors.  
- [ ] Graph cache idempotent and concurrency-safe with Ref.  
- [ ] Tools registered and discoverable in system prompt.  
- [ ] Tests green (Python + TS).  
- [ ] Manual curl + agent smoke verified against droplet.
