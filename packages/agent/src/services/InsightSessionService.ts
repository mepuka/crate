/**
 * InsightSessionService
 *
 * In-memory session state using Effect Ref to track insights produced
 * during an agent session. Enables the agent to recall previous findings
 * and avoid duplicate research.
 *
 * @module
 */

import { Context, Effect, Layer, Ref } from "effect"
import type { InsightSummary, GetRecentInsightsParams } from "../tools/schemas.js"

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
 * Note: Ref operations never fail, so error types are removed for type safety
 */
export interface InsightSessionServiceInterface {
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
   * Reset the session with a new session ID and empty insights
   */
  readonly reset: () => Effect.Effect<void>

  /**
   * Get the current session ID
   */
  readonly getSessionId: () => Effect.Effect<string>
}

// =============================================================================
// Service Tag
// =============================================================================

/**
 * InsightSessionService - in-memory session state for insights
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
 * Internal state structure
 */
interface SessionState {
  readonly sessionId: string
  readonly insights: readonly InsightSummary[]
}

/**
 * Create initial session state
 */
const initialState = (): SessionState => ({
  sessionId: generateSessionId(),
  insights: []
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
 * Create the InsightSessionService implementation
 *
 * Note: Ref operations never fail, so no error handling is needed
 */
const makeInsightSessionService = Effect.gen(function* () {
  const stateRef = yield* Ref.make<SessionState>(initialState())

  const addInsight = (insight: InsightSummary): Effect.Effect<void> =>
    Ref.update(stateRef, (state) => ({
      ...state,
      insights: [...state.insights, insight]
    }))

  const getRecentInsights = (
    params: Partial<GetRecentInsightsParams> = {}
  ): Effect.Effect<GetRecentInsightsResponse> =>
    Ref.get(stateRef).pipe(
      Effect.map((state) => {
        const filtered = filterInsights(state.insights, params)
        const limit = params.limit ?? 10

        return {
          insights: filtered.slice(-limit),
          total: filtered.length,
          sessionId: state.sessionId
        }
      })
    )

  const seedWithExistingInsights = (
    insights: readonly InsightSummary[]
  ): Effect.Effect<void> =>
    Ref.update(stateRef, (state) => ({
      ...state,
      // Prepend existing insights so they appear first (oldest first)
      // New insights produced this session will be appended after
      insights: [...insights, ...state.insights]
    }))

  const clear = (): Effect.Effect<void> =>
    Ref.update(stateRef, (state) => ({
      sessionId: state.sessionId,
      insights: []
    }))

  const reset = (): Effect.Effect<void> => Ref.set(stateRef, initialState())

  const getSessionId = (): Effect.Effect<string> =>
    Ref.get(stateRef).pipe(Effect.map((state) => state.sessionId))

  return {
    addInsight,
    getRecentInsights,
    seedWithExistingInsights,
    clear,
    reset,
    getSessionId
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
    getSessionId: () => Effect.succeed("test_session")
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
    getSessionId: () => Effect.succeed("test_session")
  } satisfies InsightSessionServiceInterface)
