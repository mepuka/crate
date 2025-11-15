# KEXP Program & Show Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add KEXP program and show metadata to the frontend with subtle show transition markers in the timeline.

**Architecture:** Dedicated web worker fetches KEXP API data, caches in localStorage, posts updates to main thread. Composable atoms manage reactive state. Components enrich plays with show/program info and render transition markers.

**Tech Stack:** Effect-TS, Solid.js, Web Workers, localStorage, KEXP public API

---

## Task 1: Create Worker Protocol Schema

**Files:**
- Create: `packages/web/src/workers/kexp-data-worker-protocol.ts`

**Step 1: Write protocol schema with Effect Schema**

```typescript
import { Schema } from "effect"
import { KexpProgram, KexpShow } from "@crate/domain/kexp/schemas"

// Request messages (main → worker)
export const FetchProgramsRequest = Schema.Struct({
  type: Schema.Literal("fetch-programs")
})
export type FetchProgramsRequest = Schema.Schema.Type<typeof FetchProgramsRequest>

export const FetchShowsRequest = Schema.Struct({
  type: Schema.Literal("fetch-shows"),
  limit: Schema.Number
})
export type FetchShowsRequest = Schema.Schema.Type<typeof FetchShowsRequest>

export const GetShowInfoRequest = Schema.Struct({
  type: Schema.Literal("get-show-info"),
  showId: Schema.Number
})
export type GetShowInfoRequest = Schema.Schema.Type<typeof GetShowInfoRequest>

export const WorkerRequest = Schema.Union(
  FetchProgramsRequest,
  FetchShowsRequest,
  GetShowInfoRequest
)
export type WorkerRequest = Schema.Schema.Type<typeof WorkerRequest>

// Response messages (worker → main)
export const ProgramsData = Schema.Struct({
  type: Schema.Literal("programs-data"),
  programs: Schema.Array(KexpProgram),
  cached: Schema.Boolean,
  timestamp: Schema.String
})
export type ProgramsData = Schema.Schema.Type<typeof ProgramsData>

export const ShowsData = Schema.Struct({
  type: Schema.Literal("shows-data"),
  shows: Schema.Array(KexpShow),
  cached: Schema.Boolean,
  timestamp: Schema.String
})
export type ShowsData = Schema.Schema.Type<typeof ShowsData>

export const ShowInfoResponse = Schema.Struct({
  type: Schema.Literal("show-info"),
  show: Schema.NullOr(KexpShow),
  program: Schema.NullOr(KexpProgram)
})
export type ShowInfoResponse = Schema.Schema.Type<typeof ShowInfoResponse>

export const ErrorResponse = Schema.Struct({
  type: Schema.Literal("error"),
  error: Schema.String,
  requestType: Schema.String
})
export type ErrorResponse = Schema.Schema.Type<typeof ErrorResponse>

export const WorkerResponse = Schema.Union(
  ProgramsData,
  ShowsData,
  ShowInfoResponse,
  ErrorResponse
)
export type WorkerResponse = Schema.Schema.Type<typeof WorkerResponse>
```

**Step 2: Verify imports resolve**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors related to this file

**Step 3: Commit**

```bash
git add packages/web/src/workers/kexp-data-worker-protocol.ts
git commit -m "feat(web): add KEXP worker protocol schemas"
```

---

## Task 2: Create KEXP API Effect Service

**Files:**
- Create: `packages/web/src/workers/kexp-api-service.ts`

**Step 1: Define service interface with Context.Tag**

```typescript
import { Context, Effect, HttpClient, Layer, Schedule } from "effect"
import { KexpProgramsResponse, KexpShowsResponse, KexpShow } from "@crate/domain/kexp/schemas"

// Error types
export class NetworkError extends Error {
  readonly _tag = "NetworkError"
}

export class ParseError extends Error {
  readonly _tag = "ParseError"
}

export class NotFoundError extends Error {
  readonly _tag = "NotFoundError"
}

// Service interface
export class KexpApiService extends Context.Tag("KexpApiService")<
  KexpApiService,
  {
    readonly fetchPrograms: Effect.Effect<
      KexpProgramsResponse,
      NetworkError | ParseError
    >
    readonly fetchShows: (
      limit: number
    ) => Effect.Effect<KexpShowsResponse, NetworkError | ParseError>
  }
>() {}
```

