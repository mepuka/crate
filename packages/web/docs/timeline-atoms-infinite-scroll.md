# Timeline Atoms, Search, and Infinite Scroll Architecture

## 1. High‑Level Overview

The current frontend timeline stack is built around:

- **Effect‑Atom** for state and React integration (`@effect-atom/atom-react`).
- **TimelineRuntime** and **TimelineKVS** for HTTP + localStorage‑backed cache.
- **Web workers** for CPU‑heavy search and sorting.
- A **Python FastAPI** service (`faiss-search-api`) for timeline and semantic search.

This document:

1. Maps the existing atom graph (timeline, KEXP metadata, links, workers, URL‑sync).
2. Maps the Python API relevant to timeline/search.
3. Proposes a **pull‑based, Effect‑Atom‑driven infinite scroll design** for the timeline, ready to hand off for implementation.

---

## 2. Existing Frontend State Graph

### 2.1 Core Runtime and Services

**File:** `packages/web/src/lib/http-runtime.ts`

- `TimelineClient` (`AtomHttpApi.Tag`)
  - API: `KexpApi` from `@crate/api`.
  - HTTP client: `FetchHttpClient.layer`.
  - `baseUrl: "/api"` (typically proxied to the Python API).
  - Used by:
    - `FetchLatestLive` (background timeline fetch).
    - Worker side (`search-worker.ts`) via `TimelineClient` for search.

- `TimelineKVS` (`Effect.Service`)
  - Backed by `KeyValueStore.KeyValueStore` with `BrowserKeyValueStore.layerLocalStorage`.
  - Schema versioning:
    - `SCHEMA_VERSION = 4`, stored under key `timeline:schema_version`.
    - On mismatch → `kvs.clear` + set new version.
  - Stores:
    - Per‑play: `playStore` (`PlayResult`), keyed as `timeline:play:{id}`.
    - Last seen ID: `lastSeenIdStore` (`Number`) at `timeline:last_seen_id`.
    - Global Chunk: `playsChunkStore` (`Chunk<PlayResult>`) at `timeline:plays_chunk`.
    - Global ID set: `playIdsHashSetStore` (`HashSet<number>`) at `timeline:play_ids_set`.
  - Initialization:
    - `reconstructChunkFromAllPlays()`:
      - Reads `playIdsHashSetStore("timeline:play_ids_set")`.
      - Loads each `timeline:play:{id}`.
      - Filters out missing plays, rebuilds `HashSet`.
      - Sorts with `sortPlaysByAirdateDesc` (newest first).
      - Writes `playsChunkStore("timeline:plays_chunk")` + updated HashSet.
    - Runs once on service creation; logs play count.
  - Public API (Effect channel, no requirements from callers):
    - `storePlay(play: PlayResult)`
      - Writes individual `timeline:play:{id}`.
      - Reads/modifies `playIdsHashSetStore("timeline:play_ids_set")`.
      - If new ID:
        - Adds to `HashSet`.
        - Removes `timeline:plays_chunk` (forces reconstruction on next read).
      - Always calls `Reactivity.invalidate` on:
        - `"timeline:plays_chunk"`
        - `"timeline:play:{id}"`
    - `getPlay(id: number)`
      - Reads `playStore("timeline:play:{id}")`.
    - `setLastSeenId(id: number)`
      - Writes `lastSeenIdStore("timeline:last_seen_id")`.
      - `Reactivity.invalidate(["timeline:last_seen_id"])`.
    - `getLastSeenId()`
      - Reads `lastSeenIdStore("timeline:last_seen_id")`.
    - `getLastSeenPlay()`
      - Reads last seen ID, then `playStore("timeline:play:{id}")`, returns `Option<PlayResult>`.
    - `getPlayIds()`
      - Reads `playsChunkStore("timeline:plays_chunk")` if present, otherwise reconstructs.
      - Returns `ReadonlyArray<number>` (IDs from sorted chunk).
    - `getPlaysChunk()`
      - Same cache pattern, but returns `Chunk<PlayResult>`.

- `FetchLatestLive` (background timeline fetcher)
  - Effect pipeline:
    - `TimelineClient` + `TimelineKVS`.
    - Calls `client.timeline.getTimeline({ urlParams: { limit: 200 } })`.
    - On success:
      - Stores all plays via `timelineKVS.storePlay` (concurrency 50).
      - Sets last seen ID to first play of the result.
    - On error: logs error.
  - Scheduling:
    - `Effect.repeat(Schedule.spaced(Duration.millis(100000)))`.
    - `Effect.forever`, `Effect.forkScoped`, `Effect.uninterruptible`.
    - Wrapped in `Layer.scopedDiscard` and provided `TimelineClient.layer + TimelineKVS.Default`.
  - Semantics:
    - **Push‑based**: periodically pulls latest 200 plays and pushes them into KVS.
    - Ensures cache is resilient to local clears / schema changes.

