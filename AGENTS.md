# Effect-TS Best Practices for AI Agents

> **Version**: 1.0  
> **Updated**: 2025-11-13  
> **Purpose**: Enforce Effect-TS best practices for AI coding agents working in this codebase

## Overview

This document provides comprehensive guidelines for AI agents implementing Effect-TS patterns in this codebase. All agents MUST follow these practices to ensure consistent, type-safe, and idiomatic Effect code.

## Quick Reference

**Pattern Library Locations:**
- **Documentation**: [`/docs/effect-patterns/`](./docs/effect-patterns/)
- **Agent Skills**: [`.claude/skills/effect-patterns-hub/patterns/`](./.claude/skills/effect-patterns-hub/patterns/)
- **Claude Agents**: [`.claude/agents/`](./.claude/agents/)
- **Claude Skills Index**: [`.claude/skills/effect-index/SKILL.md`](./.claude/skills/effect-index/SKILL.md)

**Pattern Count**: 130+ curated Effect-TS patterns from [EffectPatterns](https://github.com/PaulJPhilp/EffectPatterns)

## Core Principles

### 1. Data-First Piped Style

**ALWAYS** prefer data-first pipe style for composition:

```typescript
// ✅ GOOD: Data-first with pipe
const result = value.pipe(
  Effect.map((n) => n * 2),
  Effect.flatMap((n) => processValue(n)),
  Effect.catchTag("NetworkError", () => Effect.succeed(fallback))
)

// ❌ BAD: Function-first style
const result = Effect.catchTag(
  Effect.flatMap(
    Effect.map(value, (n) => n * 2),
    (n) => processValue(n)
  ),
  "NetworkError",
  () => Effect.succeed(fallback)
)
```

**Reference Patterns:**
- [`use-pipe-for-composition.mdx`](./docs/effect-patterns/use-pipe-for-composition.mdx)
- [`avoid-long-andthen-chains.mdx`](./docs/effect-patterns/avoid-long-andthen-chains.mdx)

### 2. Effect.gen for Business Logic

Use `Effect.gen` for sequential business logic, control flow, and dependency access:

```typescript
// ✅ GOOD: Effect.gen for sequential logic
const program = Effect.gen(function* () {
  const user = yield* validateUser(data)
  const token = yield* createToken(user)
  yield* Effect.logInfo(`Token created for ${user.email}`)
  return token
})

// ❌ BAD: Overly complex pipe chains for sequential logic
const program = validateUser(data).pipe(
  Effect.flatMap((user) =>
    createToken(user).pipe(
      Effect.tap(() => Effect.logInfo(`Token created for ${user.email}`))
    )
  )
)
```

**Reference Patterns:**
- [`use-gen-for-business-logic.mdx`](./docs/effect-patterns/use-gen-for-business-logic.mdx)
- [`write-sequential-code-with-gen.mdx`](./docs/effect-patterns/write-sequential-code-with-gen.mdx)

### 3. Minimal Imperative Code

Avoid imperative patterns. Use Effect's functional combinators:

```typescript
// ✅ GOOD: Functional composition
const processItems = (items: Item[]) =>
  Effect.all(items.map(processItem), { concurrency: 5 })

// ❌ BAD: Imperative loop
const processItems = (items: Item[]) =>
  Effect.gen(function* () {
    const results = []
    for (const item of items) {
      const result = yield* processItem(item)
      results.push(result)
    }
    return results
  })
```

**Reference Patterns:**
- [`run-effects-in-parallel-with-all.mdx`](./docs/effect-patterns/run-effects-in-parallel-with-all.mdx)
- [`process-collection-in-parallel-with-foreach.mdx`](./docs/effect-patterns/process-collection-in-parallel-with-foreach.mdx)

### 4. Explicit Type Safety

**ALWAYS** specify all three Effect channels explicitly:

```typescript
// ✅ GOOD: Explicit types
const fetchUser = (id: string): Effect.Effect<User, UserNotFoundError | NetworkError, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    return yield* db.query(`SELECT * FROM users WHERE id = ?`, [id])
  })

// ❌ BAD: Implicit types
const fetchUser = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Database
    return yield* db.query(`SELECT * FROM users WHERE id = ?`, [id])
  })
```

**Effect Type Signature:**
```typescript
Effect<Success, Error, Requirements>
//     ↑        ↑      ↑
//     A        E      R
```

### 5. Tagged Errors for Domain Modeling

Define errors as tagged types using `Data.TaggedError`:

```typescript
// ✅ GOOD: Tagged errors with context
class UserNotFoundError extends Data.TaggedError("UserNotFound")<{
  readonly userId: string
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string
  readonly message: string
}> {}

// Recover from specific errors
program.pipe(
  Effect.catchTag("UserNotFound", (error) =>
    Effect.succeed(createGuestUser())
  ),
  Effect.catchTag("ValidationError", (error) =>
    Effect.fail(new BadRequestError({ details: error }))
  )
)
```

**Reference Patterns:**
- [`define-tagged-errors.mdx`](./docs/effect-patterns/define-tagged-errors.mdx)
- [`pattern-catchtag.mdx`](./docs/effect-patterns/pattern-catchtag.mdx)
- [`handle-errors-with-catch.mdx`](./docs/effect-patterns/handle-errors-with-catch.mdx)

## Service Layer Architecture

### Service Definition Pattern

Services MUST have `never` as their Requirements channel to avoid requirement leakage:

```typescript
// ✅ GOOD: Service interface with no requirements
class UserService extends Effect.Service<UserService>()("UserService", {
  effect: Effect.gen(function* () {
    const db = yield* Database
    const logger = yield* Logger

    return {
      getUser: (id: string): Effect.Effect<User, UserNotFoundError, never> =>
        Effect.gen(function* () {
          yield* logger.log(`Fetching user ${id}`)
          const user = yield* db.query(...)
          return user
        }),
    }
  }),
  dependencies: [Database.Default, Logger.Default]
}) {}

// ❌ BAD: Requirements leak into service interface
class UserService extends Effect.Service<UserService>()("UserService", {
  effect: Effect.gen(function* () {
    return {
      getUser: (id: string): Effect.Effect<User, UserNotFoundError, Database | Logger> =>
        // Dependencies leaked!
        Effect.gen(function* () {
          const db = yield* Database
          const logger = yield* Logger
          // ...
        }),
    }
  })
}) {}
```

**Reference Patterns:**
- [`model-dependencies-as-services.mdx`](./docs/effect-patterns/model-dependencies-as-services.mdx)
- [`scoped-service-layer.mdx`](./docs/effect-patterns/scoped-service-layer.mdx)
- [`understand-layers-for-dependency-injection.mdx`](./docs/effect-patterns/understand-layers-for-dependency-injection.mdx)

### Layer Composition

```typescript
// Infrastructure layer
const InfraLive = Layer.mergeAll(ConfigLive, LoggerLive, DatabaseLive)

// Domain layer (depends on infrastructure)
const DomainLive = Layer.mergeAll(UserServiceLive, AuthServiceLive).pipe(
  Layer.provide(InfraLive)
)

// Application layer
const AppLive = HttpApiLive.pipe(Layer.provide(DomainLive))
```

**Reference Patterns:**
- [`organize-layers-into-composable-modules.mdx`](./docs/effect-patterns/organize-layers-into-composable-modules.mdx)
- [`compose-scoped-layers.mdx`](./docs/effect-patterns/compose-scoped-layers.mdx)

## Operator Selection Guide

| Goal | Operator | When to Use |
|------|----------|-------------|
| Transform success value | `Effect.map` | Pure transformation, no new effects |
| Chain effects | `Effect.flatMap` | Result is another Effect |
| Replace with new effect | `Effect.andThen` | Ignoring previous result |
| Side effect only | `Effect.tap` | Logging, metrics, keep original value |
| Handle specific errors | `Effect.catchTag` | Recover from tagged errors |
| Handle all errors | `Effect.catchAll` | Universal error handler |
| Provide dependencies | `Effect.provide` | Supply Layer/Context |

**Reference Patterns:**
- [`combinator-map.mdx`](./docs/effect-patterns/combinator-map.mdx)
- [`combinator-flatmap.mdx`](./docs/effect-patterns/combinator-flatmap.mdx)
- [`combinator-error-handling.mdx`](./docs/effect-patterns/combinator-error-handling.mdx)

## Common Patterns Quick Reference

### Creation

```typescript
// Success
Effect.succeed(value)
Effect.sync(() => computation())

// Failure
Effect.fail(new MyError())

// From promises
Effect.tryPromise({
  try: () => fetch(url),
  catch: (error) => new NetworkError({ cause: error })
})
```

**Patterns**: [`constructor-succeed-some-right.mdx`](./docs/effect-patterns/constructor-succeed-some-right.mdx), [`constructor-sync-async.mdx`](./docs/effect-patterns/constructor-sync-async.mdx), [`constructor-try-trypromise.mdx`](./docs/effect-patterns/constructor-try-trypromise.mdx)

### Concurrency

```typescript
// Parallel execution
yield* Effect.all([task1, task2, task3], { concurrency: "unbounded" })

// Background tasks
const fiber = yield* Effect.fork(backgroundTask)
yield* Fiber.await(fiber)

// Racing
yield* Effect.race(primary, timeout(5000))
```

**Patterns**: [`run-effects-in-parallel-with-all.mdx`](./docs/effect-patterns/run-effects-in-parallel-with-all.mdx), [`run-background-tasks-with-fork.mdx`](./docs/effect-patterns/run-background-tasks-with-fork.mdx), [`race-concurrent-effects.mdx`](./docs/effect-patterns/race-concurrent-effects.mdx)

### Error Handling

```typescript
// Retry with schedule
program.pipe(
  Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.compose(Schedule.recurs(3))))
)

// Specific error recovery
program.pipe(
  Effect.catchTag("Transient", () => Effect.succeed(fallback))
)

// Timeout
program.pipe(Effect.timeout("5 seconds"))
```

**Patterns**: [`retry-based-on-specific-errors.mdx`](./docs/effect-patterns/retry-based-on-specific-errors.mdx), [`handle-flaky-operations-with-retry-timeout.mdx`](./docs/effect-patterns/handle-flaky-operations-with-retry-timeout.mdx)

### Resource Management

```typescript
// Scoped resources
Effect.acquireRelease(
  acquire, // Effect<Resource, E, R>
  (resource) => cleanup(resource) // cleanup Effect
)

// Use with gen
Effect.gen(function* () {
  const resource = yield* Effect.acquireRelease(
    openFile("data.txt"),
    (file) => closeFile(file)
  )
  yield* processFile(resource)
})
```

**Patterns**: [`safely-bracket-resource-usage.mdx`](./docs/effect-patterns/safely-bracket-resource-usage.mdx), [`manage-resource-lifecycles-with-scope.mdx`](./docs/effect-patterns/manage-resource-lifecycles-with-scope.mdx)

### Streaming

```typescript
// Create streams
const stream = Stream.fromIterable([1, 2, 3, 4, 5])

// Transform and process
stream.pipe(
  Stream.map((n) => n * 2),
  Stream.filter((n) => n > 5),
  Stream.runCollect
)

// Resource-safe streaming
Stream.acquireRelease(openFile, closeFile).pipe(
  Stream.flatMap((file) => Stream.fromReadableStream(() => file.stream())),
  Stream.run(Sink.collectAll())
)
```

**Patterns**: [`process-streaming-data-with-stream.mdx`](./docs/effect-patterns/process-streaming-data-with-stream.mdx), [`stream-manage-resources.mdx`](./docs/effect-patterns/stream-manage-resources.mdx)

## Testing Requirements

### Always Use .Default Layers

```typescript
// ✅ GOOD: Use auto-generated Default layer
test("user service", () =>
  Effect.gen(function* () {
    const userService = yield* UserService
    const user = yield* userService.getUser("123")
    expect(user.id).toBe("123")
  }).pipe(Effect.provide(UserService.Default))
)

// ❌ BAD: Manual layer construction in tests
test("user service", () =>
  Effect.gen(function* () {
    const userService = yield* UserService
    // ...
  }).pipe(Effect.provide(Layer.succeed(UserService, ...)))
)
```

**Reference Patterns:**
- [`use-default-layer-for-tests.mdx`](./docs/effect-patterns/use-default-layer-for-tests.mdx)
- [`mocking-dependencies-in-tests.mdx`](./docs/effect-patterns/mocking-dependencies-in-tests.mdx)
- [`write-tests-that-adapt-to-application-code.mdx`](./docs/effect-patterns/write-tests-that-adapt-to-application-code.mdx)

### Test Layer Pattern

```typescript
// Create test layers with mocks
const DatabaseTest = Layer.succeed(Database, {
  query: () => Effect.succeed(mockData)
})

const TestLive = Layer.mergeAll(DatabaseTest, LoggerTest)

// Use in tests
test("feature", () =>
  program.pipe(Effect.provide(TestLive), Effect.runPromise)
)
```

## Schema and Validation

Use `@effect/schema` for domain modeling and validation:

```typescript
import { Schema } from "@effect/schema"

// Define schema
const User = Schema.Struct({
  id: Schema.String.pipe(Schema.uuid()),
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  age: Schema.Number.pipe(Schema.int(), Schema.positive()),
  createdAt: Schema.Date
})

// Extract type
type User = Schema.Schema.Type<typeof User>

// Decode with Effect
const decodeUser = Schema.decode(User)

const program = Effect.gen(function* () {
  const user = yield* decodeUser(rawData)
  return user
})
```

**Reference Patterns:**
- [`define-contracts-with-schema.mdx`](./docs/effect-patterns/define-contracts-with-schema.mdx)
- [`parse-with-schema-decode.mdx`](./docs/effect-patterns/parse-with-schema-decode.mdx)
- [`transform-data-with-schema.mdx`](./docs/effect-patterns/transform-data-with-schema.mdx)
- [`brand-model-domain-type.mdx`](./docs/effect-patterns/brand-model-domain-type.mdx)

## Pattern Matching

Use Match API for type-safe branching:

```typescript
import { Match } from "effect"

const result = Match.value(value).pipe(
  Match.when("success", () => Effect.succeed("Great!")),
  Match.when("pending", () => Effect.succeed("Wait...")),
  Match.orElse(() => Effect.fail(new UnknownStatusError()))
)

// Tag-based matching
const handle = Match.type<Result>().pipe(
  Match.tag("Success", ({ data }) => processSuccess(data)),
  Match.tag("Failure", ({ error }) => handleError(error)),
  Match.exhaustive
)
```

**Reference Patterns:**
- [`pattern-match.mdx`](./docs/effect-patterns/pattern-match.mdx)
- [`pattern-matcheffect.mdx`](./docs/effect-patterns/pattern-matcheffect.mdx)
- [`pattern-matchtag.mdx`](./docs/effect-patterns/pattern-matchtag.mdx)

## HTTP and API Patterns

### HTTP Server

```typescript
import { HttpServer, HttpRouter, HttpMiddleware } from "@effect/platform"

const router = HttpRouter.empty.pipe(
  HttpRouter.get("/users/:id", 
    Effect.gen(function* () {
      const params = yield* HttpRouter.params
      const userService = yield* UserService
      const user = yield* userService.getUser(params.id)
      return HttpServer.response.json(user)
    })
  )
)

const app = router.pipe(
  HttpServer.serve(HttpMiddleware.logger),
  Layer.provide(UserService.Default)
)
```

**Reference Patterns:**
- [`build-a-basic-http-server.mdx`](./docs/effect-patterns/build-a-basic-http-server.mdx)
- [`launch-http-server.mdx`](./docs/effect-patterns/launch-http-server.mdx)
- [`handle-get-request.mdx`](./docs/effect-patterns/handle-get-request.mdx)
- [`make-http-client-request.mdx`](./docs/effect-patterns/make-http-client-request.mdx)

### API Error Handling

```typescript
// Define API errors
class BadRequestError extends Data.TaggedError("BadRequest")<{
  readonly message: string
}> {}

class NotFoundError extends Data.TaggedError("NotFound")<{
  readonly resource: string
}> {}

// Handle in routes
const handler = program.pipe(
  Effect.catchTag("ValidationError", (e) =>
    Effect.fail(new BadRequestError({ message: e.message }))
  ),
  Effect.catchTag("UserNotFound", (e) =>
    Effect.fail(new NotFoundError({ resource: "user" }))
  )
)
```

**Reference Patterns:**
- [`handle-api-errors.mdx`](./docs/effect-patterns/handle-api-errors.mdx)
- [`validate-request-body.mdx`](./docs/effect-patterns/validate-request-body.mdx)

## Observability

### Structured Logging

```typescript
// Always use structured logging
yield* Effect.logInfo("User created", { userId, email, timestamp })

// Log levels
yield* Effect.logDebug("Debug details", context)
yield* Effect.logWarning("Potential issue", { reason })
yield* Effect.logError("Operation failed", { error, context })
```

**Reference Patterns:**
- [`leverage-structured-logging.mdx`](./docs/effect-patterns/leverage-structured-logging.mdx)
- [`observability-structured-logging.mdx`](./docs/effect-patterns/observability-structured-logging.mdx)

### Tracing

```typescript
// Add tracing spans
const operation = Effect.gen(function* () {
  // ... operation logic
}).pipe(
  Effect.withSpan("operation-name", { attributes: { userId, operation: "create" } })
)
```

**Reference Patterns:**
- [`trace-operations-with-spans.mdx`](./docs/effect-patterns/trace-operations-with-spans.mdx)
- [`observability-tracing-spans.mdx`](./docs/effect-patterns/observability-tracing-spans.mdx)

### Metrics

```typescript
import { Metric } from "effect"

const requestCounter = Metric.counter("http_requests_total")
const requestDuration = Metric.histogram("http_request_duration_ms")

yield* Metric.increment(requestCounter)
yield* Metric.set(requestDuration, duration)
```

**Reference Patterns:**
- [`add-custom-metrics.mdx`](./docs/effect-patterns/add-custom-metrics.mdx)
- [`observability-custom-metrics.mdx`](./docs/effect-patterns/observability-custom-metrics.mdx)

## Anti-Patterns to Avoid

### ❌ Don't Mix Promises and Effects Directly

```typescript
// ❌ BAD
const result = await Effect.runPromise(effect)
return result

// ✅ GOOD
const program = Effect.gen(function* () {
  const result = yield* effect
  return result
})
```

### ❌ Don't Return Raw Values in Effect.gen

```typescript
// ❌ BAD
Effect.gen(function* () {
  const user = getUser() // Returns plain User, not Effect
  return user
})

// ✅ GOOD
Effect.gen(function* () {
  const user = yield* getUser() // Returns Effect<User>
  return user
})
```

### ❌ Don't Ignore Type Parameters

```typescript
// ❌ BAD
const process = (id: string) => {
  // Implicit any everywhere
  return Effect.gen(function* () {
    const data = yield* fetchData(id)
    return transform(data)
  })
}

// ✅ GOOD
const process = (id: string): Effect.Effect<Result, FetchError | TransformError, Database> =>
  Effect.gen(function* () {
    const data = yield* fetchData(id)
    return transform(data)
  })
```

### ❌ Don't Use Imperative Loops for Effect Collections

```typescript
// ❌ BAD
const results = []
for (const item of items) {
  results.push(yield* process(item))
}

// ✅ GOOD
const results = yield* Effect.all(items.map(process), { concurrency: 5 })
```

## Decision Tree for Pattern Selection

```
Need to... 
├─ Create an Effect?
│  ├─ From value? → Effect.succeed / Effect.fail
│  ├─ From sync code? → Effect.sync / Effect.try
│  ├─ From promise? → Effect.tryPromise
│  └─ From callback? → Effect.async
│
├─ Transform values?
│  ├─ Pure function? → Effect.map
│  ├─ Returns Effect? → Effect.flatMap
│  ├─ Side effect only? → Effect.tap
│  └─ Replace entirely? → Effect.andThen
│
├─ Handle errors?
│  ├─ Specific error type? → Effect.catchTag
│  ├─ All errors? → Effect.catchAll
│  ├─ Retry? → Effect.retry(schedule)
│  └─ Timeout? → Effect.timeout
│
├─ Run concurrently?
│  ├─ Multiple effects? → Effect.all
│  ├─ Background task? → Effect.fork
│  ├─ Race? → Effect.race
│  └─ Collection? → Effect.forEach with concurrency
│
├─ Manage resources?
│  ├─ Simple acquire/release? → Effect.acquireRelease
│  ├─ Multiple resources? → Effect.scoped
│  └─ Manual control? → Scope API
│
├─ Stream data?
│  ├─ From iterable? → Stream.fromIterable
│  ├─ From file? → Stream.fromReadableStream
│  ├─ Transform? → Stream.map / Stream.filter
│  └─ With backpressure? → Stream.buffer
│
└─ Model dependencies?
   ├─ Define service? → Effect.Service
   ├─ Implement? → Layer.effect / Layer.scoped
   ├─ Compose? → Layer.merge / Layer.provide
   └─ Test? → Mock layers + .Default
```

## Integration with Existing Codebase

### Claude Agent Hierarchy

1. **effect-architect** - Service design, Layer composition, architecture decisions
2. **effect-engineer** - Implementation, coding patterns, operator usage
3. **effect-expert** - Complex patterns, performance optimization
4. **effect-tester** - Test implementation, mocking strategies

See [`.claude/agents/`](./.claude/agents/) for detailed agent instructions.

### Skills System

All agents have access to specialized skills in [`.claude/skills/`](./.claude/skills/):

- `effect-foundations` - Core Effect patterns
- `effect-errors-retries` - Error handling and retry logic
- `effect-concurrency-fibers` - Concurrency and fiber management
- `effect-streams-pipelines` - Stream processing
- `effect-layers-services` - Dependency injection
- `effect-http-routing` - HTTP server and routing
- `effect-testing-mocking` - Testing strategies
- `effect-patterns-hub` - **This pattern library (130+ patterns)**

### Pattern Lookup Workflow

1. **Check local patterns first**: Search `docs/effect-patterns/` or `.claude/skills/effect-patterns-hub/patterns/`
2. **Consult skills**: Reference `.claude/skills/effect-index/SKILL.md` for decision tree
3. **Ask agents**: Use `@effect-architect` for design, `@effect-engineer` for implementation
4. **Read source**: When type errors occur, inspect `node_modules/effect/` for actual types

## API Endpoints Reference

This codebase exposes the following Effect patterns API:

```json
{
  "name": "Effect Patterns API",
  "version": "v1",
  "description": "AI coding rules for Effect-TS patterns",
  "repository": "https://github.com/PaulJPhilp/EffectPatterns",
  "endpoints": {
    "health": "/health",
    "rules": {
      "list": "/api/v1/rules",
      "get": "/api/v1/rules/{id}"
    }
  }
}
```

**Local Pattern Endpoints:**
- Pattern library: `file://./docs/effect-patterns/`
- Skills integration: `file://./.claude/skills/effect-patterns-hub/`
- Agent configurations: `file://./.claude/agents/`

## Additional Resources

- **Effect Documentation**: [https://effect.website/](https://effect.website/)
- **Effect Patterns Hub**: [https://github.com/PaulJPhilp/EffectPatterns](https://github.com/PaulJPhilp/EffectPatterns)
- **Effect Discord**: [https://discord.gg/effect-ts](https://discord.gg/effect-ts)
- **Local Patterns**: `docs/effect-patterns/README.md`
- **MCP Server Setup**: See EffectPatterns `MCP_SERVER_SETUP.md`

## Summary Checklist

When implementing Effect code, ensure:

- [ ] Using data-first pipe style (`.pipe()`)
- [ ] Effect.gen for sequential business logic
- [ ] Explicit type annotations `Effect<A, E, R>`
- [ ] Tagged errors with `Data.TaggedError`
- [ ] Service interfaces have `never` requirements
- [ ] Functional combinators over imperative loops
- [ ] Proper resource management with `acquireRelease`
- [ ] Structured logging with context
- [ ] Test layers use `.Default`
- [ ] Schema validation for domain models
- [ ] Pattern matching with Match API
- [ ] Consulted local patterns first

---

**Last Updated**: 2025-11-13  
**Maintained By**: Effect-TS Community  
**Pattern Source**: [EffectPatterns Repository](https://github.com/PaulJPhilp/EffectPatterns)