**Step 2: Implement live service with retry policy**

```typescript
const BASE_URL = "https://api.kexp.org/v2"

export const KexpApiServiceLive = Layer.effect(
  KexpApiService,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient

    const retryPolicy = Schedule.exponential("100 millis").pipe(
      Schedule.compose(Schedule.recurs(3))
    )

    const fetchPrograms = httpClient
      .get(`${BASE_URL}/programs/?format=json`)
      .pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap((json) =>
          Effect.try({
            try: () => KexpProgramsResponse.parse(json),
            catch: (error) => new ParseError(String(error))
          })
        ),
        Effect.retry(retryPolicy),
        Effect.catchAll((error) =>
          Effect.fail(
            error instanceof ParseError ? error : new NetworkError(String(error))
          )
        )
      )

    const fetchShows = (limit: number) =>
      httpClient
        .get(`${BASE_URL}/shows/?format=json&limit=${limit}`)
        .pipe(
          Effect.flatMap((response) => response.json),
          Effect.flatMap((json) =>
            Effect.try({
              try: () => KexpShowsResponse.parse(json),
              catch: (error) => new ParseError(String(error))
            })
          ),
          Effect.retry(retryPolicy),
          Effect.catchAll((error) =>
            Effect.fail(
              error instanceof ParseError
                ? error
                : new NetworkError(String(error))
            )
          )
        )

    return {
      fetchPrograms,
      fetchShows
    }
  })
)
```

**Step 3: Verify imports and type checking**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/web/src/workers/kexp-api-service.ts
git commit -m "feat(web): add KEXP API Effect service"
```

---

## Task 3: Create LocalStorage Cache Utilities

**Files:**
- Create: `packages/web/src/workers/kexp-cache.ts`

**Step 1: Define cache keys and types**

```typescript
import { Effect } from "effect"
import { KexpProgram, KexpShow } from "@crate/domain/kexp/schemas"

const CACHE_KEYS = {
  programs: "kexp:programs",
  shows: "kexp:shows",
  programsTimestamp: "kexp:programs:timestamp",
  showsTimestamp: "kexp:shows:timestamp"
} as const

interface CachedData<T> {
  data: T
  timestamp: string
}

const CACHE_TTL = {
  programs: 24 * 60 * 60 * 1000, // 24 hours
  shows: 60 * 60 * 1000 // 1 hour
} as const
```

**Step 2: Implement cache operations**

```typescript
export const savePrograms = (programs: KexpProgram[]) =>
  Effect.sync(() => {
    const timestamp = new Date().toISOString()
    localStorage.setItem(CACHE_KEYS.programs, JSON.stringify(programs))
    localStorage.setItem(CACHE_KEYS.programsTimestamp, timestamp)
    return timestamp
  })

export const loadPrograms = () =>
  Effect.try({
    try: (): CachedData<KexpProgram[]> | null => {
      const data = localStorage.getItem(CACHE_KEYS.programs)
      const timestamp = localStorage.getItem(CACHE_KEYS.programsTimestamp)

      if (!data || !timestamp) return null

      const age = Date.now() - new Date(timestamp).getTime()
      if (age > CACHE_TTL.programs) {
        // Expired
        localStorage.removeItem(CACHE_KEYS.programs)
        localStorage.removeItem(CACHE_KEYS.programsTimestamp)
        return null
      }

      return {
        data: JSON.parse(data),
        timestamp
      }
    },
    catch: () => null
  })

export const saveShows = (shows: KexpShow[]) =>
  Effect.sync(() => {
    const timestamp = new Date().toISOString()
    localStorage.setItem(CACHE_KEYS.shows, JSON.stringify(shows))
    localStorage.setItem(CACHE_KEYS.showsTimestamp, timestamp)
    return timestamp
  })