- `TimelineRuntime` (`Atom.runtime`)
  - Layer composition:
    - `Reactivity.layer`
    - `BrowserKeyValueStore.layerLocalStorage`
    - `FetchHttpClient.layer`
    - `TimelineKVS.Default`
    - `AlbumBarWorkerClient.Default`
  - This runtime is the root for most timeline‑related atoms.

---

### 2.2 Timeline Atoms

**File:** `packages/web/src/atoms/timeline.ts`

#### 2.2.1 Background Fetch Launcher

- `latestItemAtom`
  - Defined with `Atom.runtime` + `Layer.launch(FetchLatestLive)`.
  - `Timeline` component calls `useAtomMount(latestItemAtom)` once.
  - Effect: starts the background `FetchLatestLive` loop scoped to the timeline runtime.

#### 2.2.2 Reactive Timeline Data (from KVS)

All of these atoms run their effects inside `TimelineRuntime` and use `TimelineKVS` as the persistence layer.

- `lastSeenPlayAtom`
  - `TimelineRuntime.atom(Effect.gen(... timelineKVS.getLastSeenPlay()))`.
  - `Atom.withReactivity(["timeline:last_seen_id", "timeline:play"])`.
  - Always returns `Result<Option<PlayResult>>` in UI.

- `playAtom(id: number)` (family)
  - `TimelineRuntime.atom(Effect.gen(... timelineKVS.getPlay(id)))`.
  - `Atom.withReactivity([`timeline:play:${id}`])`.
  - Efficient per‑play lookup, used by link atoms and details views.

- `lastSeenIdAtom`
  - `TimelineRuntime.atom(Effect.gen(... timelineKVS.getLastSeenId()))`.
  - `Atom.withReactivity(["timeline:last_seen_id"])`.

- `playsChunkAtom`
  - `TimelineRuntime.atom(Effect.gen(... timelineKVS.getPlaysChunk()))`.
  - `Atom.withReactivity(["timeline:plays_chunk"])`.
  - This is the *global* ordered `Chunk<PlayResult>` cache.

- `playIdsAtom`
  - `TimelineRuntime.atom(Effect.gen(... timelineKVS.getPlayIds()))`.
  - `Atom.withReactivity(["timeline:plays_chunk"])`.
  - Returns `Result<ReadonlyArray<number>>` in UI.

#### 2.2.3 Derived Timeline Views (pure atoms)

All derived atoms use `Atom.make` with `Result.map` to preserve loading/error semantics.

- Sorting:
  - `playsSortedByAirdateDescAtom`
  - `playsSortedByAirdateAscAtom`
  - `playsSortedByIdDescAtom`
  - Use `sortPlaysByAirdateDesc/Asc` and `sortPlaysByIdDesc` from `timeline-utils.ts`.

- ID extraction:
  - `playIdsFromChunkAtom`
    - Reads `playsChunkAtom`, extracts IDs via `extractPlayIds`, returns `Result<ReadonlyArray<number>>`.
  - `playIdsSortedByAirdateDescAtom`
    - Derived from `playsSortedByAirdateDescAtom`, then extracts + maps to array.

- Extrema & subsets:
  - `newestPlayAtom`
    - `Result<Option<Play>>` using `getNewestPlay(chunk)`.
  - `oldestPlayAtom`
    - `Result<Option<Play>>` using `getOldestPlay(chunk)`.
  - `newestNPlaysAtom(n: number)` (family)
    - Uses `getNewestNPlays(chunk, n)` and returns the array.

#### 2.2.4 Scroll & Viewport Atoms

- `scrollYAtom: Atom<number>`
  - Imperatively subscribes to `window.scroll` and uses `get.setSelf` to update.
  - Uses `get.addFinalizer` to remove listeners.
  - Represents global window scroll offset.

- `viewportHeightAtom: Atom<number>`
  - Similar pattern for `window.resize`, tracks `window.innerHeight`.

These are useful for future virtualization / visible‑window computation.

#### 2.2.5 Show Boundary Atoms (dependent on KEXP atoms)

**File:** `packages/web/src/atoms/kexp-atoms.ts`

At the timeline level:

- `playsArrayAtom` (private)
  - Converts `playsChunkAtom`’s `Chunk<PlayResult>` → `readonly Play[]`.

- `showBoundariesAtom`
  - Reads `playsArrayAtom`.
  - For each successful array, calls `showBoundariesForPlaysAtom(plays)` (Atom.family from `kexp-atoms`).
  - Returns `Result<ShowBoundary[]>`.

