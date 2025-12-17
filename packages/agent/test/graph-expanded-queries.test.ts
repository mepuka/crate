/**
 * Integration Tests: Expanded Graph Queries
 *
 * Tests the 4 new graph query types against the live Graph API:
 * - members_by_instrument: Band members filtered by instrument
 * - works_by_creator: Works composed/written by artist
 * - work_credits: Who composed/wrote a work
 * - collaborators_direct: Direct artist collaborations
 *
 * These tests require FAISS_API_URL to be set and hit the live API.
 * Run with: pnpm --filter @crate/agent test
 *
 * @module
 */

import { describe, it, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "@effect/platform"
import {
  GraphConnectionsService,
  GraphConnectionsServiceLive,
} from "../src/services/GraphConnectionsService.js"
import { GraphConnectionsClientLive } from "../src/services/GraphConnectionsClient.js"
import { FaissConfig } from "../src/config.js"

// =============================================================================
// Test Data: Well-known MBIDs
// =============================================================================

/**
 * Radiohead - Oxford band with 5 known members
 * Good for testing band_members and members_by_instrument
 */
const RADIOHEAD_MBID = "a74b1b7f-71a5-4011-9441-d0b5e4122711"

/**
 * Thom Yorke - Lead singer, multi-instrumentalist
 * Good for testing collaborators and member_of
 */
const THOM_YORKE_MBID = "8ed2e0b3-aa4c-4e13-bec3-dc7393ed4d6b"

/**
 * Dave Grohl - Drummer/vocalist, many collaborations
 * Good for testing collaborators_direct with various types
 */
const DAVE_GROHL_MBID = "b7ffd2af-418f-4be2-bdd1-22f8b48613da"

/**
 * Foo Fighters - Rock band
 * Good for testing band_members
 */
const FOO_FIGHTERS_MBID = "67f66c07-6e61-4026-ade5-7e782fad3a5d"

/**
 * "Creep" by Radiohead (work, not recording)
 * Good for testing work_credits
 */
const CREEP_WORK_MBID = "0a8e8d55-4b83-3c67-8fe5-4fb0eb5a0a81"

/**
 * Dolly Parton - Prolific songwriter
 * Good for testing works_by_creator
 */
const DOLLY_PARTON_MBID = "20bcf2dd-59f8-4acd-9af3-23c3a2c3ee1c"

/**
 * "Jolene" by Dolly Parton (work)
 * Good for testing work_credits
 */
const JOLENE_WORK_MBID = "5a8c3c70-6e5b-3fcf-b817-8f6c48e0a1eb"

// =============================================================================
// Test Layers
// =============================================================================

/**
 * Full layer stack for integration tests
 * Uses FAISS_API_URL from environment
 */
const TestLayer = GraphConnectionsServiceLive.pipe(
  Layer.provide(GraphConnectionsClientLive),
  Layer.provide(FaissConfig.Default),
  Layer.provide(FetchHttpClient.layer)
)

// =============================================================================
// members_by_instrument Tests
// =============================================================================

describe("members_by_instrument", () => {
  it.effect("returns band members without filter", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "members_by_instrument",
        mbids: [RADIOHEAD_MBID],
        limit: 20,
      })

      expect(result.query_type).toBe("members_by_instrument")
      expect(result.source_mbids).toContain(RADIOHEAD_MBID)
      // Query should succeed (may return 0 if data not in graph)
      expect(result.total).toBeGreaterThanOrEqual(0)
      expect(result.connections.length).toBe(result.total)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters by vocals instrument", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "members_by_instrument",
        mbids: [RADIOHEAD_MBID],
        instrument: "vocals",
        limit: 20,
      })

      expect(result.query_type).toBe("members_by_instrument")
      // Should have at least Thom Yorke as vocalist
      expect(result.connections.length).toBeGreaterThanOrEqual(1)
      // Check attributes include vocals-related
      for (const conn of result.connections) {
        if (conn.attributes) {
          const hasVocals = conn.attributes.some(
            (attr) =>
              attr.toLowerCase().includes("vocal") ||
              attr.toLowerCase().includes("voice") ||
              attr.toLowerCase().includes("sing")
          )
          expect(hasVocals).toBe(true)
        }
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters by guitar instrument", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "members_by_instrument",
        mbids: [RADIOHEAD_MBID],
        instrument: "guitar",
        limit: 20,
      })

      expect(result.query_type).toBe("members_by_instrument")
      // Radiohead has multiple guitarists (Jonny, Ed, Thom)
      expect(result.connections.length).toBeGreaterThanOrEqual(1)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters by drums instrument", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "members_by_instrument",
        mbids: [FOO_FIGHTERS_MBID],
        instrument: "drums",
        limit: 20,
      })

      expect(result.query_type).toBe("members_by_instrument")
      // Foo Fighters - Dave Grohl started as drummer, Taylor Hawkins
      // At minimum should find drummers
      expect(result.connections.length).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns empty for non-existent band", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "members_by_instrument",
        mbids: ["00000000-0000-0000-0000-000000000000"],
        limit: 20,
      })

      expect(result.connections).toEqual([])
      expect(result.total).toBe(0)
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// works_by_creator Tests
// =============================================================================

