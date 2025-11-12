---
name: effect-time-tracing-logging
description: Time with Clock/Duration, tracing spans, and structured logging. Use for time-based logic, deadlines, and observability.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Time, Tracing & Logging

## When to use
- You need timeouts, deadlines, or sleeps
- You want spans for latency analysis or logs for debugging

## Time
```ts
import { Clock, Duration } from "effect"
const now = yield* Clock.currentTimeMillis
yield* Effect.sleep(Duration.seconds(1))
```

## Timeout
```ts
const guarded = yield* Effect.timeout(task, Duration.seconds(2))
```

## Tracing (span wrapper pattern)
```ts
const op = Effect.withSpan("operation")(Effect.succeed(1))
```

## Logging
```ts
yield* Effect.logInfo("message")
yield* Effect.logDebug("debug")
yield* Effect.logError("error")
```

## Real-world snippet: set minimum log level via Layer
```ts
import { Effect, Option, Logger, LogLevel, Layer } from "effect"

export const setMinimumLogLevel = (cliLevel: Option.Option<LogLevel.LogLevel>) =>
  APP_CONFIG["LOG_LEVEL"].pipe(
    Effect.map((envLevel) => Option.zipLeft(cliLevel, envLevel)),
    Effect.map(Option.getOrElse(() => LogLevel.Info)),
    Effect.map((level) => Logger.minimumLogLevel(level)),
    Layer.unwrapEffect
  )
```

## Guidance
- Prefer `Duration` helpers for clarity of units
- Wrap critical sections with spans; attach attributes for context
- Use structured logs and avoid ad-hoc console prints

## Pitfalls
- Mixing ms numbers → use `Duration` consistently
- No timeouts on external calls → risk of hanging operations

## Cross-links
- Errors & Retries for timeouts+races
- Concurrency for coordinated time-based operations

## References
- Agent Skills overview: https://www.anthropic.com/news/skills
- Skills guide: https://docs.claude.com/en/docs/claude-code/skills