- `playIdToBoundaryMapAtom`
  - Reads `playsArrayAtom` and `showBoundariesAtom`.
  - Uses `Result.matchWithWaiting` on boundaries.
  - Builds `Map<playId, ShowBoundary>` by matching `play.show` + `airdate` to boundary timestamps.
  - UI (`Timeline.tsx`) uses this to decide where to render show markers.

---

### 2.3 KEXP Metadata Atoms

**File:** `packages/web/src/atoms/kexp-atoms.ts`

#### 2.3.1 Layers and Fetch Effects

- `KexpApiService` (`packages/web/src/services/kexp-api-service.ts`)
  - Fetches from `https://api.kexp.org/v2` (programs, shows).
  - Errors: `NetworkError`, `ParseError` (tagged with `Data.TaggedError`).
  - Uses `HttpClient.HttpClient` and `Schema.decodeUnknown`.

- `KexpLayer`
  - `Layer.provide(KexpApiServiceLive, FetchHttpClient.layer)`.

- `fetchProgramsEffect`
  - Logs.
  - `apiService.fetchPrograms`.
  - Builds `HashMap<number, KexpProgram>`.

- `fetchShowsEffect`
  - Similar, with `limit=200`.

Both are wrapped in `Effect.cachedWithTTL("24 hours")` before use in atoms.

#### 2.3.2 Runtime Atoms

- `_programsAtom`
  - `TimelineRuntime.atom(Effect.gen(...)` using `fetchProgramsEffect` with `cachedWithTTL`.

- `_showsAtom`
  - Same pattern with `fetchShowsEffect`.

#### 2.3.3 Public Derived Atoms

- `programsMapAtom`
  - `Atom.make` with `Result.matchWithWaiting` on `_programsAtom`.
  - Returns `HashMap<number, KexpProgram>`, default empty on waiting/error/defect.

- `showsMapAtom`
  - Same pattern for `_showsAtom`.

- Loading/error booleans:
  - `programsLoadingAtom`, `showsLoadingAtom`.
  - `programsErrorAtom`, `showsErrorAtom`.

- Relationship mapping:
  - `showToProgramMapAtom`
    - Combines `showsMapAtom` + `programsMapAtom`.
    - For each show, looks up `show.program` in programs map; builds `HashMap<showId, KexpProgram>`.

- Per‑timeline boundaries:
  - `showBoundariesForPlaysAtom(plays: readonly Play[])` (family)
    - Iterates plays, detects first play per show.
    - Uses `HashMap.get(shows, play.show)` to enrich boundaries with program/host metadata.
    - Returns `ShowBoundary[]` (pure derived data).

---

### 2.4 Link Atoms

**File:** `packages/web/src/atoms/link-atoms.ts`

- `playLinksAtom(playId: number)` (family)
  - Reads `playAtom(playId)` from `timeline.ts`.
  - Uses `Result.matchWithWaiting`:
    - On waiting/error/defect → empty `PlayLinks`.
    - On success:
      - `Option.match` on play Option.
      - If `comment` exists, uses `extractLinksFromComment(playId, play.comment)`.
  - Output: `PlayLinks` model:
    - `links: Chunk<PlayLink>`.
    - `byCategory: HashMap<string, Chunk<PlayLink>>`.
    - `featuredLink: Option<PlayLink>`.

- `featuredLinkAtom(playId: number)` (family)
  - Derived from `playLinksAtom(playId).featuredLink`.

- `linksByCategoryAtom(playId: number)` (family)
  - Derived from `playLinksAtom(playId).byCategory`.

All link‑related state is **derived** from the canonical timeline play Atom graph.

---

### 2.5 Album Bar Atoms

**File:** `packages/web/src/atoms/album-bar.ts`

- `recentAlbumArtAtom`
  - `TimelineRuntime.atom(Effect.gen(...)`:
    - `AlbumBarWorkerClient` + `TimelineKVS`.
    - Reads `timelineKVS.getPlaysChunk()`.
    - Converts to array and calls `workerClient.loadArtwork(playsArray, ALBUM_BAR_PLAY_COUNT)`.
  - `Atom.withReactivity(["timeline:plays_chunk"])`.
  - Offloads album‑art processing to a dedicated worker.

- `scrollSpeedAtom`
  - Simple `Atom.make(() => 25)` (pixels/s).

Album bar tracks the same timeline data as the main `Timeline` component.

---

### 2.6 URL‑Synced Atoms

**File:** `packages/web/src/atoms/timeline-url-sync.ts`

- Search‑param atoms (all return `Option<T>`):
  - `limitAtom` (`NumberFromString`).
  - `cursorAtom` (`String`).
  - `sinceAtom`, `untilAtom` (`String`).
  - `percentageAtom` (`NumberFromString`).
  - `anchorIdAtom` (`NumberFromString`).

