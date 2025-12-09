# Search Tool Optimization - Implementation Plan

**Date:** 2025-12-08
**Design:** [search-tool-optimization-design.md](./2025-12-08-search-tool-optimization-design.md)
**Status:** Ready for implementation

---

## Overview

This plan implements the Search Tool Optimization design in three sequential layers:
1. **Layer 1:** Backend Limits (FAISS API)
2. **Layer 2:** Tool Schemas & Handlers (Agent Package)
3. **Layer 3:** System Prompt Audit

Each task includes exact file paths, line numbers, and complete code changes.

---

## Layer 1: Backend Limits (FAISS API)

### Task 1.1: Add Batch Endpoint Limit

**File:** `faiss-search-api/app/main.py`
**Location:** Lines 779-821 (`get_plays_batch` function)

**Current Code (line 788-796):**
```python
try:
    # Parse comma-separated IDs
    ids = [int(id.strip()) for id in play_ids.split(",")]

    if not ids:
        raise HTTPException(
            status_code=400,
            detail="No play IDs provided"
        )
```

**New Code:**
```python
try:
    # Parse comma-separated IDs
    ids = [int(id.strip()) for id in play_ids.split(",")]

    if not ids:
        raise HTTPException(
            status_code=400,
            detail="No play IDs provided"
        )

    # Enforce maximum batch size for safety
    if len(ids) > 500:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum 500 IDs allowed, got {len(ids)}"
        )
```

**Verification:**
```bash
curl "https://cratemusic.duckdns.org/api/plays/batch?play_ids=$(seq -s, 1 501)" | jq '.detail'
# Expected: "Maximum 500 IDs allowed, got 501"
```

---

### Task 1.2: Optimize FAISS Internal k Value

**File:** `faiss-search-api/app/main.py`
**Location:** Line 360 (in `search` function)

**Current Code:**
```python
# FAISS search (get top 1000)
faiss_indices, distances = search_svc.search(request.query, k=1000)
```

**New Code:**
```python
# FAISS search - fetch only what's needed for pagination
# Add buffer of 100 to handle potential filtering
internal_k = min(1000, request.offset + request.limit + 100)
faiss_indices, distances = search_svc.search(request.query, k=internal_k)
```

**Verification:**
- Search performance should remain unchanged for typical queries (limit ≤ 20)
- Edge case: offset=900, limit=100 should still work (internal_k=1000)

---

## Layer 2: Tool Schemas & Handlers (Agent Package)

### Task 2.1: Update SemanticSearchParams Description

**File:** `packages/agent/src/tools/schemas.ts`
**Location:** Lines 162-165

**Current Code:**
```typescript
/** Maximum number of results to return (1-100, default 20) */
limit: Schema.optional(Schema.Number).annotations({
  description: "Maximum number of results to return (1-100, default 20)"
}),
```

**Change:** None needed - description already matches backend default (20).

**Status:** ✅ Already correct

---

### Task 2.2: Update SearchPlaysParams Description

**File:** `packages/agent/src/tools/schemas.ts`
**Location:** Lines 119-122

**Current Code:**
```typescript
/** Maximum number of results to return (1-100, default 20) */
limit: Schema.optional(Schema.Number).annotations({
  description: "Maximum number of results to return (1-100, default 20)"
}),
```

**Change:** None needed - description already matches handler default.

**Status:** ✅ Already correct

---

### Task 2.3: Add limit Parameter to QueryCachedNeighborsParams

**File:** `packages/agent/src/tools/schemas.ts`
**Location:** Lines 487-495

**Current Code:**
```typescript
export const QueryCachedNeighborsParams = Schema.Struct({
  mbid: Schema.String.annotations({
    description: "MBID to get cached neighbors for"
  }),
  include_edges: Schema.optional(Schema.Boolean).annotations({
    description: "Whether to include full edge data with relationship context (default true)"
  })
})
```

**New Code:**
```typescript
export const QueryCachedNeighborsParams = Schema.Struct({
  mbid: Schema.String.annotations({
    description: "MBID to get cached neighbors for"
  }),
  include_edges: Schema.optional(Schema.Boolean).annotations({
    description: "Whether to include full edge data with relationship context (default true)"
  }),
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum neighbors to return (1-100, default 20)"
  })
})
```

---

### Task 2.4: Add max_words Parameter to FetchLinkParams

**File:** `packages/agent/src/tools/schemas.ts`
**Location:** Lines 248-258

