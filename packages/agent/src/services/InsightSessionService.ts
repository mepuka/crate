/**
 * InsightSessionService
 *
 * In-memory session state using Effect Ref to track insights produced
 * during an agent session. Enables the agent to recall previous findings
 * and avoid duplicate research.
 *
 * Enhanced with work logging for observability and multi-agent handoff:
 * - Tool call logging: Tracks all tool invocations with params and results
 * - Research steps: High-level research activity tracking
 * - Entity facts: Accumulated knowledge about discovered entities
 * - Session export/import: Enables handoff and crash recovery
 *
 * @module
 */

import { Context, Effect, Layer, Ref, HashMap } from "effect"
import type { InsightSummary, GetRecentInsightsParams } from "../tools/schemas.js"

// =============================================================================
// Work Logging Types
// =============================================================================

/**
 * Tool call log entry - captures what tools were called and results
 */
export interface ToolCallLogEntry {
  readonly id: string
  readonly toolName: string
  readonly params: unknown
  readonly resultSummary: string
  readonly resultCount?: number | undefined
  readonly durationMs: number
  readonly timestamp: number
  readonly iteration: number
}

/**
 * Input for logging a tool call (id and timestamp auto-generated)
 */
export interface ToolCallLogInput {
  readonly toolName: string
  readonly params: unknown
  readonly resultSummary: string
  readonly resultCount?: number | undefined
  readonly durationMs: number
  readonly iteration: number
}

/**
 * Research step types
 */
export type ResearchStepType = "search" | "graph" | "fetch" | "analyze" | "synthesize"

/**
 * Research step - captures agent reasoning at a high level
 */
export interface ResearchStep {
  readonly id: string
  readonly step: ResearchStepType
  readonly description: string
  readonly findings: readonly string[]
  readonly entityMbids: readonly string[]
  readonly timestamp: number
}

/**
 * Input for logging a research step (id and timestamp auto-generated)
 */
export interface ResearchStepInput {
  readonly step: ResearchStepType
  readonly description: string
  readonly findings: readonly string[]
  readonly entityMbids: readonly string[]
}

/**
 * Entity type for discovered entities
 */
export type EntityType = "artist" | "band" | "label" | "recording" | "work" | "area" | "place"

/**
 * Discovered entity facts - accumulated knowledge about an entity
 */
export interface EntityFacts {
  readonly mbid: string
  readonly name: string
  readonly type: EntityType
  readonly facts: readonly string[]
  readonly sources: readonly string[]
  readonly discoveredAt: number
}

/**
 * Session mode - what the agent is doing
 */
export type SessionMode = "enrich" | "discover"

/**
 * Parameters for filtering tool calls
 */
export interface GetToolCallsParams {
  readonly toolName?: string
  readonly iteration?: number
  readonly limit?: number
}

/**
 * Exported session state for handoff or persistence
 */
export interface SessionExport {
  readonly sessionId: string
  readonly mode: SessionMode
  readonly startedAt: number
  readonly playIds: readonly number[]
  readonly insights: readonly InsightSummary[]
  readonly toolCalls: readonly ToolCallLogEntry[]
  readonly researchSteps: readonly ResearchStep[]
  readonly entities: readonly EntityFacts[]
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Response from getting recent insights
 */
export interface GetRecentInsightsResponse {
  readonly insights: readonly InsightSummary[]
  readonly total: number
  readonly sessionId: string
}

// =============================================================================
// Service Interface
// =============================================================================

/**
 * InsightSessionService interface
 *
 * Enhanced with work logging for observability and multi-agent handoff.
 * Note: Ref operations never fail, so error types are removed for type safety
 */
export interface InsightSessionServiceInterface {
  // =========================================================================
  // Insight Management (existing)
  // =========================================================================

  /**
   * Add an insight to the session
   */
  readonly addInsight: (insight: InsightSummary) => Effect.Effect<void>

  /**
   * Get recent insights with optional filtering
   */
  readonly getRecentInsights: (
    params?: GetRecentInsightsParams
  ) => Effect.Effect<GetRecentInsightsResponse>

