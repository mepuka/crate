# KXP Radio Crate Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a React frontend with Effect Atom that displays an infinite scrollable timeline of 2.2M+ KEXP radio plays with semantic search, using the FastAPI backend.

**Architecture:** Vite + React 18 + TypeScript + Effect Atom for reactive state management, TanStack Router for file-based routing, TanStack Virtual for infinite scrolling, and shadcn/ui for components. All HTTP requests go through Effect Atom's HttpClient runtime.

**Tech Stack:** React 18, TypeScript, Effect-TS ^3.19, @effect-atom/atom-react, @effect/platform, @effect/schema, TanStack Router, TanStack Virtual, Vite, Tailwind CSS, shadcn/ui

---

## Task 1: Create Web Package Structure

**Goal:** Set up `packages/web` with the same structure as existing packages

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/tsconfig.build.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/.gitignore`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`
- Modify: `tsconfig.build.json` (add web package reference)

**Step 1: Create package.json**

Create: `packages/web/package.json`

```json
{
  "name": "@crate/web",
  "version": "0.0.0",
  "type": "module",
  "license": "MIT",
  "description": "KXP Radio Crate Frontend",
  "repository": {
    "type": "git",
    "url": "https://github.com/mkessy/crate",
    "directory": "packages/web"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "effect": "^3.19.3",
    "@effect/platform": "^0.93.0",
    "@effect/schema": "^0.76.0",
    "@effect-atom/atom": "^0.32.0",
    "@effect-atom/atom-react": "^0.32.0",
    "@tanstack/react-router": "^1.87.0",
    "@tanstack/router-devtools": "^1.87.0",
    "@tanstack/react-virtual": "^3.10.8",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.460.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "sonner": "^1.7.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "vite": "^6.0.1",
    "typescript": "^5.9.2",
    "tailwindcss": "^3.4.15",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20",
    "@tanstack/router-plugin": "^1.87.0"
  }
}
```

**Step 2: Create TypeScript configs**

Create: `packages/web/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": []
}
```

Create: `packages/web/tsconfig.build.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist"
  }
}
```

**Step 3: Create Vite config with TanStack Router plugin**

Create: `packages/web/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
})
```

**Step 4: Create HTML entry point**

Create: `packages/web/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KXP Radio Crate</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 5: Create gitignore**

Create: `packages/web/.gitignore`

```
# Dependencies
node_modules

# Build output
dist
build
.vite

