# Agent Handoff Patterns - Executive Summary

**Research Task:** crate-njw
**Date:** 2025-12-17

## Quick Reference

This document provides a quick decision guide for choosing agent handoff patterns. For full details, see `/Users/pooks/Dev/crate/docs/research/agent-handoff-patterns.md`

---

## Pattern Selection Decision Tree

```
Need durability across crashes?
├─ NO
│  ├─ Same process?
│  │  ├─ YES → Queue-based handoff (Pattern 1)
│  │  └─ NO → RPC-based handoff (Pattern 2)
│  └─ Need backpressure? → Stream handoff (Pattern 3)
│
└─ YES
   ├─ Simple checkpoint/resume?
   │  └─ YES → Database checkpoint (Pattern 4)
   │
   └─ Complex multi-step with rollback?
      ├─ Moderate complexity → Saga pattern (Pattern 5)
      └─ High complexity → Effect Workflow (Pattern 6)

Need to reduce token costs?
└─ YES → Static+Dynamic context split (Pattern 7)

Need transient failure handling?
└─ YES → Retry with backoff (Pattern 8)

Need parallel execution?
└─ YES → Fiber-based parallel (Pattern 9)
```

---

## Quick Comparison

### By Implementation Complexity

| Pattern | Complexity | Time | When to Use |
|---------|-----------|------|-------------|
| Queue-based | Low (2/10) | 1-2 days | Same-process, fire-and-forget |
| Retry | Low (2/10) | 1 day | Add to any pattern |
| Static+Dynamic | Low (2/10) | 2-3 days | Always (token savings) |
| Stream | Medium (5/10) | 3-5 days | Backpressure needed |
| RPC | Medium (6/10) | 1 week | Cross-service |
| Fiber/Parallel | Medium (5/10) | 2-3 days | Independent tasks |
| DB Checkpoint | Medium (4/10) | 3-4 days | Need crash recovery |
| Saga | High (7/10) | 2-3 weeks | Multi-step rollback |
| Entity/Actor | Very High (9/10) | 4-6 weeks | Distributed state |
| Workflow | Very High (8/10) | 3-4 weeks | Long-running critical |

### By Durability

| Pattern | Survives Crash? | Resume Capability | Storage Required |
|---------|----------------|-------------------|------------------|
| Queue-based | No | No | None |
| Stream | No | No | None |
| RPC | No | No | None |
| Retry | No | No | None |
| Fiber/Parallel | No | No | None |
| Static+Dynamic | N/A | N/A | None |
| DB Checkpoint | Yes | Yes | Database |
| Saga | Yes | Yes | Database |
| Entity/Actor | Yes | Yes | Database |
| Workflow | Yes | Yes | Database + Cluster |

### By Use Case

| Use Case | Best Pattern | Alternative |
|----------|-------------|-------------|
| Reduce token costs | Static+Dynamic | - |
| Handle API failures | Retry | Circuit breaker |
| Same-process handoff | Queue-based | Stream |
| Cross-service handoff | RPC | HTTP/REST |
| Need backpressure | Stream | Queue-based |
| Need crash recovery | DB Checkpoint | Workflow |
| Long-running (hours) | Workflow | DB Checkpoint |
| Multi-step with rollback | Saga | Workflow |
| Parallel execution | Fiber/Parallel | Effect.all |
| Distributed system | Entity/Actor | Workflow |

---

## Recommended Stack for Crate

### Current State (MVP)
Research agent processes single play, generates insights, <2 min timeout.

### Recommended Patterns

#### 1. Static + Dynamic Context (Immediate - This Week)
**Why:** 90% token cost reduction
**Effort:** 2-3 days
**ROI:** ~$25K/year savings

```typescript
const messages = createCacheablePrompt(play, showContext, insights)
// Static prompt cached, only dynamic portion sent
```

**Implementation:** Already designed in `/Users/pooks/Dev/crate/docs/plans/2025-12-04-token-optimization.md`

#### 2. Retry with Exponential Backoff (Immediate - This Week)
**Why:** Handle transient API failures
**Effort:** 1 day
**ROI:** Prevents failed insights due to network blips

```typescript
const results = yield* searchPlays(params).pipe(
  Effect.retry({
    times: 5,
    schedule: Schedule.exponential("100 millis")
  })
)
```

**Implementation:** Add retry wrapper to all tool calls

#### 3. Database Checkpoint (Short-term - Next 2 Weeks)
**Why:** Enable "resume research" feature, survive Cloud Run timeouts
**Effort:** 3-4 days
**ROI:** Better UX, can handle longer research

```typescript
// Save checkpoint after each major step
yield* saveCheckpoint({
  executionId,
  playId: play.id,
  insights: currentInsights,
  status: "researching"
})

// Resume from checkpoint on timeout/crash
const checkpoint = yield* loadCheckpoint(executionId, playId)
if (checkpoint) {
  yield* resumeResearch(checkpoint)
}
```