export const loadShows = () =>
  Effect.try({
    try: (): CachedData<KexpShow[]> | null => {
      const data = localStorage.getItem(CACHE_KEYS.shows)
      const timestamp = localStorage.getItem(CACHE_KEYS.showsTimestamp)

      if (!data || !timestamp) return null

      const age = Date.now() - new Date(timestamp).getTime()
      if (age > CACHE_TTL.shows) {
        // Expired
        localStorage.removeItem(CACHE_KEYS.shows)
        localStorage.removeItem(CACHE_KEYS.showsTimestamp)
        return null
      }

      return {
        data: JSON.parse(data),
        timestamp
      }
    },
    catch: () => null
  })

export const clearCache = () =>
  Effect.sync(() => {
    Object.values(CACHE_KEYS).forEach((key) => localStorage.removeItem(key))
  })
```

**Step 3: Verify type checking**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/web/src/workers/kexp-cache.ts
git commit -m "feat(web): add KEXP localStorage cache utilities"
```

---

## Task 4: Implement Worker Message Handler

**Files:**
- Create: `packages/web/src/workers/kexp-data-worker.ts`

**Step 1: Set up worker with message handler skeleton**

```typescript
import { Effect, Layer } from "effect"
import { KexpApiService, KexpApiServiceLive } from "./kexp-api-service"
import * as Cache from "./kexp-cache"
import * as Protocol from "./kexp-data-worker-protocol"
import { KexpProgram, KexpShow } from "@crate/domain/kexp/schemas"

// Build runtime with live service
const MainLayer = Layer.mergeAll(KexpApiServiceLive)

const runtime = Effect.runSync(Layer.toRuntime(MainLayer))

// In-memory maps for quick lookup
let programsMap = new Map<number, KexpProgram>()
let showsMap = new Map<number, KexpShow>()

// Message handler
self.onmessage = async (event: MessageEvent<Protocol.WorkerRequest>) => {
  const request = event.data

  switch (request.type) {
    case "fetch-programs":
      await handleFetchPrograms()
      break
    case "fetch-shows":
      await handleFetchShows(request.limit)
      break
    case "get-show-info":
      await handleGetShowInfo(request.showId)
      break
  }
}
```

**Step 2: Implement fetch programs handler**

```typescript
async function handleFetchPrograms() {
  const program = Effect.gen(function* () {
    // Try cache first
    const cached = yield* Cache.loadPrograms()
    if (cached) {
      programsMap = new Map(cached.data.map((p) => [p.id, p]))
      const response: Protocol.ProgramsData = {
        type: "programs-data",
        programs: cached.data,
        cached: true,
        timestamp: cached.timestamp
      }
      self.postMessage(response)
    }

    // Fetch fresh data in background
    const service = yield* KexpApiService
    const apiResponse = yield* service.fetchPrograms
    const programs = apiResponse.results

    // Update cache and map
    const timestamp = yield* Cache.savePrograms(programs)
    programsMap = new Map(programs.map((p) => [p.id, p]))

    const response: Protocol.ProgramsData = {
      type: "programs-data",
      programs,
      cached: false,
      timestamp
    }
    self.postMessage(response)

    return Effect.succeed(undefined)
  }).pipe(
    Effect.catchAll((error) => {
      const response: Protocol.ErrorResponse = {
        type: "error",
        error: String(error),
        requestType: "fetch-programs"
      }
      self.postMessage(response)
      return Effect.succeed(undefined)
    })
  )

  await Effect.runPromise(program.pipe(Effect.provide(runtime)))
}
```

**Step 3: Implement fetch shows handler**

