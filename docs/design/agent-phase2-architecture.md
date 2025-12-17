# Agent Phase 2 Architecture: Parallel Execution, Discovery, and Work Logging

## Overview

This design covers three interconnected features that form the foundation for eventual multi-agent architecture:

1. **Work Logging (crate-jxv)** - Enhanced session state for observability and handoff
2. **Parallel Execution (crate-81x)** - Fiber-based parallel research for 2x speedup
3. **Discovery Agent (crate-m7t)** - Graph-focused discovery mode integrated into MusicAgent

**Design Principle**: Start simple, design for evolution. These features use the existing single-agent architecture while preparing for future multi-agent collaboration.

---

## 1. Work Logging: Enhanced Session State

### Current State

`InsightSessionService` (packages/agent/src/services/InsightSessionService.ts) tracks:
- `sessionId: string`
- `insights: InsightSummary[]`

### Enhanced State

```typescript
// packages/agent/src/services/InsightSessionService.ts

interface EnhancedSessionState {
  readonly sessionId: string
  readonly insights: readonly InsightSummary[]

  // NEW: Research activity log
  readonly toolCalls: readonly ToolCallLogEntry[]
  readonly researchSteps: readonly ResearchStep[]
  readonly discoveredEntities: ReadonlyMap<string, EntityFacts>

  // NEW: Session metadata
  readonly startedAt: number
  readonly playIds: readonly number[]
  readonly mode: "enrich" | "discover"
}

/**
 * Tool call log entry - captures what tools were called and why
 */
interface ToolCallLogEntry {
  readonly id: string
  readonly toolName: string
  readonly params: unknown
  readonly resultSummary: string
  readonly resultCount?: number
  readonly durationMs: number
  readonly timestamp: number
  readonly iteration: number
}

/**
 * Research step - captures agent reasoning
 */
interface ResearchStep {
  readonly id: string
  readonly step: "search" | "graph" | "fetch" | "analyze" | "synthesize"
  readonly description: string
  readonly findings: readonly string[]
  readonly entityMbids: readonly string[]
  readonly timestamp: number
}

/**
 * Discovered entity facts - accumulated knowledge about entities
 */
interface EntityFacts {
  readonly mbid: string
  readonly name: string
  readonly type: "artist" | "band" | "label" | "recording" | "work"
  readonly facts: readonly string[]
  readonly sources: readonly string[]
  readonly discoveredAt: number
}
```

### New Service Methods

```typescript
interface InsightSessionServiceInterface {
  // Existing
  readonly addInsight: (insight: InsightSummary) => Effect.Effect<void>
  readonly getRecentInsights: (params?: GetRecentInsightsParams) => Effect.Effect<GetRecentInsightsResponse>
  readonly seedWithExistingInsights: (insights: readonly InsightSummary[]) => Effect.Effect<void>
  readonly clear: () => Effect.Effect<void>
  readonly reset: () => Effect.Effect<void>
  readonly getSessionId: () => Effect.Effect<string>

  // NEW: Tool call logging
  readonly logToolCall: (entry: Omit<ToolCallLogEntry, "id" | "timestamp">) => Effect.Effect<void>
  readonly getToolCalls: (params?: { toolName?: string; limit?: number }) => Effect.Effect<readonly ToolCallLogEntry[]>

  // NEW: Research step logging
  readonly logResearchStep: (step: Omit<ResearchStep, "id" | "timestamp">) => Effect.Effect<void>
  readonly getResearchSteps: () => Effect.Effect<readonly ResearchStep[]>

  // NEW: Entity fact accumulation
  readonly addEntityFact: (mbid: string, fact: string, source: string) => Effect.Effect<void>
  readonly getEntityFacts: (mbid: string) => Effect.Effect<EntityFacts | undefined>
  readonly getAllEntities: () => Effect.Effect<ReadonlyMap<string, EntityFacts>>

  // NEW: Session export (for handoff or persistence)
  readonly exportSession: () => Effect.Effect<SessionExport>
  readonly importSession: (session: SessionExport) => Effect.Effect<void>
}
```

