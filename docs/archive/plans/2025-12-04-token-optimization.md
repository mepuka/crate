# Token Optimization Implementation Plan

**Created:** 2025-12-04
**Status:** Ready for Implementation
**Estimated Impact:** 60-75% token reduction (~$24K/year savings at current usage)

## Executive Summary

This plan implements three complementary token optimization strategies:

1. **Prompt Caching** - Cache static system prompt sections (~85% of prompt) using Anthropic's prompt caching
2. **Field Dropping** - Remove unused fields from tool responses (image_uri, thumbnail_uri, show)
3. **Schema Compression** - Create compact response schemas for graph/play data

Combined, these reduce per-iteration costs from ~13,055 tokens to ~4,500 tokens.

---

## Current State Analysis

### Token Breakdown (per iteration)

| Component | Tokens | % of Total |
|-----------|--------|------------|
| System prompt (static) | ~8,500 | 65% |
| System prompt (dynamic) | ~1,500 | 12% |
| Tool responses | ~2,500 | 19% |
| Model output | ~555 | 4% |
| **Total** | ~13,055 | 100% |

### Key Files

- `packages/agent/src/prompts/system-prompt.ts` - Modular prompt builder (1440 lines)
- `packages/agent/src/tools/schemas.ts` - Tool I/O schemas (462 lines)
- `packages/agent/src/tools/handlers.ts` - Tool handler implementations
- `packages/agent/src/MusicAgent.ts` - Agent orchestration
- `packages/agent/src/prompts/CratePrompt.ts` - Simple prompt wrapper

---

## Phase 1: Prompt Caching (Highest ROI)

**Goal:** Cache static prompt sections to reduce input token costs by 88-90%

### Background

Anthropic's prompt caching allows marking message content with `cache_control: { type: "ephemeral" }` to cache and reuse across requests. @effect/ai supports this via provider options.

### Current Structure (system-prompt.ts)

```
STATIC SECTIONS (~85% of system prompt, ~8,500 tokens):
├── CORE_IDENTITY
├── PHILOSOPHY
├── TONE
├── STORYTELLING
├── KEXP_CULTURE
├── KEXP_DJ_COMMENT_PATTERNS
├── KEXP_ROTATION
├── DATA_MODEL
├── MBID_INSTRUCTION
├── GRAPH_INSTRUCTION
├── INSIGHT_TYPES
├── TOOLS
├── INSIGHT_CONTINUITY
├── RESEARCH_PROCESS
├── WHEN_ZERO_INSIGHTS
├── GUIDELINES
├── TEMPORAL_REASONING
├── CONFIDENCE
└── CONSTRAINTS

DYNAMIC SECTIONS (~15%, ~1,500 tokens):
├── formatTimeContext(date)
├── formatShowContext(show)
├── formatRecentInsights(insights)
└── formatPlayData(play)
```

### Implementation Tasks

#### Task 1.1: Create Static Prompt Constant

**File:** `packages/agent/src/prompts/system-prompt.ts`

**What to do:**
1. Add a new exported constant `STATIC_SYSTEM_PROMPT` that concatenates all static sections
2. This will be the cacheable portion

**Code to add at line ~1305 (before PROMPT BUILDER section):**

```typescript
// =============================================================================
// CACHEABLE STATIC PROMPT
// =============================================================================

/**
 * Combined static sections for prompt caching.
 *
 * This string contains all sections that never change between requests.
 * It should be sent with cache_control: { type: "ephemeral" } to enable
 * Anthropic prompt caching.
 *
 * Token count: ~8,500 tokens (85% of total system prompt)
 */
export const STATIC_SYSTEM_PROMPT = [
  CORE_IDENTITY,
  PHILOSOPHY,
  TONE,
  STORYTELLING,
  KEXP_CULTURE,
  KEXP_DJ_COMMENT_PATTERNS,
  KEXP_ROTATION,
  DATA_MODEL,
  MBID_INSTRUCTION,
  GRAPH_INSTRUCTION,
  INSIGHT_TYPES,
  TOOLS,
  INSIGHT_CONTINUITY,
  RESEARCH_PROCESS,
  WHEN_ZERO_INSIGHTS,
  GUIDELINES,
  TEMPORAL_REASONING,
  CONFIDENCE,
  CONSTRAINTS,
].join("\n\n---\n\n");
```

**Verification:** Run `pnpm build` to ensure TypeScript compiles

---

#### Task 1.2: Create buildDynamicPrompt Function

**File:** `packages/agent/src/prompts/system-prompt.ts`