# Environment
.env
.env.local
.env.production.local
.env.development.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Editor
.vscode/*
!.vscode/extensions.json
.idea
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# TanStack Router generated files
src/routeTree.gen.ts
```

**Step 6: Create basic React entry points**

Create: `packages/web/src/main.tsx`

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

Create: `packages/web/src/App.tsx`

```typescript
export function App() {
  return (
    <div>
      <h1>KXP Radio Crate</h1>
      <p>Coming soon...</p>
    </div>
  )
}
```

Create: `packages/web/src/index.css`

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

**Step 7: Update root tsconfig.build.json**

Modify: `tsconfig.build.json`

```json
{
  "extends": "./tsconfig.base.json",
  "include": [],
  "references": [
    { "path": "packages/cli/tsconfig.build.json" },
    { "path": "packages/domain/tsconfig.build.json" },
    { "path": "packages/server/tsconfig.build.json" },
    { "path": "packages/web/tsconfig.build.json" }
  ]
}
```

**Step 8: Install dependencies**

Run: `cd packages/web && pnpm install`

Expected: All dependencies installed successfully

**Step 9: Verify dev server runs**

Run: `cd packages/web && pnpm dev`

Expected: Vite dev server starts on http://localhost:5173, shows "KXP Radio Crate" page

Stop server: Ctrl+C

**Step 10: Commit**

```bash
git add packages/web/ tsconfig.build.json
git commit -m "feat(web): initialize web package with vite + react + typescript"
```

---

## Task 2: Set Up Tailwind CSS and shadcn/ui

**Goal:** Configure Tailwind CSS and install shadcn/ui base components

**Files:**
- Create: `packages/web/tailwind.config.js`
- Create: `packages/web/postcss.config.js`
- Create: `packages/web/src/lib/utils.ts`
- Create: `packages/web/components.json`
- Modify: `packages/web/src/index.css`

**Step 1: Create Tailwind config**

Create: `packages/web/tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        }
      }
    }
  },
  plugins: [require('tailwindcss-animate')],
}
```

Create: `packages/web/postcss.config.js`

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 2: Update index.css with Tailwind and CSS variables**

Modify: `packages/web/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

**Step 3: Create utils for className merging**

Create: `packages/web/src/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Step 4: Create shadcn/ui config**

Create: `packages/web/components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

**Step 5: Install tailwindcss-animate**

Run: `cd packages/web && pnpm add tailwindcss-animate`

Expected: Package installed successfully

**Step 6: Install shadcn/ui base components**

Run: `cd packages/web && npx shadcn@latest add button input badge`

Expected: Components installed to `src/components/ui/`

**Step 7: Verify Tailwind works**

Modify: `packages/web/src/App.tsx`

```typescript
import { Button } from '@/components/ui/button'

export function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground">KXP Radio Crate</h1>
        <p className="text-muted-foreground">Coming soon...</p>
        <Button>Get Started</Button>
      </div>
    </div>
  )
}
```

Run: `cd packages/web && pnpm dev`

Expected: Styled page with button visible at http://localhost:5173

Stop server: Ctrl+C

**Step 8: Commit**

```bash
git add packages/web/
git commit -m "feat(web): configure tailwind css and shadcn/ui"
```

---

## Task 3: Create HTTP Runtime and Effect Atom Infrastructure

**Goal:** Set up Effect Atom runtime with HttpClient for making API requests

**Files:**
- Create: `packages/web/src/lib/http-runtime.ts`
- Create: `packages/web/src/domain/errors.ts`

**Step 1: Create HTTP runtime with Effect Atom**

Create: `packages/web/src/lib/http-runtime.ts`

```typescript
import { Atom } from "@effect-atom/atom-react"
import { FetchHttpClient, HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import { Layer } from "effect"

// Base HTTP client layer (browser fetch)
const baseHttpLayer = FetchHttpClient.layer

// Configure base URL and default headers
const httpConfigLayer = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.mapRequest(
    HttpClient.fetchOk,
    HttpClientRequest.prependUrl(
      import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
    )
  )
)

// Combined runtime with configured HTTP
export const httpRuntime = Atom.runtime(
  Layer.provide(baseHttpLayer, httpConfigLayer)
)
```

**Step 2: Create domain error types**

Create: `packages/web/src/domain/errors.ts`

```typescript
import { Data } from "effect"

// API Errors
export class TimelineApiError extends Data.TaggedError("TimelineApiError")<{
  readonly cause: unknown
  readonly context?: string
}> {}

export class SearchApiError extends Data.TaggedError("SearchApiError")<{
  readonly cause: unknown
  readonly query: string
}> {}

export class PlayNotFoundError extends Data.TaggedError("PlayNotFoundError")<{
  readonly playId: number
}> {}

export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly cause: unknown
  readonly url: string
}> {}

// Validation Errors
export class InvalidCursorError extends Data.TaggedError("InvalidCursorError")<{
  readonly cursor: string
}> {}

export class InvalidPercentageError extends Data.TaggedError("InvalidPercentageError")<{
  readonly percentage: number
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly errors: string[]
}> {}
```

**Step 3: Create environment variables file**

Create: `packages/web/.env.development`

```
VITE_API_BASE_URL=http://localhost:8000
```

Create: `packages/web/.env.production`

```
VITE_API_BASE_URL=https://cratemusic.duckdns.org
```

**Step 4: Verify runtime exports**

Create: `packages/web/src/lib/index.ts`

```typescript
export { httpRuntime } from './http-runtime'
export { cn } from './utils'
```

**Step 5: Commit**

```bash
git add packages/web/
git commit -m "feat(web): create http runtime and error types for effect atom"
```

---

## Task 4: Create Domain Schemas and Types

**Goal:** Define Effect Schema classes matching the FastAPI backend models

**Files:**
- Create: `packages/web/src/domain/Play.ts`
- Create: `packages/web/src/domain/index.ts`

**Step 1: Create PlayResult schema**

Create: `packages/web/src/domain/Play.ts`

```typescript
import { Schema } from "@effect/schema"

export class PlayResult extends Schema.Class<PlayResult>("PlayResult")({
  id: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  similarity: Schema.Number,

  // Metadata
  album: Schema.NullOr(Schema.String),
  airdate: Schema.DateFromString,  // Automatically transforms ISO 8601 strings to Date objects
  labels: Schema.Array(Schema.String),
  rotation_status: Schema.NullOr(Schema.String),
  is_local: Schema.Boolean,
  is_live: Schema.Boolean,
  is_request: Schema.Boolean,
  comment: Schema.NullOr(Schema.String),
  show: Schema.Number,

  // Album artwork
  image_uri: Schema.NullOr(Schema.String),
  thumbnail_uri: Schema.NullOr(Schema.String),

  // MusicBrainz IDs
  artist_mbid: Schema.NullOr(Schema.Array(Schema.String)),
  recording_mbid: Schema.NullOr(Schema.String),
  release_mbid: Schema.NullOr(Schema.String),
  release_group_mbid: Schema.NullOr(Schema.String)
}) {}

export class TimelineResponse extends Schema.Class<TimelineResponse>("TimelineResponse")({
  results: Schema.Array(PlayResult),
  next_cursor: Schema.NullOr(Schema.String),
  has_more: Schema.Boolean,
  query_time_ms: Schema.Number,
  total_count: Schema.optional(Schema.Number),
  anchor_position: Schema.optional(Schema.Number)
}) {}

export class SearchResponse extends Schema.Class<SearchResponse>("SearchResponse")({
  results: Schema.Array(PlayResult),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  query: Schema.String
}) {}

// Export types
export type Play = typeof PlayResult.Type
export type Timeline = typeof TimelineResponse.Type
export type SearchResult = typeof SearchResponse.Type
```

**Step 2: Create domain index**

Create: `packages/web/src/domain/index.ts`

```typescript
export * from './Play'
export * from './errors'
```

**Step 3: Commit**

```bash
git add packages/web/src/domain/
git commit -m "feat(web): add domain schemas for play and timeline"
```

---

## Task 5: Create Timeline Atoms

**Goal:** Create Effect Atoms for fetching and managing timeline state

**Files:**
- Create: `packages/web/src/atoms/timeline.ts`
- Create: `packages/web/src/atoms/index.ts`

**Step 1: Create timeline atom with HTTP fetching**

Create: `packages/web/src/atoms/timeline.ts`

```typescript
import { Atom } from "@effect-atom/atom-react"
import { HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import { Effect } from "effect"
import { httpRuntime } from "@/lib/http-runtime"
import { PlayResult, TimelineResponse } from "@/domain/Play"
import { NetworkError, TimelineApiError } from "@/domain/errors"

export interface TimelineState {
  plays: PlayResult[]
  cursor: string | null
  hasMore: boolean
  isLoading: boolean
  error: string | null
}

// Timeline atom with proper HttpClient service access and error handling
export const timelineAtom = httpRuntime.atom(
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient

    const request = HttpClientRequest.get("/api/plays/timeline").pipe(
      HttpClientRequest.setUrlParams({ limit: "50" })
    )

    const response = yield* client.execute(request).pipe(
      Effect.mapError(cause => new NetworkError({
        cause,
        url: "/api/plays/timeline"
      }))
    )

    const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response).pipe(
      Effect.mapError(cause => new TimelineApiError({
        cause,
        context: "Failed to parse timeline response"
      }))
    )

    return {
      plays: data.results,
      cursor: data.next_cursor,
      hasMore: data.has_more,
      isLoading: false,
      error: null
    } satisfies TimelineState
  }).pipe(
    Effect.catchTags({
      NetworkError: (error) => Effect.succeed({
        plays: [],
        cursor: null,
        hasMore: false,
        isLoading: false,
        error: `Network error: ${error.url}`
      }),
      TimelineApiError: (error) => Effect.succeed({
        plays: [],
        cursor: null,
        hasMore: false,
        isLoading: false,
        error: `API error: ${error.context}`
      })
    })
  )
).pipe(Atom.keepAlive)

// Computed atom for current plays
export const currentPlaysAtom = Atom.map(timelineAtom, (state) => state.plays)

// Append more plays (infinite scroll action)
export const appendPlaysAtom = Atom.make(
  Effect.fn(function* (get: Atom.Context, cursor: string) {
    const client = yield* HttpClient.HttpClient
    const currentState = yield* get(timelineAtom)

    const request = HttpClientRequest.get("/api/plays/timeline").pipe(
      HttpClientRequest.setUrlParams({
        cursor,
        limit: "50"
      })
    )

    const response = yield* client.execute(request).pipe(
      Effect.mapError(cause => new NetworkError({
        cause,
        url: `/api/plays/timeline?cursor=${cursor}`
      }))
    )

    const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response).pipe(
      Effect.mapError(cause => new TimelineApiError({
        cause,
        context: "Failed to append plays"
      }))
    )

    return {
      ...currentState,
      plays: [...currentState.plays, ...data.results],
      cursor: data.next_cursor,
      hasMore: data.has_more,
      isLoading: false,
      error: null
    } satisfies TimelineState
  })
)

// Jump to position (anchor, date, percentage)
export const jumpToPositionAtom = Atom.make(
  Effect.fn(function* (params: {
    anchor_id?: number
    since?: string
    percentage?: number
  }) {
    const client = yield* HttpClient.HttpClient

    const urlParams: Record<string, string> = { limit: "50" }
    if (params.anchor_id) urlParams.anchor_id = String(params.anchor_id)
    if (params.since) urlParams.since = params.since
    if (params.percentage !== undefined) urlParams.percentage = String(params.percentage)

    const request = HttpClientRequest.get("/api/plays/timeline").pipe(
      HttpClientRequest.setUrlParams(urlParams)
    )

    const response = yield* client.execute(request).pipe(
      Effect.mapError(cause => new NetworkError({
        cause,
        url: `/api/plays/timeline with params ${JSON.stringify(params)}`
      }))
    )

    const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response).pipe(
      Effect.mapError(cause => new TimelineApiError({
        cause,
        context: "Failed to jump to position"
      }))
    )

    return {
      plays: data.results,
      cursor: data.next_cursor,
      hasMore: data.has_more,
      isLoading: false,
      error: null,
      anchorPosition: data.anchor_position
    }
  })
)
```

**Step 2: Create atoms index**

Create: `packages/web/src/atoms/index.ts`

```typescript
export * from './timeline'
```

**Step 3: Commit**

```bash
git add packages/web/src/atoms/
git commit -m "feat(web): create timeline atoms with effect http client"
```

---

## Task 6: Create Search Atoms

**Goal:** Create Effect Atoms for semantic search with debouncing

**Files:**
- Create: `packages/web/src/atoms/search.ts`
- Modify: `packages/web/src/atoms/index.ts`

**Step 1: Create search atoms**

Create: `packages/web/src/atoms/search.ts`

```typescript
import { Atom } from "@effect-atom/atom-react"
import { HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import { Effect } from "effect"
import { httpRuntime } from "@/lib/http-runtime"
import { SearchResponse } from "@/domain/Play"
import { NetworkError, SearchApiError } from "@/domain/errors"

export interface SearchState {
  results: Array<typeof SearchResponse.Type['results'][number]>
  total: number
  queryTimeMs: number
  query: string
  error: string | null
  isLoading: boolean
}

// Search query atom (user input)
export const searchQueryAtom = Atom.make("")

// Search results atom (derived from query) with error handling
export const searchResultsAtom = httpRuntime.atom(
  Effect.gen(function* (get) {
    const query = yield* get(searchQueryAtom)
    const client = yield* HttpClient.HttpClient

    if (!query.trim() || query.length < 3) {
      return {
        results: [],
        total: 0,
        queryTimeMs: 0,
        query: "",
        error: null,
        isLoading: false
      } satisfies SearchState
    }

    const request = HttpClientRequest.post("/api/plays/search").pipe(
      HttpClientRequest.jsonBody({ query, limit: 20 })
    )

    const response = yield* client.execute(request).pipe(
      Effect.mapError(cause => new NetworkError({
        cause,
        url: "/api/plays/search"
      }))
    )

    const data = yield* HttpClientResponse.schemaBodyJson(SearchResponse)(response).pipe(
      Effect.mapError(cause => new SearchApiError({
        cause,
        query
      }))
    )

    return {
      results: data.results,
      total: data.total,
      queryTimeMs: data.query_time_ms,
      query: data.query,
      error: null,
      isLoading: false
    } satisfies SearchState
  }).pipe(
    Effect.catchTags({
      NetworkError: () => Effect.succeed({
        results: [],
        total: 0,
        queryTimeMs: 0,
        query: "",
        error: "Network connection failed",
        isLoading: false
      }),
      SearchApiError: (error) => Effect.succeed({
        results: [],
        total: 0,
        queryTimeMs: 0,
        query: error.query,
        error: `Search failed for "${error.query}"`,
        isLoading: false
      })
    })
  )
)
```

**Step 2: Update atoms index**

Modify: `packages/web/src/atoms/index.ts`

```typescript
export * from './timeline'
export * from './search'
```

**Step 3: Commit**

```bash
git add packages/web/src/atoms/
git commit -m "feat(web): create search atoms with error handling"
```

---

## Task 7: Set Up TanStack Router

**Goal:** Configure file-based routing with TanStack Router

**Files:**
- Create: `packages/web/src/routes/__root.tsx`
- Create: `packages/web/src/routes/index.tsx`
- Create: `packages/web/src/routes/play.$playId.tsx`
- Create: `packages/web/src/routes/search.tsx`
- Create: `packages/web/src/routes/timeline.tsx`
- Modify: `packages/web/src/App.tsx`

**Step 1: Create root route with layout**

Create: `packages/web/src/routes/__root.tsx`

```typescript
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootComponent
})

function RootComponent() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  )
}
```

**Step 2: Create index route (home timeline)**

Create: `packages/web/src/routes/index.tsx`

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: IndexComponent
})

function IndexComponent() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Timeline</h1>
      <p className="text-muted-foreground mt-2">
        Infinite scroll timeline will go here
      </p>
    </div>
  )
}
```

**Step 3: Create play detail route**

Create: `packages/web/src/routes/play.$playId.tsx`

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/play/$playId')({
  component: PlayDetailComponent
})

function PlayDetailComponent() {
  const { playId } = Route.useParams()

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Play #{playId}</h1>
      <p className="text-muted-foreground mt-2">
        Play detail with context will go here
      </p>
    </div>
  )
}
```

**Step 4: Create search route**

Create: `packages/web/src/routes/search.tsx`

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/search')({
  component: SearchComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) || ''
  })
})

function SearchComponent() {
  const { q } = Route.useSearch()

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Search</h1>
      <p className="text-muted-foreground mt-2">
        Query: {q || 'No query'}
      </p>
      <p className="text-muted-foreground">
        Search results will go here
      </p>
    </div>
  )
}
```

**Step 5: Create timeline jump route**

Create: `packages/web/src/routes/timeline.tsx`

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/timeline')({
  component: TimelineComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    since: search.since as string | undefined,
    until: search.until as string | undefined,
    percentage: search.percentage ? Number(search.percentage) : undefined
  })
})

function TimelineComponent() {
  const { since, until, percentage } = Route.useSearch()

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Timeline Jump</h1>
      <div className="mt-4 text-muted-foreground space-y-1">
        {since && <p>Since: {since}</p>}
        {until && <p>Until: {until}</p>}
        {percentage !== undefined && <p>Percentage: {percentage}%</p>}
      </div>
      <p className="text-muted-foreground mt-4">
        Timeline jump will go here
      </p>
    </div>
  )
}
```

**Step 6: Update App.tsx to use router**

Modify: `packages/web/src/App.tsx`

```typescript
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

// Create router instance
const router = createRouter({ routeTree })

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function App() {
  return <RouterProvider router={router} />
}
```

**Step 7: Generate route tree**

Run: `cd packages/web && pnpm dev`

Expected: Vite starts and TanStack Router plugin generates `src/routeTree.gen.ts`

Stop server: Ctrl+C

**Step 8: Verify routes work**

Run: `cd packages/web && pnpm dev`

Test routes:
- http://localhost:5173/ → Shows "Timeline"
- http://localhost:5173/play/123 → Shows "Play #123"
- http://localhost:5173/search?q=nirvana → Shows "Query: nirvana"
- http://localhost:5173/timeline?percentage=50 → Shows "Percentage: 50%"

Stop server: Ctrl+C

**Step 9: Commit**

```bash
git add packages/web/src/
git commit -m "feat(web): set up tanstack router with file-based routes"
```

---

## Task 8: Create Base UI Components

**Goal:** Create reusable UI components for the application

**Files:**
- Create: `packages/web/src/components/AlbumArt.tsx`
- Create: `packages/web/src/components/DateDivider.tsx`
- Create: `packages/web/src/components/LoadingSpinner.tsx`

**Step 1: Create AlbumArt component**

Create: `packages/web/src/components/AlbumArt.tsx`

```typescript
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Music } from 'lucide-react'

interface AlbumArtProps {
  src: string | null
  alt: string
  size?: number
  className?: string
}

export function AlbumArt({ src, alt, size = 120, className }: AlbumArtProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const imageSrc = src || '/placeholder-album.png'

  return (
    <div
      className={cn("relative rounded overflow-hidden bg-muted shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* Loading skeleton */}
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-muted-foreground/10" />
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Music className="w-8 h-8 text-muted-foreground/30" />
        </div>
      )}

      {/* Image */}
      {!error && (
        <img
          src={imageSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  )
}
```

**Step 2: Create DateDivider component**

Create: `packages/web/src/components/DateDivider.tsx`

```typescript
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface DateDividerProps {
  date: Date
  className?: string
  sticky?: boolean
}

export function DateDivider({ date, className, sticky = true }: DateDividerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 py-3 px-4 sm:py-4 sm:px-6",
        sticky && "sticky top-16 bg-background/95 backdrop-blur-sm z-10 border-b border-border/50",
        className
      )}
    >
      <div className="h-px flex-1 bg-border/50" />
      <time
        dateTime={date.toISOString()}
        className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider"
      >
        {format(date, 'MMMM d, yyyy')}
      </time>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  )
}
```

**Step 3: Create LoadingSpinner component**

Create: `packages/web/src/components/LoadingSpinner.tsx`

```typescript
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4'
  }

  return (
    <div
      className={cn(
        "inline-block rounded-full border-solid border-primary border-t-transparent animate-spin",
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  )
}
```

**Step 4: Create components index**

Create: `packages/web/src/components/index.ts`

```typescript
export * from './AlbumArt'
export * from './DateDivider'
export * from './LoadingSpinner'
```

**Step 5: Commit**

```bash
git add packages/web/src/components/
git commit -m "feat(web): create base ui components (album art, date divider, loading spinner)"
```

---

## Task 9: Create PlayCard Component

**Goal:** Create the main PlayCard component for displaying individual plays

**Files:**
- Create: `packages/web/src/components/PlayCard.tsx`
- Modify: `packages/web/src/components/index.ts`

**Step 1: Install additional shadcn/ui components**

Run: `cd packages/web && npx shadcn@latest add toast`

Expected: Toast component installed

**Step 2: Create PlayCard component**

Create: `packages/web/src/components/PlayCard.tsx`

```typescript
import { Play } from '@/domain'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { forwardRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { AlbumArt } from './AlbumArt'
import { toast } from 'sonner'

const playCardVariants = cva(
  [
    "group relative overflow-hidden rounded-lg border",
    "transition-all duration-200 ease-in-out",
    "hover:shadow-md hover:border-primary/50",
    "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
    "cursor-pointer"
  ],
  {
    variants: {
      variant: {
        default: "bg-card border-border",
        focused: "bg-primary/5 border-primary shadow-lg ring-2 ring-primary",
        dimmed: "opacity-60"
      },
      size: {
        compact: "p-2",
        default: "p-4",
        expanded: "p-6"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

interface PlayCardProps extends VariantProps<typeof playCardVariants> {
  play: Play
  isFocused?: boolean
  onVisible?: () => void
  className?: string
}

export const PlayCard = forwardRef<HTMLDivElement, PlayCardProps>(
  ({ play, variant, size, isFocused, className }, ref) => {
    const imageSize = size === 'compact' ? 80 : size === 'expanded' ? 160 : 120

    const handleCopyLink = () => {
      const url = `${window.location.origin}/play/${play.id}`
      navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard!')
    }

    // Parse release year from airdate
    const releaseYear = play.airdate ? new Date(play.airdate).getFullYear() : null

    return (
      <div
        ref={ref}
        className={cn(
          playCardVariants({
            variant: isFocused ? 'focused' : variant,
            size
          }),
          className
        )}
        tabIndex={0}
        role="article"
        aria-label={`${play.song} by ${play.artist} played ${play.airdate ? formatDistanceToNow(new Date(play.airdate)) + ' ago' : ''}`}
        onClick={handleCopyLink}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleCopyLink()
          }
        }}
      >
        <div className="flex gap-3 sm:gap-4">
          {/* Album Art */}
          <AlbumArt
            src={play.thumbnail_uri || play.image_uri}
            alt={`${play.album} by ${play.artist}`}
            size={imageSize}
          />

          {/* Metadata */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {/* Title & Time */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-foreground text-sm sm:text-base truncate" title={play.song}>
                {play.song || 'Untitled'}
              </h3>
              {play.airdate && (
                <time
                  className="text-xs sm:text-sm text-muted-foreground font-mono whitespace-nowrap shrink-0"
                  dateTime={play.airdate.toISOString()}
                >
                  {play.airdate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </time>
              )}
            </div>

            {/* Artist */}
            <p className="text-xs sm:text-sm text-foreground/90 truncate" title={play.artist}>
              {play.artist || 'Unknown Artist'}
            </p>

            {/* Album & Year */}
            {play.album && (
              <p className="text-xs sm:text-sm text-muted-foreground truncate" title={play.album}>
                {play.album}
                {releaseYear && ` • ${releaseYear}`}
              </p>
            )}

            {/* Badges */}
            {size !== 'compact' && (
              <div className="flex flex-wrap gap-1 mt-1">
                {play.rotation_status && (
                  <Badge variant="secondary" className="text-xs px-2 py-0">
                    {play.rotation_status}
                  </Badge>
                )}
                {play.labels && play.labels.length > 0 && (
                  <span className="text-xs text-muted-foreground truncate" title={play.labels.join(', ')}>
                    {play.labels.slice(0, 2).join(', ')}
                  </span>
                )}
                {play.is_local && (
                  <Badge variant="outline" className="text-xs px-2 py-0 border-secondary text-secondary">
                    Local
                  </Badge>
                )}
                {play.is_request && (
                  <Badge variant="outline" className="text-xs px-2 py-0">
                    ★ Request
                  </Badge>
                )}
                {play.is_live && (
                  <Badge variant="outline" className="text-xs px-2 py-0 border-accent text-accent">
                    ● Live
                  </Badge>
                )}
              </div>
            )}

            {/* Similarity score (for search results) */}
            {play.similarity > 0 && (
              <div className="text-xs text-muted-foreground">
                Similarity: {(play.similarity * 100).toFixed(1)}%
              </div>
            )}

            {/* Comment */}
            {play.comment && size === 'expanded' && (
              <p className="mt-2 text-xs text-muted-foreground italic line-clamp-2">
                {play.comment}
              </p>
            )}
          </div>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
          <span className="text-xs text-primary font-medium bg-background/90 px-3 py-1 rounded-full">
            Click to copy link
          </span>
        </div>
      </div>
    )
  }
)

PlayCard.displayName = 'PlayCard'
```

**Step 3: Update components index**

Modify: `packages/web/src/components/index.ts`

```typescript
export * from './AlbumArt'
export * from './DateDivider'
export * from './LoadingSpinner'
export * from './PlayCard'
```

**Step 4: Add Toaster to App**

Modify: `packages/web/src/App.tsx`

```typescript
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { Toaster } from 'sonner'

// Create router instance
const router = createRouter({ routeTree })

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  )
}
```

**Step 5: Test PlayCard in index route**

Modify: `packages/web/src/routes/index.tsx`

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { PlayCard } from '@/components'
import { Play } from '@/domain'

export const Route = createFileRoute('/')({
  component: IndexComponent
})

// Mock data for testing
const mockPlay: Play = {
  id: 1,
  artist: 'Radiohead',
  song: 'Paranoid Android',
  similarity: 0,
  album: 'OK Computer',
  airdate: new Date(),
  labels: ['Parlophone', 'Capitol Records'],
  rotation_status: 'Heavy',
  is_local: false,
  is_live: false,
  is_request: false,
  comment: null,
  show: 1,
  image_uri: null,
  thumbnail_uri: null,
  artist_mbid: null,
  recording_mbid: null,
  release_mbid: null,
  release_group_mbid: null
}

function IndexComponent() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <h1 className="text-3xl font-bold">PlayCard Preview</h1>
      <PlayCard play={mockPlay} />
      <PlayCard play={mockPlay} size="compact" />
      <PlayCard play={mockPlay} size="expanded" />
      <PlayCard play={mockPlay} isFocused />
    </div>
  )
}
```

Run: `cd packages/web && pnpm dev`

Expected: PlayCard renders with all variants visible, clicking copies link and shows toast

Stop server: Ctrl+C

**Step 6: Commit**

```bash
git add packages/web/
git commit -m "feat(web): create playcard component with variants and toast"
```

---

## Task 10: Create InfiniteTimeline Component

**Goal:** Create the main infinite scrolling timeline with virtual scrolling

**Files:**
- Create: `packages/web/src/components/InfiniteTimeline.tsx`
- Modify: `packages/web/src/components/index.ts`
- Modify: `packages/web/src/routes/index.tsx`

**Step 1: Create InfiniteTimeline component**

Create: `packages/web/src/components/InfiniteTimeline.tsx`

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useEffect, Suspense } from 'react'
import { useAtomValue } from '@effect-atom/atom-react'
import { PlayCard } from './PlayCard'
import { DateDivider } from './DateDivider'
import { LoadingSpinner } from './LoadingSpinner'
import { timelineAtom, appendPlaysAtom } from '@/atoms/timeline'
import { isSameDay } from 'date-fns'
import { Atom } from '@effect-atom/atom-react'

interface InfiniteTimelineProps {
  anchorId?: number
  since?: string
  until?: string
  percentage?: number
}

function TimelineContent({
  anchorId,
}: InfiniteTimelineProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const lastItemRef = useRef<HTMLDivElement>(null)

  // Fetch data using Effect Atoms
  const timeline = useAtomValue(timelineAtom)
  const { plays, hasMore, isLoading, error } = timeline

  // Find anchor position if present
  const anchorPosition = plays.findIndex(play => play.id === anchorId)

  // Virtual scroller
  const virtualizer = useVirtualizer({
    count: plays.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // Check if we need a date divider
      const needsDivider = index === 0 || !isSameDay(
        plays[index].airdate,
        plays[index - 1].airdate
      )
      return needsDivider ? 180 : 140  // 40px for divider + 140px for card
    },
    overscan: 10
  })

  // Scroll to anchor on mount
  useEffect(() => {
    if (anchorPosition >= 0 && plays.length > 0) {
      virtualizer.scrollToIndex(anchorPosition, { align: 'center', behavior: 'smooth' })
    }
  }, [anchorPosition, plays.length])

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!lastItemRef.current || !hasMore || isLoading) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && timeline.cursor) {
          // Trigger append
          Atom.get(appendPlaysAtom).pipe(
            Atom.set(timelineAtom)
          )
        }
      },
      { rootMargin: '400px' }
    )

    observer.observe(lastItemRef.current)

    return () => observer.disconnect()
  }, [hasMore, isLoading, timeline.cursor])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-destructive">
        Error loading plays: {error}
      </div>
    )
  }

  const items = virtualizer.getVirtualItems()

  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative'
        }}
      >
        {items.map((virtualRow) => {
          const play = plays[virtualRow.index]
          const prevPlay = plays[virtualRow.index - 1]

          const showDateDivider = !prevPlay || !isSameDay(
            play.airdate,
            prevPlay.airdate
          )

          const isLast = virtualRow.index === plays.length - 1

          return (
            <div
              key={virtualRow.key}
              ref={isLast ? lastItemRef : undefined}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              {showDateDivider && (
                <DateDivider date={play.airdate} />
              )}

              <PlayCard
                play={play}
                isFocused={anchorId === play.id}
                className="mx-auto max-w-4xl mb-2 px-4"
              />
            </div>
          )
        })}
      </div>

      {/* Loading more indicator */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <LoadingSpinner />
        </div>
      )}

      {/* End of results */}
      {!hasMore && plays.length > 0 && (
        <div className="text-center text-muted-foreground py-8">
          You've reached the end of the timeline
        </div>
      )}
    </div>
  )
}