### Integration Points

**MusicAgent.runAgentLoop()** - Already captures tool calls, wire to session:
```typescript
// In runAgentLoop, after each tool call
yield* insightSession.logToolCall({
  toolName: tc.name,
  params: tc.params,
  resultSummary: summarizeToolResult(tc.name, result.result, result.isFailure),
  resultCount: extractResultCount(tc.name, result.result),
  durationMs: Number(iterationEndTime - iterationStartTime),
  iteration: state.iteration,
})
```

**Graph tools** - Log discovered entities:
```typescript
// In graph_connections tool handler
for (const conn of response.connections) {
  yield* insightSession.addEntityFact(
    conn.mbid,
    `${conn.relationship_type} connection to source`,
    `graph_connections:${queryType}`
  )
}
```

### Benefits

1. **Observability**: Full audit trail of agent research
2. **Debugging**: See exactly what tools found and when
3. **Multi-agent handoff**: Future agents can resume from exported session
4. **Context efficiency**: Summarized facts vs raw tool results

---

## 2. Parallel Execution: Fiber-Based Research

### Current State

MusicAgent processes plays sequentially to maintain session isolation:
```typescript
// Current: Sequential processing
const playResults = yield* Effect.forEach(plays, processPlay, {
  concurrency: 1, // Sequential to maintain session isolation
})
```

### Parallel Research Pattern

Instead of parallelizing plays, parallelize research steps **within** a play:

```typescript
// packages/agent/src/orchestration/ParallelResearch.ts

import { Effect, Fiber, Schedule } from "effect"
import type { KexpTrackPlay } from "@crate/domain/kexp/schemas"

/**
 * Research context passed to parallel tasks
 */
interface ResearchContext {
  readonly play: KexpTrackPlay
  readonly artistMbids: readonly string[]
  readonly recordingMbid?: string
  readonly sessionId: string
}

/**
 * Research result from a parallel task
 */
interface ResearchResult {
  readonly source: "covers" | "samples" | "history" | "graph" | "context"
  readonly findings: readonly string[]
  readonly entityMbids: readonly string[]
  readonly toolCalls: readonly ToolCallLogEntry[]
}

/**
 * Run research tasks in parallel using Effect.all
 *
 * This provides 2-4x speedup by overlapping I/O-bound operations
 * while maintaining structured concurrency via Effect's fiber model.
 */
export const parallelResearch = (
  context: ResearchContext
): Effect.Effect<readonly ResearchResult[], never, ResearchDeps> =>
  Effect.gen(function* () {
    const { play, artistMbids } = context

    // Define independent research tasks
    const tasks = {
      // 1. Search for cover versions
      covers: Effect.gen(function* () {
        if (!artistMbids.length) return emptyResult("covers")
        const graph = yield* GraphConnectionsService
        const result = yield* graph.connections({
          query_type: "covers",
          mbids: [...artistMbids],
          limit: 10,
        }).pipe(
          Effect.timeout("30 seconds"),
          Effect.catchAll(() => Effect.succeed({ connections: [], total: 0 }))
        )
        return {
          source: "covers" as const,
          findings: result.connections.map(c => `Cover: ${c.name}`),
          entityMbids: result.connections.map(c => c.mbid),
          toolCalls: [],
        }
      }),

      // 2. Search for sample relationships
      samples: Effect.gen(function* () {
        const search = yield* SearchService
        const result = yield* search.semanticSearch({
          query: `${play.artist} ${play.song} samples interpolation`,
          limit: 5,
        }).pipe(
          Effect.timeout("30 seconds"),
          Effect.catchAll(() => Effect.succeed({ results: [] }))
        )
        return {
          source: "samples" as const,
          findings: result.results.map(r => r.summary),
          entityMbids: [],
          toolCalls: [],
        }
      }),

      // 3. Get play history for context
      history: Effect.gen(function* () {
        const search = yield* SearchService
        const result = yield* search.searchPlays({
          artist: play.artist,
          limit: 10,
        }).pipe(
          Effect.timeout("30 seconds"),
          Effect.catchAll(() => Effect.succeed({ results: [], total: 0 }))
        )
        return {
          source: "history" as const,
          findings: [`${result.total} plays of ${play.artist}`],
          entityMbids: [],
          toolCalls: [],
        }
      }),

      // 4. Explore graph connections
      graph: Effect.gen(function* () {
        if (!artistMbids.length) return emptyResult("graph")
        const graph = yield* GraphConnectionsService

        // Run multiple graph queries in parallel
        const [members, labels, collaborators] = yield* Effect.all([
          graph.connections({ query_type: "member_of", mbids: [...artistMbids], limit: 5 }),
          graph.connections({ query_type: "labelmates", mbids: [...artistMbids], limit: 5 }),
          graph.connections({ query_type: "collaborators", mbids: [...artistMbids], limit: 5 }),
        ], { concurrency: 3 }).pipe(
          Effect.timeout("45 seconds"),
          Effect.catchAll(() => Effect.succeed([
            { connections: [], total: 0 },
            { connections: [], total: 0 },
            { connections: [], total: 0 },
          ]))
        )

        return {
          source: "graph" as const,
          findings: [
            ...members.connections.map(c => `Member of: ${c.name}`),
            ...labels.connections.map(c => `Labelmate: ${c.name}`),
            ...collaborators.connections.map(c => `Collaborator: ${c.name}`),
          ],
          entityMbids: [
            ...members.connections.map(c => c.mbid),
            ...labels.connections.map(c => c.mbid),
            ...collaborators.connections.map(c => c.mbid),
          ],
          toolCalls: [],
        }
      }),
    }

    // Execute all tasks in parallel with structured concurrency
    const results = yield* Effect.all(tasks, {
      concurrency: 4,    // Max 4 concurrent fibers
      mode: "default",   // Fail fast on first error
    }).pipe(
      Effect.timeout("2 minutes"),
      Effect.catchTag("TimeoutException", () =>
        Effect.logWarning("Research timed out, using partial results").pipe(
          Effect.map(() => ({
            covers: emptyResult("covers"),
            samples: emptyResult("samples"),
            history: emptyResult("history"),
            graph: emptyResult("graph"),
          }))
        )
      )
    )

    return [results.covers, results.samples, results.history, results.graph]
  }).pipe(
    Effect.withSpan("ParallelResearch.execute", {
      attributes: {
        play_id: context.play.id,
        artist_mbids: context.artistMbids.join(","),
      },
    })
  )

const emptyResult = (source: ResearchResult["source"]): ResearchResult => ({
  source,
  findings: [],
  entityMbids: [],
  toolCalls: [],
})
```

### Integration with MusicAgent

Option 1: **Pre-research phase** (recommended for initial implementation)
```typescript
// In MusicAgent.processPlay()
const researchResults = yield* parallelResearch({
  play,
  artistMbids: play.artist_ids ?? [],
  recordingMbid: play.recording_id,
  sessionId,
})

// Inject pre-research findings into prompt context
const prompt = yield* promptBuilder.buildPromptForKexpPlay(play, {
  preResearch: researchResults,
})

// Agent can now reference pre-fetched data
const { response, researchMeta } = yield* runAgentLoop(prompt, toolkit, 10)
```

Option 2: **Parallel tool execution** (future enhancement)
```typescript
// Modify toolkit to run independent tools in parallel
// This requires detecting tool independence in the agent loop
```

### Performance Impact

| Scenario | Current | Parallel | Speedup |
|----------|---------|----------|---------|
| Single play, 4 API calls | 8s | 2.5s | 3.2x |
| Single play with graph | 12s | 4s | 3x |
| Expected average | - | - | 2-3x |