- `timelineParamsAtom`
  - Derived config atom that returns:
    - `{ limit, cursor, since, until, percentage, anchor_id }`.
    - Uses `Option.getOrElse` / `Option.getOrUndefined`.
  - Matches the Python `/api/plays/timeline` query model (see §3).

**File:** `packages/web/src/atoms/play-details.ts`

- `selectedPlayIdAtom`
  - `Atom.searchParam("playId", { schema: Schema.NumberFromString })`.
  - Returns `Option<number>` (selected play).

- `isPanelOpenAtom`
  - Derived boolean based on `Option.isSome(selectedPlayIdAtom)`.
  - Used by `Timeline.tsx` to adjust layout width.

URL‑synced atoms provide declarative control over **timeline navigation parameters** and **play details panel**.

---

### 2.7 Search Worker Runtimes and Atoms

**File:** `packages/web/src/workers/search-worker-client.ts`

- `SearchWorkerClient` (`Effect.Service`)
  - Dependencies:
    - `BrowserWorker.layer(() => new Worker(new URL("./search-worker.ts", import.meta.url), { type: "module" }))`.
  - Provides:
    - `search(query, { limit, offset })`.
    - `filterByDateRange(plays, startDate, endDate)`.
    - `sortPlays(plays, orderBy)`.
    - `groupByDate(plays, granularity)`.
    - `extractPlayIds(plays, sorted)`.
  - Uses `Worker.makePoolSerialized<WorkerRequest>` and `pool.executeEffect(request)`.

**File:** `packages/web/src/workers/search-worker.ts`

- `SearchService`
  - Uses `TimelineClient` to call `client.search.search({ payload: { query, limit, offset } })`.
  - Retries with exponential backoff.
  - Encodes `PlayResult` via `Schema.encode(PlayResult)` for postMessage.

- `ChunkProcessorService`
  - Pure operations using `timeline-utils.ts`:
    - `filterByDateRange`.
    - `sortPlays`.
    - `groupByDate` (day/week/month).
    - `extractPlayIds`.

- `handleRequest(request: unknown)`
  - Decodes with `Schema.decodeUnknown(WorkerRequest)`.
  - Dispatches via `Match.tag` to search / filtering / sorting / grouping / ID extraction handlers.

- `WorkerLive`
  - `WorkerRunner.layer(handleRequest)` provided with:
    - `SearchServiceLive`, `ChunkProcessorServiceLive`.
    - `BrowserWorkerRunner.layer`.

- Entry point: `Effect.runFork(BrowserWorkerRunner.launch(WorkerLive))`.

**File:** `packages/web/src/atoms/search-worker.ts`

- `SearchWorkerRuntime = Atom.runtime(Layer.mergeAll(Reactivity.layer, BrowserKeyValueStore.layerLocalStorage, SearchWorkerClient.Default))`.

- `searchQueryAtom(query: string)` (family)
  - Calls `SearchWorkerClient.search(query, { limit: 50, offset: 0 })`.

- `searchWithOptionsAtom({ query, limit?, offset? })` (family)
  - Same but with configurable limit/offset.

- `sortPlaysAtom({ plays, orderBy })` (family)
  - Accepts `Chunk<PlayResult>` or `ReadonlyArray<PlayResult>`.
  - Normalizes to array and calls `SearchWorkerClient.sortPlays`.

These atoms give us **pull‑based, worker‑backed search and sort** capabilities already.

---

### 2.8 Timeline Component Consumption

**File:** `packages/web/src/components/Timeline.tsx`

Key usage:

- Mounts background fetch:
  - `useAtomMount(latestItemAtom)`.

- Reads data:
  - `playIds = useAtomValue(playIdsAtom)`.
  - `newestPlay = useAtomValue(newestPlayAtom)`.
  - `boundaryMap = useAtomValue(playIdToBoundaryMapAtom)`.
  - `isPanelOpen = useAtomValue(isPanelOpenAtom)`.

- Renders:
  - `Result.matchWithWaiting(newestPlay, ...)` for header.
  - `Result.matchWithWaiting(playIds, ...)`:
    - On success, `success.value` is `ReadonlyArray<number>`.
    - For each ID, resolves boundary via `boundaryMap` (also `Result.matchWithWaiting`).
    - Renders `<TimelineItemWithMarker key={id} playId={id} showBoundary={boundary} />`.

Current behavior:

- The timeline is effectively **“latest N plays”** driven by periodic `FetchLatestLive` updates.
- `Timeline` renders **all loaded IDs**; there is no infinite scroll windowing yet.
- All deeper derivations (links, show boundaries, album art) are pure derived atoms over the KVS‑backed play chunk.

