import { Atom, Result } from "@effect-atom/atom-react"
import { HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import { Effect, Schema, Schedule, Stream } from "effect"
import { httpRuntime } from "@/lib/http-runtime"
import { PlayResult, TimelineResponse } from "@/domain/Play"
import { NetworkError, TimelineApiError } from "@/domain/errors"

/**
 * Timeline Atoms Architecture
 *
 * This module demonstrates two patterns for managing reactive state with Effect Atom:
 *
 * 1. **Manual State Management** (used for timeline):
 *    - Writable atoms with explicit updates
 *    - Good for complex state (infinite scroll, pagination)
 *    - Component controls when/how state updates
 *    - Example: timelineAtom (persisted to localStorage)
 *
 * 2. **Reactive State Management** (available but not used here):
 *    - Atoms with `Atom.withReactivity(["key"])` auto-refresh
 *    - Mutations with `{ reactivityKeys: ["key"] }` invalidate atoms
 *    - Good for simple queries that should refetch on mutations
 *    - Example: A "current play" atom that refetches when timeline updates
 *
 * For infinite-scroll UX, manual management is better than auto-refresh
 * because we want to append data, not replace it.
 */

/**
 * TimelineState schema - represents the state of the timeline atom.
 *
 * Tracks the list of plays, pagination cursor, loading state, errors,
 * and optional anchor position for navigation.
 */
export class TimelineState extends Schema.Class<TimelineState>("TimelineState")({
  plays: Schema.Array(PlayResult),
  cursor: Schema.NullOr(Schema.String),
  hasMore: Schema.Boolean,
  isLoading: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
  anchorPosition: Schema.optional(Schema.Number)
}) {}

// Effect to fetch timeline data
const fetchTimelineEffect = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient

  const request = HttpClientRequest.get("/api/plays/timeline").pipe(
    HttpClientRequest.setUrlParams({ limit: "50" })
  )

  const response = yield* client.execute(request).pipe(
    Effect.mapError((cause): NetworkError => new NetworkError({
      cause,
      url: "/api/plays/timeline"
    }))
  )

  const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response).pipe(
    Effect.mapError((cause): TimelineApiError => new TimelineApiError({
      cause,
      context: "Failed to parse timeline response"
    }))
  )

  return new TimelineState({
    plays: data.results,
    cursor: data.next_cursor,
    hasMore: data.has_more,
    isLoading: false,
    error: null
  })
})

// Stream that fetches timeline data every 2 minutes
const timelineFetchStream = Stream.fromSchedule(Schedule.spaced("2 minutes")).pipe(
  Stream.flatMap(() => Stream.fromEffect(fetchTimelineEffect))
)

// Primary timeline atom - writable, persisted to localStorage
// Components use this to read and write timeline state
// Note: For infinite-scroll UX, manual state management is better than auto-refresh
//
//        ┌─── Atom.Writable<TimelineState, TimelineState>
//        ▼
export const timelineAtom = httpRuntime.atom(fetchTimelineEffect).pipe(Atom.keepAlive)

// Initial fetch atom - returns Result for pattern matching with loading/error/success states
// Use with useAtom and Result.match to handle all states declaratively
//
//        ┌─── Atom<Result<TimelineState, NetworkError | TimelineApiError>>
//        ▼
export const initialTimelineFetchAtom = httpRuntime.atom(fetchTimelineEffect)

// Internal stream atom for background fetching (Result-based)
// Used by background sync to fetch new data periodically
const timelineStreamAtom = httpRuntime.atom(timelineFetchStream).pipe(Atom.keepAlive)

// Background sync function - to be called manually or from components
// Updates persisted atom when stream emits new data
// Components can call this to sync stream data to localStorage
export const syncTimelineToStorage = httpRuntime.fn<void>()(
  (_, get) => Effect.gen(function* () {
    // Read from stream atom using get.result()
    const streamResult = yield* get.result(timelineStreamAtom)
    
    // Return the result to be written to persisted atom by caller
    return streamResult
  })
)

// Computed atom for current plays
// Reads from writable timelineAtom directly (not Result)
export const currentPlaysAtom = Atom.map(timelineAtom, (state) => Result.map(state, (state) => state.plays))

// Append more plays (infinite scroll action)
// Fetches more plays and returns new state for component to write to timelineAtom
export const appendPlaysAtom = httpRuntime.fn<{ cursor: string; currentState: TimelineState }>()(
  (params) => Effect.gen(function* () {
    const { cursor, currentState } = params

    // Perform HTTP operation
    const client = yield* HttpClient.HttpClient

    const request = HttpClientRequest.get("/api/plays/timeline").pipe(
      HttpClientRequest.setUrlParams({
        cursor,
        limit: "50"
      })
    )

    const response = yield* client.execute(request).pipe(
      Effect.mapError((cause): NetworkError => new NetworkError({
        cause,
        url: `/api/plays/timeline?cursor=${cursor}`
      }))
    )

    const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response).pipe(
      Effect.mapError((cause): TimelineApiError => new TimelineApiError({
        cause,
        context: "Failed to append plays"
      }))
    )

    // Create new state with appended plays
    return new TimelineState({
      ...currentState,
      plays: [...currentState.plays, ...data.results],
      cursor: data.next_cursor,
      hasMore: data.has_more,
      isLoading: false,
      error: null
    })
  })
)

// Jump to position (anchor, date, percentage)
// Fetches plays at specified position and returns new state for component to write to timelineAtom
export const jumpToPositionAtom = httpRuntime.fn<{
  anchor_id?: number
  since?: string
  percentage?: number
}>()(
  (params) => Effect.gen(function* () {
    // Perform HTTP operation
    const client = yield* HttpClient.HttpClient

    const urlParams: Record<string, string> = { limit: "50" }
    if (params.anchor_id !== undefined) urlParams.anchor_id = String(params.anchor_id)
    if (params.since !== undefined) urlParams.since = params.since
    if (params.percentage !== undefined) urlParams.percentage = String(params.percentage)

    const request = HttpClientRequest.get("/api/plays/timeline").pipe(
      HttpClientRequest.setUrlParams(urlParams)
    )

    const response = yield* client.execute(request).pipe(
      Effect.mapError((cause): NetworkError => new NetworkError({
        cause,
        url: `/api/plays/timeline with params ${JSON.stringify(params)}`
      }))
    )

    const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response).pipe(
      Effect.mapError((cause): TimelineApiError => new TimelineApiError({
        cause,
        context: "Failed to jump to position"
      }))
    )

    // Create new state with fetched plays
    return new TimelineState({
      plays: data.results,
      cursor: data.next_cursor,
      hasMore: data.has_more,
      isLoading: false,
      error: null,
      anchorPosition: data.anchor_position
    })
  })
)

// Scroll position atom - tracks window scroll position
// Based on: https://github.com/tim-smart/effect-atom?tab=readme-ov-file#wrapping-an-event-listener
export const scrollYAtom = Atom.make((get) => {
  // get.setSelf updates the value of this Atom from within itself
  const onScroll = () => {
    get.setSelf(window.scrollY)
  }
  
  // Add event listener when atom is subscribed to
  if (typeof window !== "undefined") {
    window.addEventListener("scroll", onScroll)
    // Remove event listener when atom is no longer used
    get.addFinalizer(() => window.removeEventListener("scroll", onScroll))
  }
  
  // Return the current scroll position
  return typeof window !== "undefined" ? window.scrollY : 0
})
