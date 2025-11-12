---
name: effect-config-schema
description: Config loading and Schema validation/transform. Use when defining configuration or validating inputs.
allowed-tools: Read, Grep, Glob, Edit, Write, mcp__effect-docs__effect_docs_search
---

# Config & Schema

## When to use
- Validating request bodies, params, or external inputs
- Loading environment configuration with types

## Config (example)
```ts
import { Config } from "effect"

const Server = Config.nested("SERVER")(Config.all({
  host: Config.string("HOST"),
  port: Config.number("PORT")
}))
```

## Schema Validate
```ts
import { Schema as S } from "effect"

const User = S.Struct({ id: S.Number, name: S.String })
const decodeUser = (u: unknown) => S.decodeUnknown(User)(u)
```

## Transform
```ts
const IsoDate = S.String // then transform to Date in pipeline where needed
```

## Real-world snippet: Layer selecting AWS credentials via Config options
```ts
class AwsCredentials extends Effect.Service<AwsCredentials>()("AwsCredentials", {
  effect: Effect.gen(function* () {
    const accessKeys = yield* Config.option(
      Config.all([Config.string("CAP_AWS_ACCESS_KEY"), Config.string("CAP_AWS_SECRET_KEY")])
    )
    const vercelAwsRole = yield* Config.option(Config.string("VERCEL_AWS_ROLE_ARN"))

    const credentials = yield* Effect.gen(function* () {
      if (Option.isSome(vercelAwsRole)) return awsCredentialsProvider({ roleArn: vercelAwsRole.value })
      if (Option.isSome(accessKeys)) {
        const [accessKeyId, secretAccessKey] = accessKeys.value
        return { accessKeyId, secretAccessKey }
      }
      return fromContainerMetadata()
    })

    return { credentials }
  })
})
```

## Guidance
- Prefer schemas close to boundaries; keep core logic typed
- For branded types (Email, PositiveInt), use transform/brand helpers
- Validate early, map to domain errors in one place

## Pitfalls
- Accepting `unknown` into core → always decode first
- Large ad-hoc validation code → centralize in Schema

## Cross-links
- HTTP & Routing for endpoint validation
- Foundations for operator style

## References
- Agent Skills overview: https://www.anthropic.com/news/skills
- Skills guide: https://docs.claude.com/en/docs/claude-code/skills

