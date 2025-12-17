/**
 * Parallel Research Orchestration
 *
 * Runs independent research tasks (covers, samples, history, graph) in parallel
 * using Effect.all with structured concurrency. Provides 2-3x speedup by
 * overlapping I/O-bound operations.
 *
 * This is part of Phase 2 multi-agent foundation - establishing fiber-based
 * patterns that can later evolve to agent-per-task architecture.
 *
 * @module
 */

import { Effect, Duration } from "effect"
import type * as Kexp from "@crate/domain/kexp/schemas"
import {
  GraphConnectionsService,
  SearchPlaysService,
  SemanticSearchService,
  InsightSessionService,
} from "../services/index.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Context passed to parallel research tasks
 */
export interface ResearchContext {
  /** The play being researched */
  readonly play: Kexp.KexpTrackPlay
  /** Artist MBIDs for the play (may be empty) */
  readonly artistMbids: readonly string[]
  /** Recording MBID if available */
  readonly recordingMbid?: string | undefined
  /** Current session ID for logging */
  readonly sessionId: string
}

/**
 * Result from a single research task
 */
export interface ResearchTaskResult {
  /** Which research task produced this */
  readonly source: "covers" | "history" | "graph" | "context"
  /** Human-readable findings */
  readonly findings: readonly string[]
  /** MBIDs discovered during research */
  readonly entityMbids: readonly string[]
  /** Number of results found */
  readonly resultCount: number
  /** Time taken in milliseconds */
  readonly durationMs: number
  /** Error message if task failed */
  readonly error?: string
}

/**
 * Aggregated results from all parallel research tasks
 */
export interface ParallelResearchResult {
  /** Results from cover version research */
  readonly covers: ResearchTaskResult
  /** Results from play history research */
  readonly history: ResearchTaskResult
  /** Results from graph exploration */
  readonly graph: ResearchTaskResult
  /** Results from semantic context search */
  readonly context: ResearchTaskResult
  /** Total duration including parallel execution */
  readonly totalDurationMs: number
  /** Summary of all findings for prompt injection */
  readonly summary: string
}

// =============================================================================
// Individual Research Tasks
// =============================================================================

/**
 * Research cover versions for the artist
 *
 * Uses graph_connections with query_type: "covers" to find
 * cover versions of songs by this artist.
 */
const researchCovers = (
  context: ResearchContext
): Effect.Effect<ResearchTaskResult, never, GraphConnectionsService> =>
  Effect.gen(function* () {
    const startTime = Date.now()

    if (context.artistMbids.length === 0) {
      return {
        source: "covers" as const,
        findings: [],
        entityMbids: [],
        resultCount: 0,
        durationMs: Date.now() - startTime,
      }
    }

    const graph = yield* GraphConnectionsService

    const result = yield* graph
      .connections({
        query_type: "covers",
        mbids: [...context.artistMbids],
        limit: 10,
      })
      .pipe(
        Effect.timeout(Duration.seconds(30)),
        Effect.catchAll((error) =>
          Effect.succeed({
            connections: [] as readonly { mbid: string; name: string; relationship_type: string }[],
            total: 0,
            query_time_ms: 0,
            query_type: "covers" as const,
            source_mbids: context.artistMbids,
            _error: error instanceof Error ? error.message : String(error),
          })
        )
      )

    const findings = result.connections.map(
      (c) => `Cover: "${c.name}" (${c.relationship_type})`
    )
    const entityMbids = result.connections.map((c) => c.mbid)

    return {
      source: "covers" as const,
      findings,
      entityMbids,
      resultCount: result.total,
      durationMs: Date.now() - startTime,
      ...("_error" in result && result._error ? { error: result._error } : {}),
    }
  }).pipe(Effect.withSpan("ParallelResearch.covers"))

/**
 * Research play history for the artist
 *
 * Uses SearchPlaysService to find when this artist was played on KEXP,
 * providing historical context.
 */
const researchHistory = (
  context: ResearchContext
): Effect.Effect<ResearchTaskResult, never, SearchPlaysService> =>
  Effect.gen(function* () {
    const startTime = Date.now()

    if (context.artistMbids.length === 0) {
      return {
        source: "history" as const,
        findings: [],
        entityMbids: [],
        resultCount: 0,
        durationMs: Date.now() - startTime,
      }
    }

    const search = yield* SearchPlaysService

    // Search for plays of this artist
    const result = yield* search
      .timeline({
        artistMbid: context.artistMbids[0],
        limit: 15,
      })
      .pipe(
        Effect.timeout(Duration.seconds(30)),
        Effect.catchAll((error) =>
          Effect.succeed({
            results: [],
            total_count: 0,
            query_time_ms: 0,
            next_cursor: null,
            has_more: false,
            anchor_position: null,
            _error: error instanceof Error ? error.message : String(error),
          })
        )
      )

    const findings: string[] = []
    const totalPlays = result.total_count ?? 0
    if (totalPlays > 0) {
      findings.push(`${totalPlays} plays of ${context.play.artist} on KEXP`)

      // Find unique songs played (other than current)
      const otherSongs = new Set(
        result.results
          .map((r) => r.song)
          .filter((s) => s && s !== context.play.song)
      )
      if (otherSongs.size > 0) {
        findings.push(`Other songs played: ${[...otherSongs].slice(0, 3).join(", ")}`)
      }
    }

    return {
      source: "history" as const,
      findings,
      entityMbids: [],
      resultCount: result.total_count ?? result.results.length,
      durationMs: Date.now() - startTime,
      ...("_error" in result && result._error ? { error: result._error } : {}),
    }
  }).pipe(Effect.withSpan("ParallelResearch.history"))