export function InfiniteTimeline(props: InfiniteTimelineProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <LoadingSpinner />
        </div>
      }
    >
      <TimelineContent {...props} />
    </Suspense>
  )
}
```

**Step 2: Update components index**

Modify: `packages/web/src/components/index.ts`

```typescript
export * from './AlbumArt'
export * from './DateDivider'
export * from './LoadingSpinner'
export * from './PlayCard'
export * from './InfiniteTimeline'
```

**Step 3: Update index route to use InfiniteTimeline**

Modify: `packages/web/src/routes/index.tsx`

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { InfiniteTimeline } from '@/components'

export const Route = createFileRoute('/')({
  component: IndexComponent
})

function IndexComponent() {
  return <InfiniteTimeline />
}
```

**Step 4: Test with API running**

Run API: `cd faiss-search-api && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000`

Run frontend: `cd packages/web && pnpm dev`

Expected: Timeline loads plays from API, infinite scrolling works, date dividers show

Stop both servers: Ctrl+C

**Step 5: Commit**

```bash
git add packages/web/
git commit -m "feat(web): create infinite timeline with virtual scrolling"
```

---

## Task 11: Create SearchBar Component

**Goal:** Create semantic search bar with debouncing and keyboard shortcuts

**Files:**
- Create: `packages/web/src/hooks/useDebounce.ts`
- Create: `packages/web/src/components/SearchBar.tsx`
- Modify: `packages/web/src/components/index.ts`

