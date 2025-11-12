---
name: effect-layers-services
description: Define services, provide layers, compose dependencies, and switch live/test. Use for DI boundaries and app composition.
allowed-tools: Read, Grep, Glob, Edit, Write, mcp__effect-docs__effect_docs_search
---

# Layers & Services

## When to use
- You need DI boundaries or swapping test/live implementations
- You want to compose infra (logger, db, http) once for the app

## Define Service
```ts
class UserRepo extends Effect.Service<UserRepo>()("UserRepo", {
  sync: () => ({ find: (id: string) => Effect.succeed({ id }) })
}) {}
```

## Provide Layer
```ts
const program = Effect.gen(function* () {
  const repo = yield* UserRepo
  return yield* repo.find("123")
}).pipe(Effect.provide(UserRepo.Default))
```

## Compose
```ts
const AppLayer = Layer.merge(UserRepo.Default, Logger.Default)
```

## Test vs Live
```ts
const layer = process.env.NODE_ENV === "test" ? UserRepoTest : UserRepo.Default
```

## Guidance
- Services define interfaces; Layers bind implementations
- Compose layers at the app boundary; keep handlers unaware of wiring
- Use `.Default` for quick live/test setup; add custom layers as needed

## Pitfalls
- Circular layer dependencies → split modules, provide from above
- Providing layers too deep → centralize to avoid duplication and confusion

## Cross-links
- Foundations: requirement channel `R` and provisioning
- Resources: scoped resources exposed via layers
- EffectPatterns inspiration: https://github.com/PaulJPhilp/EffectPatterns

## References
- Agent Skills overview: https://www.anthropic.com/news/skills
- Skills guide: https://docs.claude.com/en/docs/claude-code/skills

