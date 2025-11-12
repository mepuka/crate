---
name: effect-queues-background
description: Queue and PubSub patterns, background fibers, and graceful shutdown. Use for decoupling producers/consumers.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Queues, PubSub & Background

## When to use
- Decoupling producers/consumers with backpressure
- Broadcasting events to multiple subscribers
- Running background loops with graceful shutdown

## Queue (bounded)
```ts
import { Queue } from "effect"
const q = yield* Queue.bounded<string>(32)
yield* Queue.offer(q, "job")
const job = yield* Queue.take(q)
```

## PubSub (broadcast)
```ts
import { PubSub } from "effect"
const ps = yield* PubSub.bounded<string>(32)
yield* PubSub.publish(ps, "evt")
```

## Background Fiber
```ts
const fiber = yield* Effect.fork(loop)
yield* Fiber.interrupt(fiber)
```

## Guidance
- Prefer bounded queues to apply natural backpressure
- Use multiple workers by forking consumers
- Ensure background fibers are interrupted during shutdown

## Pitfalls
- Unbounded queues lead to memory growth
- Silent background failures → add logging/metrics

## Cross-links
- Concurrency for pools and interruption
- Time/Logging for observability of background tasks

## References
- Agent Skills overview: https://www.anthropic.com/news/skills
- Skills guide: https://docs.claude.com/en/docs/claude-code/skills