/**
 * Research graph connections for the artist
 *
 * Runs multiple graph queries in parallel:
 * - band_members / member_of: Find band relationships
 * - collaborators: Find collaboration networks
 * - labelmates: Find artists on same label
 */
const researchGraph = (
  context: ResearchContext
): Effect.Effect<ResearchTaskResult, never, GraphConnectionsService> =>
  Effect.gen(function* () {
    const startTime = Date.now()

    if (context.artistMbids.length === 0) {
      return {
        source: "graph" as const,
        findings: [],
        entityMbids: [],
        resultCount: 0,
        durationMs: Date.now() - startTime,
      }
    }

    const graph = yield* GraphConnectionsService

    // Run multiple graph queries in parallel
    const [members, memberOf, labelmates] = yield* Effect.all(
      [
        graph.connections({
          query_type: "band_members",
          mbids: [...context.artistMbids],
          limit: 5,
        }),
        graph.connections({
          query_type: "member_of",
          mbids: [...context.artistMbids],
          limit: 5,
        }),
        graph.connections({
          query_type: "labelmates",
          mbids: [...context.artistMbids],
          limit: 5,
        }),
      ],
      { concurrency: 3 }
    ).pipe(
      Effect.timeout(Duration.seconds(45)),
      Effect.catchAll(() =>
        Effect.succeed([
          { connections: [], total: 0, query_time_ms: 0, query_type: "band_members" as const, source_mbids: [] },
          { connections: [], total: 0, query_time_ms: 0, query_type: "member_of" as const, source_mbids: [] },
          { connections: [], total: 0, query_time_ms: 0, query_type: "labelmates" as const, source_mbids: [] },
        ] as const)
      )
    )

    const findings: string[] = []
    const entityMbids: string[] = []

    // Process band members
    if (members.connections.length > 0) {
      const memberNames = members.connections.map((c) => c.name).slice(0, 3)
      findings.push(`Band members: ${memberNames.join(", ")}`)
      entityMbids.push(...members.connections.map((c) => c.mbid))
    }

    // Process member_of (bands the artist is in)
    if (memberOf.connections.length > 0) {
      const bandNames = memberOf.connections.map((c) => c.name).slice(0, 3)
      findings.push(`Member of: ${bandNames.join(", ")}`)
      entityMbids.push(...memberOf.connections.map((c) => c.mbid))
    }

    // Process labelmates
    if (labelmates.connections.length > 0) {
      const labelmateNames = labelmates.connections.map((c) => c.name).slice(0, 3)
      findings.push(`Labelmates: ${labelmateNames.join(", ")}`)
      entityMbids.push(...labelmates.connections.map((c) => c.mbid))
    }

    const totalResults =
      members.connections.length +
      memberOf.connections.length +
      labelmates.connections.length

    return {
      source: "graph" as const,
      findings,
      entityMbids: [...new Set(entityMbids)], // Dedupe
      resultCount: totalResults,
      durationMs: Date.now() - startTime,
    }
  }).pipe(Effect.withSpan("ParallelResearch.graph"))

/**
 * Research semantic context
 *
 * Uses SemanticSearchService to find semantically related plays
 * that might provide context about the artist or song.
 */
const researchContext = (
  context: ResearchContext
): Effect.Effect<ResearchTaskResult, never, SemanticSearchService> =>
  Effect.gen(function* () {
    const startTime = Date.now()

    const search = yield* SemanticSearchService

    // Build a contextual query
    const query = `${context.play.artist} ${context.play.song} music history context`

    const result = yield* search
      .search({
        query,
        limit: 5,
      })
      .pipe(
        Effect.timeout(Duration.seconds(30)),
        Effect.catchAll((error) =>
          Effect.succeed({
            results: [],
            total: 0,
            query_time_ms: 0,
            query,
            _error: error instanceof Error ? error.message : String(error),
          })
        )
      )

    const findings: string[] = []

    // Extract unique artists from results (excluding current artist)
    const relatedArtists = new Set(
      result.results
        .map((r) => r.artist)
        .filter((a) => a && a !== context.play.artist)
    )

    if (relatedArtists.size > 0) {
      findings.push(`Related artists: ${[...relatedArtists].slice(0, 3).join(", ")}`)
    }

    return {
      source: "context" as const,
      findings,
      entityMbids: [],
      resultCount: result.total,
      durationMs: Date.now() - startTime,
      ...("_error" in result && result._error ? { error: result._error } : {}),
    }
  }).pipe(Effect.withSpan("ParallelResearch.context"))