**Step 1: Create useDebounce hook**

Create: `packages/web/src/hooks/useDebounce.ts`

```typescript
import { useEffect, useState } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
```

**Step 2: Create SearchBar component**

Create: `packages/web/src/components/SearchBar.tsx`

```typescript
import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'

interface SearchBarProps {
  className?: string
  autoFocus?: boolean
  initialQuery?: string
}

export function SearchBar({ className, autoFocus, initialQuery = '' }: SearchBarProps) {
  const navigate = useNavigate()

  const [query, setQuery] = useState(initialQuery)
  const [isFocused, setIsFocused] = useState(false)
  const debouncedQuery = useDebounce(query, 300)

  // Update URL when debounced query changes
  useEffect(() => {
    if (debouncedQuery && debouncedQuery !== initialQuery) {
      navigate({ to: '/search', search: { q: debouncedQuery } })
    } else if (query === '' && initialQuery) {
      navigate({ to: '/' })
    }
  }, [debouncedQuery])

  // Keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        document.getElementById('search-input')?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleClear = () => {
    setQuery('')
    navigate({ to: '/' })
  }

  return (
    <div className={cn("relative w-full max-w-2xl", className)}>
      <div className="relative">
        {/* Search icon */}
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />

        {/* Input */}
        <Input
          id="search-input"
          type="search"
          placeholder="Search plays, artists, albums... (⌘K)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoFocus={autoFocus}
          className={cn(
            "pl-10 pr-10 h-12 text-base transition-shadow",
            isFocused && "ring-2 ring-primary shadow-lg"
          )}
        />

        {/* Clear button */}
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Update components index**

Modify: `packages/web/src/components/index.ts`

```typescript
export * from './AlbumArt'
export * from './DateDivider'
export * from './LoadingSpinner'
export * from './PlayCard'
export * from './InfiniteTimeline'
export * from './SearchBar'
```

**Step 4: Update search route to use SearchBar**

Modify: `packages/web/src/routes/search.tsx`

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { SearchBar, PlayCard, LoadingSpinner } from '@/components'
import { useAtomValue } from '@effect-atom/atom-react'
import { searchQueryAtom, searchResultsAtom } from '@/atoms/search'
import { useEffect } from 'react'
import { Atom } from '@effect-atom/atom-react'

export const Route = createFileRoute('/search')({
  component: SearchComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) || ''
  })
})

function SearchComponent() {
  const { q } = Route.useSearch()

  // Set search query from URL
  useEffect(() => {
    Atom.set(searchQueryAtom, q || '')
  }, [q])

  const searchResults = useAtomValue(searchResultsAtom)
  const { results, total, queryTimeMs, error, isLoading } = searchResults

  return (
    <div className="min-h-screen">
      {/* Search header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border z-20 py-4 px-4">
        <div className="max-w-4xl mx-auto">
          <SearchBar initialQuery={q} autoFocus />
        </div>
      </div>

      {/* Search results */}
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {error && (
          <div className="text-center text-destructive py-8">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && !error && results.length > 0 && (
          <>
            <div className="text-sm text-muted-foreground">
              Found {total} results in {queryTimeMs}ms
            </div>
            {results.map(play => (
              <PlayCard key={play.id} play={play} />
            ))}
          </>
        )}

        {!isLoading && !error && results.length === 0 && q && (
          <div className="text-center text-muted-foreground py-8">
            No results found for "{q}"
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 5: Test search functionality**

Run API: `cd faiss-search-api && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000`

Run frontend: `cd packages/web && pnpm dev`

Test:
- Type in search bar → URL updates after 300ms
- Search results appear
- Clear button works
- Cmd+K focuses search

Stop both servers: Ctrl+C

**Step 6: Commit**

```bash
git add packages/web/
git commit -m "feat(web): create search bar with debouncing and search results page"
```

---

## Task 12: Create Header and Layout

**Goal:** Create application header with search and navigation

**Files:**
- Create: `packages/web/src/components/Header.tsx`
- Modify: `packages/web/src/routes/__root.tsx`
- Modify: `packages/web/src/components/index.ts`

**Step 1: Create Header component**

Create: `packages/web/src/components/Header.tsx`

```typescript
import { Link } from '@tanstack/react-router'
import { SearchBar } from './SearchBar'