---

## 3. Python Timeline & Search API (faiss-search-api)

**File:** `faiss-search-api/app/main.py`  
**Models:** `faiss-search-api/app/models.py`  
**Docs:** `faiss-search-api/TIMELINE_API.md`

### 3.1 Endpoints

#### 3.1.1 `GET /api/health`

- Returns `HealthResponse`:
  - `status: "ok" | "degraded"`.
  - `index_loaded: bool`.
  - `database_connected: bool`.
  - `total_vectors`, `embedding_dimension`.
  - `memory_usage_mb`, `uptime_seconds`.
- Used to monitor FAISS index + DB connectivity.

#### 3.1.2 `POST /api/search`

- Request: `SearchRequest`
  - `query: str` (validated, trimmed).
  - `limit: int` (1–100, default 20).
  - `offset: int` (≥ 0, default 0).

- Implementation:
  - FAISS search: `search_svc.search(query, k=1000)` → indices + distances.
  - Map indices to play IDs, then slice `[offset : offset+limit]`.
  - Fetch plays from DB via `db_svc.get_plays_by_ids(paginated_ids)`.
  - Merge with similarity scores into `PlayResult`.

- Response: `SearchResponse`
  - `results: List<PlayResult>`.
  - `total: int` (total matches before pagination).
  - `query_time_ms: float`.
  - `query: str`.

#### 3.1.3 `GET /api/plays/timeline`

Core infinite scroll / navigation endpoint.

Parameters (query):

- `limit: int` (1–200, default 50).
- `cursor?: str` – base64 cursor for standard pagination.
- `since?: str`, `until?: str` – ISO 8601 datetimes for time‑range jumps.
- `percentage?: float` – 0.0–1.0 for mid‑timeline jumps.
- `anchor_id?: int` – play ID for context window.
- Optional MBID filters:
  - `artist_mbid?: str`.
  - `recording_mbid?: str`.
  - `release_mbid?: str`.
  - `release_group_mbid?: str`.

Constraints:

- Limit validation: `1 ≤ limit ≤ 200`, else `400`.
- Only **one navigation method** allowed at a time:
  - Cursor.
  - Time range (since/until).
  - Percentage.
  - `anchor_id`.
  - If more than one → `400`.

Internal routing:

- Percentage:
  - Validates `0.0 ≤ percentage ≤ 1.0`.
  - Uses `db_svc.get_plays_by_percentage` (in a thread via `anyio.to_thread.run_sync`).
  - Returns `results`, `next_cursor`, `has_more`, `total_count`.

- Anchor:
  - Uses `db_svc.get_plays_around_id(anchor_id, limit, filters...)` (threaded).
  - Returns `anchor_position` (index of anchor in `results`).

- Time range:
  - Parses `since`/`until` with `datetime.fromisoformat`.
  - Uses `db_svc.get_plays_by_time_range(since_dt, until_dt, limit, filters...)` (threaded).

- Default (cursor):
  - Uses `db_svc.get_plays_by_cursor(limit, cursor, filters...)`.
  - Fast indexed query (`airdate DESC, id DESC`).

Response: `TimelineResponse`

- `results: List<PlayResult>`
  - Sorted newest‑first by `airdate` with `id` tiebreakers.
  - `similarity` is `0.0` for timeline browsing.
- `next_cursor: Optional[str]`
  - `None` when no more pages.
- `has_more: bool`
- `query_time_ms: float`
- `total_count?: int` (percentage mode only).
- `anchor_position?: int` (anchor mode only).

This is the **canonical source** for infinite scroll and all advanced jumps.

#### 3.1.4 `GET /api/plays/{play_id}`

- Fetches a single play by ID.
- Returns `PlayResult` or `404` if not found.

### 3.2 Cache & Performance Characteristics

From `CacheHeadersMiddleware`:

- `/api/search`, `/api/plays/timeline`, `/api/plays/{id}` are cacheable (1 week).
- Health is cached for 30 seconds.
- Supports GZip and sets security headers.

Performance from `TIMELINE_API.md`:

- Cursor pagination: `< 5ms`.
- Time‑based queries: `< 1ms`.
- Percentage: `~50ms` (OFFSET).
- Anchor: `~100ms` (multiple lookups).

These characteristics make the API suitable for **pull‑based infinite scroll** with advanced navigation overlays.

---

## 4. Proposed Atom‑Based Infinite Scroll Architecture

### 4.1 Goals

- Move timeline from **“push‑only latest N”** to **pull‑based, cursor‑driven infinite scroll**.
- Keep `TimelineKVS` as **normalized cache** (single source of truth for plays).
- Reuse existing derivations:
  - Show boundaries, link atoms, album bar, search worker.