**Current Code:**
```typescript
export const FetchLinkParams = Schema.Struct({
  /** URL to fetch content from (must be http or https) */
  url: Schema.String.annotations({
    description: "URL to fetch content from (must be http or https)"
  }),
  /** Whether to extract and return links from the page (default false) */
  extract_links: Schema.optional(Schema.Boolean).annotations({
    description: "Whether to extract and return links from the page (default false)"
  })
})
```

**New Code:**
```typescript
export const FetchLinkParams = Schema.Struct({
  /** URL to fetch content from (must be http or https) */
  url: Schema.String.annotations({
    description: "URL to fetch content from (must be http or https)"
  }),
  /** Whether to extract and return links from the page (default false) */
  extract_links: Schema.optional(Schema.Boolean).annotations({
    description: "Whether to extract and return links from the page (default false)"
  }),
  /** Maximum words to return from content (default 5000, max 10000) */
  max_words: Schema.optional(Schema.Number).annotations({
    description: "Maximum words to return (default 5000, max 10000). Long pages truncated with '[Content truncated...]'"
  })
})
```

---

### Task 2.5: Update FetchLinkTool Description

**File:** `packages/agent/src/tools/definitions.ts`
**Location:** Lines 125-139

**Current Code:**
```typescript
export const FetchLinkTool = Tool.make("fetch_link", {
  description: `Fetch and extract content from a web URL.

Use this tool when:
- DJ comment contains a URL you want to analyze
- You need to research an artist/album from external sources

Good sources: Wikipedia, Bandcamp, Discogs, Pitchfork, music publications.

Set extract_links=true to also get links from the page for further research.
Returns cleaned markdown text content suitable for analysis.`,
```

**New Code:**
```typescript
export const FetchLinkTool = Tool.make("fetch_link", {
  description: `Fetch and extract content from a web URL.

Use this tool when:
- DJ comment contains a URL you want to analyze
- You need to research an artist/album from external sources

Good sources: Wikipedia, Bandcamp, Discogs, Pitchfork, music publications.

Set extract_links=true to also get links from the page for further research.
Content is truncated to 5000 words by default to manage context size.
Use max_words parameter (up to 10000) for longer articles when necessary.
Returns cleaned markdown text content suitable for analysis.`,
```

---

### Task 2.6: Update QueryCachedNeighborsTool Description

**File:** `packages/agent/src/tools/definitions.ts`
**Location:** Lines 225-238

**Current Code:**
```typescript
export const QueryCachedNeighborsTool = Tool.make("query_cached_neighbors", {
  description: `Get neighbors for an entity from the local graph cache (no API call).

Use this for fast traversal AFTER the graph has been expanded:
- List all band members already discovered
- Show known collaborators without re-fetching
- Navigate the graph efficiently

Returns full relationship context by default (include_edges=true).
Returns empty array if MBID not in cache - use explore_graph first.`,
```

**New Code:**
```typescript
export const QueryCachedNeighborsTool = Tool.make("query_cached_neighbors", {
  description: `Get neighbors for an entity from the local graph cache (no API call).

Use this for fast traversal AFTER the graph has been expanded:
- List all band members already discovered
- Show known collaborators without re-fetching
- Navigate the graph efficiently

Returns up to 20 neighbors by default. Use limit parameter to increase (max 100).
Returns full relationship context by default (include_edges=true).
Returns empty array if MBID not in cache - use explore_graph first.`,
```

---

### Task 2.7: Add truncateToWords Utility Function

**File:** `packages/agent/src/tools/handlers.ts`
**Location:** Add after line 51 (before the Handler Factory Functions section)

**New Code:**
```typescript
// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Truncate text to a maximum number of words
 * Used by fetch_link to prevent unbounded content from bloating context
 */
function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "\n\n[Content truncated...]";
}
```

---

### Task 2.8: Update fetch_link Handler with Truncation

**File:** `packages/agent/src/tools/handlers.ts`
**Location:** Lines 290-329 (makeFetchLinkHandler)

**Current Code (lines 300-326):**
```typescript
const response = yield* service.fetch(params).pipe(
  // Map service error to success with error content for tool robustness
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`fetch_link tool error: ${error.message}`);
      yield* Effect.annotateCurrentSpan({ error: error.message, error_type: error._tag ?? "UnknownError" });
      return {
        url: params.url,
        title: "Error fetching content",
        content: `Failed to fetch content: ${error.message}`,
        word_count: 0,
        links: [],
      };
    })
  )
);

yield* Effect.annotateCurrentSpan({
  word_count: response.word_count,
  link_count: response.links.length,
});
yield* Effect.logDebug(
  `fetch_link returned ${response.word_count} words`
);

return response satisfies FetchLinkResponse;
```

