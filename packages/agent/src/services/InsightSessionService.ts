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
import { SessionError } from "./errors.js"
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
 */
export interface InsightSessionServiceInterface {
  /**
   * Add an insight to the session
   */
  readonly addInsight: (insight: InsightSummary) => Effect.Effect<void, SessionError>

  /**
   * Get recent insights with optional filtering
   */
  readonly getRecentInsights: (
    params?: GetRecentInsightsParams
  ) => Effect.Effect<GetRecentInsightsResponse, SessionError>

  /**
   * Clear all insights from the session
   */
  readonly clear: () => Effect.Effect<void, SessionError>

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
 * Create the InsightSessionService implementation
 */
const makeInsightSessionService = Effect.gen(function* () {
  // Create Ref for session state
  const stateRef = yield* Ref.make<SessionState>(initialState())

  const addInsight = (
    insight: InsightSummary
  ): Effect.Effect<void, SessionError> =>
    Ref.update(stateRef, (state) => ({
      ...state,
      insights: [...state.insights, insight]
    })).pipe(
      Effect.mapError((error) =>
        new SessionError({
          message: "Failed to add insight",
          cause: error
        })
      )
    )

  const getRecentInsights = (
    params: Partial<GetRecentInsightsParams> = {}
  ): Effect.Effect<GetRecentInsightsResponse, SessionError> =>
    Ref.get(stateRef).pipe(
      Effect.map((state) => {
        let filtered = state.insights

        // Filter by artist MBID if provided
        if (params.artist_mbid) {
          filtered = filtered.filter((insight) =>
            insight.entity_mbids.includes(params.artist_mbid!)
          )
        }

        // Filter by entity type if provided
        if (params.entity_type) {
          filtered = filtered.filter(
            (insight) => insight.insight_type === params.entity_type
          )
        }

        // Get total before limiting
        const total = filtered.length

        // Apply limit (default 10)
        const limit = params.limit ?? 10
        const limited = filtered.slice(-limit) // Get most recent

        return {
          insights: limited,
          total,
          sessionId: state.sessionId
        }
      }),
      Effect.mapError((error) =>
        new SessionError({
          message: "Failed to get recent insights",
          cause: error
        })
      )
    )

  const clear = (): Effect.Effect<void, SessionError> =>
    Ref.update(stateRef, (state) => ({
      sessionId: state.sessionId, // Keep same session ID
      insights: []
    })).pipe(
      Effect.mapError((error) =>
        new SessionError({
          message: "Failed to clear session",
          cause: error
        })
      )
    )

  const getSessionId = (): Effect.Effect<string> =>
    Ref.get(stateRef).pipe(Effect.map((state) => state.sessionId))

  return {
    addInsight,
    getRecentInsights,
    clear,
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
    clear: () => Effect.void,
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
    clear: () => Effect.void,
    getSessionId: () => Effect.succeed("test_session")
  } satisfies InsightSessionServiceInterface)