export function Header() {
  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center gap-4">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
        >
          <div className="font-bold text-xl">KXP CRATE</div>
        </Link>

        {/* Search bar */}
        <div className="flex-1 max-w-2xl mx-auto">
          <SearchBar />
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* Add navigation menu here later */}
        </div>
      </div>
    </header>
  )
}
```

**Step 2: Update components index**

Modify: `packages/web/src/components/index.ts`

```typescript
export * from './AlbumArt'
export * from './DateDivider'
export * from './LoadingSpinner'
export * from './PlayCard'
export * from './InfiniteTimeline'
export * from './SearchBar'
export * from './Header'
```

**Step 3: Update root route to include header**

Modify: `packages/web/src/routes/__root.tsx`

```typescript
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Header } from '@/components'

export const Route = createRootRoute({
  component: RootComponent
})

function RootComponent() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Outlet />
    </div>
  )
}
```

**Step 4: Test header and layout**

Run: `cd packages/web && pnpm dev`

Expected: Header visible on all pages, logo links to home, search bar integrated

Stop server: Ctrl+C

**Step 5: Commit**

```bash
git add packages/web/
git commit -m "feat(web): create header component and integrate into layout"
```

---

## Task 13: Implement Play Detail Page

**Goal:** Create play detail page with anchored timeline

**Files:**
- Modify: `packages/web/src/routes/play.$playId.tsx`

**Step 1: Implement play detail route**

Modify: `packages/web/src/routes/play.$playId.tsx`

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { InfiniteTimeline } from '@/components'

export const Route = createFileRoute('/play/$playId')({
  component: PlayDetailComponent
})

function PlayDetailComponent() {
  const { playId } = Route.useParams()
  const playIdNumber = parseInt(playId, 10)

  return <InfiniteTimeline anchorId={playIdNumber} />
}
```