- Respect Effect‑TS best practices:
  - Data‑first `.pipe`, `Effect.gen` for sequential logic.
  - Explicit error typing.
  - Services with `never` requirements in public interfaces.
- Integrate with URL search params (`timeline-url-sync`) for:
  - Initial jump mode (cursor/time/percentage/anchor).
  - Deep‑linking and shareable URLs.

### 4.2 Core Types (Conceptual)

On the frontend we already have:

- `PlayResult`, `TimelineResponse` from `@crate/api` (see `packages/web/src/domain/Play.ts`).

For infinite scroll, define higher‑level conceptual types:

- `TimelinePage`
  - Alias for `TimelineResponse` (plus we track the **request params** used).
  - Shape:
    - `response: TimelineResponse`.
    - `params: TimelineParams` (matches `timelineParamsAtom` output).

- `TimelineInfiniteState`
  - Persistent UI state for the infinite timeline:
    - `pages: ReadonlyArray<TimelinePage>` (newest to oldest).
    - `status: "idle" | "loading-initial" | "loading-more" | "error"`.
    - `error?: unknown`.
    - `hasMore: boolean`.
    - `nextCursor?: string | null`.
    - `initialParams: TimelineParams` (used to seed the first page).
    - `initialMethod: "cursor" | "time-range" | "percentage" | "anchor"`.
    - Optional metadata:
      - `totalCount?: number` (from percentage queries).
      - `anchorPosition?: { pageIndex: number; itemIndex: number }`.

This state will live in an **atom**, not in KVS. KVS remains play‑level cache only.

### 4.3 New Atoms and Actions

#### 4.3.1 Timeline Page Fetch Atom (pull‑based)

**Goal:** A pure, re‑usable Effect that:

- Calls the Python `/api/plays/timeline` via `TimelineClient`.
- Normalizes plays into `TimelineKVS` via `storePlay`.
- Returns the `TimelineResponse`.

**Design (conceptual):**

- `timelinePageAtom(params: TimelineParams)` (family)
  - Runtime: `TimelineRuntime.atom(...)`.
  - Effect (sketch):
    - `const client = yield* TimelineClient`.
    - `const kvs = yield* TimelineKVS`.
    - `const response = yield* client.timeline.getTimeline({ urlParams: params })`.
    - `yield* Effect.forEach(response.results, play => kvs.storePlay(play), { concurrency: 50 })`.
    - Return `response`.
  - Error handling:
    - `Result` wrapper via `Atom` runtime (as with other HTTP atoms) so UI can use `Result.matchWithWaiting`.

This gives a **pull‑based** primitive to fetch *any* page, *any* jump type, while still keeping `TimelineKVS` authoritative for play data.

#### 4.3.2 Infinite Timeline State Atom

**Goal:** A single source of truth for infinite scroll UI state.

**Design (conceptual):**

- `timelineInfiniteStateAtom: Atom<TimelineInfiniteState>`
  - Implementation: `Atom.make((get) => initialState)` + `get.setSelf` for updates.
  - Responsibilities:
    - Store ordered `pages`.
    - Track overall status and `nextCursor`.
    - Track initial jump behavior (`initialMethod`, `initialParams`).
  - Not persisted to localStorage (session‑level), leaving persistence to `TimelineKVS`.

#### 4.3.3 URL‑Driven Initial Config Atom

We already have `timelineParamsAtom` in `timeline-url-sync.ts`.

**Design (re‑use and extend):**

- `timelineInitialConfigAtom`
  - Derived from `timelineParamsAtom`.
  - Additionally computes `initialMethod` based on which fields are set:
    - If `percentage` → `"percentage"`.
    - Else if `anchor_id` → `"anchor"`.
    - Else if `since`/`until` → `"time-range"`.
    - Else if `cursor` → `"cursor"`.
    - Else → `"cursor"` with `cursor = undefined` (default newest page).

The UI can use this to decide which jump mode to show as "active".

#### 4.3.4 Actions: Initial Load and Load More

Effect‑Atom supports action atoms bound to a runtime (pattern shown in comments in `timeline-url-sync.ts`: `httpRuntime.fn()`).

**Initial load action**

- `loadInitialTimelinePageAtom = TimelineRuntime.fn()((_, get) => Effect.gen(...))`
  - Steps:
    1. Read `config = get(timelineInitialConfigAtom)`.
    2. Update `timelineInfiniteStateAtom` to:
       - `status: "loading-initial"`.
       - `initialParams: config.params`.
       - `initialMethod: config.method`.
       - Clear old `pages`.
    3. Call `timelinePageAtom(config.params)`:
       - Effectful fetch via Python API.
       - Normalizes plays into `TimelineKVS`.
    4. On success:
       - Append page to `pages`.
       - Set `nextCursor = response.next_cursor`.
       - Set `hasMore = response.has_more`.
       - Record `totalCount` / `anchorPosition` if present.
       - `status = "idle"`.
    5. On error:
       - `status = "error"`, store error.
  - Trigger:
    - `Timeline` component calls `useAtomMount(loadInitialTimelinePageAtom)` instead of (or in addition to) `latestItemAtom`.