// =============================================================================
// Main Parallel Research Function
// =============================================================================

/**
 * Dependencies required for parallel research
 */
export type ParallelResearchDeps =
  | GraphConnectionsService
  | SearchPlaysService
  | SemanticSearchService
  | InsightSessionService

/**
 * Run all research tasks in parallel
 *
 * Uses Effect.all with concurrency: 4 to run covers, history, graph,
 * and context research simultaneously. Each task has its own 30s timeout,
 * and the overall operation has a 2-minute timeout.
 *
 * Failed tasks return empty results (graceful degradation) rather than
 * failing the entire research operation.
 *
 * @param context - Research context with play and artist info
 * @returns Aggregated research results with summary
 */
export const parallelResearch = (
  context: ResearchContext
): Effect.Effect<ParallelResearchResult, never, ParallelResearchDeps> =>
  Effect.gen(function* () {
    const startTime = Date.now()

    yield* Effect.logDebug(
      `Starting parallel research for ${context.play.artist} - ${context.play.song}`
    )
    yield* Effect.annotateCurrentSpan({
      artist: context.play.artist ?? "Unknown",
      song: context.play.song ?? "Unknown",
      artist_mbid_count: context.artistMbids.length,
    })

    // Log research start to session
    const session = yield* InsightSessionService
    yield* session.logResearchStep({
      step: "search",
      description: `Starting parallel research for ${context.play.artist}`,
      findings: [],
      entityMbids: [...context.artistMbids],
    })

    // Run all research tasks in parallel
    const results = yield* Effect.all(
      {
        covers: researchCovers(context),
        history: researchHistory(context),
        graph: researchGraph(context),
        context: researchContext(context),
      },
      {
        concurrency: 4,
        mode: "default", // Fail fast on first error (but tasks catch their own errors)
      }
    ).pipe(
      Effect.timeout(Duration.minutes(2)),
      Effect.catchTag("TimeoutException", () =>
        Effect.gen(function* () {
          yield* Effect.logWarning("Parallel research timed out after 2 minutes")
          // Return empty results on timeout
          const emptyResult: ResearchTaskResult = {
            source: "covers",
            findings: [],
            entityMbids: [],
            resultCount: 0,
            durationMs: 0,
            error: "Timeout",
          }
          return {
            covers: { ...emptyResult, source: "covers" as const },
            history: { ...emptyResult, source: "history" as const },
            graph: { ...emptyResult, source: "graph" as const },
            context: { ...emptyResult, source: "context" as const },
          }
        })
      )
    )

    const totalDurationMs = Date.now() - startTime

    // Build summary from all findings
    const allFindings = [
      ...results.covers.findings,
      ...results.history.findings,
      ...results.graph.findings,
      ...results.context.findings,
    ]

    const summary =
      allFindings.length > 0
        ? `Pre-research findings:\n${allFindings.map((f) => `• ${f}`).join("\n")}`
        : "No pre-research findings available."

    // Log research completion to session
    yield* session.logResearchStep({
      step: "analyze",
      description: `Parallel research complete in ${totalDurationMs}ms`,
      findings: allFindings,
      entityMbids: [
        ...results.covers.entityMbids,
        ...results.graph.entityMbids,
      ],
    })

    // Log discovered entities to session
    const allEntityMbids = [
      ...new Set([
        ...results.covers.entityMbids,
        ...results.graph.entityMbids,
      ]),
    ]

    yield* Effect.annotateCurrentSpan({
      total_duration_ms: totalDurationMs,
      covers_count: results.covers.resultCount,
      history_count: results.history.resultCount,
      graph_count: results.graph.resultCount,
      context_count: results.context.resultCount,
      findings_count: allFindings.length,
      entities_discovered: allEntityMbids.length,
    })

    yield* Effect.logDebug(
      `Parallel research complete: ${allFindings.length} findings in ${totalDurationMs}ms`
    )

    return {
      ...results,
      totalDurationMs,
      summary,
    }
  }).pipe(Effect.withSpan("ParallelResearch.execute"))

/**
 * Create a ResearchContext from a play
 *
 * Helper to build the context object from a KexpTrackPlay.
 */
export const createResearchContext = (
  play: Kexp.KexpTrackPlay,
  sessionId: string
): ResearchContext => ({
  play,
  artistMbids: play.artist_ids ?? [],
  recordingMbid: play.recording_id ?? undefined,
  sessionId,
})
