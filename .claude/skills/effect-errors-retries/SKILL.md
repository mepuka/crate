---
name: effect-errors-retries
description: Error modeling and recovery with TaggedError, catchTag(s), mapError, and retry schedules. Use when defining errors or adding resilience.
allowed-tools: Read, Grep, Glob, Edit, Write, mcp__effect-docs__effect_docs_search
---

# Errors & Retries

## When to use
- You’re defining domain errors and recovery policies
- You need to map infrastructure errors to domain boundaries
- You must add retries, backoff, jitter, and timeouts

## Model Errors
```ts
import { Data } from "effect"

class ValidationError extends Data.TaggedError("ValidationError")<{ field: string; reason: string }>{}
class NotFoundError extends Data.TaggedError("NotFoundError")<{ id: string }>{}
```

## Map/Boundary
```ts
const repoCall = Effect.fail(new ValidationError({ field: "name", reason: "empty" }))

const service = repoCall.pipe(
  Effect.mapError((e) => new ServiceError({ cause: e }))
)
```

## Recover Precisely
```ts
program.pipe(
  Effect.catchTags({
    ValidationError: (e) => Effect.succeed(fix(e)),
    NotFoundError: (e) => Effect.succeed(defaultValue)
  })
)
```

## Retry Policies
```ts
import { Schedule } from "effect"

const retry = Schedule.exponential("100 millis").pipe(
  Schedule.jittered,
  Schedule.compose(Schedule.recurs(5))
)

const resilient = program.pipe(Effect.retry(retry))
```

## Timeouts & Races
```ts
const withTimeout = Effect.timeout(program, "2 seconds")
```

## Guidance & Pitfalls
- Create separate TaggedError types per failure mode; avoid generic Error
- Map low-level (HTTP/DB) errors to domain errors at the boundary
- Retry only transient errors (use predicates with `Schedule.whileInput`)
- Always combine retry with timeouts for bounded latency
- Prefer `catchTags` over broad `catchAll` for clarity and safety

## Real-world snippet: Map HTTP errors and retry selectively
```ts
// Verify URL with HEAD-range request, map ResponseError to domain errors,
// retry with exponential backoff unless invalid.
const verify = http.get(url, { headers: { range: "bytes=0-0" } }).pipe(
  Effect.flatMap(HttpClientResponse.filterStatus((s) => s < 400)),
  Effect.catchIf(
    (e) => e._tag === "ResponseError",
    (cause) =>
      cause.response.status < 500
        ? Effect.fail(new VideoInvalidError({ cause: "NotFound" }))
        : Effect.fail(new ExternalLoomError({ cause: cause.response }))
  ),
  Effect.retry({
    schedule: Schedule.exponential("200 millis"),
    times: 3,
    while: (e) => e._tag !== "VideoInvalidError"
  }),
  Effect.catchTag("RequestError", Effect.die)
)
```

## Real-world snippet: Capture structured errors from Cause
```ts
import { Cause } from "effect"

const captureErrors = (cause: Cause.Cause<unknown>) => Effect.gen(function* () {
  if (Cause.isInterruptedOnly(cause)) return { interrupted: true, errors: [] }
  const raw = captureErrorsFrom(cause)
  const errors = yield* Effect.forEach(raw, transformRawError({ stripCwd: true }))
  return { interrupted: false, errors }
})
```

## Quick Heuristics
- Domain errors → TaggedError per type
- Map low-level to high-level at boundaries
- Retry only transient errors; predicate with `Schedule.whileInput`

## Cross-links
- Foundations: operator selection and `.pipe` style
- Concurrency: race and timeout patterns
- EffectPatterns inspiration: https://github.com/PaulJPhilp/EffectPatterns

## References
- Agent Skills overview: https://www.anthropic.com/news/skills
- Skills guide: https://docs.claude.com/en/docs/claude-code/skills