**Load‑more action**

- `loadNextTimelinePageAtom = TimelineRuntime.fn()((_, get) => Effect.gen(...))`
  - Steps:
    1. Read `state = get(timelineInfiniteStateAtom)`.
    2. If `!state.hasMore` or `state.status === "loading-more"` → no‑op.
    3. Build new params:
       - Base on `state.initialParams` but override `cursor` with `state.nextCursor`.
       - Other jump fields (`percentage`, `anchor_id`, `since`, `until`) should be cleared:
         - After initial jump, pagination should be **cursor‑only** (per server design).
    4. Set `status = "loading-more"`.
    5. Call `timelinePageAtom(nextParams)`.
    6. On success:
       - Append new `TimelinePage` to `pages`.
       - Update `nextCursor`, `hasMore`.
       - `status = "idle"`.
    7. On error:
       - `status = "error"`, keep existing pages.

**Reset action (optional)**

- `resetTimelineInfiniteStateAtom`
  - Clears `pages`, resets `status`, `hasMore`, `nextCursor`.
  - Typically called when:
    - URL params change in a way that alters `initialMethod/params` (e.g., user selects a new date range).
    - User hits a "Back to latest" or "Jump to..." control.

#### 4.3.5 Derived Visible IDs Atom

Rendering all loaded IDs as `success.value.map(...)` will not scale when we have many pages.

**Design (conceptual):**

- `visibleTimelinePlayIdsAtom`
  - Reads `timelineInfiniteStateAtom` and `TimelineKVS`.
  - Constructs `ReadonlyArray<number>` of visible play IDs:
    - Concatenate `page.response.results` across all `pages`, in order.
    - Use `play.id` as the canonical ID.
    - Optionally dedupe via a `HashSet` if we ever mix overlapping pages.
  - Optionally apply **windowing**:
    - Use `scrollYAtom` + `viewportHeightAtom` to compute a `startIndex` / `endIndex`.
    - Limit IDs to `[startIndex, endIndex]` for virtualization.

UI would then:

- Replace `playIdsAtom` with `visibleTimelinePlayIdsAtom` for rendering.
- Keep `playsChunkAtom` and `playIdToBoundaryMapAtom` unchanged (they observe `TimelineKVS` and remain global).

---

### 4.4 Data Flow: End‑to‑End Infinite Scroll

1. **Initial Page Load**
   - URL parsed by router → `Atom.searchParam` atoms updated.
   - `timelineParamsAtom` derives initial `TimelineParams`.
   - `timelineInitialConfigAtom` infers `initialMethod` + `initialParams`.
   - `Timeline` mounts:
     - `useAtomMount(loadInitialTimelinePageAtom)`.
   - `loadInitialTimelinePageAtom`:
     - Calls `timelinePageAtom(initialParams)` → Python timeline API.
     - Normalizes plays via `TimelineKVS.storePlay`.
     - Updates `timelineInfiniteStateAtom.pages` and `nextCursor/hasMore`.
   - `TimelineKVS` invalidates `"timeline:plays_chunk"` and individual `timeline:play:{id}`.
   - `playsChunkAtom`, `playIdsAtom`, `playIdToBoundaryMapAtom`, `recentAlbumArtAtom` all refresh.
   - `visibleTimelinePlayIdsAtom` combines `pages` into a visible ID list.

2. **User Scrolls to Bottom**
   - UI tracks sentinel visibility (via IntersectionObserver or similar).
   - On threshold, calls `useSetAtom(loadNextTimelinePageAtom)` (or equivalent hook).
   - `loadNextTimelinePageAtom`:
     - Builds cursor‑based params using `state.nextCursor`.
     - Calls `timelinePageAtom(nextParams)`.
     - Stores new plays in `TimelineKVS`, appends page to `state.pages`.
   - Derived atoms update automatically via KVS reactivity.

3. **Advanced Jumps (Time / Percentage / Anchor)**
   - User interacts with UI that sets URL search params:
     - Date picker → sets `since`/`until`.
     - Scrubber → sets `percentage`.
     - “Context around play” → sets `anchor_id`.
   - Router updates URL → `Atom.searchParam` atoms update.
   - `timelineInitialConfigAtom` yields new `initialMethod/params`.
   - We:
     - Call `resetTimelineInfiniteStateAtom`.
     - Call `loadInitialTimelinePageAtom` again.
   - After the initial special query, subsequent infinite scroll uses `next_cursor` for pure cursor pagination.