```typescript
async function handleFetchShows(limit: number) {
  const program = Effect.gen(function* () {
    // Try cache first
    const cached = yield* Cache.loadShows()
    if (cached) {
      showsMap = new Map(cached.data.map((s) => [s.id, s]))
      const response: Protocol.ShowsData = {
        type: "shows-data",
        shows: cached.data,
        cached: true,
        timestamp: cached.timestamp
      }
      self.postMessage(response)
    }

    // Fetch fresh data in background
    const service = yield* KexpApiService
    const apiResponse = yield* service.fetchShows(limit)
    const shows = apiResponse.results

    // Update cache and map
    const timestamp = yield* Cache.saveShows(shows)
    showsMap = new Map(shows.map((s) => [s.id, s]))

    const response: Protocol.ShowsData = {
      type: "shows-data",
      shows,
      cached: false,
      timestamp
    }
    self.postMessage(response)

    return Effect.succeed(undefined)
  }).pipe(
    Effect.catchAll((error) => {
      const response: Protocol.ErrorResponse = {
        type: "error",
        error: String(error),
        requestType: "fetch-shows"
      }
      self.postMessage(response)
      return Effect.succeed(undefined)
    })
  )

  await Effect.runPromise(program.pipe(Effect.provide(runtime)))
}
```

**Step 4: Implement get show info handler**

```typescript
async function handleGetShowInfo(showId: number) {
  const show = showsMap.get(showId) ?? null
  const program = show ? programsMap.get(show.program) ?? null : null

  const response: Protocol.ShowInfoResponse = {
    type: "show-info",
    show,
    program
  }
  self.postMessage(response)
}
```

**Step 5: Verify type checking**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/web/src/workers/kexp-data-worker.ts
git commit -m "feat(web): implement KEXP data worker message handlers"
```

---

## Task 5: Create Worker Client for Main Thread

**Files:**
- Create: `packages/web/src/services/kexp-data-client.ts`

**Step 1: Create client class with worker initialization**

```typescript
import * as Protocol from "../workers/kexp-data-worker-protocol"
import { KexpProgram, KexpShow } from "@crate/domain/kexp/schemas"

type MessageCallback = (response: Protocol.WorkerResponse) => void

export class KexpDataClient {
  private worker: Worker | null = null
  private callbacks: Set<MessageCallback> = new Set()

  constructor() {
    this.initWorker()
  }

  private initWorker() {
    this.worker = new Worker(
      new URL("../workers/kexp-data-worker.ts", import.meta.url),
      { type: "module" }
    )

    this.worker.onmessage = (event: MessageEvent<Protocol.WorkerResponse>) => {
      this.callbacks.forEach((callback) => callback(event.data))
    }

    this.worker.onerror = (error) => {
      console.error("KEXP worker error:", error)
    }
  }