**Step 2: Test play detail page**

Run API: `cd faiss-search-api && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000`

Run frontend: `cd packages/web && pnpm dev`

Test: Navigate to http://localhost:5173/play/123

Expected: Timeline loads and scrolls to play #123, highlighted

Stop both servers: Ctrl+C

**Step 3: Commit**

```bash
git add packages/web/src/routes/play.$playId.tsx
git commit -m "feat(web): implement play detail page with anchored timeline"
```

---

## Task 14: Implement Timeline Jump Page

**Goal:** Implement timeline jump functionality with date and percentage navigation

**Files:**
- Modify: `packages/web/src/routes/timeline.tsx`
- Modify: `packages/web/src/atoms/timeline.ts`

**Step 1: Update timeline atom to support jump parameters**

This is already implemented in the atoms, so we just need to wire it up to the route.

**Step 2: Update timeline route**

Modify: `packages/web/src/routes/timeline.tsx`

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { InfiniteTimeline } from '@/components'

export const Route = createFileRoute('/timeline')({
  component: TimelineComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    since: search.since as string | undefined,
    until: search.until as string | undefined,
    percentage: search.percentage ? Number(search.percentage) : undefined
  })
})

function TimelineComponent() {
  const { since, until, percentage } = Route.useSearch()

  return (
    <InfiniteTimeline
      since={since}
      until={until}
      percentage={percentage}
    />
  )
}
```

**Step 3: Test timeline jump**

Run API and frontend

Test URLs:
- http://localhost:5173/timeline?since=2020-01-01T00:00:00
- http://localhost:5173/timeline?percentage=0.5

Expected: Timeline jumps to the specified date/percentage

**Step 4: Commit**

```bash
git add packages/web/src/routes/timeline.tsx
git commit -m "feat(web): implement timeline jump with date and percentage"
```

---

## Task 15: Add Navigation Controls (Optional Enhancement)

**Goal:** Add quick navigation controls for jumping through timeline

**Files:**
- Create: `packages/web/src/components/NavigationControls.tsx`
- Modify: `packages/web/src/components/index.ts`

**Step 1: Install additional shadcn/ui components**

Run: `cd packages/web && npx shadcn@latest add popover calendar slider`

Expected: Components installed

**Step 2: Create NavigationControls component**

Create: `packages/web/src/components/NavigationControls.tsx`

```typescript
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Slider } from '@/components/ui/slider'
import { format } from 'date-fns'

