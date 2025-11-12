---
name: effect-concurrency-fibers
description: Concurrency with Effect.all, forEach concurrency, Fiber lifecycle, race and timeouts. Use for parallelizing tasks safely.
allowed-tools: Read, Grep, Glob, Edit, Write, mcp__effect-docs__effect_docs_search
---

# Concurrency & Fibers

## When to use
- Parallelizing independent work safely with limits
- Coordinating background tasks and lifecycle
- Racing operations for latency control

## Parallel Patterns
```ts
const results = yield* Effect.all(tasks, { concurrency: 10 })
```

```ts
const processed = yield* Effect.forEach(items, processItem, { concurrency: 5 })
```

## Fiber Lifecycle
```ts
const fiber = yield* Effect.fork(work)
const value = yield* Fiber.join(fiber)
yield* Fiber.interrupt(fiber)
```

## Racing / Timeouts
```ts
const fastest = yield* Effect.race(slow, fast)
const withTimeout = yield* Effect.timeout(operation, "5 seconds")
```

## Guidance
- Limit concurrency to protect resources
- Use `fork` for background loops; always manage interruption
- Prefer `Effect.all` for independent operations
 - Use `Effect.forEach` with `concurrency` for pools
 - Combine with retries and timeouts for resilient parallelism

## Pitfalls
- Unbounded concurrency can exhaust CPU/IO or hit rate limits
- Always interrupt background fibers on shutdown
- Don’t block inside fibers; keep work asynchronous/effectful

## Cross-links
- Errors & Retries: backoff + jitter for transient failures
- Streams & Pipelines: concurrent map over streams
- EffectPatterns inspiration: https://github.com/PaulJPhilp/EffectPatterns

## References
- Agent Skills overview: https://www.anthropic.com/news/skills
- Skills guide: https://docs.claude.com/en/docs/claude-code/skills