**What to do:**
1. Add a new function that builds only the dynamic portions
2. This is what changes per-request (time, show, insights)

**Code to add after STATIC_SYSTEM_PROMPT:**

```typescript
/**
 * Build only the dynamic portions of the system prompt.
 *
 * This is combined with STATIC_SYSTEM_PROMPT at runtime.
 * The dynamic portion is NOT cached.
 *
 * Token count: ~1,500 tokens (15% of total system prompt)
 */
export function buildDynamicPrompt(ctx: PromptContext): string {
  const sections: string[] = [];

  sections.push(formatTimeContext(ctx.currentTime));

  if (ctx.showContext) {
    sections.push(formatShowContext(ctx.showContext));
  }

  if (ctx.recentInsights) {
    sections.push(formatRecentInsights(ctx.recentInsights));
  }

  return sections.join("\n\n---\n\n");
}
```

**Verification:** TypeScript compiles, function is exported

---

#### Task 1.3: Create Cacheable Message Builder

**File:** `packages/agent/src/prompts/system-prompt.ts`

**What to do:**
1. Add a new function that returns messages structured for caching
2. Returns array with static (cacheable) and dynamic (non-cacheable) parts separate

**Code to add:**

```typescript
/**
 * Message structure for prompt caching.
 *
 * The `cache` field indicates whether this content block should be cached.
 * When using with @effect/ai Anthropic provider, set cache_control on cached blocks.
 */
export interface CacheableMessage {
  role: "system" | "user";
  content: string;
  cache?: boolean;
}

/**
 * Create prompt messages structured for Anthropic prompt caching.
 *
 * Returns separate message blocks:
 * 1. Static system prompt (cache: true) - ~8,500 tokens, cached
 * 2. Dynamic system prompt (cache: false) - ~1,500 tokens, not cached
 * 3. User message with play data (cache: false) - varies
 *
 * @example
 * ```ts
 * const messages = createCacheablePromptMessages(ctx);
 * // messages[0].cache === true  (static, cacheable)
 * // messages[1].cache === false (dynamic)
 * // messages[2].cache === false (play data)
 * ```
 */
export function createCacheablePromptMessages(ctx: PromptContext): CacheableMessage[] {
  const messages: CacheableMessage[] = [
    {
      role: "system",
      content: STATIC_SYSTEM_PROMPT,
      cache: true,
    },
    {
      role: "system",
      content: buildDynamicPrompt(ctx),
      cache: false,
    },
  ];

  if (ctx.playData) {
    messages.push({
      role: "user",
      content: buildPlayMessage(ctx.playData),
      cache: false,
    });
  }

  return messages;
}
```

**Verification:** TypeScript compiles, new function is exported

---

#### Task 1.4: Update CratePrompt Namespace Export

**File:** `packages/agent/src/prompts/system-prompt.ts`

**What to do:**
1. Add new exports to the CratePrompt namespace object at the bottom of the file

**Code to modify (around line 1406):**

```typescript
export const CratePrompt = {
  // Static sections
  CORE_IDENTITY,
  // ... existing exports ...

  // NEW: Cacheable prompt building
  STATIC_SYSTEM_PROMPT,
  buildDynamicPrompt,
  createCacheablePromptMessages,

  // Formatting functions
  formatTimeContext,
  // ... rest of existing exports ...
};
```

**Verification:** `pnpm build && pnpm check` passes

---

#### Task 1.5: Update MusicAgent to Use Cached Prompts

**File:** `packages/agent/src/MusicAgent.ts`

**What to do:**
1. Import the new cacheable message builder
2. Modify prompt construction to use cache markers
3. Pass cache_control to Anthropic provider

**This task requires exploring @effect/ai's Anthropic provider options first.**

**Research step:**
```bash
grep -r "cache_control" docs/effect-source/ai/
grep -r "ephemeral" docs/effect-source/ai/
```

**Expected change pattern:**
```typescript
// Before:
const prompt = Prompt.make([{
  role: "system",
  content: buildSystemPrompt(ctx),
}]);

// After:
const messages = createCacheablePromptMessages(ctx);
const prompt = Prompt.make(
  messages.map(msg => ({
    role: msg.role,
    content: msg.content,
    // Apply cache control for Anthropic
    ...(msg.cache ? { cache_control: { type: "ephemeral" } } : {}),
  }))
);
```

**Verification:**
1. Run agent with `ANTHROPIC_DEBUG=1` to see API requests
2. Confirm `cache_control` appears in request
3. Monitor Anthropic dashboard for cache hits

