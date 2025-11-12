---
name: effect-collections-datastructs
description: Value-based data structures (Data.struct, tuple, array) and high-performance collections (Chunk, HashSet). Use for safe comparisons and pipelines.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Data Structures & Collections

## Structural Equality
```ts
import { Data, Equal } from "effect"
const a = Data.struct({ id: 1, name: "A" })
const b = Data.struct({ id: 1, name: "A" })
Equal.equals(a, b) // true
```

## Tuples & Arrays
```ts
const t = Data.tuple(1, "x")
const arr = Data.array([1,2,3])
```

## Chunk
```ts
import { Chunk } from "effect"
const items = Chunk.fromIterable([1,2,3])
```

## HashSet
```ts
import { HashSet } from "effect"
const set = HashSet.fromIterable([1,2,3])
```

## References
- Agent Skills overview: https://www.anthropic.com/news/skills
- Skills guide: https://docs.claude.com/en/docs/claude-code/skills

