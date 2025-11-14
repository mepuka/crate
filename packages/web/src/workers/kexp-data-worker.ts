/**
 * KEXP Data Worker
 *
 * Web Worker for fetching and caching KEXP programs and shows data.
 * Uses Effect's WorkerRunner for structured message passing and error handling.
 *
 * Architecture:
 * - KexpDataService encapsulates business logic with cache-first strategy
 * - WorkerRunner handles message routing and serialization
 * - Effect patterns ensure type safety and composability
 * - In-memory maps provide O(1) lookups for show info
 *
 * Cache Strategy:
 * - Programs: 24 hour TTL (static data, rarely changes)
 * - Shows: 1 hour TTL (semi-dynamic data, updates regularly)
 * - Cache-first: Always check cache before hitting network
 */

import { BrowserWorkerRunner } from "@effect/platform-browser"
import { WorkerRunner, FetchHttpClient } from "@effect/platform"
import { Effect, Layer, Context, Schema, Match, HashMap, Option } from "effect"
import {
  type ProgramsData,
  type ShowsData,
  type ShowInfoResponse,
  type ErrorResponse
} from "./kexp-data-worker-protocol"
import {
  KexpApiService,
  KexpApiServiceLive,
  type NetworkError,
  type ParseError
} from "./kexp-api-service"
import {
  loadPrograms,
  savePrograms,
  loadShows,
  saveShows
} from "./kexp-cache"
import type { Kexp } from "@crate/domain"

// Type aliases for convenience
type KexpProgram = Schema.Schema.Type<typeof Kexp.KexpProgram>
type KexpShow = Schema.Schema.Type<typeof Kexp.KexpShow>

/**
 * KexpDataService
 *
 * Handles KEXP data operations with cache-first strategy and in-memory indexes.
 * Maintains in-memory maps for fast lookups without repeated searches.
 */
class KexpDataService extends Context.Tag("KexpDataService")<
  KexpDataService,
  {
    readonly fetchPrograms: () => Effect.Effect<
      { programs: readonly KexpProgram[]; cached: boolean; timestamp: string },
      NetworkError | ParseError
    >
    readonly fetchShows: (
      limit: number
    ) => Effect.Effect<
      { shows: readonly KexpShow[]; cached: boolean; timestamp: string },
      NetworkError | ParseError
    >
    readonly getShowInfo: (
      showId: number
    ) => Effect.Effect<
      { show: KexpShow | null; program: KexpProgram | null },
      never
    >
  }
>() {}

/**
 * KexpDataService Implementation
 *
 * Live implementation with cache-first strategy and in-memory maps.
 * Uses KexpApiService for network calls and kexp-cache for localStorage.
 *
 * Note: KexpDataServiceLive does NOT provide KexpApiServiceLive here.
 * Layer composition happens at the WorkerLive level where we can also provide
 * the HttpClient dependency that KexpApiServiceLive requires.
 */