**New Code:**
```typescript
const rawResponse = yield* service.fetch(params).pipe(
  // Map service error to success with error content for tool robustness
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`fetch_link tool error: ${error.message}`);
      yield* Effect.annotateCurrentSpan({ error: error.message, error_type: error._tag ?? "UnknownError" });
      return {
        url: params.url,
        title: "Error fetching content",
        content: `Failed to fetch content: ${error.message}`,
        word_count: 0,
        links: [],
      };
    })
  )
);

// Apply word truncation to prevent context bloat
const maxWords = Math.min(params.max_words ?? 5000, 10000);
const truncatedContent = truncateToWords(rawResponse.content, maxWords);
const truncatedWordCount = truncatedContent.split(/\s+/).length;

yield* Effect.annotateCurrentSpan({
  word_count: truncatedWordCount,
  original_word_count: rawResponse.word_count,
  link_count: rawResponse.links.length,
  truncated: rawResponse.word_count > maxWords,
});
yield* Effect.logDebug(
  `fetch_link returned ${truncatedWordCount} words (original: ${rawResponse.word_count})`
);

return {
  ...rawResponse,
  content: truncatedContent,
  word_count: truncatedWordCount,
} satisfies FetchLinkResponse;
```

---

### Task 2.9: Update query_cached_neighbors Handler with Limit

**File:** `packages/agent/src/tools/handlers.ts`
**Location:** Lines 545-600 (makeQueryCachedNeighborsHandler)

**Current Code (lines 559-580):**
```typescript
if (includeEdges) {
  // Use outgoingEdges for full relationship context
  const edges = yield* service.outgoingEdges(params.mbid);
  const neighbors = edges.map((e) => ({
    mbid: e.node.mbid,
    name: e.node.name,
    node_type: e.node.nodeType,
    relationship_type: e.edge.relationshipType,
    attributes: e.edge.attributes ? [...e.edge.attributes] : undefined,
    begin_date: e.edge.beginDate,
    end_date: e.edge.endDate,
    via_mbid: e.edge.viaMbid,
    via_name: e.edge.viaName,
  }));

  yield* Effect.annotateCurrentSpan("neighbor_count", neighbors.length);

  return {
    mbid: params.mbid,
    neighbors,
    neighbor_count: neighbors.length,
  } satisfies QueryCachedNeighborsResponse;
}
```

**New Code:**
```typescript
// Apply limit with default of 20, max of 100
const limit = Math.min(params.limit ?? 20, 100);

if (includeEdges) {
  // Use outgoingEdges for full relationship context
  const edges = yield* service.outgoingEdges(params.mbid);
  const allNeighbors = edges.map((e) => ({
    mbid: e.node.mbid,
    name: e.node.name,
    node_type: e.node.nodeType,
    relationship_type: e.edge.relationshipType,
    attributes: e.edge.attributes ? [...e.edge.attributes] : undefined,
    begin_date: e.edge.beginDate,
    end_date: e.edge.endDate,
    via_mbid: e.edge.viaMbid,
    via_name: e.edge.viaName,
  }));

  // Apply limit
  const neighbors = allNeighbors.slice(0, limit);

  yield* Effect.annotateCurrentSpan({
    neighbor_count: neighbors.length,
    total_available: allNeighbors.length,
    limited: allNeighbors.length > limit,
  });

  return {
    mbid: params.mbid,
    neighbors,
    neighbor_count: neighbors.length,
  } satisfies QueryCachedNeighborsResponse;
}
```

**Also update the else branch (lines 581-597):**

```typescript
} else {
  // Use neighbors for basic node info only
  const nodes = yield* service.neighbors(params.mbid);
  const allNeighbors = nodes.map((n) => ({
    mbid: n.mbid,
    name: n.name,
    node_type: n.nodeType,
  }));

  // Apply limit
  const neighbors = allNeighbors.slice(0, limit);

  yield* Effect.annotateCurrentSpan({
    neighbor_count: neighbors.length,
    total_available: allNeighbors.length,
    limited: allNeighbors.length > limit,
  });

  return {
    mbid: params.mbid,
    neighbors,
    neighbor_count: neighbors.length,
  } satisfies QueryCachedNeighborsResponse;
}
```

