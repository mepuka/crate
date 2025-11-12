---
name: effect-resources-scope
description: Resource safety with acquireRelease, Effect.scoped, and finalizers. Use when opening files, sockets, servers, or external handles.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Resource Management (Scope)

## Acquire/Release
```ts
const withConn = Effect.acquireRelease(
  Effect.sync(() => open()),
  (conn) => Effect.sync(() => close(conn))
).pipe(Effect.flatMap(use))
```

## Scoped
```ts
yield* Effect.scoped(
  Effect.gen(function* () {
    const h = yield* Effect.acquireRelease(acquire(), release)
    return yield* use(h)
  })
)
```

## Finalizers
```ts
yield* Effect.addFinalizer(() => cleanup)
```

## Ensuring
```ts
operation.pipe(Effect.ensuring(cleanup))
```

## Real-world snippet: wrap Promise APIs with typed errors and spans
```ts
const wrapS3Promise = <T>(promise: Promise<T> | Effect.Effect<Promise<T>>) =>
  Effect.gen(function* () {
    if (promise instanceof Promise) {
      return yield* Effect.tryPromise({ try: () => promise, catch: (cause) => new S3Error({ cause }) })
    }
    return yield* promise.pipe(
      Effect.flatMap((cb) =>
        Effect.tryPromise({ try: () => cb, catch: (cause) => new S3Error({ cause }) })
      )
    )
  }).pipe(Effect.catchTag("UnknownException", (cause) => new S3Error({ cause })))

// Usage with spans
const put = wrapS3Promise(client.send(new S3.PutObjectCommand(args))).pipe(
  Effect.withSpan("S3.putObject", { attributes: { key: args.Key } })
)
```

## References
- Agent Skills overview: https://www.anthropic.com/news/skills
- Skills guide: https://docs.claude.com/en/docs/claude-code/skills