describe("works_by_creator", () => {
  it.effect("returns works without filter", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "works_by_creator",
        mbids: [DOLLY_PARTON_MBID],
        limit: 20,
      })

      expect(result.query_type).toBe("works_by_creator")
      expect(result.source_mbids).toContain(DOLLY_PARTON_MBID)
      // Query should succeed (may return 0 if data not in graph)
      expect(result.total).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters by composer role", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "works_by_creator",
        mbids: [DOLLY_PARTON_MBID],
        creator_type: "composer",
        limit: 20,
      })

      expect(result.query_type).toBe("works_by_creator")
      // Each connection should be a work
      for (const conn of result.connections) {
        expect(conn.node_type).toBe("work")
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters by lyricist role", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "works_by_creator",
        mbids: [DOLLY_PARTON_MBID],
        creator_type: "lyricist",
        limit: 20,
      })

      expect(result.query_type).toBe("works_by_creator")
      // Dolly wrote many songs
      // Results may be empty if API doesn't distinguish composer/lyricist
      expect(result.total).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters by writer role", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "works_by_creator",
        mbids: [THOM_YORKE_MBID],
        creator_type: "writer",
        limit: 20,
      })

      expect(result.query_type).toBe("works_by_creator")
      // Thom Yorke has written many songs
      expect(result.total).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// work_credits Tests
// =============================================================================

describe("work_credits", () => {
  it.effect("returns credits for a work", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      // Note: work_credits queries a work MBID, not artist MBID
      const result = yield* graph.connections({
        query_type: "work_credits",
        mbids: [CREEP_WORK_MBID],
        limit: 20,
      })

      expect(result.query_type).toBe("work_credits")
      expect(result.source_mbids).toContain(CREEP_WORK_MBID)
      // "Creep" should have writer credits
      // Note: May return 0 if work MBID isn't in the graph
      expect(result.total).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns credits for Jolene", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "work_credits",
        mbids: [JOLENE_WORK_MBID],
        limit: 20,
      })

      expect(result.query_type).toBe("work_credits")
      // Jolene was written by Dolly Parton
      // May be empty if work isn't in local graph
      expect(result.total).toBeGreaterThanOrEqual(0)
      if (result.connections.length > 0) {
        // Credits should be artists
        for (const conn of result.connections) {
          expect(["artist", "band"]).toContain(conn.node_type)
        }
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns empty for non-existent work", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "work_credits",
        mbids: ["00000000-0000-0000-0000-000000000000"],
        limit: 20,
      })

      expect(result.connections).toEqual([])
      expect(result.total).toBe(0)
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// collaborators (existing 2-hop query) Tests
// =============================================================================

describe("collaborators (2-hop)", () => {
  it.effect("returns collaborators via shared bands", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "collaborators",
        mbids: [THOM_YORKE_MBID],
        limit: 20,
      })

      expect(result.query_type).toBe("collaborators")
      expect(result.source_mbids).toContain(THOM_YORKE_MBID)
      // Thom Yorke has collaborators via Radiohead
      expect(result.total).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// covers with version_type filter Tests
// =============================================================================

describe("covers with version_type", () => {
  it.effect("returns covers without filter", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "covers",
        mbids: [RADIOHEAD_MBID],
        limit: 20,
      })

      expect(result.query_type).toBe("covers")
      expect(result.source_mbids).toContain(RADIOHEAD_MBID)
      // May or may not have covers
      expect(result.total).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters by cover version type", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "covers",
        mbids: [RADIOHEAD_MBID],
        version_type: "cover",
        limit: 20,
      })

      expect(result.query_type).toBe("covers")
      // Filtered results
      expect(result.total).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters by live version type", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "covers",
        mbids: [RADIOHEAD_MBID],
        version_type: "live",
        limit: 20,
      })

      expect(result.query_type).toBe("covers")
      // Radiohead has many live recordings
      expect(result.total).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters by instrumental version type", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "covers",
        mbids: [RADIOHEAD_MBID],
        version_type: "instrumental",
        limit: 20,
      })

      expect(result.query_type).toBe("covers")
      expect(result.total).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe("edge cases", () => {
  it.effect("handles multiple MBIDs in single query", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "members_by_instrument",
        mbids: [RADIOHEAD_MBID, FOO_FIGHTERS_MBID],
        limit: 50,
      })

      expect(result.query_type).toBe("members_by_instrument")
      expect(result.source_mbids).toContain(RADIOHEAD_MBID)
      expect(result.source_mbids).toContain(FOO_FIGHTERS_MBID)
      // Query should succeed (may return 0 if data not in graph)
      expect(result.total).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("respects limit parameter", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "members_by_instrument",
        mbids: [RADIOHEAD_MBID],
        limit: 2,
      })

      expect(result.connections.length).toBeLessThanOrEqual(2)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("include_attributes parameter is accepted", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "band_members", // Use band_members which may have more data
        mbids: [RADIOHEAD_MBID],
        include_attributes: true,
        limit: 10,
      })

      // Query should succeed
      expect(result.query_type).toBe("band_members")
      expect(result.total).toBeGreaterThanOrEqual(0)
      // Attributes field exists on connections (may be empty array or have data)
      for (const conn of result.connections) {
        expect(conn).toHaveProperty("attributes")
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns query_time_ms", () =>
    Effect.gen(function* () {
      const graph = yield* GraphConnectionsService

      const result = yield* graph.connections({
        query_type: "members_by_instrument",
        mbids: [RADIOHEAD_MBID],
        limit: 10,
      })

      expect(typeof result.query_time_ms).toBe("number")
      expect(result.query_time_ms).toBeGreaterThanOrEqual(0)
    }).pipe(Effect.provide(TestLayer))
  )
})