---

## Layer 3: System Prompt Audit

### Task 3.1: Add Result Size Guidance Section

**File:** `packages/agent/src/prompts/system-prompt.ts`
**Location:** After the TOOLS constant (around line 813), add a new constant.

**New Constant:**
```typescript
export const RESULT_SIZE_GUIDANCE = `### Result Size Guidance

**Search tools (semantic_search, search_plays):**
- Use limit=5-10 for quick existence checks
- Use default (20) for standard exploration
- Use limit=50-100 only for comprehensive research

**fetch_link:**
- Content auto-truncated to 5000 words by default
- Set max_words=10000 for longer articles when needed
- Very long pages will note "[Content truncated...]"

**Graph tools:**
- query_cached_neighbors: Returns 20 by default, increase limit if exploring dense networks
- graph_connections: Returns 20 results per query type
- explore_graph: Returns 20 results, merges into local cache`;
```

**Update TOOLS constant** to include result size info (add before the closing backtick):

Add to the Tool Selection Guide section (around line 785):

```typescript
### Result Size Defaults

| Tool | Default Limit | Max Limit |
|------|--------------|-----------|
| semantic_search | 20 | 100 |
| search_plays | 20 | 100 |
| graph_connections | 20 | 20 |
| query_cached_neighbors | 20 | 100 |
| fetch_link | 5000 words | 10000 words |
```

---

### Task 3.2: Update STATIC_SYSTEM_PROMPT to Include Result Size Guidance

**File:** `packages/agent/src/prompts/system-prompt.ts`
**Location:** Line 1370-1401 (STATIC_SYSTEM_PROMPT array)

**Add RESULT_SIZE_GUIDANCE after TOOLS in the array:**

```typescript
export const STATIC_SYSTEM_PROMPT = [
  // ... existing entries ...
  TOOLS,
  RESULT_SIZE_GUIDANCE,  // NEW: Add after TOOLS
  INSIGHT_CONTINUITY,
  // ... rest of entries ...
].join("\n\n---\n\n");
```

**Also add to namespace export (around line 1596):**
```typescript
RESULT_SIZE_GUIDANCE,
```

---

## Verification Checklist

After implementation, verify:

### Backend (Layer 1)
- [ ] `/api/plays/batch` returns 400 for >500 IDs
- [ ] `/api/search` uses dynamic internal k value
- [ ] Deploy to droplet and test endpoints

### Schemas & Handlers (Layer 2)
- [ ] `pnpm check` passes
- [ ] `pnpm build` passes
- [ ] fetch_link truncates content to max_words
- [ ] query_cached_neighbors respects limit parameter

### System Prompt (Layer 3)
- [ ] Result Size Guidance section present
- [ ] All tool defaults documented accurately

---

## Commit Strategy

**Commit 1: Layer 1 - Backend Limits**
```
feat(faiss-api): add safety limits to batch endpoint and optimize FAISS k

- Add 500 ID limit to /api/plays/batch (prevents unbounded requests)
- Optimize /api/search internal k based on offset+limit (reduces work)
```

**Commit 2: Layer 2 - Tool Schemas & Handlers**
```
feat(agent): add limit parameters and content truncation to tools

- Add max_words param to FetchLinkParams (default 5000, max 10000)
- Add limit param to QueryCachedNeighborsParams (default 20, max 100)
- Update tool descriptions to document defaults
- Add truncateToWords utility for fetch_link handler
- Apply limit filtering to query_cached_neighbors handler
```

**Commit 3: Layer 3 - System Prompt Audit**
```
docs(agent): add Result Size Guidance to system prompt

- Add RESULT_SIZE_GUIDANCE section documenting all tool defaults
- Update TOOLS section with Result Size Defaults table
- Ensure all documented defaults match actual implementation
```

---

## Execution Options

Choose your preferred execution approach:

### Option A: Subagent-Driven Development
- Launch 3 subagents (one per layer)
- Execute sequentially with code review between each
- Best for: thorough review, catching integration issues

### Option B: Direct Implementation
- Implement all tasks in this session
- Faster but requires careful attention
- Best for: straightforward changes, experienced developer

### Option C: Parallel Sessions
- Split into 3 parallel worktrees
- Each focuses on one layer
- Best for: maximum parallelism, independent changes

**Recommended:** Option A (Subagent-Driven) - ensures each layer is verified before proceeding.