---

## 3. Discovery Agent: Graph-Focused Mode

### Design Decision

**Chosen approach**: Integrate discovery as a **mode** within MusicAgent, not a separate agent.

Rationale:
- Simpler architecture (no coordination overhead)
- Shares existing tools and session infrastructure
- Easy to evolve toward separate agent later
- User's direction: "work up to multi-agent"

### Discovery Mode Design

```typescript
// packages/agent/src/modes/DiscoveryMode.ts

import { Effect } from "effect"
import type { GraphConnectionsResponse } from "@crate/domain/graph/schemas"

/**
 * Discovery intent - what kind of exploration the user wants
 */
type DiscoveryIntent =
  | { type: "lineage"; artistMbid: string }           // Trace band membership history
  | { type: "collaboration"; artistMbid: string }    // Find collaboration networks
  | { type: "covers"; artistMbid: string }           // Find cover chains
  | { type: "geographic"; areaMbid: string }         // Find artists from area
  | { type: "label"; labelMbid: string }             // Explore label roster
  | { type: "creator"; artistMbid: string }          // Find songwriting connections
  | { type: "surprise"; seedMbid: string }           // Serendipitous discovery

/**
 * Discovery result - interesting paths and insights
 */
interface DiscoveryResult {
  readonly intent: DiscoveryIntent
  readonly paths: readonly DiscoveryPath[]
  readonly insights: readonly string[]
  readonly suggestedNextSteps: readonly DiscoveryIntent[]
}

interface DiscoveryPath {
  readonly nodes: readonly {
    mbid: string
    name: string
    type: string
    depth: number
  }[]
  readonly description: string
  readonly interestScore: number  // 0-1, how interesting is this path
}
```

### Discovery System Prompt

```typescript
// packages/agent/src/prompts/discovery.ts

export const DISCOVERY_SYSTEM_PROMPT = `
You are a music discovery specialist working with the KEXP music knowledge graph.
Your goal is to find interesting, surprising, or educational connections between artists.

## Discovery Strategies

### 1. Lineage Discovery
Trace an artist's musical history through band memberships.
- Use graph_connections with query_type: "member_of" and "band_members"
- Look for unexpected connections (e.g., session musicians in famous bands)
- Note time periods to build career timeline

### 2. Collaboration Networks
Find artists who worked together directly or indirectly.
- Use graph_connections with query_type: "collaborators"
- Look for "six degrees" connections between artists
- Identify hub artists who connect different scenes

### 3. Cover Chains
Trace how songs travel between artists and genres.
- Use graph_connections with query_type: "covers"
- Find surprising covers (genre-crossing, generational)
- Identify influential songs with many covers

### 4. Geographic Clusters
Explore musical scenes by location.
- Use graph_connections with query_type: "artist_origin" and "artists_from_area"
- Find local scenes (Seattle grunge, Athens GA, etc.)
- Connect artists who shared geography but different eras

### 5. Label Families
Explore record label rosters and relationships.
- Use graph_connections with query_type: "labelmates" and "label_hierarchy"
- Find unexpected labelmates
- Trace how labels influenced artist connections

### 6. Creator Networks
Connect artists through shared songwriters/composers.
- Use graph_connections with query_type: "works_by_creator" and "work_credits"
- Find who wrote hits for multiple artists
- Trace influence through songwriting

## Output Guidelines

For each discovery, explain:
1. **The connection**: What is the relationship?
2. **Why it's interesting**: What makes this surprising or noteworthy?
3. **Context**: Historical/cultural significance
4. **Next steps**: What else could we explore from here?

Prioritize quality over quantity. One fascinating connection beats five obvious ones.
`
```

### Mode Integration