4. **Background Freshness (Optional Integration)**
   - `FetchLatestLive` can continue to run:
     - It will keep injecting newest plays into `TimelineKVS`.
     - As `TimelineKVS` invalidates `"timeline:plays_chunk"`, derived `newestPlayAtom`, `playIdsAtom`, etc. refresh.
   - For infinite scroll:
     - We can choose whether or not to merge new plays into `timelineInfiniteStateAtom.pages`.
     - Simple option:
       - Treat infinite scroll as “historical view”.
       - Let background fetch update the very top; UI can show a “New plays available” toast based on a `latestPlayAtom` comparison.

---

### 4.5 Virtualization and Performance Considerations

Infinite scroll over millions of plays needs careful rendering strategies.

**Key tools already present:**

- `scrollYAtom` and `viewportHeightAtom` for global scroll/viewport.
- `timeline-utils.ts` for efficient chunk operations.
- `@tanstack/react-virtual` is available in `packages/web/node_modules`.

**Recommended approach:**

- `virtualWindowAtom`
  - Derived from `scrollYAtom`, `viewportHeightAtom`, and an estimated row height.
  - Produces `{ startIndex, endIndex }` indices over the infinite list.

- `visibleTimelinePlayIdsAtom`
  - Uses `virtualWindowAtom` to slice the concatenated ID list.
  - Ensures we only render a window of e.g. `~100–200` items at a time.

Further enhancement:

- Use worker (`search-worker.ts`) for heavy grouping or aggregation on large windows, e.g. grouping by day/week on the fly.

---

### 4.6 Error Handling & Edge Cases

- API Errors:
  - `timelinePageAtom` should expose `Result` states so UI can:
    - Show `TimelineErrorState` (same pattern as current `Timeline.tsx`).
    - Retry via a button wired to `loadInitialTimelinePageAtom` or `loadNextTimelinePageAtom`.

- Invalid parameters:
  - Python API returns `400` for invalid combinations (multiple navigation methods, invalid cursor, bad dates).
  - We should surface these as:
    - A domain error type in TS (e.g. `TimelineBadRequestError`).
    - Human‑readable messages in UI.

- End of data:
  - When `has_more === false`, `loadNextTimelinePageAtom` is a no‑op.
  - UI can show “You’ve reached the beginning” or similar messaging.

- Duplicate data:
  - KVS’s `HashSet` + sort ensures `playsChunkAtom` deduplicates by ID.
  - `visibleTimelinePlayIdsAtom` should dedupe if pages can overlap (e.g. anchor queries).

---

### 4.7 Extending to Infinite Search Results (Optional)

While the primary ask is timeline infinite scroll, the same pattern can extend to search:

- Python `/api/search` already supports `limit` and `offset`.
- `SearchWorkerClient.search(query, { limit, offset })` is the entry point.

Conceptual additions:

- `searchPageAtom({ query, limit, offset })`
  - Calls `SearchWorkerClient.search`.
  - Optionally normalizes search results into `TimelineKVS` as `PlayResult` entries (IDs overlap with timeline).

- `searchInfiniteStateAtom`
  - Similar structure to `TimelineInfiniteState`.

- `loadInitialSearchPageAtom`, `loadNextSearchPageAtom`
  - Same `fn()` action pattern, but for search.

This would give a consistent **pull‑based, Effect‑Atom infinite pagination** story for both timeline and search.

---

## 5. Implementation Notes & Next Steps

**Recommended implementation sequence:**

1. Implement `timelinePageAtom` (family) using `TimelineRuntime.atom` + `TimelineClient` + `TimelineKVS`.
2. Add `timelineInitialConfigAtom` and `timelineInfiniteStateAtom`.
3. Implement `loadInitialTimelinePageAtom` and `loadNextTimelinePageAtom` using `TimelineRuntime.fn()`.
4. Add `visibleTimelinePlayIdsAtom` (and optional `virtualWindowAtom`).
5. Wire `Timeline.tsx` to:
   - Use `visibleTimelinePlayIdsAtom` instead of `playIdsAtom`.
   - Trigger `loadInitialTimelinePageAtom` on mount.
   - Trigger `loadNextTimelinePageAtom` via scroll sentinel.
6. Decide integration strategy for `FetchLatestLive`:
   - Keep as background freshness layer, or
   - Replace with explicit “Refresh latest” action that uses `timelinePageAtom` with `{ limit: 200 }`.

This plan keeps the existing atom ecosystem intact (KVS, boundaries, links, album bar, workers) while adding a **clear, idiomatic Effect‑Atom infinite scroll layer** on top of the Python timeline API.