**Implementation:** New table + save/load functions

#### 4. Fiber-Based Parallel (Short-term - Next 2 Weeks)
**Why:** 2x speedup by running research tasks in parallel
**Effort:** 2-3 days
**ROI:** Faster insights, better Cloud Run utilization

```typescript
// Run cover/sample/history research in parallel
const [covers, samples, history] = yield* Effect.all([
  researchCovers(play, context),
  researchSamples(play, context),
  researchHistory(play, context)
], { concurrency: 3 })
```

**Implementation:** Refactor sequential research to parallel

### Not Recommended (Yet)

#### Queue-Based Handoff
**Why not:** Single agent per play, no pipeline needed
**When to revisit:** If building multi-agent orchestration

#### Effect Workflow
**Why not:** Overkill for <2 min operations
**When to revisit:** If workflows extend to hours/days

#### Saga Pattern
**Why not:** No multi-step transactions with rollback yet
**When to revisit:** If adding payment/critical operations

#### Entity/Actor Pattern
**Why not:** No distributed state management needed
**When to revisit:** If scaling to cluster

---

## Context Transfer Strategies

### Recommended: Static + Dynamic Split

```typescript
// Static (8,500 tokens) - cached 90% reduction
const STATIC_PROMPT = [
  CORE_IDENTITY,
  PHILOSOPHY,
  KEXP_CULTURE,
  INSIGHT_TYPES,
  TOOLS,
  // ... all unchanging sections
].join("\n\n")

// Dynamic (1,500 tokens) - always sent
const dynamicContext = {
  currentTime: new Date(),
  showContext: currentShow,
  recentInsights: insights.slice(-10)  // Rolling window
}

// On handoff
const messages = [
  {
    role: "system",
    content: STATIC_PROMPT,
    cache_control: { type: "ephemeral" }  // CACHED
  },
  {
    role: "system",
    content: buildDynamicContext(dynamicContext)  // NOT CACHED
  }
]
```

**Token cost:**
- Before: ~13,000 tokens/iteration (~$0.03)
- After: ~1,500 tokens/iteration (~$0.003)
- Savings: 90% (~$25K/year at current usage)

### Alternative: Reference-Based (For Large Context)

If context grows beyond 50KB, store in database and pass reference:

```typescript
// Save large context
const contextRef = yield* saveContext({
  executionId,
  fullContext: largeObject
})

// Pass only reference
yield* agentB.handle({
  contextRef: contextRef.id,
  payload: minimalPayload
})

// Agent B loads on demand
const context = yield* loadContext(contextRef.id)
```

**Trade-off:** Database latency for reduced token costs

---

## State Management Strategy

### Recommended: Hybrid Approach

**For ephemeral state (during single run):**
Use Effect's `Ref` for in-memory state

```typescript
const state = yield* Ref.make<AgentState>({
  insights: [],
  exploredNodes: new Set()
})

// Update atomically
yield* Ref.update(state, (s) => ({
  ...s,
  insights: [...s.insights, newInsight]
}))
```

**For durable state (across runs):**
Use database checkpoints

```typescript
// Save after major steps
yield* saveCheckpoint({
  executionId,
  playId,
  state: currentState
})

// Load on startup
const checkpoint = yield* loadCheckpoint(executionId, playId)
```

**Why hybrid:** Best of both worlds - fast in-memory, durable persistence

---

## Error Recovery Strategy

### Recommended: Layered Approach

#### Layer 1: Retry (Handle Transient Failures)
```typescript
const result = yield* operation.pipe(
  Effect.retry({
    times: 5,
    schedule: Schedule.exponential("100 millis")
  })
)
```

#### Layer 2: Timeout (Prevent Hangs)
```typescript
const result = yield* operation.pipe(
  Effect.timeout("30 seconds")
)
```

#### Layer 3: Checkpoint (Enable Resume)
```typescript
// Before expensive operation
yield* saveCheckpoint(currentState)

// Do work
const result = yield* expensiveOperation

// Update checkpoint
yield* saveCheckpoint(newState)
```

#### Layer 4: Logging (Debug Failures)
```typescript
const result = yield* operation.pipe(
  Effect.tapError((error) =>
    Effect.logError("Operation failed", { error, context })
  )
)
```

**Combined:**
```typescript
const resilientOperation = operation.pipe(
  Effect.retry({ times: 3 }),
  Effect.timeout("1 minute"),
  Effect.tap(() => saveCheckpoint(state)),
  Effect.tapError((error) => Effect.logError("Failed", { error }))
)
```

---

## Async vs Sync Handoffs

### Default: Fiber-Based Async

For most handoffs, use Effect's `Fiber`:

```typescript
// Start work in background
const fiber = yield* agentB.enrich(data).pipe(Effect.fork)

// Do other work
yield* continueOtherWork()

// Later, get result
const result = yield* Fiber.join(fiber)
```

### When to Use Sync