  subscribe(callback: MessageCallback): () => void {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  fetchPrograms() {
    if (!this.worker) return
    const request: Protocol.FetchProgramsRequest = {
      type: "fetch-programs"
    }
    this.worker.postMessage(request)
  }

  fetchShows(limit: number = 200) {
    if (!this.worker) return
    const request: Protocol.FetchShowsRequest = {
      type: "fetch-shows",
      limit
    }
    this.worker.postMessage(request)
  }

  getShowInfo(showId: number) {
    if (!this.worker) return
    const request: Protocol.GetShowInfoRequest = {
      type: "get-show-info",
      showId
    }
    this.worker.postMessage(request)
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.callbacks.clear()
  }
}

// Singleton instance
let clientInstance: KexpDataClient | null = null

export function getKexpDataClient(): KexpDataClient {
  if (!clientInstance) {
    clientInstance = new KexpDataClient()
  }
  return clientInstance
}
```

**Step 2: Verify type checking**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/services/kexp-data-client.ts
git commit -m "feat(web): add KEXP data worker client"
```

---

## Task 6: Create Reactive Atoms for KEXP Data

**Files:**
- Create: `packages/web/src/state/kexp-atoms.ts`

**Step 1: Create base atoms for programs and shows**

```typescript
import { atom } from "jotai"
import { KexpProgram, KexpShow } from "@crate/domain/kexp/schemas"

// Base atoms (writable)
export const programsMapAtom = atom<Map<number, KexpProgram>>(new Map())
export const showsMapAtom = atom<Map<number, KexpShow>>(new Map())

// Metadata atoms
export const programsLoadingAtom = atom<boolean>(false)
export const showsLoadingAtom = atom<boolean>(false)
export const programsTimestampAtom = atom<string | null>(null)
export const showsTimestampAtom = atom<string | null>(null)
export const programsCachedAtom = atom<boolean>(false)
export const showsCachedAtom = atom<boolean>(false)
```

**Step 2: Create derived atom for show-to-program lookup**

```typescript
// Derived atom: quick lookup from showId to program
export const showToProgramMapAtom = atom((get) => {
  const shows = get(showsMapAtom)
  const programs = get(programsMapAtom)
  const map = new Map<number, KexpProgram>()

  shows.forEach((show) => {
    const program = programs.get(show.program)
    if (program) {
      map.set(show.id, program)
    }
  })

  return map
})
```

**Step 3: Create atom for show boundaries computation**

```typescript
import type { Play } from "@crate/domain/Play"

export interface ShowBoundary {
  timestamp: string
  showId: number
  programName?: string
  programId?: number
  hostNames?: string[]
}

// This will be used by timeline components
export const createShowBoundariesAtom = (playsAtom: typeof atom<Play[]>) =>
  atom((get) => {
    const plays = get(playsAtom)
    const shows = get(showsMapAtom)
    const boundaries: ShowBoundary[] = []

    plays.forEach((play, idx) => {
      const prevPlay = plays[idx - 1]
      const isNewShow = !prevPlay || prevPlay.show !== play.show

      if (isNewShow) {
        const showInfo = shows.get(play.show)
        boundaries.push({
          timestamp: play.airdate,
          showId: play.show,
          programName: showInfo?.program_name,
          programId: showInfo?.program,
          hostNames: showInfo?.host_names
        })
      }
    })

    return boundaries
  })
```

**Step 4: Verify type checking**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/web/src/state/kexp-atoms.ts
git commit -m "feat(web): add KEXP reactive atoms"
```

---

## Task 7: Wire Worker Client to Atoms

**Files:**
- Create: `packages/web/src/state/kexp-sync.ts`

**Step 1: Create sync function to wire worker messages to atoms**

```typescript
import { useSetAtom } from "jotai"
import { useEffect } from "solid-js"
import { getKexpDataClient } from "../services/kexp-data-client"
import * as Protocol from "../workers/kexp-data-worker-protocol"
import {
  programsMapAtom,
  showsMapAtom,
  programsTimestampAtom,
  showsTimestampAtom,
  programsCachedAtom,
  showsCachedAtom,
  programsLoadingAtom,
  showsLoadingAtom
} from "./kexp-atoms"

export function useKexpDataSync() {
  const setProgramsMap = useSetAtom(programsMapAtom)
  const setShowsMap = useSetAtom(showsMapAtom)
  const setProgramsTimestamp = useSetAtom(programsTimestampAtom)
  const setShowsTimestamp = useSetAtom(showsTimestampAtom)
  const setProgramsCached = useSetAtom(programsCachedAtom)
  const setShowsCached = useSetAtom(showsCachedAtom)
  const setProgramsLoading = useSetAtom(programsLoadingAtom)
  const setShowsLoading = useSetAtom(showsLoadingAtom)

  useEffect(() => {
    const client = getKexpDataClient()

    const unsubscribe = client.subscribe((response: Protocol.WorkerResponse) => {
      switch (response.type) {
        case "programs-data":
          setProgramsMap(new Map(response.programs.map((p) => [p.id, p])))
          setProgramsTimestamp(response.timestamp)
          setProgramsCached(response.cached)
          setProgramsLoading(false)
          break

        case "shows-data":
          setShowsMap(new Map(response.shows.map((s) => [s.id, s])))
          setShowsTimestamp(response.timestamp)
          setShowsCached(response.cached)
          setShowsLoading(false)
          break

        case "error":
          console.error(`KEXP worker error (${response.requestType}):`, response.error)
          if (response.requestType === "fetch-programs") {
            setProgramsLoading(false)
          } else if (response.requestType === "fetch-shows") {
            setShowsLoading(false)
          }
          break
      }
    })

    // Initial fetch
    setProgramsLoading(true)
    setShowsLoading(true)
    client.fetchPrograms()
    client.fetchShows(200)

    return () => {
      unsubscribe()
    }
  })
}
```

**Step 2: Verify type checking**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/state/kexp-sync.ts
git commit -m "feat(web): wire KEXP worker to reactive atoms"
```

---

## Task 8: Create Composable Hooks for KEXP Data

**Files:**
- Create: `packages/web/src/hooks/use-kexp-data.ts`

**Step 1: Create useShowInfo hook**

```typescript
import { useAtomValue } from "jotai"
import { createMemo } from "solid-js"
import { showsMapAtom, programsMapAtom } from "../state/kexp-atoms"
import type { KexpShow, KexpProgram } from "@crate/domain/kexp/schemas"

export function useShowInfo(showId: number) {
  const showsMap = useAtomValue(showsMapAtom)
  const programsMap = useAtomValue(programsMapAtom)

  return createMemo<{
    show: KexpShow | undefined
    program: KexpProgram | undefined
  }>(() => {
    const show = showsMap().get(showId)
    const program = show ? programsMap().get(show.program) : undefined
    return { show, program }
  })
}
```

**Step 2: Create useProgramForShow hook**

```typescript
export function useProgramForShow(showId: number) {
  const { program } = useShowInfo(showId)
  return createMemo(() => program())
}
```

**Step 3: Create useShowBoundaries hook**

```typescript
import { showToProgramMapAtom } from "../state/kexp-atoms"
import type { Play } from "@crate/domain/Play"

export function useShowBoundaries(plays: () => Play[]) {
  const showsMap = useAtomValue(showsMapAtom)

  return createMemo(() => {
    const playList = plays()
    const shows = showsMap()
    const boundaries: Array<{
      timestamp: string
      showId: number
      programName?: string
      hostNames?: string[]
    }> = []

    playList.forEach((play, idx) => {
      const prevPlay = playList[idx - 1]
      const isNewShow = !prevPlay || prevPlay.show !== play.show

      if (isNewShow) {
        const showInfo = shows.get(play.show)
        boundaries.push({
          timestamp: play.airdate,
          showId: play.show,
          programName: showInfo?.program_name,
          hostNames: showInfo?.host_names
        })
      }
    })

    return boundaries
  })
}
```

**Step 4: Verify type checking**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/web/src/hooks/use-kexp-data.ts
git commit -m "feat(web): add composable KEXP data hooks"
```

---

## Task 9: Initialize KEXP Sync in App Root

**Files:**
- Modify: `packages/web/src/App.tsx` (or main app component)

**Step 1: Import and call useKexpDataSync**

Find the app initialization component and add:

```tsx
import { useKexpDataSync } from "./state/kexp-sync"

export function App() {
  // Initialize KEXP data sync (starts worker, fetches data)
  useKexpDataSync()

  return (
    // ... existing app structure
  )
}
```

**Step 2: Verify dev server runs**

Run: `pnpm --filter @crate/web dev`
Expected: Dev server starts, no errors in console
Check: Browser console should show worker initializing

**Step 3: Verify worker loads data**

Open browser console, wait 2-3 seconds
Expected: See network requests to `api.kexp.org/v2/programs` and `/shows`
Check localStorage: Should have `kexp:programs` and `kexp:shows` keys

**Step 4: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat(web): initialize KEXP data sync in app root"
```

---

## Task 10: Create Show Transition Marker Component

**Files:**
- Create: `packages/web/src/components/ShowTransitionMarker.tsx`

**Step 1: Create basic marker component**

```tsx
import { Component } from "solid-js"
import "./ShowTransitionMarker.css"

interface ShowTransitionMarkerProps {
  timestamp: string
  programName?: string
  hostNames?: string[]
  showId: number
}

export const ShowTransitionMarker: Component<ShowTransitionMarkerProps> = (
  props
) => {
  return (
    <div class="show-transition" data-show-id={props.showId}>
      <div class="transition-line" />
      {props.programName && (
        <span class="program-badge">{props.programName}</span>
      )}
    </div>
  )
}
```

**Step 2: Create CSS for minimal, subtle styling**

Create: `packages/web/src/components/ShowTransitionMarker.css`

```css
.show-transition {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}

.transition-line {
  width: 100%;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    rgba(255, 255, 255, 0.1) 20%,
    rgba(255, 255, 255, 0.1) 80%,
    transparent
  );
}

.program-badge {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  transition: all 0.2s ease;
}

.program-badge:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}
```

**Step 3: Verify type checking**

Run: `pnpm --filter @crate/web exec tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/web/src/components/ShowTransitionMarker.tsx packages/web/src/components/ShowTransitionMarker.css
git commit -m "feat(web): add show transition marker component"
```

---

## Task 11: Integrate Show Markers into Timeline

**Files:**
- Modify: `packages/web/src/components/Timeline.tsx` (or wherever plays are rendered)

**Step 1: Import hooks and marker component**

```tsx
import { For } from "solid-js"
import { useShowBoundaries } from "../hooks/use-kexp-data"
import { ShowTransitionMarker } from "./ShowTransitionMarker"
```

**Step 2: Compute show boundaries from plays**

In the Timeline component:

```tsx
export function Timeline() {
  // Existing plays atom/signal
  const plays = usePlays() // or however you access plays

  // Compute show boundaries
  const showBoundaries = useShowBoundaries(plays)

  return (
    <div class="timeline">
      <For each={showBoundaries()}>
        {(boundary) => (
          <ShowTransitionMarker
            timestamp={boundary.timestamp}
            programName={boundary.programName}
            hostNames={boundary.hostNames}
            showId={boundary.showId}
          />
        )}
      </For>

      {/* Existing play cards */}
      <For each={plays()}>
        {(play) => <PlayCard play={play} />}
      </For>
    </div>
  )
}
```

**Step 3: Verify in dev mode**

Run: `pnpm --filter @crate/web dev`
Expected: Timeline shows subtle horizontal lines and program badges at show transitions

**Step 4: Test visual appearance**

Check:
- Markers appear between plays from different shows
- Program names are readable but subtle
- Styling matches aesthetic (minimal, clean)

**Step 5: Commit**

```bash
git add packages/web/src/components/Timeline.tsx
git commit -m "feat(web): integrate show transition markers into timeline"
```

---

## Task 12: Add Loading States and Error Handling

**Files:**
- Modify: `packages/web/src/components/Timeline.tsx`

**Step 1: Show loading indicator for KEXP data**

```tsx
import { useAtomValue } from "jotai"
import { programsLoadingAtom, showsLoadingAtom } from "../state/kexp-atoms"

export function Timeline() {
  const programsLoading = useAtomValue(programsLoadingAtom)
  const showsLoading = useAtomValue(showsLoadingAtom)
  const isKexpDataLoading = () => programsLoading() || showsLoading()

  // ... rest of component

  return (
    <div class="timeline">
      {isKexpDataLoading() && (
        <div class="kexp-loading-indicator">
          Loading show information...
        </div>
      )}

      {/* Show markers and plays */}
    </div>
  )
}
```

**Step 2: Add CSS for loading indicator**

In Timeline.css:

```css
.kexp-loading-indicator {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  padding: 8px;
  text-align: center;
  font-style: italic;
}
```

**Step 3: Verify loading states**

Clear localStorage, reload app
Expected: See "Loading show information..." briefly, then markers appear

**Step 4: Commit**

```bash
git add packages/web/src/components/Timeline.tsx packages/web/src/components/Timeline.css
git commit -m "feat(web): add loading states for KEXP data"
```

---

## Task 13: Test with Real KEXP API

**Step 1: Clear cache and test fresh fetch**

Open browser console:
```javascript
localStorage.clear()
location.reload()
```

Expected:
- Network requests to KEXP API
- Programs and shows populate
- Show markers appear in timeline

**Step 2: Test cache hit**

Reload page (don't clear localStorage)

Expected:
- Markers appear immediately (from cache)
- Background refresh happens
- No visual jank

**Step 3: Test error handling**

Block `api.kexp.org` in DevTools Network tab
Reload page

Expected:
- Cached data still displays (if available)
- Error logged to console
- App doesn't crash

**Step 4: Verify data persistence**

Check localStorage:
```javascript
console.log(localStorage.getItem('kexp:programs'))
console.log(localStorage.getItem('kexp:shows'))
```

Expected: JSON data for programs and shows

---

## Task 14: Polish and Performance Optimization

**Files:**
- Modify: `packages/web/src/workers/kexp-data-worker.ts`

**Step 1: Add debouncing for repeated requests**

```typescript
let fetchProgramsTimeout: NodeJS.Timeout | null = null
let fetchShowsTimeout: NodeJS.Timeout | null = null

function debouncedFetchPrograms() {
  if (fetchProgramsTimeout) clearTimeout(fetchProgramsTimeout)
  fetchProgramsTimeout = setTimeout(() => handleFetchPrograms(), 100)
}

function debouncedFetchShows(limit: number) {
  if (fetchShowsTimeout) clearTimeout(fetchShowsTimeout)
  fetchShowsTimeout = setTimeout(() => handleFetchShows(limit), 100)
}

self.onmessage = async (event: MessageEvent<Protocol.WorkerRequest>) => {
  const request = event.data

  switch (request.type) {
    case "fetch-programs":
      debouncedFetchPrograms()
      break
    case "fetch-shows":
      debouncedFetchShows(request.limit)
      break
    // ... other cases
  }
}
```

**Step 2: Verify no duplicate requests**

Watch network tab, trigger multiple fetches quickly
Expected: Only one request per debounce window

**Step 3: Commit**

```bash
git add packages/web/src/workers/kexp-data-worker.ts
git commit -m "perf(web): debounce KEXP worker requests"
```

---

## Task 15: Documentation

**Files:**
- Create: `packages/web/docs/kexp-integration.md`

**Step 1: Write integration guide**

```markdown
# KEXP Program & Show Integration

## Overview

The frontend integrates KEXP program and show metadata to display subtle show transition markers in the timeline.

## Architecture

- **Worker**: `src/workers/kexp-data-worker.ts` - Handles KEXP API requests
- **Service**: `src/workers/kexp-api-service.ts` - Effect-based HTTP client
- **Cache**: `src/workers/kexp-cache.ts` - localStorage persistence
- **Atoms**: `src/state/kexp-atoms.ts` - Reactive state management
- **Hooks**: `src/hooks/use-kexp-data.ts` - Composable data access

## Data Flow

1. App init → Worker spawned
2. Worker checks cache → Emit cached data
3. Background API fetch → Update cache → Emit fresh data
4. Atoms update → Components re-render

## Adding KEXP Data to Components

```tsx
import { useShowInfo } from "../hooks/use-kexp-data"

function MyComponent({ showId }: { showId: number }) {
  const { show, program } = useShowInfo(showId)

  return (
    <div>
      Program: {program()?.name}
      Hosts: {show()?.host_names.join(", ")}
    </div>
  )
}
```

## Cache Management

- Programs: 24 hour TTL
- Shows: 1 hour TTL
- Clear cache: `localStorage.clear()`

## Performance

- Initial load: <500ms (with cache)
- Worker overhead: ~15kb bundle
- API calls: Debounced, retried with exponential backoff
```

**Step 2: Commit**

```bash
git add packages/web/docs/kexp-integration.md
git commit -m "docs(web): add KEXP integration guide"
```

---

## Testing Checklist

- [ ] Worker initializes without errors
- [ ] Programs fetched and cached
- [ ] Shows fetched and cached
- [ ] Show transition markers appear in timeline
- [ ] Markers styled minimally and subtly
- [ ] Cache persists across reloads
- [ ] Fresh data fetched in background
- [ ] Error states handled gracefully
- [ ] No duplicate API requests
- [ ] DevTools shows correct network timing
- [ ] localStorage populated correctly

---

## Future Enhancements

1. **Infinite Scroll Pagination**
   - Fetch more shows as user scrolls
   - Append to existing cache

2. **Host Photos**
   - Fetch host data
   - Display avatars on markers

3. **Program Color Theming**
   - Extract dominant color from program images
   - Apply subtle tint to background

4. **Program Filtering**
   - Filter timeline by program
   - Search by host name

5. **Show Schedule View**
   - Visualize upcoming shows
   - Calendar integration
