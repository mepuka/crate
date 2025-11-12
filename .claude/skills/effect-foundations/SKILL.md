---
name: effect-foundations
description: Core Effect foundations and style for a coding agent. Use when starting an Effect task, choosing operators, or structuring a small pipeline.
allowed-tools: Read, Grep, Glob, Edit, Write, mcp__effect-docs__effect_docs_search, mcp__effect-docs__get_effect_doc
---

# Effect Foundations & Style

Purpose: Provide a compact, go-to checklist for writing idiomatic Effect TypeScript with data-first pipe style, minimal imperative code, and strong typing. Optimized for a coding agent with limited context.

## Triggers
- New Effect implementation or refactor
- Selecting map/flatMap/andThen/tap operators
- Converting promise/callback to Effect

## When to use
- You’re unsure which operator to pick (map vs flatMap vs andThen vs tap)
- You need a minimal template for sequential vs parallel code
- You want to keep error and context channels explicit (`Effect<E, A, R>`)

## Checklist (Do First)
1. Prefer data-first `.pipe()` style for readability
2. Use `Effect.gen` for sequential logic; `Effect.all` for parallelism
3. Lift values with `Effect.succeed`, failures with `Effect.fail`
4. Declare errors as `Data.TaggedError` and recover with `catchTag(s)`
5. Keep effects small, composable, and typed—avoid `any`
6. If `R` (requirements) is not `never`, provide layers explicitly

## Minimal Patterns
- Creation

```ts
const value = Effect.succeed(42)
const failure = Effect.fail(new MyError())
```

- Transform

```ts
const result = value.pipe(
  Effect.map((n) => n * 2),
  Effect.tap((n) => Effect.log(`n=${n}`))
)
```

- Sequential

```ts
const program = Effect.gen(function* () {
  const a = yield* getA()
  const b = yield* getB(a)
  return b
})
```

- Parallel

```ts
const both = yield* Effect.all([left(), right()], { concurrency: "unbounded" })
```

## Operator Selection Guide
- Map value: `Effect.map`
- Chain effect: `Effect.flatMap`
- Ignore previous result: `Effect.andThen`
- Side-effect only: `Effect.tap`
- Provide context: `Effect.provide`/layers (see layers skill)
 - Combine layers: `Layer.merge`, `Layer.provide`

## Key APIs (intuition)
- `Effect.gen`: write sequential code with `yield*` for each Effect
- `Effect.all(values, { concurrency })`: run independent Effects concurrently
- `Effect.catchTags(...)`: recover only specific typed errors
- `Layer.merge(a, b)`: compose dependencies once, reuse everywhere
- `Effect.runPromise(...)`: bridge Effects to async workflows

## Real-world snippet: Branching with Match and TaggedError
```ts
import { Effect, Match, Data } from "effect"

class UnsupportedPlatformError extends Data.TaggedError("UnsupportedPlatformError")<{
  readonly platform: string
  readonly arch: string
}>{}

const detectPlatform = (rawPlatform: string, rawArch: string) => Effect.gen(function* () {
  const platform = yield* Match.value(rawPlatform).pipe(
    Match.when("darwin", () => Effect.succeed("darwin" as const)),
    Match.when("linux", () => Effect.succeed("linux" as const)),
    Match.orElse(() => Effect.fail(new UnsupportedPlatformError({ platform: rawPlatform, arch: rawArch })))
  )
  const arch = yield* Match.value(rawArch).pipe(
    Match.when("x64", () => Effect.succeed("x64" as const)),
    Match.when("arm64", () => Effect.succeed("aarch64" as const)),
    Match.when("aarch64", () => Effect.succeed("aarch64" as const)),
    Match.orElse(() => Effect.fail(new UnsupportedPlatformError({ platform: rawPlatform, arch: rawArch })))
  )
  return { platform, arch }
})
```

## Recovery (Quick)

```ts
program.pipe(
  Effect.catchTag("DomainError", () => Effect.succeed(fallback)),
  Effect.catchAll((e) => Effect.fail(new WrappedError({ cause: e })))
)
```

## Tooling Steps (with effect-engineer)
- Grep local examples: `Effect.gen`, `Effect.all`, `.pipe(`
- Search docs MCP for operator specifics when unsure
 - Consult EffectPatterns for canonical idioms (https://github.com/PaulJPhilp/EffectPatterns)

## Pitfalls
- Don’t mix promises and effects—wrap with `Effect.try/tryPromise`
- Don’t return raw values inside `Effect.gen`—always `yield*` an Effect
 - Unsatisfied `R` requirements → provide layers or adjust architecture

## References
- Agent Skills overview: https://www.anthropic.com/news/skills
- Skills guide: https://docs.claude.com/en/docs/claude-code/skills
 - EffectPatterns: https://github.com/PaulJPhilp/EffectPatterns

