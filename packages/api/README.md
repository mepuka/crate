# @crate/api

Type-safe HTTP API client for the KEXP Radio Crate backend.

## Overview

This package provides a **single source of truth** for API schemas and endpoints using Effect's HttpApi. It eliminates:

- Dual schema definitions (Python Pydantic + TypeScript)
- Manual HTTP client usage with error-prone validation
- Null vs undefined mismatches between frontend and backend

## Features

- **Type-safe API calls** - Compile-time verification of request/response types
- **Automatic schema validation** - No manual `schemaBodyJson()` calls
- **Reusable URL params** - Schemas work with HttpApi, TanStack Router, and effect-atom
- **Single source of truth** - One schema definition for frontend and backend contract

## Installation

```bash
pnpm add @crate/api
```

## Usage

### Basic API Call

```typescript
import { kexpApiClient } from "@/lib/http-runtime"
import { Effect } from "effect"

const fetchTimeline = Effect.gen(function* () {
  const client = yield* kexpApiClient

  // Type-safe API call with automatic validation
  const timeline = yield* client.timeline.getTimeline({
    urlParams: { limit: 50, cursor: "..." }
  })

  return timeline
})
```

### In Effect Atoms

```typescript
import { httpRuntime, kexpApiClient } from "@/lib/http-runtime"

export const timelineAtom = httpRuntime.fn()(
  () => Effect.gen(function* () {
    const client = yield* kexpApiClient
    const data = yield* client.timeline.getTimeline({
      urlParams: { limit: 50 }
    })
    return data
  })
)
```

### Error Handling

The HttpApiClient automatically wraps errors. You can handle them with `mapError`:

```typescript
const data = yield* client.timeline.getTimeline({
  urlParams: { limit: 50 }
}).pipe(
  Effect.mapError((cause) => {
    if (cause._tag === "ParseError") {
      return new TimelineApiError({ cause, context: "Parse failed" })
    }
    return new NetworkError({ cause, url: "/api/plays/timeline" })
  })
)
```

## Reusable URL Param Schemas

The param schemas in `@crate/api/schemas/SearchParams` are designed to work in **three contexts**:

### 1. HttpApi Endpoints (already configured)

```typescript
// In packages/api/src/endpoints/timeline.ts
HttpApiEndpoint.get("getTimeline", "/timeline")
  .setUrlParams(TimelineParams)  // Reusable schema
```

### 2. TanStack Router Search Params

```typescript
import { TimelineParams } from "@crate/api"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/timeline")({
  validateSearch: (search) => TimelineParams.make(search)
})
```

### 3. Effect Atom URL Sync

```typescript
import { Atom } from "@effect-atom/atom-react"
import { Schema } from "effect"

// Individual param atoms synchronized with URL
const cursorAtom = Atom.searchParam("cursor", {
  schema: Schema.optional(Schema.String)
})

const limitAtom = Atom.searchParam("limit", {
  schema: Schema.NumberFromString
})

const percentageAtom = Atom.searchParam("percentage", {
  schema: Schema.optional(Schema.NumberFromString)
})
```

## API Reference

### Endpoints

#### Timeline

```typescript
client.timeline.getTimeline({
  urlParams: {
    limit?: number,        // Default: 50
    cursor?: string,       // Pagination cursor
    since?: string,        // ISO 8601 datetime
    until?: string,        // ISO 8601 datetime
    percentage?: number,   // 0.0-1.0
    anchor_id?: number     // Play ID to center around
  }
})
```

#### Search

```typescript
client.search.search({
  payload: {
    query: string,
    limit?: number,   // Default: 10
    offset?: number   // Default: 0
  }
})
```

#### Play by ID

```typescript
client.play.getById({
  path: { id: number }
})
```

#### Health Check

```typescript
client.health.check()
```

## Schemas

All schemas are re-exported from `@crate/api`:

```typescript
import {
  PlayResult,
  TimelineResponse,
  SearchResponse,
  HealthResponse,
  TimelineParams,
  SearchParams,
  type Play,
  type Timeline,
  type SearchResult,
  type Health
} from "@crate/api"
```

## Architecture

```
packages/api/
├── src/
│   ├── schemas/
│   │   ├── Play.ts          # PlayResult, TimelineResponse, SearchResponse
│   │   ├── Health.ts         # HealthResponse
│   │   ├── SearchParams.ts   # Reusable URL param schemas
│   │   └── errors.ts         # API error schemas
│   ├── endpoints/
│   │   ├── timeline.ts       # Timeline group
│   │   ├── search.ts         # Search group
│   │   ├── play.ts           # Play by ID
│   │   └── health.ts         # Health check
│   ├── api.ts               # Main HttpApi definition
│   └── index.ts             # Exports
```

## Benefits

### Before (Manual HTTP Client)

```typescript
// Dual schema definitions
// - Python: Pydantic models
// - TypeScript: Effect Schema classes

const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(
  yield* client.execute(
    HttpClientRequest.get("/api/plays/timeline").pipe(
      HttpClientRequest.setUrlParams({ limit: "50" })
    )
  )
)
// Manual validation, error-prone, type mismatches
```

### After (HttpApi Client)

```typescript
// Single source of truth in packages/api

const data = yield* client.timeline.getTimeline({
  urlParams: { limit: 50 }
})
// Type-safe, automatic validation, compile-time safety
```

## Next Steps

- Use `TimelineParams` in TanStack Router search param validation
- Use individual param atoms with `Atom.searchParam()` for URL sync
- Add new endpoints by creating new groups in `endpoints/`
- Extend schemas in `schemas/` as backend API evolves

## See Also

- [Effect HttpApi Documentation](https://effect.website/docs/guides/http-api)
- [effect-atom README](https://github.com/tim-smart/effect-atom)
- [TanStack Router Search Params](https://tanstack.com/router/latest/docs/framework/react/guide/search-params)