```typescript
// packages/agent/src/MusicAgent.ts (extended)

interface MusicAgentInterface {
  // Existing
  readonly enrichPlays: (playIds: number[]) => Effect.Effect<...>

  // NEW: Discovery mode
  readonly discover: (
    intent: DiscoveryIntent,
    options?: { maxDepth?: number; maxResults?: number }
  ) => Effect.Effect<DiscoveryResult, MusicAgentError, MusicAgentRequirements>
}

// Implementation sketch
const discover = (intent: DiscoveryIntent, options = {}) =>
  Effect.gen(function* () {
    const { maxDepth = 3, maxResults = 10 } = options

    // Build discovery-specific prompt
    const prompt = yield* promptBuilder.buildDiscoveryPrompt(intent)

    // Run agent loop with discovery system prompt
    const { response, researchMeta } = yield* runAgentLoop(
      prompt,
      toolkit,
      maxDepth * 3  // More iterations for deeper exploration
    )

    // Extract discovery paths from response
    const paths = extractDiscoveryPaths(response.value)

    // Generate follow-up suggestions
    const suggestions = generateSuggestions(paths, intent)

    return {
      intent,
      paths,
      insights: response.value.insights ?? [],
      suggestedNextSteps: suggestions,
    }
  })
```

### API Endpoint

```typescript
// packages/server/src/routes/discover.ts (future)

// POST /api/agent/discover
interface DiscoverRequest {
  intent_type: "lineage" | "collaboration" | "covers" | "geographic" | "label" | "creator" | "surprise"
  seed_mbid: string
  max_depth?: number
  max_results?: number
}

interface DiscoverResponse {
  paths: DiscoveryPath[]
  insights: string[]
  suggested_next: DiscoverRequest[]
  research_meta: {
    tool_calls: number
    duration_ms: number
    entities_explored: number
  }
}
```

---

## Implementation Order

Based on dependencies and user direction:

### Phase 2a: Foundation (Week 1)
1. **crate-jxv**: Enhance InsightSessionService with work logging
   - Add ToolCallLogEntry tracking
   - Add ResearchStep logging
   - Add EntityFacts accumulation
   - Add session export/import

### Phase 2b: Performance (Week 2)
2. **crate-81x**: Parallel research implementation
   - Create ParallelResearch.ts
   - Integrate pre-research with MusicAgent
   - Add timeout and error handling

### Phase 2c: Discovery (Week 3)
3. **crate-m7t**: Discovery mode
   - Create discovery prompts
   - Add discover() method to MusicAgent
   - Test with graph queries

### Phase 2d: Polish
4. **crate-xfh**: Database checkpoints (optional)
   - Persist session state for crash recovery
   - Enable cross-session handoff

---

## Evolution to Multi-Agent

These features prepare for future multi-agent architecture:

| Feature | Single Agent | Multi-Agent Evolution |
|---------|--------------|----------------------|
| Work logging | Debug/observability | Agent-to-agent handoff |
| Parallel research | 2x speedup | Specialist agents in parallel |
| Discovery mode | Mode in MusicAgent | Dedicated DiscoveryAgent |
| Session export | Crash recovery | Context transfer |

When ready to split into multiple agents:
1. Extract discovery logic into `DiscoveryAgent`
2. Use Queue/PubSub for coordination
3. Shared work store via database
4. Coordinator agent delegates to specialists

---

## Files to Create/Modify

### New Files
- `packages/agent/src/orchestration/ParallelResearch.ts` - Parallel research
- `packages/agent/src/modes/DiscoveryMode.ts` - Discovery mode types
- `packages/agent/src/prompts/discovery.ts` - Discovery system prompt

### Modified Files
- `packages/agent/src/services/InsightSessionService.ts` - Enhanced state
- `packages/agent/src/MusicAgent.ts` - Add discover() method
- `packages/agent/src/services/PromptBuilderService.ts` - Discovery prompts

### Test Files
- `packages/agent/test/parallel-research.test.ts`
- `packages/agent/test/discovery-mode.test.ts`
- `packages/agent/test/session-logging.test.ts`