export function NavigationControls() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [percentage, setPercentage] = useState<number>(0)

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date)
      const isoDate = date.toISOString().split('T')[0] + 'T00:00:00'
      navigate({ to: '/timeline', search: { since: isoDate } })
    }
  }

  const handlePercentageChange = (value: number[]) => {
    setPercentage(value[0])
  }

  const handlePercentageCommit = () => {
    navigate({ to: '/timeline', search: { percentage: percentage / 100 } })
  }

  const handleYearClick = (year: number) => {
    const isoDate = `${year}-01-01T00:00:00`
    navigate({ to: '/timeline', search: { since: isoDate } })
  }

  return (
    <div className="border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
        {/* Quick year buttons */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">Jump to:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: '/' })}
          >
            Today
          </Button>
          {[2024, 2020, 2015, 2010].map((year) => (
            <Button
              key={year}
              variant="ghost"
              size="sm"
              onClick={() => handleYearClick(year)}
            >
              {year}
            </Button>
          ))}
        </div>

        {/* Date picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              <CalendarIcon className="w-4 h-4 mr-2" />
              {selectedDate ? format(selectedDate, 'MMM d, yyyy') : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Timeline scrubber */}
        <div className="w-full mt-2 flex items-center gap-4">
          <span className="text-xs text-muted-foreground">2007</span>
          <Slider
            value={[percentage]}
            onValueChange={handlePercentageChange}
            onValueCommit={handlePercentageCommit}
            max={100}
            step={1}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground">2025</span>
          <span className="text-xs text-muted-foreground font-mono w-12 text-right">
            {percentage}%
          </span>
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Update components index**

Modify: `packages/web/src/components/index.ts`

```typescript
export * from './AlbumArt'
export * from './DateDivider'
export * from './LoadingSpinner'
export * from './PlayCard'
export * from './InfiniteTimeline'
export * from './SearchBar'
export * from './Header'
export * from './NavigationControls'
```

**Step 4: Add NavigationControls to root layout**

Modify: `packages/web/src/routes/__root.tsx`

```typescript
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Header, NavigationControls } from '@/components'

export const Route = createRootRoute({
  component: RootComponent
})

function RootComponent() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationControls />
      <Outlet />
    </div>
  )
}
```

**Step 5: Test navigation controls**

Run frontend and test:
- Year quick links
- Date picker
- Percentage slider

**Step 6: Commit**

```bash
git add packages/web/
git commit -m "feat(web): add navigation controls for timeline jumping"
```

---

## Task 16: Production Build and Deployment Setup

**Goal:** Set up production build configuration and Vercel deployment

**Files:**
- Create: `packages/web/vercel.json`
- Create: `packages/web/.env.example`
- Modify: `packages/web/package.json`

**Step 1: Create Vercel configuration**

Create: `packages/web/vercel.json`

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://cratemusic.duckdns.org/api/:path*"
    }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

**Step 2: Create environment example**

Create: `packages/web/.env.example`

```
VITE_API_BASE_URL=http://localhost:8000
```

**Step 3: Update package.json with additional scripts**

Modify: `packages/web/package.json` (add to scripts):

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "check": "tsc --noEmit",
    "lint": "eslint src --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  }
}
```

**Step 4: Test production build**

Run: `cd packages/web && pnpm build`

Expected: Build completes successfully, outputs to `dist/`

Run: `cd packages/web && pnpm preview`

Expected: Production preview server starts

**Step 5: Create README**

Create: `packages/web/README.md`

```markdown
# KXP Radio Crate Frontend