  /**
   * Seed session with existing insights from database.
   * Used to pre-populate context before enriching a play that may
   * already have insights. Marks insights as from_database: true.
   */
  readonly seedWithExistingInsights: (
    insights: readonly InsightSummary[]
  ) => Effect.Effect<void>

  /**
   * Clear all insights from the session
   */
  readonly clear: () => Effect.Effect<void>

  /**
   * Reset the session with a new session ID and empty state
   */
  readonly reset: () => Effect.Effect<void>

  /**
   * Get the current session ID
   */
  readonly getSessionId: () => Effect.Effect<string>

  // =========================================================================
  // Tool Call Logging (new)
  // =========================================================================

  /**
   * Log a tool call with params and result summary
   */
  readonly logToolCall: (entry: ToolCallLogInput) => Effect.Effect<void>

  /**
   * Get tool calls with optional filtering
   */
  readonly getToolCalls: (
    params?: GetToolCallsParams
  ) => Effect.Effect<readonly ToolCallLogEntry[]>

  // =========================================================================
  // Research Step Logging (new)
  // =========================================================================

  /**
   * Log a high-level research step
   */
  readonly logResearchStep: (step: ResearchStepInput) => Effect.Effect<void>

  /**
   * Get all research steps for the session
   */
  readonly getResearchSteps: () => Effect.Effect<readonly ResearchStep[]>

  // =========================================================================
  // Entity Facts (new)
  // =========================================================================

  /**
   * Add a fact about an entity (creates entity if not exists)
   */
  readonly addEntityFact: (
    mbid: string,
    name: string,
    type: EntityType,
    fact: string,
    source: string
  ) => Effect.Effect<void>

  /**
   * Get facts for a specific entity
   */
  readonly getEntityFacts: (mbid: string) => Effect.Effect<EntityFacts | undefined>

  /**
   * Get all discovered entities
   */
  readonly getAllEntities: () => Effect.Effect<readonly EntityFacts[]>

  // =========================================================================
  // Session Export/Import (new)
  // =========================================================================

  /**
   * Export full session state for handoff or persistence
   */
  readonly exportSession: () => Effect.Effect<SessionExport>

  /**
   * Import session state (used for handoff or recovery)
   */
  readonly importSession: (session: SessionExport) => Effect.Effect<void>

  // =========================================================================
  // Session Metadata (new)
  // =========================================================================

  /**
   * Set the session mode (enrich or discover)
   */
  readonly setMode: (mode: SessionMode) => Effect.Effect<void>

  /**
   * Get the current session mode
   */
  readonly getMode: () => Effect.Effect<SessionMode>

  /**
   * Add a play ID to the session
   */
  readonly addPlayId: (playId: number) => Effect.Effect<void>

  /**
   * Get all play IDs in the session
   */
  readonly getPlayIds: () => Effect.Effect<readonly number[]>
}

// =============================================================================
// Service Tag
// =============================================================================

/**
 * InsightSessionService - in-memory session state for insights and work logging
 */
export class InsightSessionService extends Context.Tag("InsightSessionService")<
  InsightSessionService,
  InsightSessionServiceInterface
>() {}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Generate a unique session ID
 */
const generateSessionId = (): string => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `session_${timestamp}_${random}`
}

/**
 * Generate a unique entry ID
 */
