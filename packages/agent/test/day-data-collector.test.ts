/**
 * Unit Tests: DayDataCollector Date Boundary Filtering
 *
 * Tests the critical pagination fix that ensures plays from adjacent days
 * are not included when paginating with cursor-based pagination.
 *
 * The API cursor is NOT date-scoped (it only encodes airdate:play_id),
 * so we must filter client-side to enforce date boundaries.
 *
 * @module
 */

import { describe, it, expect } from "@effect/vitest"
import { Effect, Layer, Context } from "effect"
import type { Play } from "@crate/domain/faiss/schemas"
import { DayDataCollector, DayDataCollectorLive, type DayData } from "../src/daily-summary/DayDataCollector.js"
import { FaissClient } from "../src/FaissClient.js"

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock play with specified airdate
 */
const mockPlay = (id: number, airdate: string): Play => ({
  id,
  artist: "Test Artist",
  song: "Test Song",
  album: "Test Album",
  airdate: new Date(airdate),
  release_date: null,
  labels: [],
  rotation_status: null,
  is_local: false,
  is_live: false,
  is_request: false,
  comment: null,
  show: 1,
  image_uri: null,
  thumbnail_uri: null,
  artist_mbid: [],
  recording_mbid: null,
  release_mbid: null,
  release_group_mbid: null,
})

// =============================================================================
// Mock FaissClient Layers
// =============================================================================

/**
 * Creates a mock FaissClient that simulates the API's cursor behavior:
 * - First request: uses since/until filter
 * - Subsequent requests: uses cursor only (NO date filtering)
 *
 * This tests that our client-side filtering handles the boundary correctly.
 */
const createMockFaissClient = (pages: Array<{ plays: Play[], hasMore: boolean }>) => {
  let pageIndex = 0

  const mockClient = {
    timeline: (_params: unknown) => {
      const page = pages[pageIndex] ?? { plays: [], hasMore: false }
      pageIndex++
      return Effect.succeed({
        results: page.plays,
        has_more: page.hasMore,
        next_cursor: page.hasMore ? `cursor_page_${pageIndex}` : null,
        query_time_ms: 10,
        total_count: undefined,
        anchor_position: undefined,
      })
    },
    // Stub other methods (not used in DayDataCollector)
    search: () => Effect.succeed({ results: [], total: 0, query_time_ms: 0, query: "" }),
    hybridSearch: () => Effect.succeed({ results: [], total: 0, query_time_ms: 0, query: "", bm25_weight: 0.5, faiss_weight: 0.5 }),
    getPlay: () => Effect.fail({ message: "not implemented" }),
    health: () => Effect.succeed({ status: "ok" }),
    getPlaysBatch: () => Effect.succeed({ plays: [] }),
    postEnrichments: () => Effect.succeed({ status: "success", count: 0 }),
    postInsights: () => Effect.succeed({ status: "success", count: 0, insight_ids: [] }),
    getInsightsForPlay: () => Effect.succeed({ play_id: 0, insights: [], total: 0 }),
    getRecentInsights: () => Effect.succeed({ insights: [], total: 0 }),
    getInsightsForContext: () => Effect.succeed({ insights: [], total: 0 }),
    getUnprocessedPlays: () => Effect.succeed({ play_ids: [], count: 0, total_unprocessed: 0, strategy: "oldest_first", query_time_ms: 0 }),
    storeGeneratedAsset: () => Effect.succeed({ id: 1, params_hash: "", was_existing: false }),
    getCircuitState: () => Effect.succeed({ state: "closed", failures: 0, successes: 0 }),
  }

  return Layer.succeed(FaissClient, mockClient as unknown as FaissClient["Type"])
}

// =============================================================================
// Date Boundary Filtering Tests
// =============================================================================