---

## Phase 2: Drop Unused Fields (Quick Win)

**Goal:** Remove fields from tool responses that the model doesn't need

### Analysis of PlayResultSchema

Current fields in `PlayResultSchema` (schemas.ts:40-61):

| Field | Used by Model? | Action |
|-------|---------------|--------|
| id | Yes - play identification | Keep |
| artist | Yes - core info | Keep |
| song | Yes - core info | Keep |
| similarity | Yes - search relevance | Keep |
| album | Yes - release context | Keep |
| airdate | Yes - temporal reasoning | Keep |
| release_date | Maybe - duplicates album | Consider dropping |
| labels | Yes - connection insights | Keep |
| rotation_status | Yes - discovery context | Keep |
| is_local | Yes - KEXP mission | Keep |
| is_live | Yes - performance context | Keep |
| is_request | Yes - audience engagement | Keep |
| comment | Yes - PRIMARY source | Keep |
| show | No - never referenced | **DROP** |
| image_uri | No - visual, not text | **DROP** |
| thumbnail_uri | No - visual, not text | **DROP** |
| artist_mbid | Yes - graph queries | Keep |
| recording_mbid | Yes - graph queries | Keep |
| release_mbid | Yes - graph queries | Keep |
| release_group_mbid | Yes - graph queries | Keep |

**Estimated savings:** ~37% reduction in play result tokens (3 fields × ~50 tokens each = 150 tokens/result)

### Implementation Tasks

#### Task 2.1: Create Compact Play Schema

**File:** `packages/agent/src/tools/schemas.ts`

**What to do:**
1. Add a new `PlayResultCompact` schema that omits unused fields
2. Keep original `PlayResultSchema` for API compatibility

**Code to add after PlayResultSchema (around line 62):**

```typescript
/**
 * Compact play result for tool responses - omits fields the model doesn't use.
 *
 * Drops: show, image_uri, thumbnail_uri (saves ~150 tokens per result)
 *
 * Use this for tool responses; use PlayResultSchema for API parsing.
 */
export const PlayResultCompact = Schema.Struct({
  id: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  similarity: Schema.Number,
  album: Schema.NullOr(Schema.String),
  airdate: Schema.String,
  labels: Schema.Array(Schema.String),
  rotation_status: Schema.NullOr(Schema.String),
  is_local: Schema.Boolean,
  is_live: Schema.Boolean,
  is_request: Schema.Boolean,
  comment: Schema.NullOr(Schema.String),
  artist_mbid: Schema.Array(Schema.String),
  recording_mbid: Schema.NullOr(Schema.String),
  release_mbid: Schema.NullOr(Schema.String),
  release_group_mbid: Schema.NullOr(Schema.String),
})
export type PlayResultCompact = typeof PlayResultCompact.Type
```

**Verification:** TypeScript compiles

---

#### Task 2.2: Create transformToCompact Helper

**File:** `packages/agent/src/services/http-utils.ts`

**What to do:**
1. Add a function to transform full PlayResult to compact version
2. This strips the unused fields

**Code to add:**

```typescript
import type { PlayResultCompact } from "../tools/schemas.js";

/**
 * Transform a full play result to compact form for tool responses.
 *
 * Drops: show, image_uri, thumbnail_uri, release_date
 */
export function toCompactPlayResult(play: PlayResult, similarity: number = 1.0): PlayResultCompact {
  return {
    id: play.id,
    artist: play.artist,
    song: play.song,
    similarity,
    album: play.album,
    airdate: play.airdate,
    labels: play.labels,
    rotation_status: play.rotation_status,
    is_local: play.is_local,
    is_live: play.is_live,
    is_request: play.is_request,
    comment: play.comment,
    artist_mbid: play.artist_mbid,
    recording_mbid: play.recording_mbid,
    release_mbid: play.release_mbid,
    release_group_mbid: play.release_group_mbid,
  };
}
```

**Verification:** TypeScript compiles

---

#### Task 2.3: Update Tool Response Schemas

**File:** `packages/agent/src/tools/schemas.ts`

**What to do:**
1. Update `SearchPlaysResponse` and `SemanticSearchResponse` to use compact schema

**Code to modify (around lines 109-116 and 146-154):**