Only use synchronous handoffs when:
1. Next step strictly depends on result
2. No other work to do while waiting
3. Debugging async issues

```typescript
// Synchronous
const result = yield* agentB.enrich(data)
yield* nextStep(result)
```

### Parallel Execution Pattern

For independent tasks:

```typescript
// Run all in parallel
const [resultA, resultB, resultC] = yield* Effect.all([
  agentA.work(),
  agentB.work(),
  agentC.work()
], { concurrency: 3 })
```

---

## Implementation Roadmap

### Week 1: Token Optimization + Retry
**Goal:** 90% token savings, handle transient failures
**Tasks:**
1. Implement Static + Dynamic context split (2 days)
2. Add retry wrapper to all tools (1 day)
3. Deploy and monitor (1 day)

**Expected impact:**
- Token costs: -90%
- Reliability: +20%

### Week 2-3: Checkpointing
**Goal:** Enable crash recovery and resume
**Tasks:**
1. Create `agent_checkpoints` table (0.5 days)
2. Implement save/load checkpoint functions (1 day)
3. Integrate with MusicAgent (1 day)
4. Add resume endpoint (0.5 day)
5. Testing and rollout (1 day)

**Expected impact:**
- Can survive Cloud Run timeouts
- Users can resume failed research

### Week 4: Parallel Execution
**Goal:** 2x speedup
**Tasks:**
1. Refactor research into parallel tasks (2 days)
2. Add timeout and error handling (1 day)
3. Performance testing (1 day)

**Expected impact:**
- Research time: -50%
- Cloud Run costs: -30% (fewer billable seconds)

### Future Considerations

**Only implement if requirements change:**

- **Queue-based handoff:** If building multi-agent pipeline
- **RPC handoff:** If splitting into microservices
- **Effect Workflow:** If workflows extend to hours/days
- **Saga pattern:** If adding transactional operations
- **Circuit breaker:** If external services unreliable

---

## Key Metrics to Track

### Performance
- Research duration (p50, p95, p99)
- Token usage per play
- Error rate by error type
- Checkpoint save/load latency

### Cost
- Token costs (input/output/cached)
- Database query costs
- Cloud Run billable seconds
- Failed research cost (wasted tokens)

### Reliability
- Success rate
- Retry rate by tool
- Checkpoint resume rate
- Error recovery success

---

## Anti-Patterns to Avoid

### Don't: Unbounded Context Growth
```typescript
// BAD: Context grows without bound
const context = {
  allInsights: insights,  // Could be 1000s
  conversationHistory: history  // Grows forever
}
```

**Fix:** Use rolling windows
```typescript
const context = {
  recentInsights: insights.slice(-10),  // Last 10 only
  conversationHistory: history.slice(-5)
}
```

### Don't: Synchronous When Async Would Work
```typescript
// BAD: Sequential when could be parallel
const a = yield* agentA.work()
const b = yield* agentB.work()
const c = yield* agentC.work()
```

**Fix:** Parallelize independent work
```typescript
const [a, b, c] = yield* Effect.all([
  agentA.work(),
  agentB.work(),
  agentC.work()
])
```

### Don't: Retry Everything Forever
```typescript
// BAD: Retry all errors indefinitely
const result = yield* operation.pipe(
  Effect.retry({ forever: true })
)
```

**Fix:** Limit retries, filter error types
```typescript
const result = yield* operation.pipe(
  Effect.retry({
    times: 5,
    while: (error) =>
      error._tag !== "PermanentError"  // Don't retry permanent errors
  })
)
```

### Don't: Serialize Everything to Database
```typescript
// BAD: Save every intermediate value
yield* saveCheckpoint(state1)
yield* saveCheckpoint(state2)
yield* saveCheckpoint(state3)
```

**Fix:** Checkpoint only at major milestones
```typescript
yield* saveCheckpoint(afterInitialResearch)
// ... lots of work ...
yield* saveCheckpoint(afterDeepDive)
// ... more work ...
yield* saveCheckpoint(final)
```

---

## Summary

**For Crate's current requirements, implement in order:**

1. **Static + Dynamic Context** (2-3 days) - Huge ROI
2. **Retry with Backoff** (1 day) - Easy reliability win
3. **Database Checkpointing** (3-4 days) - Enables resume
4. **Fiber-Based Parallel** (2-3 days) - Performance boost

**Total effort:** 2-3 weeks for all four patterns

**Expected impact:**
- Token costs: -90%
- Research speed: +100% (2x faster)
- Reliability: +30% (fewer failures)
- UX: Resume capability unlocked

**Don't implement (yet):**
- Effect Workflow (too complex for <2 min operations)
- Queue-based orchestration (no pipeline yet)
- Saga pattern (no transactional operations)
- Entity/Actor model (no distributed state)

These patterns can be added later if requirements change.

---

**Full research available in:** `/Users/pooks/Dev/crate/docs/research/agent-handoff-patterns.md`
