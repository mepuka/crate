# Agent Handoff and Context Transfer Patterns

**Research Task:** crate-njw
**Date:** 2025-12-17
**Status:** Research Complete

## Executive Summary

This document analyzes production patterns for agent-to-agent handoffs, context transfer, and work continuation across agent boundaries. Based on analysis of:

- Effect Workflow system (`@effect/workflow`)
- Effect Cluster distributed execution (`@effect/cluster`)
- Effect RPC serialization patterns (`@effect/rpc`)
- Effect Stream handoff mechanisms
- Production multi-agent system patterns

## Table of Contents

1. [Handoff Mechanisms](#handoff-mechanisms)
2. [Context Serialization Strategies](#context-serialization-strategies)
3. [State Management Patterns](#state-management-patterns)
4. [Error Recovery and Rollback](#error-recovery-and-rollback)
5. [Async vs Sync Handoffs](#async-vs-sync-handoffs)
6. [Actionable Patterns for Implementation](#actionable-patterns-for-implementation)

---

## Handoff Mechanisms

### 1. Effect Workflow Pattern (Durable Execution)

**Source:** `/Users/pooks/Dev/crate/docs/effect-source/workflow/src/Workflow.ts`

#### Mechanism Description

Effect's `@effect/workflow` implements durable execution with automatic checkpointing through "activities" and "durable primitives":

- **Activities** - Atomic units of work that execute exactly once
- **DurableClock** - Sleep/delay operations that persist state during pauses
- **DurableDeferred** - Signals that can be awaited across workflow boundaries
- **Compensation** - Saga pattern for rollback on failure

Each workflow step is tracked by:
1. Execution ID (deterministic based on payload + idempotency key)
2. Request ID (per activity/operation via Snowflake IDs)
3. State persisted to storage (via `MessageStorage`)

```typescript
// Pattern from Effect Workflow
const EmailWorkflow = Workflow.make({
  name: "EmailWorkflow",
  payload: { id: Schema.String, to: Schema.String },
  idempotencyKey: ({ id }) => id  // Deterministic execution ID
})

// Activities are checkpointed automatically
yield* Activity.make({
  name: "SendEmail",
  execute: Effect.gen(function* () {
    // This runs exactly once, even across restarts
    yield* sendEmail(payload)
  })
}).pipe(Activity.retry({ times: 5 }))

// Workflows can pause and resume
yield* DurableClock.sleep({ duration: "10 seconds" })
```

#### Pros
- **Exactly-once execution** - Activities never execute twice
- **Durable pauses** - Can sleep for hours/days with zero resource usage
- **Automatic recovery** - System crashes don't lose progress
- **Strong typing** - Full TypeScript safety end-to-end
- **Saga pattern** - Built-in compensation for rollback

#### Cons
- **Complex implementation** - Requires storage layer and entity system
- **Schema rigidity** - Changing workflow schemas requires migration
- **Learning curve** - New mental model for developers
- **Cluster dependency** - Best with distributed execution framework

#### When to Use
- Long-running workflows (hours to days)
- Critical operations requiring exactly-once semantics
- Complex multi-step processes with error recovery
- Work that must survive system restarts

#### Implementation Complexity
**High** (8/10)
- Requires: Storage layer, entity system, RPC framework, cluster coordination
- Estimated effort: 3-4 weeks for full implementation
- Effect provides the framework, but integration is non-trivial

---

### 2. Queue-Based Handoff (Producer-Consumer)

**Source:** `/Users/pooks/Dev/crate/.claude/skills/effect-queues-background/SKILL.md`

#### Mechanism Description

Use Effect's `Queue` or `PubSub` to decouple agent handoffs:

```typescript
// Create bounded queue for handoffs
const handoffQueue = yield* Queue.bounded<AgentTask>(32)

// Agent A: Producer
yield* Queue.offer(handoffQueue, {
  taskType: "research",
  context: { playId: 123, insights: [...] },
  priority: "high"
})

// Agent B: Consumer
const task = yield* Queue.take(handoffQueue)
yield* processTask(task)
```

For one-to-many handoffs (broadcasting):
```typescript
// PubSub for multiple subscribers
const eventBus = yield* PubSub.bounded<AgentEvent>(32)

// Agent A publishes
yield* PubSub.publish(eventBus, { type: "play_enriched", playId: 123 })

// Multiple agents subscribe
const subscription = yield* PubSub.subscribe(eventBus)
```

#### Pros
- **Simple** - Easy to understand and implement
- **Backpressure** - Bounded queues naturally throttle producers
- **Decoupled** - Agents don't need to know about each other
- **Concurrent** - Multiple workers can consume from same queue
- **Type-safe** - Queue<T> enforces payload types

#### Cons
- **No durability** - If system crashes, queue is lost
- **No checkpointing** - Work in progress is not tracked
- **Memory bound** - Queue lives in memory only
- **No retry logic** - Must implement manually

#### When to Use
- Short-lived handoffs within same process
- High-throughput, low-latency transfers
- When agents run in same runtime
- Fire-and-forget patterns acceptable

#### Implementation Complexity
**Low** (2/10)
- Use Effect's built-in `Queue` or `PubSub`
- Estimated effort: 1-2 days

---

### 3. Stream Handoff (Producer-Consumer with Backpressure)

**Source:** `/Users/pooks/Dev/crate/docs/effect-source/effect/src/internal/stream/handoff.ts`

#### Mechanism Description

Effect's internal `Handoff` abstraction provides synchronous producer-consumer coordination:

```typescript
// Handoff mechanism (used internally by Stream)
interface Handoff<A> {
  offer: (value: A) => Effect<void>  // Producer waits if consumer not ready
  take: Effect<A>                     // Consumer waits if no value available
}

// Higher-level Stream API
const agentStream = Stream.fromQueue(queue).pipe(
  Stream.mapEffect((task) => processTask(task)),
  Stream.buffer(32),  // Backpressure control
  Stream.timeout("30 seconds")
)
```

The `Handoff` state machine:
- **Empty** - Consumer waiting, producer can offer immediately
- **Full** - Value waiting, consumer can take immediately
- Uses `Deferred` for coordination (no polling)

#### Pros
- **Backpressure** - Producer blocks when consumer is slow
- **Efficient** - No polling, uses Effect's Deferred
- **Composable** - Streams provide rich operators
- **Resource-safe** - Automatic cleanup with scopes
- **Structured concurrency** - Clear parent-child relationships

#### Cons
- **Same-process only** - Not durable across restarts
- **Complexity** - Stream operators have learning curve
- **Debugging** - Async stream pipelines can be hard to trace

#### When to Use
- Real-time data processing pipelines
- When backpressure is critical
- Streaming agent responses (e.g., LLM tokens)
- High-throughput with resource limits

#### Implementation Complexity
**Medium** (5/10)
- Use Effect's `Stream` API
- Estimated effort: 3-5 days to build robust pipeline

---

### 4. RPC-Based Handoff (Remote Procedure Call)

**Source:** `/Users/pooks/Dev/crate/docs/effect-source/rpc/src/RpcSerialization.ts`

#### Mechanism Description

Effect's `@effect/rpc` provides typed RPC with multiple serialization strategies:

```typescript
// Define RPC interface
class ResearchPlayRpc extends Rpc.Rpc<
  "researchPlay",
  { playId: number; context: ResearchContext },
  Insight[]
>("researchPlay") {}

// Agent A: Client
const insights = yield* rpcClient.researchPlay({
  playId: 123,
  context: { showContext: "...", recentInsights: [...] }
})

// Agent B: Server
const rpcRouter = RpcRouter.make(
  ResearchPlayRpc,
  Effect.gen(function* ({ playId, context }) {
    // Process and return insights
    return yield* researchPlay(playId, context)
  })
)
```

Serialization options:
- **JSON** - Simple, human-readable
- **NDJSON** - Newline-delimited for streaming
- **MessagePack** - Binary, compact
- **JSON-RPC** - Standard protocol with batching

#### Pros
- **Type-safe** - Full TypeScript types across network boundary
- **Flexible serialization** - Choose based on needs
- **Streaming support** - NDJSON for incremental responses
- **Error handling** - Effect errors propagate automatically
- **Batching** - JSON-RPC batches multiple calls

#### Cons
- **Network overhead** - Serialization/deserialization cost
- **No built-in retry** - Must wrap with retry logic
- **Coupling** - Client and server must share schema
- **Versioning** - Schema changes require coordination

#### When to Use
- Cross-process or cross-machine handoffs
- When agents are separate services
- REST/HTTP-based architectures
- Need for streaming responses

#### Implementation Complexity
**Medium** (6/10)
- Use `@effect/rpc` with HTTP transport
- Estimated effort: 1 week for full setup

---

### 5. Entity-Based Handoff (Actor Model)

**Source:** `/Users/pooks/Dev/crate/docs/effect-source/cluster/src/Entity.ts`

#### Mechanism Description

Effect Cluster uses the Actor model where entities (stateful actors) handle messages:

```typescript
// Define entity type
const AgentEntity = Entity.make({
  name: "ResearchAgent",
  payload: Schema.Struct({
    playId: Schema.Number,
    command: Schema.Literal("start", "continue", "finalize")
  })
})

// Entity maintains state across messages
const entity = yield* AgentEntity.makeLayer(
  Effect.gen(function* (payload) {
    const state = yield* Ref.get(agentState)

    switch (payload.command) {
      case "start":
        // Initialize research
        yield* Ref.update(agentState, (s) => ({ ...s, status: "researching" }))
        break
      case "continue":
        // Resume from checkpoint
        const checkpoint = yield* loadCheckpoint(payload.playId)
        yield* continueResearch(checkpoint)
        break
      case "finalize":
        // Complete and handoff to next agent
        yield* finalizeAndHandoff()
        break
    }
  })
)
```

Messages are durable via `MessageStorage`:
- Persist to database before processing
- Survive crashes and restarts
- Exactly-once delivery guarantees

#### Pros
- **Stateful** - Entity maintains state between messages
- **Durable** - Messages persisted to storage
- **Location transparent** - Entity can move between nodes
- **Exactly-once** - Message processing guarantees
- **Scalable** - Distribute entities across cluster

#### Cons
- **High complexity** - Full cluster setup required
- **Storage dependency** - Needs PostgreSQL or similar
- **Latency** - Message persistence adds overhead
- **Operational burden** - Cluster management is complex

#### When to Use
- Distributed multi-agent systems
- Need for exactly-once message processing
- Agents with long-lived state
- Horizontal scalability requirements

#### Implementation Complexity
**Very High** (9/10)
- Requires: Cluster, storage, sharding, entity system
- Estimated effort: 4-6 weeks

---

## Context Serialization Strategies

### Strategy 1: Full Context (Naive)

**Mechanism:** Serialize entire context on every handoff

```typescript
interface FullContext {
  systemPrompt: string           // ~8,500 tokens
  showContext: ShowInfo          // ~500 tokens
  recentInsights: Insight[]      // ~2,000 tokens
  playData: Play                 // ~150 tokens
  conversationHistory: Message[] // Variable, grows unbounded
}
```

**Pros:** Simple, no information loss
**Cons:** Token explosion, unbounded growth, expensive
**Use When:** Never in production

**Cost Impact:** ~$0.03 per handoff (at Claude Opus 4 rates)

---

### Strategy 2: Static + Dynamic Split (Recommended)

**Mechanism:** Separate static (cacheable) from dynamic (variable) context

```typescript
// Static context (cached, never changes)
interface StaticContext {
  systemPrompt: string      // ~8,500 tokens, CACHED
  toolDefinitions: Tool[]   // ~1,200 tokens, CACHED
  guidelines: string        // ~500 tokens, CACHED
}

// Dynamic context (passed per-handoff)
interface DynamicContext {
  currentTime: DateTime
  showContext: ShowInfo
  recentInsights: Insight[]  // Rolling window, max 10
  playData: Play
}

// On handoff
yield* agentB.handle({
  static: staticContextRef,  // Reference to cached prompt
  dynamic: dynamicContext    // Only what changed
})
```

**Pros:**
- 90% token reduction via caching (Anthropic prompt caching)
- Fast handoffs (only serialize dynamic portion)
- Type-safe with schema validation

**Cons:**
- Requires cache-aware infrastructure
- Static changes invalidate cache

**Use When:** Most production scenarios

**Implementation Pattern:**
```typescript
// Use Anthropic's cache_control
const messages = [
  {
    role: "system",
    content: STATIC_PROMPT,
    cache_control: { type: "ephemeral" }  // This gets cached
  },
  {
    role: "system",
    content: buildDynamicContext(ctx)  // This is always new
  }
]
```

**Cost Impact:** ~$0.003 per handoff (10x reduction)

**Source:** `/Users/pooks/Dev/crate/docs/plans/2025-12-04-token-optimization.md`

---

### Strategy 3: Reference-Based Context (Database)

**Mechanism:** Store large context in database, pass only references

```typescript
interface ContextReference {
  executionId: string        // UUID for this workflow run
  checkpointId: number       // Sequential checkpoint number
  playId: number             // Which play we're processing
  insightCount: number       // How many insights generated
  metadata: {
    startedAt: DateTime
    lastActivity: DateTime
    agentChain: string[]     // Which agents have touched this
  }
}

// On handoff
const contextRef = yield* saveContext({
  fullContext: largeContextObject
})

yield* agentB.handle({
  contextRef: contextRef.id,  // Just pass the ID
  payload: minimalPayload
})

// Agent B loads context
const fullContext = yield* loadContext(contextRef.id)
```

**Pros:**
- Minimal network transfer
- No token costs for context
- Easy to implement checkpointing
- Can load partial context on demand

**Cons:**
- Database latency on every load
- Storage costs
- Complex cache invalidation
- Need for schema versioning

**Use When:**
- Very large contexts (>50KB)
- Multiple handoffs for same workflow
- Need for audit trail

**Implementation Complexity:** Medium (4/10)

---

### Strategy 4: Compressed Context (Semantic)

**Mechanism:** Summarize context using semantic compression

```typescript
interface CompressedContext {
  summary: string            // LLM-generated summary (200 tokens)
  keyInsights: Insight[]     // Top 3 most relevant (300 tokens)
  focusAreas: string[]       // Tags/keywords (50 tokens)
  fullContextRef?: string    // Optional reference to full data
}

// Use a smaller model to compress
const compressed = yield* compressionModel.complete(
  Prompt.make([{
    role: "user",
    content: `Summarize this research context in 200 tokens:

    ${fullContext}

    Focus on:
    - Key insights found
    - Research gaps
    - Next steps for agent handoff`
  }])
)
```

**Pros:**
- Dramatic token reduction (10-20x)
- Preserves semantic meaning
- Can use cheaper model for compression
- Natural language, easy to debug

**Cons:**
- Information loss (lossy compression)
- Compression cost (extra LLM call)
- Can lose critical details
- Non-deterministic

**Use When:**
- Context too large for full serialization
- Semantic meaning more important than exact data
- Budget-constrained scenarios

**Cost Impact:**
- Compression: ~$0.001 per handoff (Claude Haiku)
- Handoff: ~$0.005 per handoff (compressed context)
- Total: ~$0.006 vs ~$0.03 (5x savings)

---

### Strategy 5: Schema-Based Delta (Incremental)

**Mechanism:** Pass only what changed since last handoff

```typescript
interface ContextDelta {
  basedOn: CheckpointId              // Which state this builds on
  added: {
    insights?: Insight[]             // New insights since checkpoint
    connections?: Connection[]       // New graph connections
  }
  updated: {
    playStatus?: "researching" | "complete"
    confidenceScores?: Map<string, number>
  }
  removed: {
    deprecatedInsights?: string[]    // Insight IDs to remove
  }
}

// On handoff
const delta = computeDelta(lastCheckpoint, currentState)
yield* agentB.handle({
  checkpointRef: lastCheckpoint.id,
  delta: delta  // Only serialize changes
})

// Agent B reconstructs state
const fullState = yield* applyDelta(lastCheckpoint, delta)
```

**Pros:**
- Minimal serialization for incremental work
- Clear change tracking
- Type-safe with schema
- Efficient for long-running workflows

**Cons:**
- Complex delta computation
- Requires base checkpoint to exist
- Schema versioning challenges
- Need for delta application logic

**Use When:**
- Many small handoffs in sequence
- State changes are incremental
- Need for change audit trail

**Implementation Complexity:** High (7/10)

---

## State Management Patterns

### Pattern 1: Stateless Agents (Functional)

**Mechanism:** Agents are pure functions, no internal state

```typescript
// Agent is just a function
const researchAgent = (
  playData: Play,
  context: Context
): Effect<Insight[], ResearchError> =>
  Effect.gen(function* () {
    // All state passed in as parameters
    // No side effects except via Effect
    const insights = yield* research(playData, context)
    return insights
  })

// Handoff is just function call
const insights1 = yield* researchAgent(play, context)
const enriched = yield* enrichmentAgent(insights1, context)
```

**Pros:**
- **Simple** - Easy to reason about
- **Testable** - Pure functions are trivial to test
- **Composable** - Agents are just functions
- **No race conditions** - No shared mutable state
- **Parallel-safe** - Can run multiple agents concurrently

**Cons:**
- **Context passing** - Must thread context through all calls
- **No memory** - Agent can't "remember" previous work
- **Repeated work** - May recompute things

**When to Use:**
- Short-lived agent tasks
- No need for agent memory
- When composition is key
- Testing is critical

---

### Pattern 2: Ref-Based State (Effect)

**Mechanism:** Use Effect's `Ref` for mutable state

```typescript
// Agent with internal state
interface AgentState {
  insights: Insight[]
  exploredNodes: Set<string>
  iterationCount: number
}

const makeResearchAgent = Effect.gen(function* () {
  const state = yield* Ref.make<AgentState>({
    insights: [],
    exploredNodes: new Set(),
    iterationCount: 0
  })

  return {
    research: (play: Play) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(state)

        // Check if already explored
        if (current.exploredNodes.has(play.recording_mbid)) {
          return current.insights
        }

        // Research and update state
        const newInsights = yield* doResearch(play)
        yield* Ref.update(state, (s) => ({
          insights: [...s.insights, ...newInsights],
          exploredNodes: s.exploredNodes.add(play.recording_mbid),
          iterationCount: s.iterationCount + 1
        }))

        return newInsights
      }),

    getState: Ref.get(state),
    reset: Ref.set(state, initialState)
  }
})
```

**Pros:**
- **Memory** - Agent remembers previous work
- **Type-safe** - Ref<T> enforces state shape
- **Concurrent-safe** - Ref updates are atomic
- **Scoped** - State lives with agent scope

**Cons:**
- **Not durable** - Lost on crash
- **Not serializable** - Can't checkpoint easily
- **Single-process** - Can't distribute

**When to Use:**
- Agent needs memory within single session
- Avoid redundant work
- State is small and ephemeral

---

### Pattern 3: Database-Backed State (Persistent)

**Mechanism:** Persist state to database, load on demand

```typescript
// State schema
const AgentCheckpoint = Schema.Struct({
  executionId: Schema.String,
  agentName: Schema.String,
  state: Schema.Struct({
    insights: Schema.Array(InsightSchema),
    exploredNodes: Schema.Array(Schema.String),
    iterationCount: Schema.Number,
    lastUpdated: Schema.DateTime
  })
})

// Agent with persistent state
const makePersistedAgent = Effect.gen(function* () {
  const sql = yield* SqlClient
  const executionId = yield* Context.get(ExecutionId)

  return {
    research: (play: Play) =>
      Effect.gen(function* () {
        // Load latest checkpoint
        const checkpoint = yield* sql.single(
          `SELECT * FROM agent_checkpoints
           WHERE execution_id = ? AND agent_name = ?`,
          [executionId, "ResearchAgent"]
        ).pipe(
          Effect.flatMap(Schema.decode(AgentCheckpoint)),
          Effect.catchTag("NoSuchElementException", () =>
            Effect.succeed(initialCheckpoint)
          )
        )

        // Check if already explored
        if (checkpoint.state.exploredNodes.includes(play.recording_mbid)) {
          return checkpoint.state.insights
        }

        // Research
        const newInsights = yield* doResearch(play)

        // Save checkpoint
        yield* sql.execute(
          `INSERT INTO agent_checkpoints (execution_id, agent_name, state)
           VALUES (?, ?, ?)
           ON CONFLICT (execution_id, agent_name)
           DO UPDATE SET state = EXCLUDED.state`,
          [executionId, "ResearchAgent", checkpoint.state]
        )

        return newInsights
      })
  }
})
```

**Pros:**
- **Durable** - Survives crashes and restarts
- **Auditable** - Full history in database
- **Distributable** - Any agent instance can load state
- **Scalable** - Can handle large state

**Cons:**
- **Latency** - Database round-trip on every operation
- **Complexity** - Schema migrations, versioning
- **Cost** - Storage and query costs
- **Serialization** - Must encode/decode complex types

**When to Use:**
- Long-running workflows (hours to days)
- Need for crash recovery
- Multiple agents accessing shared state
- Audit requirements

---

### Pattern 4: Workflow State (Effect Workflow)

**Mechanism:** Use `@effect/workflow` for durable execution state

```typescript
// Define workflow with automatic checkpointing
const ResearchWorkflow = Workflow.make({
  name: "ResearchWorkflow",
  payload: { playId: Schema.Number },
  idempotencyKey: ({ playId }) => `play-${playId}`
})

const ResearchWorkflowLayer = ResearchWorkflow.toLayer(
  Effect.gen(function* (payload, executionId) {
    // State is implicitly checkpointed by workflow engine

    // Activity 1: Initial research
    const initialInsights = yield* Activity.make({
      name: "InitialResearch",
      execute: researchPlay(payload.playId)
    })

    // Activity 2: Deep dive (only runs if above succeeds)
    const deepInsights = yield* Activity.make({
      name: "DeepDive",
      execute: deepDiveResearch(initialInsights)
    })

    // Activity 3: Enrichment
    const enriched = yield* Activity.make({
      name: "Enrichment",
      execute: enrichInsights(deepInsights)
    })

    // Return final result
    return enriched
  })
)
```

**How it works:**
- Each `Activity.make` creates a checkpoint
- If workflow crashes, it resumes from last successful activity
- No explicit state management needed
- Compensation runs on failure

**Pros:**
- **Automatic checkpointing** - No manual state management
- **Exactly-once** - Activities never run twice
- **Saga pattern** - Built-in compensation
- **Type-safe** - Schema validation throughout
- **Durable pauses** - Can sleep for days

**Cons:**
- **High complexity** - Full workflow engine required
- **Schema rigidity** - Changing activities is hard
- **Operational burden** - Cluster and storage setup
- **Overkill** - For simple handoffs

**When to Use:**
- Complex multi-step workflows
- Need for exactly-once guarantees
- Long-running processes
- Critical operations (payments, etc.)

---

## Error Recovery and Rollback

### Pattern 1: Saga Pattern (Compensation)

**Mechanism:** Each step has a compensating action for rollback

```typescript
// Effect Workflow provides built-in saga pattern
const workflow = Workflow.make({ name: "PaymentWorkflow" })

const layer = workflow.toLayer(
  Effect.gen(function* () {
    // Step 1: Reserve inventory
    const reservation = yield* Activity.make({
      name: "ReserveInventory",
      execute: reserveInventory(orderId)
    }).pipe(
      workflow.withCompensation((value, cause) =>
        // Rollback: Release inventory
        releaseInventory(value.reservationId)
      )
    )

    // Step 2: Charge payment
    const payment = yield* Activity.make({
      name: "ChargePayment",
      execute: chargeCard(orderId)
    }).pipe(
      workflow.withCompensation((value, cause) =>
        // Rollback: Refund payment
        refundPayment(value.transactionId)
      )
    )

    // Step 3: Ship order (no compensation needed)
    yield* Activity.make({
      name: "ShipOrder",
      execute: shipOrder(orderId)
    })

    // If any step fails, compensations run in reverse order
    return { orderId, status: "complete" }
  })
)
```

**Compensation execution:**
- Runs in **reverse order** of success
- Only for steps that **succeeded**
- Receives both success value and failure cause
- Can't fail (must use `orDie` or absorb errors)

**Pros:**
- **Automatic** - Workflow engine handles execution
- **Ordered** - Reverse order guarantees cleanup
- **Type-safe** - Compensation has access to success value
- **Standard pattern** - Well-understood in distributed systems

**Cons:**
- **Complexity** - Must design compensating actions
- **Not always possible** - Some actions can't be undone
- **Failure scenarios** - What if compensation fails?

**When to Use:**
- Multi-step transactions
- When partial failure is unacceptable
- Distributed state changes
- Financial or critical operations

---

### Pattern 2: Transactional Rollback (Database)

**Mechanism:** Use database transactions for atomic multi-step operations

```typescript
const researchWithRollback = Effect.gen(function* () {
  const sql = yield* SqlClient

  // Start transaction
  yield* sql.withTransaction(
    Effect.gen(function* () {
      // Step 1: Save initial insights
      yield* sql.execute(
        `INSERT INTO insights (play_id, insight_type, data)
         VALUES (?, ?, ?)`,
        [playId, "cover", coverInsight]
      )

      // Step 2: Update graph
      yield* sql.execute(
        `INSERT INTO graph_edges (from_mbid, to_mbid, edge_type)
         VALUES (?, ?, ?)`,
        [artistMbid, relatedMbid, "cover"]
      )

      // Step 3: Update play metadata
      yield* sql.execute(
        `UPDATE plays SET research_status = 'complete'
         WHERE id = ?`,
        [playId]
      )

      // If any step fails, entire transaction rolls back
    })
  )
})
```

**Pros:**
- **ACID guarantees** - All-or-nothing execution
- **Database-native** - Leverages built-in transaction support
- **Simple** - No manual compensation logic
- **Fast** - No network round-trips between steps

**Cons:**
- **Database-only** - Can't roll back external API calls
- **Lock contention** - Long transactions block other queries
- **Not durable across restarts** - If process crashes, transaction aborts

**When to Use:**
- All state changes are in same database
- Short-lived operations
- ACID properties required
- Multiple related writes

---

### Pattern 3: Retry with Exponential Backoff

**Mechanism:** Automatically retry failed operations with increasing delays

```typescript
// Simple retry
const withRetry = yield* researchPlay(playId).pipe(
  Effect.retry({
    times: 5,
    schedule: Schedule.exponential("100 millis")
  })
)

// Advanced retry with jitter and backoff
const withAdvancedRetry = yield* researchPlay(playId).pipe(
  Effect.retry({
    times: 10,
    schedule: Schedule.exponential("100 millis", 2.0).pipe(
      Schedule.either(Schedule.spaced("30 seconds")),  // Max backoff
      Schedule.jittered  // Add randomness to prevent thundering herd
    ),
    while: (error) => error._tag !== "PermanentError"  // Don't retry permanent errors
  })
)

// With logging
const withLogging = yield* researchPlay(playId).pipe(
  Effect.retry({
    times: 5,
    schedule: Schedule.exponential("100 millis")
  }),
  Effect.tapErrorCause((cause) =>
    Effect.logError("Research failed, retrying", { cause })
  )
)
```

**Retry strategies:**

| Strategy | Use Case |
|----------|----------|
| Fixed delay | Simple, predictable |
| Exponential | Backoff for rate limits |
| Exponential + jitter | Prevent thundering herd |
| Spaced (max) | Cap retry delay |
| Conditional | Skip permanent errors |

**Pros:**
- **Handles transient failures** - Network blips, rate limits
- **Built into Effect** - No manual implementation
- **Composable** - Combine schedules easily
- **Type-safe** - Error types preserved

**Cons:**
- **Latency** - Retries add delay
- **Cost** - Multiple API calls
- **Not always appropriate** - Some errors shouldn't retry

**When to Use:**
- Transient failures expected (network, rate limits)
- External API calls
- Database connection issues
- Any operation that might temporarily fail

---

### Pattern 4: Circuit Breaker

**Mechanism:** Fail fast when downstream service is degraded

```typescript
// Not built into Effect, but can implement
interface CircuitBreakerState {
  failures: number
  lastFailure: DateTime | null
  state: "closed" | "open" | "half-open"
}

const makeCircuitBreaker = (config: {
  failureThreshold: number
  timeout: Duration
}) =>
  Effect.gen(function* () {
    const state = yield* Ref.make<CircuitBreakerState>({
      failures: 0,
      lastFailure: null,
      state: "closed"
    })

    return {
      execute: <A, E, R>(effect: Effect<A, E, R>) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(state)

          // Check if circuit is open
          if (current.state === "open") {
            const elapsed = yield* Clock.currentTimeMillis.pipe(
              Effect.map((now) =>
                Duration.millis(now - current.lastFailure!.getTime())
              )
            )

            if (Duration.lessThan(elapsed, config.timeout)) {
              // Still open, fail fast
              return yield* Effect.fail(new CircuitOpenError())
            } else {
              // Try half-open
              yield* Ref.update(state, (s) => ({ ...s, state: "half-open" }))
            }
          }

          // Execute operation
          return yield* effect.pipe(
            Effect.tapError(() =>
              Ref.update(state, (s) => {
                const failures = s.failures + 1
                return {
                  failures,
                  lastFailure: new Date(),
                  state: failures >= config.failureThreshold ? "open" : s.state
                }
              })
            ),
            Effect.tap(() =>
              // Success, close circuit
              Ref.set(state, {
                failures: 0,
                lastFailure: null,
                state: "closed"
              })
            )
          )
        })
    }
  })

// Usage
const breaker = yield* makeCircuitBreaker({
  failureThreshold: 5,
  timeout: Duration.seconds(30)
})

const result = yield* breaker.execute(
  callExternalAPI(url)
)
```

**Pros:**
- **Fail fast** - Don't wait for timeout when service is down
- **Protects downstream** - Gives service time to recover
- **Automatic recovery** - Half-open state tests recovery
- **Resource efficient** - Avoids wasted calls

**Cons:**
- **Complex** - Non-trivial to implement correctly
- **State management** - Need to track failure counts
- **Tuning** - Threshold and timeout need calibration
- **False positives** - May open circuit prematurely

**When to Use:**
- Calling unreliable external services
- Cascade failure prevention
- High-traffic systems
- When timeout isn't enough

---

### Pattern 5: Dead Letter Queue (DLQ)

**Mechanism:** Failed tasks go to separate queue for manual inspection

```typescript
const processWithDLQ = Effect.gen(function* () {
  const mainQueue = yield* Queue.bounded<Task>(100)
  const dlq = yield* Queue.unbounded<FailedTask>()

  // Worker
  yield* Effect.forever(
    Effect.gen(function* () {
      const task = yield* Queue.take(mainQueue)

      yield* processTask(task).pipe(
        Effect.catchAll((error) =>
          // Send to DLQ on failure
          Queue.offer(dlq, {
            task,
            error,
            timestamp: new Date(),
            retryCount: task.retryCount + 1
          })
        )
      )
    })
  ).pipe(Effect.fork)

  // DLQ monitor
  yield* Effect.forever(
    Effect.gen(function* () {
      const failed = yield* Queue.take(dlq)

      // Log for operators
      yield* Effect.logError("Task failed permanently", {
        task: failed.task,
        error: failed.error,
        retryCount: failed.retryCount
      })

      // Could also: persist to DB, send alert, etc.
    })
  ).pipe(Effect.fork)
})
```

**Pros:**
- **No data loss** - Failed tasks captured for review
- **Debugging** - Full context preserved
- **Manual recovery** - Operators can fix and retry
- **Monitoring** - Track failure patterns

**Cons:**
- **Manual intervention** - DLQ needs monitoring
- **Unbounded growth** - DLQ can fill up
- **Complexity** - Need infrastructure to handle DLQ

**When to Use:**
- Critical tasks that can't be dropped
- Need for manual review of failures
- Debugging production issues
- Compliance/audit requirements

---

## Async vs Sync Handoffs

### Synchronous Handoff Pattern

**Mechanism:** Caller waits for handoff to complete before proceeding

```typescript
// Agent A calls Agent B synchronously
const insights = yield* agentA.research(play)

// This blocks until agentB completes
const enriched = yield* agentB.enrich(insights)

// Can only proceed after both finish
yield* persistInsights(enriched)
```

**Execution timeline:**
```
Agent A: ████████░░░░░░░░░░░░░░  (waits for B)
Agent B:         ████████░░░░░░  (blocks A)
Total:   ████████████████░░░░░░
```

**Pros:**
- **Simple** - Easy to reason about sequential flow
- **Type-safe** - Return value available immediately
- **Error handling** - Errors propagate naturally
- **Debugging** - Clear stack traces

**Cons:**
- **Blocking** - Can't do other work while waiting
- **Latency** - Total time is sum of all agents
- **Resource waste** - Agent A idle while B works
- **Scalability** - Limited by sequential execution

**When to Use:**
- Agent B's result needed immediately
- Simple workflows with few steps
- When latency isn't critical
- Strong consistency required

---

### Asynchronous Handoff Pattern (Fire-and-Forget)

**Mechanism:** Caller hands off work and continues immediately

```typescript
// Agent A hands off to Agent B and continues
yield* agentB.enrich(insights).pipe(
  Effect.fork  // Run in background
)

// Agent A can proceed immediately
yield* continueOtherWork()
```

**Execution timeline:**
```
Agent A: ████████████████████  (continues immediately)
Agent B:         ████████░░░░  (runs in parallel)
Total:   ████████████████████
```

**Pros:**
- **Non-blocking** - Caller continues immediately
- **Parallelism** - Multiple agents can run concurrently
- **Throughput** - Process more work per second
- **Latency** - Critical path not blocked

**Cons:**
- **No return value** - Can't use result immediately
- **Error handling** - Errors happen "elsewhere"
- **Debugging** - Async bugs are harder to trace
- **Coordination** - Need mechanism to collect results

**When to Use:**
- Result not needed immediately
- Work can proceed independently
- High throughput required
- Background processing

---

### Async with Callback Pattern

**Mechanism:** Hand off work with callback for completion

```typescript
// Agent A provides callback
yield* agentB.enrich(insights, {
  onComplete: (result) =>
    Effect.gen(function* () {
      yield* Effect.log("Enrichment complete")
      yield* persistInsights(result)
    }),
  onError: (error) =>
    Effect.logError("Enrichment failed", { error })
})

// Agent A continues
yield* continueOtherWork()
```

**Pros:**
- **Non-blocking** - Caller continues immediately
- **Result handling** - Callback invoked on completion
- **Error handling** - Separate callback for errors
- **Composable** - Can chain callbacks

**Cons:**
- **Callback hell** - Can nest deeply
- **Error-prone** - Easy to forget error callback
- **Testing** - Harder to test async callbacks
- **Type safety** - Callbacks can lose type info

**When to Use:**
- Need notification of completion
- Result should trigger side effect
- Can't block caller
- Event-driven architectures

---

### Promise/Fiber Pattern (Effect)

**Mechanism:** Use Effect's `Fiber` for structured concurrency

```typescript
// Start Agent B in background fiber
const fiberB = yield* agentB.enrich(insights).pipe(
  Effect.fork
)

// Agent A does other work
yield* continueOtherWork()

// Later, join the fiber to get result
const enriched = yield* Fiber.join(fiberB)
yield* persistInsights(enriched)
```

**Advanced: Parallel with racing**
```typescript
// Run two agents in parallel, take first result
const result = yield* Effect.race(
  agentB.enrich(insights),
  agentC.enrich(insights)
)

// Or run both and take both results
const [resultB, resultC] = yield* Effect.all([
  agentB.enrich(insights),
  agentC.enrich(insights)
], { concurrency: "unbounded" })
```

**Advanced: Timeout and fallback**
```typescript
// Start agent with timeout
const result = yield* agentB.enrich(insights).pipe(
  Effect.timeout("30 seconds"),
  Effect.catchTag("TimeoutException", () =>
    // Fallback if timeout
    Effect.succeed(defaultInsights)
  )
)
```

**Pros:**
- **Structured concurrency** - Fibers tied to parent scope
- **Type-safe** - Full type information preserved
- **Composable** - Race, timeout, parallel, etc.
- **Resource-safe** - Automatic cleanup on scope exit
- **Interruptible** - Can cancel fibers cleanly

**Cons:**
- **Learning curve** - Fiber API takes time to learn
- **Debugging** - Concurrent bugs still hard
- **Complexity** - More moving parts

**When to Use:**
- Default choice for async handoffs in Effect
- Need result eventually
- Want structured concurrency
- Resource safety critical

---

### Event-Driven Pattern (PubSub)

**Mechanism:** Publish events, subscribers react independently

```typescript
// Setup event bus
const eventBus = yield* PubSub.bounded<AgentEvent>(100)

// Agent A publishes event
yield* PubSub.publish(eventBus, {
  type: "play_researched",
  playId: 123,
  insights: insights
})

// Agent B subscribes and reacts
yield* PubSub.subscribe(eventBus).pipe(
  Stream.filter((event) => event.type === "play_researched"),
  Stream.mapEffect((event) =>
    agentB.enrich(event.insights)
  ),
  Stream.runDrain,
  Effect.fork  // Run in background
)

// Agent C can also subscribe independently
yield* PubSub.subscribe(eventBus).pipe(
  Stream.filter((event) => event.type === "play_researched"),
  Stream.mapEffect((event) =>
    agentC.analyze(event.insights)
  ),
  Stream.runDrain,
  Effect.fork
)
```

**Pros:**
- **Decoupled** - Publishers don't know subscribers
- **Scalable** - Many subscribers without changing publisher
- **Flexible** - Easy to add new subscribers
- **Parallel** - All subscribers run concurrently

**Cons:**
- **No return value** - Fire-and-forget only
- **Debugging** - Hard to trace event flow
- **Ordering** - Events may arrive out of order
- **Reliability** - Need to handle lost events

**When to Use:**
- One-to-many handoffs
- Loosely coupled agents
- Event-driven architectures
- Microservices

---

## Actionable Patterns for Implementation

Based on the research above, here are concrete patterns ready for implementation in the Crate project.

---

### Pattern 1: Simple Queue-Based Handoff

**Use Case:** Short-lived agent handoffs within same Cloud Run instance

**Implementation:**
```typescript
// packages/agent/src/handoff/QueueHandoff.ts

interface AgentTask {
  taskType: "research" | "enrich" | "analyze"
  playId: number
  context: ResearchContext
  priority: "high" | "normal" | "low"
}

export const makeAgentQueue = Effect.gen(function* () {
  const queue = yield* Queue.bounded<AgentTask>(32)

  return {
    // Producer: Add task to queue
    handoff: (task: AgentTask) =>
      Queue.offer(queue, task),

    // Consumer: Process tasks
    worker: (handler: (task: AgentTask) => Effect<void, AgentError>) =>
      Effect.forever(
        Effect.gen(function* () {
          const task = yield* Queue.take(queue)
          yield* handler(task).pipe(
            Effect.retry({
              times: 3,
              schedule: Schedule.exponential("100 millis")
            }),
            Effect.catchAll((error) =>
              Effect.logError("Task failed", { task, error })
            )
          )
        })
      )
  }
})

// Usage in MusicAgent.ts
const agentQueue = yield* makeAgentQueue()

// Start workers
yield* agentQueue.worker((task) =>
  Effect.gen(function* () {
    switch (task.taskType) {
      case "research":
        return yield* researchAgent(task.playId, task.context)
      case "enrich":
        return yield* enrichAgent(task.playId, task.context)
      case "analyze":
        return yield* analyzeAgent(task.playId, task.context)
    }
  })
).pipe(Effect.fork)

// Hand off work
yield* agentQueue.handoff({
  taskType: "enrich",
  playId: 123,
  context: ctx,
  priority: "high"
})
```

**Pros:** Simple, low-latency, type-safe
**Cons:** Not durable, single-process only
**Estimated effort:** 1-2 days

---

### Pattern 2: Static + Dynamic Context Split

**Use Case:** Reduce token costs via prompt caching

**Implementation:**
```typescript
// packages/agent/src/prompts/CacheablePrompt.ts

export interface CacheableMessage {
  role: "system" | "user"
  content: string
  cache?: boolean
}

export const createCacheablePrompt = (
  playData: Play,
  showContext: ShowContext | null,
  recentInsights: Insight[]
): CacheableMessage[] => {
  return [
    {
      role: "system",
      content: CratePrompt.STATIC_SYSTEM_PROMPT,  // ~8,500 tokens
      cache: true  // Anthropic caches this
    },
    {
      role: "system",
      content: CratePrompt.buildDynamicPrompt({
        currentTime: new Date(),
        showContext,
        recentInsights: recentInsights.slice(-10)  // Last 10 only
      }),
      cache: false  // ~1,500 tokens, not cached
    },
    {
      role: "user",
      content: CratePrompt.buildPlayMessage(playData),
      cache: false  // ~150 tokens per play
    }
  ]
}

// Usage in MusicAgent.ts
const messages = createCacheablePrompt(play, showContext, insights)

// Pass to Anthropic with cache control
const response = yield* model.complete(
  Prompt.make(
    messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      ...(msg.cache ? { cache_control: { type: "ephemeral" } } : {})
    }))
  )
)
```

**Expected savings:** 90% reduction in input tokens (~$0.003 vs $0.03 per handoff)
**Estimated effort:** 2-3 days (already designed in token optimization doc)

---

### Pattern 3: Database Checkpoint Pattern

**Use Case:** Long-running research that needs crash recovery

**Implementation:**
```typescript
// packages/agent/src/persistence/AgentCheckpoint.ts

const AgentCheckpointSchema = Schema.Struct({
  executionId: Schema.String,
  playId: Schema.Number,
  agentName: Schema.String,
  checkpoint: Schema.Struct({
    insights: Schema.Array(InsightSchema),
    exploredMbids: Schema.Array(Schema.String),
    graphDepth: Schema.Number,
    iterationCount: Schema.Number,
    status: Schema.Literal("initializing", "researching", "complete", "failed")
  }),
  createdAt: Schema.DateTime,
  updatedAt: Schema.DateTime
})

export const saveCheckpoint = (checkpoint: AgentCheckpoint) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient

    yield* sql.execute(
      `INSERT INTO agent_checkpoints
       (execution_id, play_id, agent_name, checkpoint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (execution_id, play_id, agent_name)
       DO UPDATE SET checkpoint = EXCLUDED.checkpoint, updated_at = EXCLUDED.updated_at`,
      [
        checkpoint.executionId,
        checkpoint.playId,
        checkpoint.agentName,
        JSON.stringify(checkpoint.checkpoint),
        checkpoint.createdAt,
        checkpoint.updatedAt
      ]
    )
  })

export const loadCheckpoint = (
  executionId: string,
  playId: number,
  agentName: string
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient

    const row = yield* sql.single(
      `SELECT * FROM agent_checkpoints
       WHERE execution_id = ? AND play_id = ? AND agent_name = ?`,
      [executionId, playId, agentName]
    ).pipe(
      Effect.flatMap(Schema.decode(AgentCheckpointSchema)),
      Effect.catchTag("NoSuchElementException", () =>
        Effect.succeed(null)  // No checkpoint yet
      )
    )

    return row
  })

// Usage in MusicAgent.ts
const executionId = yield* generateExecutionId()
const checkpoint = yield* loadCheckpoint(executionId, play.id, "ResearchAgent")

if (checkpoint && checkpoint.checkpoint.status !== "complete") {
  // Resume from checkpoint
  yield* resumeResearch(checkpoint)
} else {
  // Start fresh
  yield* startResearch(play)
}

// Save checkpoint after each major step
yield* saveCheckpoint({
  executionId,
  playId: play.id,
  agentName: "ResearchAgent",
  checkpoint: {
    insights: currentInsights,
    exploredMbids: exploredSet,
    graphDepth: 2,
    iterationCount: 5,
    status: "researching"
  },
  createdAt: new Date(),
  updatedAt: new Date()
})
```

**Database schema:**
```sql
CREATE TABLE agent_checkpoints (
  execution_id TEXT NOT NULL,
  play_id INTEGER NOT NULL,
  agent_name TEXT NOT NULL,
  checkpoint JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (execution_id, play_id, agent_name)
);

CREATE INDEX idx_checkpoints_play_id ON agent_checkpoints(play_id);
CREATE INDEX idx_checkpoints_status ON agent_checkpoints((checkpoint->>'status'));
```

**Pros:** Crash recovery, audit trail, can resume anywhere
**Cons:** Database latency, storage costs
**Estimated effort:** 3-4 days

---

### Pattern 4: Retry with Exponential Backoff

**Use Case:** Handle transient failures in tool calls

**Implementation:**
```typescript
// packages/agent/src/tools/ResilientTools.ts

export const makeResilientTools = (baseTools: AgentTools) => ({
  searchPlays: (params: SearchPlaysParams) =>
    baseTools.searchPlays(params).pipe(
      Effect.retry({
        times: 5,
        schedule: Schedule.exponential("100 millis").pipe(
          Schedule.either(Schedule.spaced("10 seconds")),  // Max 10s backoff
          Schedule.jittered  // Prevent thundering herd
        ),
        while: (error) =>
          // Only retry transient errors
          error._tag === "NetworkError" ||
          error._tag === "TimeoutError" ||
          error._tag === "RateLimitError"
      }),
      Effect.tapError((error) =>
        Effect.logError("Search failed after retries", { error, params })
      )
    ),

  resolveGraph: (params: GraphParams) =>
    baseTools.resolveGraph(params).pipe(
      Effect.retry({
        times: 3,
        schedule: Schedule.exponential("200 millis")
      }),
      Effect.timeout("30 seconds"),  // Don't wait forever
      Effect.catchTag("TimeoutException", () =>
        Effect.fail(new GraphTimeoutError({ params }))
      )
    ),

  // All other tools...
})

// Usage in MusicAgent.ts
const resilientTools = makeResilientTools(tools)

// Now all tool calls have automatic retry
const results = yield* resilientTools.searchPlays({
  artist_mbid: artistMbid,
  limit: 10
})
```

**Pros:** Handles transient failures transparently
**Cons:** Adds latency, increases API costs
**Estimated effort:** 1 day

---

### Pattern 5: Fiber-Based Parallel Handoff

**Use Case:** Research play with multiple agents in parallel

**Implementation:**
```typescript
// packages/agent/src/orchestration/ParallelResearch.ts

export const parallelResearch = (
  play: Play,
  context: ResearchContext
) =>
  Effect.gen(function* () {
    // Start multiple agents in parallel
    const [
      coverInsights,
      sampleInsights,
      historyInsights,
      graphConnections
    ] = yield* Effect.all([
      researchCovers(play, context),
      researchSamples(play, context),
      researchHistory(play, context),
      exploreGraph(play, context)
    ], {
      concurrency: 4,  // Run all 4 in parallel
      mode: "default"  // Fail if any fails
    })

    // Merge results
    return {
      insights: [
        ...coverInsights,
        ...sampleInsights,
        ...historyInsights
      ],
      connections: graphConnections
    }
  }).pipe(
    Effect.timeout("2 minutes"),  // Overall timeout
    Effect.catchTag("TimeoutException", () =>
      Effect.logWarning("Research timed out, using partial results")
    )
  )

// With racing (take first to complete)
export const fastestResearch = (
  play: Play,
  context: ResearchContext
) =>
  Effect.race(
    researchWithMusicBrainz(play, context),
    researchWithDiscogs(play, context)
  )

// With early completion (first N results)
export const earlyStopResearch = (
  play: Play,
  context: ResearchContext
) =>
  Effect.all([
    researchCovers(play, context),
    researchSamples(play, context),
    researchHistory(play, context),
    exploreGraph(play, context)
  ], {
    concurrency: 4,
    mode: "validate",  // Stop when first N succeed
  })
```

**Pros:** Fast, efficient use of I/O time
**Cons:** Complex error handling with partial failures
**Estimated effort:** 2-3 days

---

### Pattern 6: Saga Pattern for Multi-Agent Workflows

**Use Case:** Complex workflow with rollback (for future use)

**Implementation sketch (not recommended for MVP):**
```typescript
// This would require @effect/workflow integration

const ResearchWorkflow = Workflow.make({
  name: "PlayResearchWorkflow",
  payload: { playId: Schema.Number },
  idempotencyKey: ({ playId }) => `play-${playId}`
})

const layer = ResearchWorkflow.toLayer(
  Effect.gen(function* (payload, executionId) {
    // Step 1: Initial research
    const initial = yield* Activity.make({
      name: "InitialResearch",
      execute: researchPlay(payload.playId)
    }).pipe(
      ResearchWorkflow.withCompensation((value, cause) =>
        // Rollback: Delete insights
        deleteInsights(value.insightIds)
      )
    )

    // Step 2: Graph exploration
    const graph = yield* Activity.make({
      name: "GraphExploration",
      execute: exploreGraph(initial.mbids)
    }).pipe(
      ResearchWorkflow.withCompensation((value, cause) =>
        // Rollback: Clear graph data
        clearGraphData(value.nodeIds)
      )
    )

    // Step 3: Persist to database
    yield* Activity.make({
      name: "PersistResults",
      execute: persistResults(initial.insights, graph.connections)
    })

    // If any step fails, compensations run in reverse order
  })
)
```

**Note:** This is **high complexity** and only recommended if:
- Need exactly-once semantics
- Workflow runs for hours/days
- Multiple failure points with rollback

For Crate's current use case (research single play in <2 minutes), simpler patterns above are sufficient.

**Estimated effort if implemented:** 4-6 weeks (not recommended for now)

---

## Comparison Matrix

| Pattern | Durability | Complexity | Latency | Cost | Use Case |
|---------|-----------|------------|---------|------|----------|
| Queue-based | None | Low | <10ms | Free | Same-process handoff |
| Stream | None | Medium | <50ms | Free | Backpressure pipelines |
| RPC | None | Medium | 50-200ms | Network | Cross-service |
| Entity/Actor | High | Very High | 100-500ms | Storage | Distributed systems |
| Workflow | Highest | Very High | Variable | Storage+CPU | Long-running critical |
| Static+Dynamic | N/A | Low | N/A | -90% tokens | Prompt caching |
| DB Checkpoint | High | Medium | 10-50ms | Storage | Crash recovery |
| Retry | None | Low | +latency | +API calls | Transient failures |
| Fiber/Parallel | None | Medium | -50% latency | Same | Parallel work |
| Saga | High | Very High | Variable | Storage | Multi-step rollback |

---

## Recommendations for Crate Project

Based on current requirements (process single play, generate insights, <2 minute timeout):

### Immediate Implementation (This Week)

1. **Static + Dynamic Context Split** - 90% token savings
   - Effort: 2-3 days
   - ROI: Very high ($25K/year savings)
   - Complexity: Low
   - Already designed in `/Users/pooks/Dev/crate/docs/plans/2025-12-04-token-optimization.md`

2. **Retry with Exponential Backoff** - Reliability
   - Effort: 1 day
   - ROI: High (prevents failures)
   - Complexity: Low
   - Use Effect's built-in `retry`

### Short-term (Next 2 Weeks)

3. **Database Checkpoint Pattern** - Crash recovery
   - Effort: 3-4 days
   - ROI: Medium (better UX, resume capability)
   - Complexity: Medium
   - Enables "resume research" feature

4. **Fiber-Based Parallel Handoff** - Performance
   - Effort: 2-3 days
   - ROI: Medium (2x speedup)
   - Complexity: Medium
   - Run cover/sample/history research in parallel

### Future Consideration (If Needed)

5. **Queue-Based Handoff** - If adding multi-agent pipeline
   - Effort: 1-2 days
   - ROI: Depends on use case
   - Only if building multi-agent orchestration

6. **Effect Workflow** - Only if requirements change dramatically
   - Effort: 4-6 weeks
   - ROI: Low for current use case
   - Only if: multi-day workflows, exactly-once required

---

## References

### Effect Source Code Analyzed
- `/Users/pooks/Dev/crate/docs/effect-source/workflow/src/Workflow.ts` - Workflow pattern
- `/Users/pooks/Dev/crate/docs/effect-source/workflow/src/WorkflowEngine.ts` - Execution engine
- `/Users/pooks/Dev/crate/docs/effect-source/cluster/src/ClusterWorkflowEngine.ts` - Distributed execution
- `/Users/pooks/Dev/crate/docs/effect-source/rpc/src/RpcSerialization.ts` - Serialization patterns
- `/Users/pooks/Dev/crate/docs/effect-source/effect/src/internal/stream/handoff.ts` - Stream coordination
- `/Users/pooks/Dev/crate/.claude/skills/effect-queues-background/SKILL.md` - Queue patterns
- `/Users/pooks/Dev/crate/.claude/skills/effect-concurrency-fibers/SKILL.md` - Fiber patterns

### Crate Project Documents
- `/Users/pooks/Dev/crate/docs/plans/2025-12-02-crate-research-agent-design.md` - Agent design
- `/Users/pooks/Dev/crate/docs/plans/2025-12-04-token-optimization.md` - Context optimization

### External Patterns (Conceptual)
- OpenAI Swarm: Function-based handoff with context passing
- LangGraph: Checkpointing via state graph persistence
- Temporal: Durable execution via event sourcing
- Enterprise agents: Message queues (SQS, RabbitMQ) with DLQ

---

## Glossary

- **Handoff** - Transferring work from one agent to another
- **Context** - Information passed between agents (prompts, data, state)
- **Checkpoint** - Snapshot of agent state for recovery
- **Saga** - Pattern for coordinated transactions with compensation
- **Fiber** - Effect's unit of concurrency (like a lightweight thread)
- **Durable execution** - Workflow that survives crashes and restarts
- **Backpressure** - Slowing producers when consumers are overwhelmed
- **Circuit breaker** - Stop calling failing service to let it recover
- **DLQ** - Dead letter queue for failed tasks
- **Exactly-once** - Guarantee that operation runs once and only once
- **Idempotency** - Safe to retry operation without side effects

---

**End of Research Document**