```typescript
// Before:
export const SearchPlaysResponse = Schema.Struct({
  results: Schema.Array(PlayResultSchema),
  // ...
})

// After:
export const SearchPlaysResponse = Schema.Struct({
  results: Schema.Array(PlayResultCompact),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  _error: Schema.optional(Schema.String)
})

// Similarly for SemanticSearchResponse
export const SemanticSearchResponse = Schema.Struct({
  results: Schema.Array(PlayResultCompact),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  query: Schema.String,
  _error: Schema.optional(Schema.String)
})
```

**Verification:** `pnpm build && pnpm check`

---

#### Task 2.4: Update Tool Handlers to Use Compact Transform

**File:** `packages/agent/src/tools/handlers.ts`

**What to do:**
1. Import `toCompactPlayResult`
2. Replace `transformPlayResult` calls with `toCompactPlayResult`

**Code to modify (around line 145-147):**

```typescript
// Before:
const results = response.results.map((play) =>
  transformPlayResult(play, 1.0)
);

// After:
const results = response.results.map((play) =>
  toCompactPlayResult(play, 1.0)
);
```

**Verification:** `pnpm build && pnpm check`

---

## Phase 3: Schema Compression (Graph Connections)

**Goal:** Reduce verbosity in graph connection responses

### Analysis of ConnectionNode

Current fields in `ConnectionNode` (schemas.ts:348-360):

| Field | Always Present? | Compression Opportunity |
|-------|-----------------|------------------------|
| mbid | Yes | None |
| name | Yes | None |
| node_type | Yes | Could use abbreviations |
| relationship_type | Yes | None |
| attributes | Often null | Drop when null |
| begin_date | Often null | Drop when null |
| end_date | Often null | Drop when null |
| via_mbid | Often null | Drop when null |
| via_name | Often null | Drop when null |

**Strategy:** Create compact response that omits null fields entirely

### Implementation Tasks

#### Task 3.1: Create Compact Connection Schema

**File:** `packages/agent/src/tools/schemas.ts`

**What to do:**
1. Add `ConnectionNodeCompact` that uses optional instead of nullable
2. This allows omitting null fields from JSON output

**Code to add after ConnectionNode:**

```typescript
/**
 * Compact connection node - uses optional fields instead of nullable.
 *
 * When serialized to JSON, undefined fields are omitted entirely,
 * reducing token usage for sparse connection data.
 */
export const ConnectionNodeCompact = Schema.Struct({
  mbid: Schema.String,
  name: Schema.String,
  node_type: Schema.Literal("artist", "band", "label", "recording", "work", "area", "place"),
  relationship_type: Schema.String,
  // Optional fields - omitted when not present (vs null which serializes)
  attributes: Schema.optional(Schema.Array(Schema.String)),
  begin_date: Schema.optional(Schema.String),
  end_date: Schema.optional(Schema.String),
  via_mbid: Schema.optional(Schema.String),
  via_name: Schema.optional(Schema.String),
})
export type ConnectionNodeCompact = typeof ConnectionNodeCompact.Type
```

**Verification:** TypeScript compiles

---

#### Task 3.2: Create Connection Compaction Helper

**File:** `packages/agent/src/services/GraphConnectionsClient.ts` (or new file)

**What to do:**
1. Add function to transform ConnectionNode to ConnectionNodeCompact
2. Drops null values instead of keeping them

**Code to add:**

```typescript
import type { ConnectionNode, ConnectionNodeCompact } from "../tools/schemas.js";

/**
 * Transform connection node to compact form, omitting null fields.
 */
export function toCompactConnection(node: ConnectionNode): ConnectionNodeCompact {
  const compact: ConnectionNodeCompact = {
    mbid: node.mbid,
    name: node.name,
    node_type: node.node_type,
    relationship_type: node.relationship_type,
  };

  // Only include non-null optional fields
  if (node.attributes !== null && node.attributes.length > 0) {
    compact.attributes = node.attributes;
  }
  if (node.begin_date !== null) {
    compact.begin_date = node.begin_date;
  }
  if (node.end_date !== null) {
    compact.end_date = node.end_date;
  }
  if (node.via_mbid !== null) {
    compact.via_mbid = node.via_mbid;
  }
  if (node.via_name !== null) {
    compact.via_name = node.via_name;
  }

  return compact;
}
```

**Verification:** TypeScript compiles

---

#### Task 3.3: Update Graph Response Schemas

**File:** `packages/agent/src/tools/schemas.ts`

**What to do:**
1. Update `GraphConnectionsResponse` and `ExploreGraphResponse` to use compact nodes

**Code to modify:**