React frontend for browsing 2.2M+ KEXP radio plays.

## Tech Stack

- React 18 + TypeScript
- Effect-TS + Effect Atom (state management)
- TanStack Router (file-based routing)
- TanStack Virtual (infinite scrolling)
- Tailwind CSS + shadcn/ui
- Vite

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Type check
pnpm check

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Environment Variables

- `VITE_API_BASE_URL`: Backend API URL (default: http://localhost:8000)

## Deployment

Deployed to Vercel with automatic builds on push to main.
```

**Step 6: Commit**

```bash
git add packages/web/
git commit -m "feat(web): add production build config and deployment setup"
```

---

## Final Verification

**Step 1: Full build check**

Run: `cd packages/web && pnpm check && pnpm build`

Expected: No type errors, build succeeds

**Step 2: End-to-end test**

1. Start API: `cd faiss-search-api && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000`
2. Start frontend: `cd packages/web && pnpm dev`
3. Test flows:
   - Home page loads timeline
   - Infinite scroll loads more plays
   - Search works with debouncing
   - Play detail page jumps to specific play
   - Timeline jump works with date and percentage
   - Navigation controls work

**Step 3: Final commit**

```bash
git add packages/web/
git commit -m "feat(web): complete kxp radio crate frontend implementation"
```

---

## Summary

This plan creates a complete React frontend for the KXP Radio Crate with:

- **Package structure** matching existing packages
- **Effect Atom** for reactive state management
- **TanStack Router** for file-based routing
- **Infinite scrolling** with virtual scrolling
- **Semantic search** with FAISS backend
- **Timeline navigation** with date/percentage jumping
- **Production-ready** build and deployment setup

All components follow the Effect-TS patterns with proper error handling, TaggedErrors, and HttpClient service access through Effect Atom runtime.

---

## Next Steps

After implementation:

1. Deploy to Vercel
2. Add analytics (optional)
3. Add unit tests with @effect/vitest
4. Add E2E tests with Playwright
5. Performance optimization (lazy loading, code splitting)
6. Add user preferences (theme, display density)
7. Add favorites/bookmarks feature