const KexpDataServiceLive = Layer.effect(
  KexpDataService,
  Effect.gen(function* () {
    const apiService = yield* KexpApiService

    // In-memory maps for fast lookups
    // Built from fetched data, maintained across requests
    let programsMap = HashMap.empty<number, KexpProgram>()
    let showsMap = HashMap.empty<number, KexpShow>()
    let showToProgramMap = HashMap.empty<number, number>()

    /**
     * Update in-memory maps from programs data
     */
    const updateProgramsMap = (programs: readonly KexpProgram[]) =>
      Effect.sync(() => {
        programsMap = HashMap.fromIterable(
          programs.map((program) => [program.id, program] as const)
        )
      }).pipe(
        Effect.tap(() =>
          Effect.logDebug(`Updated programs map with ${programs.length} entries`)
        )
      )

    /**
     * Update in-memory maps from shows data
     */
    const updateShowsMap = (shows: readonly KexpShow[]) =>
      Effect.sync(() => {
        showsMap = HashMap.fromIterable(
          shows.map((show) => [show.id, show] as const)
        )
        showToProgramMap = HashMap.fromIterable(
          shows.map((show) => [show.id, show.program] as const)
        )
      }).pipe(
        Effect.tap(() =>
          Effect.logDebug(
            `Updated shows map with ${shows.length} entries, show-to-program map with ${shows.length} mappings`
          )
        )
      )

    /**
     * Fetch programs with cache-first strategy
     */
    const fetchPrograms = () =>
      Effect.gen(function* () {
        yield* Effect.logInfo("Fetching programs with cache-first strategy")

        // Try cache first
        const cached = yield* loadPrograms()

        if (cached !== null) {
          yield* Effect.logInfo(
            `Programs loaded from cache: ${cached.length} programs`
          )
          // Update in-memory maps from cache
          yield* updateProgramsMap(cached)
          return {
            programs: cached,
            cached: true,
            timestamp: new Date().toISOString()
          }
        }

        // Cache miss - fetch from network
        yield* Effect.logInfo("Cache miss - fetching programs from network")
        const response = yield* apiService.fetchPrograms
        const programs = response.results

        // Save to cache
        yield* savePrograms(programs)
        yield* Effect.logInfo(
          `Fetched and cached ${programs.length} programs from network`
        )

        // Update in-memory maps
        yield* updateProgramsMap(programs)

        return {
          programs,
          cached: false,
          timestamp: new Date().toISOString()
        }
      })

    /**
     * Fetch shows with cache-first strategy
     */
    const fetchShows = (limit: number) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(
          `Fetching shows with cache-first strategy (limit: ${limit})`
        )

        // Try cache first
        const cached = yield* loadShows()

        if (cached !== null) {
          yield* Effect.logInfo(`Shows loaded from cache: ${cached.length} shows`)
          // Update in-memory maps from cache
          yield* updateShowsMap(cached)
          return {
            shows: cached,
            cached: true,
            timestamp: new Date().toISOString()
          }
        }

        // Cache miss - fetch from network
        yield* Effect.logInfo("Cache miss - fetching shows from network")
        const response = yield* apiService.fetchShows(limit)
        const shows = response.results

        // Save to cache
        yield* saveShows(shows)
        yield* Effect.logInfo(
          `Fetched and cached ${shows.length} shows from network`
        )

        // Update in-memory maps
        yield* updateShowsMap(shows)

        return {
          shows,
          cached: false,
          timestamp: new Date().toISOString()
        }
      })

    /**
     * Get show info using in-memory maps
     * Returns show and associated program, or null if not found
     */
    const getShowInfo = (showId: number) =>
      Effect.gen(function* () {
        yield* Effect.logDebug(`Getting show info for show ID: ${showId}`)

        // Lookup show in map
        const showOption = HashMap.get(showsMap, showId)
        if (Option.isNone(showOption)) {
          yield* Effect.logDebug(`Show ${showId} not found in map`)
          return { show: null, program: null }
        }

        const show = showOption.value

        // Lookup program using show-to-program mapping
        const programIdOption = HashMap.get(showToProgramMap, showId)
        if (Option.isNone(programIdOption)) {
          yield* Effect.logDebug(
            `No program mapping found for show ${showId}, using show.program field`
          )
          // Fallback to show.program field
          const programOption = HashMap.get(programsMap, show.program)
          const program = Option.isSome(programOption) ? programOption.value : null
          return { show, program }
        }

        const programId = programIdOption.value
        const programOption = HashMap.get(programsMap, programId)
        const program = Option.isSome(programOption) ? programOption.value : null

        yield* Effect.logDebug(
          `Found show ${showId} with program ${program?.id ?? "null"}`
        )

        return { show, program }
      })

    return KexpDataService.of({
      fetchPrograms,
      fetchShows,
      getShowInfo
    })
  })
)

/**
 * Worker Request Handler
 *
 * Dispatches incoming requests to appropriate service methods.
 * Uses Schema.decodeUnknown for validation and Match.value for type-safe dispatching.
 *
 * Pattern:
 * 1. Schema.decodeUnknown to validate and decode the request
 * 2. Match.value + Match.tag for exhaustive pattern matching
 * 3. Return properly typed response messages
 */
const handleRequest = (request: unknown) =>
  Effect.gen(function* () {
    yield* Effect.logDebug("Worker: Received request")

    // Decode and validate the request using Schema
    const req = yield* Schema.decodeUnknown(
      Schema.typeSchema(
        Schema.Union(
          Schema.Struct({ type: Schema.Literal("fetch-programs") }),
          Schema.Struct({
            type: Schema.Literal("fetch-shows"),
            limit: Schema.Number
          }),
          Schema.Struct({
            type: Schema.Literal("get-show-info"),
            showId: Schema.Number
          })
        )
      )
    )(request)

    yield* Effect.logDebug(`Worker: Validated request type: ${req.type}`)

    const dataService = yield* KexpDataService

    // Type-safe dispatching with Match.value
    return yield* Match.value(req).pipe(
      Match.when(
        { type: "fetch-programs" as const },
        () =>
          Effect.gen(function* () {
            const result = yield* Effect.either(dataService.fetchPrograms())

            if (result._tag === "Left") {
              const error = result.left
              const errorMessage =
                error._tag === "NetworkError"
                  ? `Network error: ${error.url}`
                  : `Parse error: ${error.message}`

              const response: ErrorResponse = {
                type: "error",
                error: errorMessage,
                requestType: "fetch-programs"
              }
              return response
            }

            const { programs, cached, timestamp } = result.right
            const response: ProgramsData = {
              type: "programs-data",
              programs,
              cached,
              timestamp
            }
            return response
          })
      ),
      Match.when(
        { type: "fetch-shows" as const },
        (r) =>
          Effect.gen(function* () {
            const result = yield* Effect.either(
              dataService.fetchShows(r.limit)
            )

            if (result._tag === "Left") {
              const error = result.left
              const errorMessage =
                error._tag === "NetworkError"
                  ? `Network error: ${error.url}`
                  : `Parse error: ${error.message}`

              const response: ErrorResponse = {
                type: "error",
                error: errorMessage,
                requestType: "fetch-shows"
              }
              return response
            }

            const { shows, cached, timestamp } = result.right
            const response: ShowsData = {
              type: "shows-data",
              shows,
              cached,
              timestamp
            }
            return response
          })
      ),
      Match.when(
        { type: "get-show-info" as const },
        (r) =>
          Effect.gen(function* () {
            const { show, program } = yield* dataService.getShowInfo(r.showId)

            const response: ShowInfoResponse = {
              type: "show-info",
              show,
              program
            }
            return response
          })
      ),
      Match.exhaustive
    )
  })