```typescript
export const GraphConnectionsResponse = Schema.Struct({
  query_type: GraphQueryType,
  source_mbids: Schema.Array(Schema.String),
  connections: Schema.Array(ConnectionNodeCompact), // Changed
  total: Schema.Number,
  query_time_ms: Schema.Number,
  _error: Schema.optional(Schema.String)
})

export const ExploreGraphResponse = Schema.Struct({
  summary: Schema.String,
  new_nodes_count: Schema.Number,
  new_edges_count: Schema.Number,
  neighbors: Schema.optional(Schema.Array(ConnectionNodeCompact)), // Changed
  _error: Schema.optional(Schema.String)
})
```

**Verification:** `pnpm build && pnpm check`

---

#### Task 3.4: Update Graph Handlers

**File:** `packages/agent/src/tools/handlers.ts`

**What to do:**
1. Apply `toCompactConnection` transform in graph tool handlers

**Verification:** `pnpm build && pnpm check`

---

## Phase 4: Verification & Monitoring

### Task 4.1: Add Token Counting Instrumentation

**What to do:**
1. Add logging to track token usage before/after changes
2. Use Anthropic's usage response fields

**Code pattern:**

```typescript
Effect.gen(function* () {
  const response = yield* model.complete(prompt);

  yield* Effect.log(`Token usage: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}, cache_read=${response.usage.cache_read_input_tokens ?? 0}`);

  return response;
})
```

---

### Task 4.2: Create Benchmark Script

**File:** `packages/agent/src/scripts/benchmark-tokens.ts`

**What to do:**
1. Create script that runs agent on sample plays
2. Measures token usage with and without optimizations
3. Reports savings

---

### Task 4.3: Monitor Production Metrics

**What to do:**
1. Check Anthropic dashboard for cache hit rates
2. Compare costs before/after deployment
3. Verify model quality hasn't degraded

---

## Implementation Order

**Recommended sequence:**

1. **Phase 2 first** (Field Dropping) - Lowest risk, immediate benefit
2. **Phase 3 second** (Schema Compression) - Similar to Phase 2, incremental
3. **Phase 1 last** (Prompt Caching) - Highest impact but needs @effect/ai research

Each phase can be deployed independently.

---

## Success Metrics

| Metric | Before | Target | Measurement |
|--------|--------|--------|-------------|
| Tokens per iteration | ~13,055 | ~4,500 | Anthropic usage API |
| Cache hit rate | 0% | >90% | Anthropic dashboard |
| Monthly cost | ~$3,000 | ~$500 | Billing |
| Response latency | baseline | -10% | Tracing |
| Insight quality | baseline | no change | Manual review |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cache misses | Medium | Low | TTL tuning, monitor hit rate |
| Field needed later | Low | Medium | Keep full schema for API layer |
| @effect/ai cache API changes | Low | High | Pin version, test before upgrade |
| Model quality degradation | Low | High | A/B test, manual review samples |

---

## Appendix: Token Estimation Details

### System Prompt Breakdown

```
CORE_IDENTITY:           ~150 tokens
PHILOSOPHY:              ~300 tokens
TONE:                    ~200 tokens
STORYTELLING:            ~400 tokens
KEXP_CULTURE:            ~350 tokens
KEXP_DJ_COMMENT_PATTERNS: ~300 tokens
KEXP_ROTATION:           ~150 tokens
DATA_MODEL:              ~250 tokens
MBID_INSTRUCTION:        ~400 tokens
GRAPH_INSTRUCTION:       ~2,500 tokens (largest section!)
INSIGHT_TYPES:           ~800 tokens
TOOLS:                   ~1,200 tokens
INSIGHT_CONTINUITY:      ~300 tokens
RESEARCH_PROCESS:        ~400 tokens
WHEN_ZERO_INSIGHTS:      ~150 tokens
GUIDELINES:              ~200 tokens
TEMPORAL_REASONING:      ~200 tokens
CONFIDENCE:              ~150 tokens
CONSTRAINTS:             ~300 tokens
─────────────────────────────────────
TOTAL STATIC:            ~8,700 tokens

Dynamic sections:        ~1,500 tokens
─────────────────────────────────────
TOTAL SYSTEM PROMPT:     ~10,200 tokens
```

### Tool Response Sizes

```
PlayResult (full):       ~150 tokens
PlayResult (compact):    ~95 tokens  (-37%)

ConnectionNode (full):   ~80 tokens
ConnectionNode (compact): ~50 tokens (-38%)

Typical search (10 results): 1,500 → 950 tokens
Typical graph (20 nodes):    1,600 → 1,000 tokens
```
