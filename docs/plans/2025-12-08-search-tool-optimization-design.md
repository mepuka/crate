# Search Tool Optimization Design

**Date:** 2025-12-08
**Status:** Approved
**Approach:** Sequential layers (Backend → Schemas → System Prompt)

## Problem Statement

Analysis of search tools revealed several issues:
1. **Safety gaps**: Batch endpoint has no limit; fetch_link returns unbounded content
2. **Documentation misalignment**: Tool descriptions don't match actual backend defaults
3. **Missing constraints**: Some tools lack limit parameters entirely

## Design Overview

Three sequential layers, each establishing ground truth for the next:

```
Layer 1: Backend Limits (FAISS API)
         ↓
Layer 2: Tool Schemas & Handlers (Agent Package)
         ↓
Layer 3: System Prompt Audit
```

---

## Layer 1: Backend Limits (FAISS API)

### Changes to `faiss-search-api/app/main.py`

#### 1.1 Batch Endpoint Limit
**Location:** `/api/plays/batch` endpoint
**Change:** Add max 500 IDs validation

```python
@app.get("/api/plays/batch")
async def get_plays_batch(play_ids: str):
    ids = [int(id.strip()) for id in play_ids.split(",") if id.strip()]
    if len(ids) > 500:
        raise HTTPException(400, f"Maximum 500 IDs allowed, got {len(ids)}")
    # ... rest of handler
```

#### 1.2 FAISS Internal Fetch Optimization
**Location:** `/api/search` endpoint
**Change:** Reduce internal k from hardcoded 1000 to dynamic value

```python
# Current:
faiss_indices, distances = search_svc.search(request.query, k=1000)

# New:
internal_k = min(1000, request.offset + request.limit + 100)
faiss_indices, distances = search_svc.search(request.query, k=internal_k)
```

### Established Defaults (Source of Truth)

| Endpoint | Default Limit | Max Limit |
|----------|--------------|-----------|
| `/api/search` | 20 | 100 |
| `/api/plays/timeline` | 20 | 100 |
| `/api/plays/batch` | N/A | 500 (new) |
| `/api/graph/connections` | 20 | 20 |

---

## Layer 2: Tool Schemas & Handlers (Agent Package)

### Changes to `packages/agent/src/tools/schemas.ts`

#### 2.1 SemanticSearchParams
Update description to match backend default:
```typescript
limit: Schema.optional(Schema.Number.pipe(
  Schema.description("Maximum results (1-100, default 20)")
))
```

#### 2.2 SearchPlaysParams
Update description to match handler default:
```typescript
limit: Schema.optional(Schema.Number.pipe(
  Schema.description("Maximum results (1-100, default 20)")
))
```

#### 2.3 QueryCachedNeighborsParams (NEW)
Add limit parameter:
```typescript
limit: Schema.optional(Schema.Number.pipe(
  Schema.description("Maximum neighbors to return (1-100, default 20)")
))
```

#### 2.4 FetchLinkParams (NEW)
Add max_words parameter:
```typescript
max_words: Schema.optional(Schema.Number.pipe(
  Schema.description("Maximum words to return (default 5000, max 10000)")
))
```

### Changes to `packages/agent/src/tools/definitions.ts`

Update tool descriptions to reflect actual behavior:

- **SemanticSearchTool**: Clarify "default 20, max 100"
- **SearchPlaysTool**: Clarify "default 20, max 100"
- **FetchLinkTool**: Add "Content truncated to max_words (default 5000)"
- **QueryCachedNeighborsTool**: Add "Returns up to limit neighbors (default 20)"

### Changes to `packages/agent/src/tools/handlers.ts`

#### 2.5 search_plays Handler
Set explicit default before API call:
```typescript
const limit = params.limit ?? 20;
const response = await faissClient.timeline({ ...params, limit });
```

#### 2.6 semantic_search Handler
Set explicit default before API call:
```typescript
const limit = params.limit ?? 20;
const response = await faissClient.search({ ...params, limit });
```

#### 2.7 fetch_link Handler
Add word truncation after fetch:
```typescript
const maxWords = params.max_words ?? 5000;
const content = truncateToWords(rawContent, maxWords);
```

#### 2.8 query_cached_neighbors Handler
Add limit filtering:
```typescript
const limit = params.limit ?? 20;
const neighbors = allNeighbors.slice(0, limit);
```

### New Utility Function

Add to `packages/agent/src/tools/handlers.ts` or separate utils file:
```typescript
function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "\n\n[Content truncated...]";
}
```

---

## Layer 3: System Prompt Audit

### File: `packages/agent/src/prompts/system-prompt.ts`

#### 3.1 Tool Selection Guide Updates

Ensure all tool defaults are documented accurately:

| Tool | Documented Default | Documented Max |
|------|-------------------|----------------|
| semantic_search | 20 | 100 |
| search_plays | 20 | 100 |
| graph_connections | 20 | 20 |
| query_cached_neighbors | 20 | 100 |
| fetch_link | 5000 words | 10000 words |

#### 3.2 New Section: Result Size Guidance

Add after Tool Selection Guide:

```markdown
### Result Size Guidance

**Search tools (semantic_search, search_plays):**
- Use limit=5-10 for quick existence checks
- Use default (20) for standard exploration
- Use limit=50-100 only for comprehensive research

**fetch_link:**
- Content auto-truncated to 5000 words by default
- Set max_words=10000 for longer articles when needed
- Very long pages will note "[Content truncated...]"

**Graph tools:**
- query_cached_neighbors: Returns 20 by default, increase if exploring dense networks
- graph_connections: Fixed 20 results per query type
- explore_graph: Fixed 20 results, merges into local cache
```

#### 3.3 fetch_link Guidance Update

Update existing fetch_link documentation to mention truncation:
```markdown
**fetch_link** - Fetches and extracts content from URLs via Jina Reader.
Content is truncated to 5000 words by default to manage context.
Use max_words parameter for longer content when necessary.
```

---

## Implementation Order

1. **Layer 1**: Backend changes (FAISS API) - establishes ground truth
2. **Deploy**: Push to droplet, verify endpoints work
3. **Layer 2**: Schema and handler changes - aligns with backend
4. **Layer 3**: System prompt audit - documents reality
5. **Build & Test**: Verify pnpm check passes
6. **Commit**: Logical commits per layer

## Verification

After implementation:
- [ ] `/api/plays/batch` returns 400 for >500 IDs
- [ ] `/api/search` uses optimized internal k value
- [ ] Tool schemas have updated descriptions
- [ ] Handlers apply explicit defaults
- [ ] fetch_link truncates content
- [ ] query_cached_neighbors respects limit
- [ ] System prompt matches all tool behaviors
- [ ] `pnpm check` passes
- [ ] `pnpm build` passes