/**
 * Worker Runtime Layer
 *
 * Composes all service layers needed by the worker.
 * Uses WorkerRunner.layer pattern for proper lifecycle management.
 *
 * CRITICAL Layer Composition Pattern:
 *
 * Understanding Layer.provide:
 * - Layer.provide feeds the OUTPUT of one layer into the INPUT (requirements) of another
 * - Signature: Layer.provide<ROut, E, RIn>(that: Layer<ROut, E, RIn>): <ROut2, E2, RIn2>(self: Layer<ROut2, E2, RIn2>) => Layer<ROut2, E | E2, RIn | Exclude<RIn2, ROut>>
 * - "that" layer provides services, "self" layer consumes them
 * - The result has all requirements of "that" plus any unsatisfied requirements from "self"
 *
 * Dependency Chain:
 * 1. WorkerRunner.layer(handleRequest) needs: PlatformRunner + KexpDataService
 * 2. KexpDataServiceLive needs: KexpApiService
 * 3. KexpApiServiceLive needs: HttpClient
 * 4. FetchHttpClient.layer provides: HttpClient (no requirements)
 * 5. BrowserWorkerRunner.layer provides: PlatformRunner (no requirements)
 *
 * Composition Order (bottom-up):
 * - Start with WorkerRunner.layer (needs PlatformRunner + KexpDataService)
 * - Provide KexpDataServiceLive (needs KexpApiService) - reduces to needs: PlatformRunner + KexpApiService
 * - Provide KexpApiServiceLive (needs HttpClient) - reduces to needs: PlatformRunner + HttpClient
 * - Provide FetchHttpClient.layer (provides HttpClient) - reduces to needs: PlatformRunner
 * - Provide BrowserWorkerRunner.layer (provides PlatformRunner) - reduces to needs: never ✓
 *
 * Key Insight: BrowserWorkerRunner.layer does NOT provide HttpClient!
 * We must explicitly provide FetchHttpClient.layer for HTTP operations in workers.
 *
 * Layer dependency tree:
 * WorkerLive
 * ├─ KexpDataServiceLive (requires KexpApiService)
 * │  └─ KexpApiServiceLive (requires HttpClient)
 * │     └─ FetchHttpClient.layer (provides HttpClient)
 * └─ BrowserWorkerRunner.layer (provides PlatformRunner only)
 */
const WorkerLive = WorkerRunner.layer(handleRequest).pipe(
  // Provide KexpDataService (needs KexpApiService)
  Layer.provide(KexpDataServiceLive),
  // Provide KexpApiService (needs HttpClient)
  Layer.provide(KexpApiServiceLive),
  // Provide HttpClient implementation for fetch-based HTTP
  Layer.provide(FetchHttpClient.layer),
  // Provide browser platform runner (provides PlatformRunner for WorkerRunner)
  Layer.provide(BrowserWorkerRunner.layer)
)

/**
 * Worker Entry Point
 *
 * Launch the worker using BrowserWorkerRunner.launch
 * Pattern from Effect source: BrowserWorkerRunner.launch(WorkerLive) + Effect.runFork
 *
 * The launch function signature: launch<A, E, R>(layer: Layer<A, E, R>) => Effect<void, E | WorkerError, R>
 * Since WorkerLive has satisfied all requirements (R = never), this produces Effect<void, WorkerError, never>
 * which is compatible with Effect.runFork.
 */
Effect.runFork(BrowserWorkerRunner.launch(WorkerLive))

/**
 * IMPLEMENTATION NOTES:
 *
 * ✅ Cache-first strategy:
 *    - loadPrograms/loadShows check cache first
 *    - Network calls only on cache miss
 *    - savePrograms/saveShows persist to localStorage
 *
 * ✅ In-memory maps for O(1) lookups:
 *    - programsMap: program ID -> program
 *    - showsMap: show ID -> show
 *    - showToProgramMap: show ID -> program ID
 *
 * ✅ Type-safe message handling:
 *    - Schema validation for incoming requests
 *    - Match.value for exhaustive pattern matching
 *    - Properly typed response messages
 *
 * ✅ Error handling:
 *    - NetworkError and ParseError from KexpApiService
 *    - Effect.either to capture errors
 *    - ErrorResponse messages for client
 *
 * ✅ Effect patterns:
 *    - Services with Context.Tag
 *    - Layer composition for dependencies
 *    - Effect.gen for sequential operations
 *    - WorkerRunner.layer for lifecycle management
 */