const generateEntryId = (prefix: string): string => {
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}_${random}`
}

/**
 * Internal state structure (enhanced)
 */
interface SessionState {
  readonly sessionId: string
  readonly mode: SessionMode
  readonly startedAt: number
  readonly playIds: readonly number[]
  readonly insights: readonly InsightSummary[]
  readonly toolCalls: readonly ToolCallLogEntry[]
  readonly researchSteps: readonly ResearchStep[]
  readonly entities: HashMap.HashMap<string, EntityFacts>
}

/**
 * Create initial session state
 */
const initialState = (): SessionState => ({
  sessionId: generateSessionId(),
  mode: "enrich",
  startedAt: Date.now(),
  playIds: [],
  insights: [],
  toolCalls: [],
  researchSteps: [],
  entities: HashMap.empty()
})

/**
 * Filter insights based on optional params
 */
const filterInsights = (
  insights: readonly InsightSummary[],
  params: Partial<GetRecentInsightsParams>
): readonly InsightSummary[] => {
  let filtered = insights

  // Filter by play_id - useful for checking existing insights for current play
  if (params.play_id !== undefined) {
    filtered = filtered.filter((insight) => insight.play_id === params.play_id)
  }

  if (params.artist_mbid) {
    filtered = filtered.filter((insight) =>
      insight.entity_mbids.includes(params.artist_mbid!)
    )
  }

  if (params.entity_type) {
    filtered = filtered.filter(
      (insight) => insight.insight_type === params.entity_type
    )
  }

  return filtered
}

/**
 * Filter tool calls based on optional params
 */
const filterToolCalls = (
  toolCalls: readonly ToolCallLogEntry[],
  params: Partial<GetToolCallsParams>
): readonly ToolCallLogEntry[] => {
  let filtered = toolCalls

  if (params.toolName) {
    filtered = filtered.filter((tc) => tc.toolName === params.toolName)
  }

  if (params.iteration !== undefined) {
    filtered = filtered.filter((tc) => tc.iteration === params.iteration)
  }

  return filtered
}

/**
 * Create the InsightSessionService implementation
 *
 * Note: Ref operations never fail, so no error handling is needed
 */
const makeInsightSessionService = Effect.gen(function* () {
  const stateRef = yield* Ref.make<SessionState>(initialState())

  // =========================================================================
  // Insight Management
  // =========================================================================

  const addInsight = Effect.fn("InsightSessionService.addInsight")(function* (
    insight: InsightSummary
  ) {
    yield* Ref.update(stateRef, (state) => ({
      ...state,
      insights: [...state.insights, insight]
    }))
  }) as (insight: InsightSummary) => Effect.Effect<void>

  const getRecentInsights = Effect.fn("InsightSessionService.getRecentInsights")(function* (
    params: Partial<GetRecentInsightsParams> = {}
  ) {
    const state = yield* Ref.get(stateRef)
    const filtered = filterInsights(state.insights, params)
    const limit = params.limit ?? 10

    return {
      insights: filtered.slice(-limit),
      total: filtered.length,
      sessionId: state.sessionId
    }
  }) as (
    params?: GetRecentInsightsParams
  ) => Effect.Effect<GetRecentInsightsResponse>

  const seedWithExistingInsights = Effect.fn("InsightSessionService.seedWithExistingInsights")(function* (
    insights: readonly InsightSummary[]
  ) {
    yield* Ref.update(stateRef, (state) => ({
      ...state,
      // Prepend existing insights so they appear first (oldest first)
      // New insights produced this session will be appended after
      insights: [...insights, ...state.insights]
    }))
  }) as (
    insights: readonly InsightSummary[]
  ) => Effect.Effect<void>

  const clear = (): Effect.Effect<void> =>
    Ref.update(stateRef, (state) => ({
      ...state,
      insights: [],
      toolCalls: [],
      researchSteps: [],
      entities: HashMap.empty()
    }))

  const reset = (): Effect.Effect<void> => Ref.set(stateRef, initialState())

  const getSessionId = (): Effect.Effect<string> =>
    Ref.get(stateRef).pipe(Effect.map((state) => state.sessionId))

  // =========================================================================
  // Tool Call Logging
  // =========================================================================

  const logToolCall = (entry: ToolCallLogInput): Effect.Effect<void> =>
    Ref.update(stateRef, (state) => ({
      ...state,
      toolCalls: [
        ...state.toolCalls,
        {
          ...entry,
          id: generateEntryId("tc"),
          timestamp: Date.now()
        }
      ]
    }))

  const getToolCalls = (
    params: Partial<GetToolCallsParams> = {}
  ): Effect.Effect<readonly ToolCallLogEntry[]> =>
    Ref.get(stateRef).pipe(
      Effect.map((state) => {
        const filtered = filterToolCalls(state.toolCalls, params)
        const limit = params.limit ?? 100
        return filtered.slice(-limit)
      })
    )

  // =========================================================================
  // Research Step Logging
  // =========================================================================

  const logResearchStep = (step: ResearchStepInput): Effect.Effect<void> =>
    Ref.update(stateRef, (state) => ({
      ...state,
      researchSteps: [
        ...state.researchSteps,
        {
          ...step,
          id: generateEntryId("rs"),
          timestamp: Date.now()
        }
      ]
    }))

  const getResearchSteps = (): Effect.Effect<readonly ResearchStep[]> =>
    Ref.get(stateRef).pipe(Effect.map((state) => state.researchSteps))

  // =========================================================================
  // Entity Facts
  // =========================================================================

  const addEntityFact = (
    mbid: string,
    name: string,
    type: EntityType,
    fact: string,
    source: string
  ): Effect.Effect<void> =>
    Ref.update(stateRef, (state) => {
      const existing = HashMap.get(state.entities, mbid)

      const updated: EntityFacts = existing._tag === "Some"
        ? {
            ...existing.value,
            facts: existing.value.facts.includes(fact)
              ? existing.value.facts
              : [...existing.value.facts, fact],
            sources: existing.value.sources.includes(source)
              ? existing.value.sources
              : [...existing.value.sources, source]
          }
        : {
            mbid,
            name,
            type,
            facts: [fact],
            sources: [source],
            discoveredAt: Date.now()
          }

      return {
        ...state,
        entities: HashMap.set(state.entities, mbid, updated)
      }
    })

  const getEntityFacts = (mbid: string): Effect.Effect<EntityFacts | undefined> =>
    Ref.get(stateRef).pipe(
      Effect.map((state) => {
        const result = HashMap.get(state.entities, mbid)
        return result._tag === "Some" ? result.value : undefined
      })
    )

  const getAllEntities = (): Effect.Effect<readonly EntityFacts[]> =>
    Ref.get(stateRef).pipe(
      Effect.map((state) => Array.from(HashMap.values(state.entities)))
    )

  // =========================================================================
  // Session Export/Import
  // =========================================================================

  const exportSession = Effect.fn("InsightSessionService.exportSession")(function* () {
    const state = yield* Ref.get(stateRef)
    return {
      sessionId: state.sessionId,
      mode: state.mode,
      startedAt: state.startedAt,
      playIds: state.playIds,
      insights: state.insights,
      toolCalls: state.toolCalls,
      researchSteps: state.researchSteps,
      entities: Array.from(HashMap.values(state.entities))
    }
  }) as () => Effect.Effect<SessionExport>

  const importSession = Effect.fn("InsightSessionService.importSession")(function* (
    session: SessionExport
  ) {
    yield* Ref.set(stateRef, {
      sessionId: session.sessionId,
      mode: session.mode,
      startedAt: session.startedAt,
      playIds: session.playIds,
      insights: session.insights,
      toolCalls: session.toolCalls,
      researchSteps: session.researchSteps,
      entities: HashMap.fromIterable(
        session.entities.map((e) => [e.mbid, e] as const)
      )
    })
  }) as (session: SessionExport) => Effect.Effect<void>

  // =========================================================================
  // Session Metadata
  // =========================================================================

  const setMode = (mode: SessionMode): Effect.Effect<void> =>
    Ref.update(stateRef, (state) => ({ ...state, mode }))

  const getMode = (): Effect.Effect<SessionMode> =>
    Ref.get(stateRef).pipe(Effect.map((state) => state.mode))

  const addPlayId = (playId: number): Effect.Effect<void> =>
    Ref.update(stateRef, (state) => ({
      ...state,
      playIds: state.playIds.includes(playId)
        ? state.playIds
        : [...state.playIds, playId]
    }))

  const getPlayIds = (): Effect.Effect<readonly number[]> =>
    Ref.get(stateRef).pipe(Effect.map((state) => state.playIds))

  return {
    addInsight,
    getRecentInsights,
    seedWithExistingInsights,
    clear,
    reset,
    getSessionId,
    logToolCall,
    getToolCalls,
    logResearchStep,
    getResearchSteps,
    addEntityFact,
    getEntityFacts,
    getAllEntities,
    exportSession,
    importSession,
    setMode,
    getMode,
    addPlayId,
    getPlayIds
  } satisfies InsightSessionServiceInterface
})

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for InsightSessionService
 * Creates a fresh session with new Ref state
 */
export const InsightSessionServiceLive: Layer.Layer<InsightSessionService> =
  Layer.effect(InsightSessionService, makeInsightSessionService)

/**
 * Scoped layer that creates a fresh session per scope
 * Use this when you want session isolation per request/operation
 */
export const InsightSessionServiceScoped: Layer.Layer<InsightSessionService> =
  Layer.scoped(InsightSessionService, makeInsightSessionService)

/**
 * Test layer with mock implementation
 */
export const InsightSessionServiceTest: Layer.Layer<InsightSessionService> = Layer.succeed(
  InsightSessionService,
  {
    addInsight: (_insight) => Effect.void,
    getRecentInsights: (_params) =>
      Effect.succeed({
        insights: [],
        total: 0,
        sessionId: "test_session"
      }),
    seedWithExistingInsights: (_insights) => Effect.void,
    clear: () => Effect.void,
    reset: () => Effect.void,
    getSessionId: () => Effect.succeed("test_session"),
    logToolCall: (_entry) => Effect.void,
    getToolCalls: (_params) => Effect.succeed([]),
    logResearchStep: (_step) => Effect.void,
    getResearchSteps: () => Effect.succeed([]),
    addEntityFact: (_mbid, _name, _type, _fact, _source) => Effect.void,
    getEntityFacts: (_mbid) => Effect.succeed(undefined),
    getAllEntities: () => Effect.succeed([]),
    exportSession: () =>
      Effect.succeed({
        sessionId: "test_session",
        mode: "enrich" as const,
        startedAt: Date.now(),
        playIds: [],
        insights: [],
        toolCalls: [],
        researchSteps: [],
        entities: []
      }),
    importSession: (_session) => Effect.void,
    setMode: (_mode) => Effect.void,
    getMode: () => Effect.succeed("enrich" as const),
    addPlayId: (_playId) => Effect.void,
    getPlayIds: () => Effect.succeed([])
  } satisfies InsightSessionServiceInterface
)

/**
 * Test layer with pre-populated insights
 * Useful for testing insight retrieval and filtering
 */
export const makeInsightSessionServiceTestWithData = (
  insights: readonly InsightSummary[]
): Layer.Layer<InsightSessionService> =>
  Layer.succeed(InsightSessionService, {
    addInsight: (_insight) => Effect.void,
    getRecentInsights: (params) => {
      let filtered = insights

      if (params?.play_id !== undefined) {
        filtered = filtered.filter((i) => i.play_id === params.play_id)
      }

      if (params?.artist_mbid) {
        filtered = filtered.filter((i) =>
          i.entity_mbids.includes(params.artist_mbid!)
        )
      }

      if (params?.entity_type) {
        filtered = filtered.filter((i) => i.insight_type === params.entity_type)
      }

      const limit = params?.limit ?? 10
      const limited = filtered.slice(-limit)

      return Effect.succeed({
        insights: limited,
        total: filtered.length,
        sessionId: "test_session"
      })
    },
    seedWithExistingInsights: (_insights) => Effect.void,
    clear: () => Effect.void,
    reset: () => Effect.void,
    getSessionId: () => Effect.succeed("test_session"),
    logToolCall: (_entry) => Effect.void,
    getToolCalls: (_params) => Effect.succeed([]),
    logResearchStep: (_step) => Effect.void,
    getResearchSteps: () => Effect.succeed([]),
    addEntityFact: (_mbid, _name, _type, _fact, _source) => Effect.void,
    getEntityFacts: (_mbid) => Effect.succeed(undefined),
    getAllEntities: () => Effect.succeed([]),
    exportSession: () =>
      Effect.succeed({
        sessionId: "test_session",
        mode: "enrich" as const,
        startedAt: Date.now(),
        playIds: [],
        insights,
        toolCalls: [],
        researchSteps: [],
        entities: []
      }),
    importSession: (_session) => Effect.void,
    setMode: (_mode) => Effect.void,
    getMode: () => Effect.succeed("enrich" as const),
    addPlayId: (_playId) => Effect.void,
    getPlayIds: () => Effect.succeed([])
  } satisfies InsightSessionServiceInterface)
