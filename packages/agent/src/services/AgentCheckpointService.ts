/**
 * AgentCheckpointService
 *
 * Persists and retrieves agent session state via FAISS API.
 * Enables crash recovery, multi-agent handoff, and observability.
 *
 * @module
 */

import { Context, Data, Effect, Layer, Schema } from "effect"
import {
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform"
import type {
  SessionExport,
  SessionMode,
} from "./InsightSessionService.js"
import { FaissConfig } from "../config.js"

// =============================================================================
// Error Types
// =============================================================================

/**
 * Checkpoint operation failed
 */
export class CheckpointError extends Data.TaggedError("CheckpointError")<{
  readonly operation: "save" | "load" | "list" | "delete"
  readonly sessionId?: string
  readonly cause: unknown
}> {}

// =============================================================================
// API Schemas
// =============================================================================

/**
 * Run status for filtering
 */
export const RunStatus = Schema.Literal("running", "completed", "failed", "paused")
export type RunStatus = typeof RunStatus.Type

/**
 * Request to save an agent run
 */
export const SaveAgentRunRequest = Schema.Struct({
  sessionId: Schema.String,
  mode: Schema.Literal("enrich", "discover"),
  startedAt: Schema.Number,
  completedAt: Schema.optional(Schema.Number),
  status: RunStatus,
  playIds: Schema.Array(Schema.Number),
  insights: Schema.Array(Schema.Unknown), // InsightSummary[]
  toolCalls: Schema.Array(Schema.Unknown), // ToolCallLogEntry[]
  researchSteps: Schema.Array(Schema.Unknown), // ResearchStep[]
  entities: Schema.Array(Schema.Unknown), // EntityFacts[]
  errorMessage: Schema.optional(Schema.String),
  errorStack: Schema.optional(Schema.String),
})
export type SaveAgentRunRequest = typeof SaveAgentRunRequest.Type

/**
 * Response from saving an agent run
 * Note: Python API uses snake_case, so schema matches API response format
 */
export const SaveAgentRunResponse = Schema.Struct({
  status: Schema.Literal("created", "updated"),
  session_id: Schema.String,
  insight_count: Schema.Number,
  tool_call_count: Schema.Number,
})
export type SaveAgentRunResponse = typeof SaveAgentRunResponse.Type

/**
 * Summary of an agent run (for list queries)
 * Note: Python API uses snake_case, so schema matches API response format
 */
export const AgentRunSummary = Schema.Struct({
  session_id: Schema.String,
  mode: Schema.Literal("enrich", "discover"),
  started_at: Schema.Number,
  completed_at: Schema.NullOr(Schema.Number),
  status: RunStatus,
  play_ids: Schema.Array(Schema.Number),
  insight_count: Schema.Number,
  tool_call_count: Schema.Number,
  research_step_count: Schema.Number,
  entity_count: Schema.Number,
  duration_ms: Schema.NullOr(Schema.Number),
  error_message: Schema.NullOr(Schema.String),
  created_at: Schema.String,
})
export type AgentRunSummary = typeof AgentRunSummary.Type

/**
 * Full agent run with all data
 * Note: Python API uses snake_case, so schema matches API response format
 */
export const AgentRunDetail = Schema.Struct({
  session_id: Schema.String,
  mode: Schema.Literal("enrich", "discover"),
  started_at: Schema.Number,
  completed_at: Schema.NullOr(Schema.Number),
  status: RunStatus,
  play_ids: Schema.Array(Schema.Number),
  insight_count: Schema.Number,
  tool_call_count: Schema.Number,
  research_step_count: Schema.Number,
  entity_count: Schema.Number,
  duration_ms: Schema.NullOr(Schema.Number),
  error_message: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  insights: Schema.Array(Schema.Unknown),
  tool_calls: Schema.Array(Schema.Unknown),
  research_steps: Schema.Array(Schema.Unknown),
  entities: Schema.Array(Schema.Unknown),
  error_stack: Schema.NullOr(Schema.String),
  updated_at: Schema.String,
})
export type AgentRunDetail = typeof AgentRunDetail.Type

/**
 * Response from listing agent runs
 */
export const ListAgentRunsResponse = Schema.Struct({
  runs: Schema.Array(AgentRunSummary),
  total: Schema.Number,
  limit: Schema.Number,
  offset: Schema.Number,
})
export type ListAgentRunsResponse = typeof ListAgentRunsResponse.Type

/**
 * Response from deleting an agent run
 * Note: Python API uses snake_case, so schema matches API response format
 */
export const DeleteAgentRunResponse = Schema.Struct({
  status: Schema.Literal("deleted"),
  session_id: Schema.String,
})
export type DeleteAgentRunResponse = typeof DeleteAgentRunResponse.Type

// =============================================================================
// Filter Types
// =============================================================================

/**
 * Filters for listing checkpoints
 */
export interface ListCheckpointsFilter {
  readonly status?: RunStatus
  readonly mode?: SessionMode
  readonly playId?: number
  readonly since?: string
  readonly until?: string
  readonly limit?: number
  readonly offset?: number
}

// =============================================================================
// Service Interface
// =============================================================================

/**
 * AgentCheckpointService interface
 *
 * Operations for persisting and retrieving agent sessions.
 * All operations are effectful and may fail with CheckpointError.
 */
export interface AgentCheckpointServiceInterface {
  /**
   * Save a session checkpoint (create or update)
   *
   * @param session - Session export from InsightSessionService
   * @param status - Current run status
   * @param error - Error details if status is 'failed'
   */
  readonly saveCheckpoint: (
    session: SessionExport,
    status: RunStatus,
    error?: { message: string; stack?: string }
  ) => Effect.Effect<SaveAgentRunResponse, CheckpointError>

  /**
   * Load a checkpoint by session ID
   *
   * @param sessionId - Session ID to load
   * @returns Full agent run data, or null if not found
   */
  readonly loadCheckpoint: (
    sessionId: string
  ) => Effect.Effect<AgentRunDetail | null, CheckpointError>

  /**
   * List checkpoints with optional filters
   *
   * @param filters - Query filters
   */
  readonly listCheckpoints: (
    filters?: ListCheckpointsFilter
  ) => Effect.Effect<ListAgentRunsResponse, CheckpointError>

  /**
   * Delete a checkpoint
   *
   * @param sessionId - Session ID to delete
   */
  readonly deleteCheckpoint: (
    sessionId: string
  ) => Effect.Effect<void, CheckpointError>

  /**
   * Find incomplete sessions for recovery
   *
   * Returns sessions with status='running' that may need recovery
   */
  readonly findIncomplete: () => Effect.Effect<
    readonly AgentRunSummary[],
    CheckpointError
  >
}

// =============================================================================
// Service Tag
// =============================================================================

/**
 * AgentCheckpointService - persist and retrieve agent sessions
 */
export class AgentCheckpointService extends Context.Tag("AgentCheckpointService")<
  AgentCheckpointService,
  AgentCheckpointServiceInterface
>() {}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Create the AgentCheckpointService implementation
 */
const makeAgentCheckpointService = Effect.gen(function* () {
  const config = yield* FaissConfig

  // Configure HTTP client with base URL and defaults
  const httpClient = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(config.baseUrl)),
    HttpClient.mapRequest(HttpClientRequest.acceptJson),
    HttpClient.mapRequest((req) =>
      config.apiKey
        ? HttpClientRequest.setHeader("X-API-Key", config.apiKey)(req)
        : req
    )
  )

  const withTimeout = <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | CheckpointError, R> =>
    effect.pipe(
      Effect.timeoutFail({
        duration: config.timeout,
        onTimeout: () =>
          new CheckpointError({
            operation: "save",
            cause: "Request timed out",
          }),
      })
    )

  // =========================================================================
  // Service Methods
  // =========================================================================

  const saveCheckpoint = (
    session: SessionExport,
    status: RunStatus,
    error?: { message: string; stack?: string }
  ): Effect.Effect<SaveAgentRunResponse, CheckpointError> => {
    const request: SaveAgentRunRequest = {
      sessionId: session.sessionId,
      mode: session.mode,
      startedAt: session.startedAt,
      completedAt: status === "completed" || status === "failed" ? Date.now() : undefined,
      status,
      playIds: [...session.playIds],
      insights: [...session.insights],
      toolCalls: [...session.toolCalls],
      researchSteps: [...session.researchSteps],
      entities: [...session.entities],
      errorMessage: error?.message,
      errorStack: error?.stack,
    }

    return withTimeout(
      httpClient
        .post("/api/agent-runs", {
          body: HttpBody.unsafeJson(request),
        })
        .pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(SaveAgentRunResponse)),
          Effect.mapError(
            (cause) =>
              new CheckpointError({
                operation: "save",
                sessionId: session.sessionId,
                cause,
              })
          )
        )
    )
  }

  const loadCheckpoint = (
    sessionId: string
  ): Effect.Effect<AgentRunDetail | null, CheckpointError> =>
    withTimeout(
      httpClient.get(`/api/agent-runs/${sessionId}`).pipe(
        Effect.flatMap((response) => {
          if (response.status === 404) {
            return Effect.succeed(null)
          }
          return HttpClientResponse.schemaBodyJson(AgentRunDetail)(response)
        }),
        Effect.mapError(
          (cause) =>
            new CheckpointError({
              operation: "load",
              sessionId,
              cause,
            })
        )
      )
    )

  const listCheckpoints = (
    filters?: ListCheckpointsFilter
  ): Effect.Effect<ListAgentRunsResponse, CheckpointError> => {
    // Build query params
    const params = new URLSearchParams()
    if (filters?.status) params.set("status", filters.status)
    if (filters?.mode) params.set("mode", filters.mode)
    if (filters?.playId) params.set("play_id", String(filters.playId))
    if (filters?.since) params.set("since", filters.since)
    if (filters?.until) params.set("until", filters.until)
    if (filters?.limit) params.set("limit", String(filters.limit))
    if (filters?.offset) params.set("offset", String(filters.offset))

    const queryString = params.toString()
    const url = queryString ? `/api/agent-runs?${queryString}` : "/api/agent-runs"

    return withTimeout(
      httpClient.get(url).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(ListAgentRunsResponse)),
        Effect.mapError(
          (cause) =>
            new CheckpointError({
              operation: "list",
              cause,
            })
        )
      )
    )
  }

  const deleteCheckpoint = (
    sessionId: string
  ): Effect.Effect<void, CheckpointError> =>
    withTimeout(
      httpClient.del(`/api/agent-runs/${sessionId}`).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(DeleteAgentRunResponse)),
        Effect.asVoid,
        Effect.mapError(
          (cause) =>
            new CheckpointError({
              operation: "delete",
              sessionId,
              cause,
            })
        )
      )
    )

  const findIncomplete = (): Effect.Effect<
    readonly AgentRunSummary[],
    CheckpointError
  > =>
    withTimeout(
      httpClient.get("/api/agent-runs/incomplete").pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(ListAgentRunsResponse)),
        Effect.map((response) => response.runs),
        Effect.mapError(
          (cause) =>
            new CheckpointError({
              operation: "list",
              cause,
            })
        )
      )
    )

  return {
    saveCheckpoint,
    loadCheckpoint,
    listCheckpoints,
    deleteCheckpoint,
    findIncomplete,
  } satisfies AgentCheckpointServiceInterface
})

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for AgentCheckpointService
 */
export const AgentCheckpointServiceLive: Layer.Layer<
  AgentCheckpointService,
  never,
  FaissConfig | HttpClient.HttpClient
> = Layer.effect(AgentCheckpointService, makeAgentCheckpointService)

/**
 * Test layer with mock implementation
 */
export const AgentCheckpointServiceTest: Layer.Layer<AgentCheckpointService> =
  Layer.succeed(AgentCheckpointService, {
    saveCheckpoint: (_session, _status, _error) =>
      Effect.succeed({
        status: "created" as const,
        session_id: "test_session",
        insight_count: 0,
        tool_call_count: 0,
      }),
    loadCheckpoint: (_sessionId) => Effect.succeed(null),
    listCheckpoints: (_filters) =>
      Effect.succeed({
        runs: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
    deleteCheckpoint: (_sessionId) => Effect.void,
    findIncomplete: () => Effect.succeed([]),
  } satisfies AgentCheckpointServiceInterface)