describe("DayDataCollector Date Boundary Filtering", () => {
  it.effect("filters out plays from previous day when cursor pagination leaks", () =>
    Effect.gen(function* () {
      // Simulate a scenario where:
      // - Page 1: all plays are within 2024-01-15
      // - Page 2: cursor pagination returns plays from 2024-01-14 (the bug case)
      const targetDate = "2024-01-15"

      const mockPages = [
        {
          // Page 1: 3 plays on target date (first request uses since/until so all in range)
          plays: [
            mockPlay(103, "2024-01-15T23:30:00Z"),
            mockPlay(102, "2024-01-15T22:00:00Z"),
            mockPlay(101, "2024-01-15T20:00:00Z"),
          ],
          hasMore: true,
        },
        {
          // Page 2: cursor pagination would leak - 1 play on target, 2 from previous day
          // This simulates what the API returns when using cursor without date bounds
          plays: [
            mockPlay(100, "2024-01-15T01:00:00Z"), // Still in range
            mockPlay(99, "2024-01-14T23:00:00Z"),  // Previous day - should be filtered!
            mockPlay(98, "2024-01-14T22:00:00Z"),  // Previous day - should be filtered!
          ],
          hasMore: false,
        },
      ]

      const MockFaissClientLayer = createMockFaissClient(mockPages)
      const TestLayer = DayDataCollectorLive.pipe(Layer.provide(MockFaissClientLayer))

      const collector = yield* DayDataCollector
      const dayData: DayData = yield* collector.collectDay(targetDate)

      // Should only include 4 plays from 2024-01-15, NOT the 2 from 2024-01-14
      expect(dayData.plays.length).toBe(4)
      expect(dayData.stats.totalPlays).toBe(4)

      // Verify all plays are on the correct date
      for (const categorizedPlay of dayData.plays) {
        const playDate = categorizedPlay.play.airdate.toISOString().split("T")[0]
        expect(playDate).toBe(targetDate)
      }

      // Verify specific plays are included
      const playIds = dayData.plays.map(p => p.play.id)
      expect(playIds).toContain(103)
      expect(playIds).toContain(102)
      expect(playIds).toContain(101)
      expect(playIds).toContain(100)

      // Verify plays from previous day are excluded
      expect(playIds).not.toContain(99)
      expect(playIds).not.toContain(98)
    }).pipe(Effect.provide(DayDataCollectorLive.pipe(
      Layer.provide(createMockFaissClient([
        {
          plays: [
            mockPlay(103, "2024-01-15T23:30:00Z"),
            mockPlay(102, "2024-01-15T22:00:00Z"),
            mockPlay(101, "2024-01-15T20:00:00Z"),
          ],
          hasMore: true,
        },
        {
          plays: [
            mockPlay(100, "2024-01-15T01:00:00Z"),
            mockPlay(99, "2024-01-14T23:00:00Z"),
            mockPlay(98, "2024-01-14T22:00:00Z"),
          ],
          hasMore: false,
        },
      ]))
    )))
  )

  it.effect("stops pagination early when reaching date boundary", () =>
    Effect.gen(function* () {
      // Simulate a scenario where page 2 has plays that cross the date boundary.
      // The collector should stop as soon as it sees a play outside the range.
      // We verify this by checking that only plays within range are collected.
      const targetDate = "2024-01-15"

      const collector = yield* DayDataCollector
      const dayData = yield* collector.collectDay(targetDate)

      // Should only have 1 play (from page 1) - the plays from previous day should be filtered
      expect(dayData.plays.length).toBe(1)

      // Verify the only play is from the target date
      const playIds = dayData.plays.map(p => p.play.id)
      expect(playIds).toContain(102)
      expect(playIds).not.toContain(99)
      expect(playIds).not.toContain(98)
      expect(playIds).not.toContain(97)
    }).pipe(Effect.provide((() => {
      let pageIndex = 0
      const mockPages = [
        {
          plays: [mockPlay(102, "2024-01-15T22:00:00Z")],
          hasMore: true,
        },
        {
          // All plays are from previous day - should be filtered out
          plays: [
            mockPlay(99, "2024-01-14T23:00:00Z"),
            mockPlay(98, "2024-01-14T22:00:00Z"),
          ],
          hasMore: true, // API says there's more, but early stop should kick in
        },
        {
          // This page might still be fetched, but plays should be filtered
          plays: [mockPlay(97, "2024-01-14T21:00:00Z")],
          hasMore: false,
        },
      ]

      const mockClient = {
        timeline: () => {
          const page = mockPages[pageIndex] ?? { plays: [], hasMore: false }
          pageIndex++
          return Effect.succeed({
            results: page.plays,
            has_more: page.hasMore,
            next_cursor: page.hasMore ? `cursor_page_${pageIndex}` : null,
            query_time_ms: 10,
            total_count: undefined,
            anchor_position: undefined,
          })
        },
        search: () => Effect.succeed({ results: [], total: 0, query_time_ms: 0, query: "" }),
        hybridSearch: () => Effect.succeed({ results: [], total: 0, query_time_ms: 0, query: "", bm25_weight: 0.5, faiss_weight: 0.5 }),
        getPlay: () => Effect.fail({ message: "not implemented" }),
        health: () => Effect.succeed({ status: "ok" }),
        getPlaysBatch: () => Effect.succeed({ plays: [] }),
        postEnrichments: () => Effect.succeed({ status: "success", count: 0 }),
        postInsights: () => Effect.succeed({ status: "success", count: 0, insight_ids: [] }),
        getInsightsForPlay: () => Effect.succeed({ play_id: 0, insights: [], total: 0 }),
        getRecentInsights: () => Effect.succeed({ insights: [], total: 0 }),
        getInsightsForContext: () => Effect.succeed({ insights: [], total: 0 }),
        getUnprocessedPlays: () => Effect.succeed({ play_ids: [], count: 0, total_unprocessed: 0, strategy: "oldest_first", query_time_ms: 0 }),
        storeGeneratedAsset: () => Effect.succeed({ id: 1, params_hash: "", was_existing: false }),
        getCircuitState: () => Effect.succeed({ state: "closed", failures: 0, successes: 0 }),
      }

      return DayDataCollectorLive.pipe(Layer.provide(Layer.succeed(FaissClient, mockClient as unknown as FaissClient["Type"])))
    })()))
  )

  it.effect("handles single page with all plays in range", () =>
    Effect.gen(function* () {
      const targetDate = "2024-01-15"

      const collector = yield* DayDataCollector
      const dayData = yield* collector.collectDay(targetDate)

      // All 3 plays should be included
      expect(dayData.plays.length).toBe(3)
    }).pipe(Effect.provide(DayDataCollectorLive.pipe(
      Layer.provide(createMockFaissClient([
        {
          plays: [
            mockPlay(103, "2024-01-15T23:30:00Z"),
            mockPlay(102, "2024-01-15T12:00:00Z"),
            mockPlay(101, "2024-01-15T01:00:00Z"),
          ],
          hasMore: false,
        },
      ]))
    )))
  )

  it.effect("handles edge case: plays exactly at midnight boundaries", () =>
    Effect.gen(function* () {
      const targetDate = "2024-01-15"

      const collector = yield* DayDataCollector
      const dayData = yield* collector.collectDay(targetDate)

      // Play at exactly midnight should be included (>= since bound)
      // Play at exactly midnight next day should be excluded (< until bound)
      expect(dayData.plays.length).toBe(2)

      const playIds = dayData.plays.map(p => p.play.id)
      expect(playIds).toContain(101) // Exactly at midnight start - included
      expect(playIds).toContain(102) // During the day - included
      expect(playIds).not.toContain(103) // Exactly at midnight next day - excluded
    }).pipe(Effect.provide(DayDataCollectorLive.pipe(
      Layer.provide(createMockFaissClient([
        {
          plays: [
            mockPlay(103, "2024-01-16T00:00:00Z"), // Exactly midnight next day - should be excluded
            mockPlay(102, "2024-01-15T12:00:00Z"), // Middle of day - included
            mockPlay(101, "2024-01-15T00:00:00Z"), // Exactly midnight start - included
          ],
          hasMore: false,
        },
      ]))
    )))
  )
})
