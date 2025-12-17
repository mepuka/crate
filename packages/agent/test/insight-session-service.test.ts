/**
 * Unit Tests: InsightSessionService Work Logging
 *
 * Tests the enhanced session state functionality:
 * - Tool call logging
 * - Research step logging
 * - Entity facts accumulation
 * - Session export/import
 *
 * @module
 */

import { describe, it, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import {
  InsightSessionService,
  InsightSessionServiceLive,
  type ToolCallLogInput,
  type ResearchStepInput,
  type SessionExport,
} from "../src/services/InsightSessionService.js"

// =============================================================================
// Test Layer
// =============================================================================

const TestLayer = InsightSessionServiceLive

// =============================================================================
// Tool Call Logging Tests
// =============================================================================

describe("Tool Call Logging", () => {
  it.effect("logs tool calls with auto-generated id and timestamp", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      const input: ToolCallLogInput = {
        toolName: "search_plays",
        params: { artist: "Radiohead", limit: 10 },
        resultSummary: "5 results",
        resultCount: 5,
        durationMs: 150,
        iteration: 1,
      }

      yield* session.logToolCall(input)

      const calls = yield* session.getToolCalls()

      expect(calls).toHaveLength(1)
      expect(calls[0].toolName).toBe("search_plays")
      expect(calls[0].params).toEqual({ artist: "Radiohead", limit: 10 })
      expect(calls[0].resultSummary).toBe("5 results")
      expect(calls[0].resultCount).toBe(5)
      expect(calls[0].durationMs).toBe(150)
      expect(calls[0].iteration).toBe(1)
      expect(calls[0].id).toMatch(/^tc_/)
      expect(calls[0].timestamp).toBeGreaterThan(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("logs multiple tool calls in order", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      yield* session.logToolCall({
        toolName: "search_plays",
        params: {},
        resultSummary: "3 results",
        durationMs: 100,
        iteration: 1,
      })

      yield* session.logToolCall({
        toolName: "graph_connections",
        params: {},
        resultSummary: "8 connections",
        durationMs: 200,
        iteration: 1,
      })

      yield* session.logToolCall({
        toolName: "semantic_search",
        params: {},
        resultSummary: "2 results",
        durationMs: 150,
        iteration: 2,
      })

      const calls = yield* session.getToolCalls()

      expect(calls).toHaveLength(3)
      expect(calls[0].toolName).toBe("search_plays")
      expect(calls[1].toolName).toBe("graph_connections")
      expect(calls[2].toolName).toBe("semantic_search")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters tool calls by tool name", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      yield* session.logToolCall({
        toolName: "search_plays",
        params: {},
        resultSummary: "3 results",
        durationMs: 100,
        iteration: 1,
      })

      yield* session.logToolCall({
        toolName: "graph_connections",
        params: {},
        resultSummary: "8 connections",
        durationMs: 200,
        iteration: 1,
      })

      yield* session.logToolCall({
        toolName: "search_plays",
        params: {},
        resultSummary: "5 results",
        durationMs: 120,
        iteration: 2,
      })

      const searchCalls = yield* session.getToolCalls({ toolName: "search_plays" })

      expect(searchCalls).toHaveLength(2)
      expect(searchCalls.every(c => c.toolName === "search_plays")).toBe(true)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("filters tool calls by iteration", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      yield* session.logToolCall({
        toolName: "search_plays",
        params: {},
        resultSummary: "3 results",
        durationMs: 100,
        iteration: 1,
      })

      yield* session.logToolCall({
        toolName: "graph_connections",
        params: {},
        resultSummary: "8 connections",
        durationMs: 200,
        iteration: 2,
      })

      const iter1Calls = yield* session.getToolCalls({ iteration: 1 })
      const iter2Calls = yield* session.getToolCalls({ iteration: 2 })

      expect(iter1Calls).toHaveLength(1)
      expect(iter2Calls).toHaveLength(1)
      expect(iter1Calls[0].toolName).toBe("search_plays")
      expect(iter2Calls[0].toolName).toBe("graph_connections")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("respects limit parameter", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      for (let i = 0; i < 10; i++) {
        yield* session.logToolCall({
          toolName: `tool_${i}`,
          params: {},
          resultSummary: "ok",
          durationMs: 100,
          iteration: i,
        })
      }

      const limited = yield* session.getToolCalls({ limit: 3 })

      expect(limited).toHaveLength(3)
      // Should return most recent (last 3)
      expect(limited[0].toolName).toBe("tool_7")
      expect(limited[1].toolName).toBe("tool_8")
      expect(limited[2].toolName).toBe("tool_9")
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// Research Step Logging Tests
// =============================================================================

describe("Research Step Logging", () => {
  it.effect("logs research steps with auto-generated id and timestamp", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      const input: ResearchStepInput = {
        step: "search",
        description: "Searching for cover versions",
        findings: ["Found 3 covers by different artists"],
        entityMbids: ["mbid-1", "mbid-2"],
      }

      yield* session.logResearchStep(input)

      const steps = yield* session.getResearchSteps()

      expect(steps).toHaveLength(1)
      expect(steps[0].step).toBe("search")
      expect(steps[0].description).toBe("Searching for cover versions")
      expect(steps[0].findings).toEqual(["Found 3 covers by different artists"])
      expect(steps[0].entityMbids).toEqual(["mbid-1", "mbid-2"])
      expect(steps[0].id).toMatch(/^rs_/)
      expect(steps[0].timestamp).toBeGreaterThan(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("logs multiple research steps in order", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      yield* session.logResearchStep({
        step: "search",
        description: "Initial search",
        findings: [],
        entityMbids: [],
      })

      yield* session.logResearchStep({
        step: "graph",
        description: "Exploring graph connections",
        findings: ["Found band members"],
        entityMbids: ["mbid-1"],
      })

      yield* session.logResearchStep({
        step: "analyze",
        description: "Analyzing results",
        findings: ["Connection discovered"],
        entityMbids: [],
      })

      const steps = yield* session.getResearchSteps()

      expect(steps).toHaveLength(3)
      expect(steps[0].step).toBe("search")
      expect(steps[1].step).toBe("graph")
      expect(steps[2].step).toBe("analyze")
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// Entity Facts Tests
// =============================================================================

describe("Entity Facts", () => {
  it.effect("adds facts about new entities", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      yield* session.addEntityFact(
        "mbid-radiohead",
        "Radiohead",
        "band",
        "British rock band formed in 1985",
        "graph_connections"
      )

      const facts = yield* session.getEntityFacts("mbid-radiohead")

      expect(facts).toBeDefined()
      expect(facts!.mbid).toBe("mbid-radiohead")
      expect(facts!.name).toBe("Radiohead")
      expect(facts!.type).toBe("band")
      expect(facts!.facts).toEqual(["British rock band formed in 1985"])
      expect(facts!.sources).toEqual(["graph_connections"])
      expect(facts!.discoveredAt).toBeGreaterThan(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("accumulates facts for existing entities", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      yield* session.addEntityFact(
        "mbid-radiohead",
        "Radiohead",
        "band",
        "British rock band formed in 1985",
        "graph_connections"
      )

      yield* session.addEntityFact(
        "mbid-radiohead",
        "Radiohead",
        "band",
        "From Oxford, England",
        "search_plays"
      )

      yield* session.addEntityFact(
        "mbid-radiohead",
        "Radiohead",
        "band",
        "Known for experimental rock",
        "semantic_search"
      )

      const facts = yield* session.getEntityFacts("mbid-radiohead")

      expect(facts!.facts).toHaveLength(3)
      expect(facts!.facts).toContain("British rock band formed in 1985")
      expect(facts!.facts).toContain("From Oxford, England")
      expect(facts!.facts).toContain("Known for experimental rock")
      expect(facts!.sources).toHaveLength(3)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("deduplicates identical facts", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      yield* session.addEntityFact(
        "mbid-radiohead",
        "Radiohead",
        "band",
        "British rock band",
        "source-1"
      )

      yield* session.addEntityFact(
        "mbid-radiohead",
        "Radiohead",
        "band",
        "British rock band", // Same fact
        "source-2"
      )

      const facts = yield* session.getEntityFacts("mbid-radiohead")

      expect(facts!.facts).toHaveLength(1)
      expect(facts!.sources).toHaveLength(2) // Different sources
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("returns undefined for unknown entities", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      const facts = yield* session.getEntityFacts("unknown-mbid")

      expect(facts).toBeUndefined()
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("gets all entities", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      yield* session.addEntityFact("mbid-1", "Artist 1", "artist", "Fact 1", "source")
      yield* session.addEntityFact("mbid-2", "Artist 2", "artist", "Fact 2", "source")
      yield* session.addEntityFact("mbid-3", "Label 1", "label", "Fact 3", "source")

      const all = yield* session.getAllEntities()

      expect(all).toHaveLength(3)
      const mbids = all.map(e => e.mbid)
      expect(mbids).toContain("mbid-1")
      expect(mbids).toContain("mbid-2")
      expect(mbids).toContain("mbid-3")
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// Session Export/Import Tests
// =============================================================================

describe("Session Export/Import", () => {
  it.effect("exports full session state", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      // Set up some state
      yield* session.setMode("discover")
      yield* session.addPlayId(123)
      yield* session.addPlayId(456)

      yield* session.logToolCall({
        toolName: "search_plays",
        params: { artist: "Test" },
        resultSummary: "3 results",
        durationMs: 100,
        iteration: 1,
      })

      yield* session.logResearchStep({
        step: "search",
        description: "Test search",
        findings: ["Found something"],
        entityMbids: [],
      })

      yield* session.addEntityFact("mbid-test", "Test Artist", "artist", "A fact", "source")

      const exported = yield* session.exportSession()

      expect(exported.mode).toBe("discover")
      expect(exported.playIds).toEqual([123, 456])
      expect(exported.toolCalls).toHaveLength(1)
      expect(exported.researchSteps).toHaveLength(1)
      expect(exported.entities).toHaveLength(1)
      expect(exported.sessionId).toMatch(/^session_/)
      expect(exported.startedAt).toBeGreaterThan(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("imports session state", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      const importData: SessionExport = {
        sessionId: "imported_session_123",
        mode: "discover",
        startedAt: Date.now() - 10000,
        playIds: [789, 101],
        insights: [],
        toolCalls: [
          {
            id: "tc_imported",
            toolName: "imported_tool",
            params: {},
            resultSummary: "imported result",
            durationMs: 50,
            timestamp: Date.now(),
            iteration: 1,
          },
        ],
        researchSteps: [
          {
            id: "rs_imported",
            step: "graph",
            description: "Imported step",
            findings: ["Imported finding"],
            entityMbids: ["imported-mbid"],
            timestamp: Date.now(),
          },
        ],
        entities: [
          {
            mbid: "imported-mbid",
            name: "Imported Entity",
            type: "artist",
            facts: ["Imported fact"],
            sources: ["import"],
            discoveredAt: Date.now(),
          },
        ],
      }

      yield* session.importSession(importData)

      const sessionId = yield* session.getSessionId()
      const mode = yield* session.getMode()
      const playIds = yield* session.getPlayIds()
      const toolCalls = yield* session.getToolCalls()
      const steps = yield* session.getResearchSteps()
      const entities = yield* session.getAllEntities()

      expect(sessionId).toBe("imported_session_123")
      expect(mode).toBe("discover")
      expect(playIds).toEqual([789, 101])
      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0].toolName).toBe("imported_tool")
      expect(steps).toHaveLength(1)
      expect(steps[0].step).toBe("graph")
      expect(entities).toHaveLength(1)
      expect(entities[0].name).toBe("Imported Entity")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("round-trips session state correctly", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      // Set up state
      yield* session.setMode("discover")
      yield* session.addPlayId(100)
      yield* session.logToolCall({
        toolName: "test_tool",
        params: { key: "value" },
        resultSummary: "ok",
        durationMs: 100,
        iteration: 1,
      })
      yield* session.addEntityFact("mbid-1", "Entity", "artist", "Fact", "source")

      // Export
      const exported = yield* session.exportSession()

      // Reset
      yield* session.reset()

      // Verify reset
      const afterReset = yield* session.getMode()
      expect(afterReset).toBe("enrich") // Default

      // Import
      yield* session.importSession(exported)

      // Verify restoration
      const restoredMode = yield* session.getMode()
      const restoredCalls = yield* session.getToolCalls()
      const restoredEntities = yield* session.getAllEntities()

      expect(restoredMode).toBe("discover")
      expect(restoredCalls).toHaveLength(1)
      expect(restoredEntities).toHaveLength(1)
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// Session Metadata Tests
// =============================================================================

describe("Session Metadata", () => {
  it.effect("sets and gets mode", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      const initial = yield* session.getMode()
      expect(initial).toBe("enrich")

      yield* session.setMode("discover")

      const updated = yield* session.getMode()
      expect(updated).toBe("discover")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("tracks play IDs without duplicates", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      yield* session.addPlayId(123)
      yield* session.addPlayId(456)
      yield* session.addPlayId(123) // Duplicate

      const playIds = yield* session.getPlayIds()

      expect(playIds).toEqual([123, 456])
    }).pipe(Effect.provide(TestLayer))
  )
})

// =============================================================================
// Clear and Reset Tests
// =============================================================================

describe("Clear and Reset", () => {
  it.effect("clear removes all logged data but preserves session ID", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      const originalId = yield* session.getSessionId()

      yield* session.logToolCall({
        toolName: "test",
        params: {},
        resultSummary: "ok",
        durationMs: 100,
        iteration: 1,
      })
      yield* session.logResearchStep({
        step: "search",
        description: "test",
        findings: [],
        entityMbids: [],
      })
      yield* session.addEntityFact("mbid", "name", "artist", "fact", "source")

      yield* session.clear()

      const afterClear = yield* session.getSessionId()
      const toolCalls = yield* session.getToolCalls()
      const steps = yield* session.getResearchSteps()
      const entities = yield* session.getAllEntities()

      expect(afterClear).toBe(originalId)
      expect(toolCalls).toHaveLength(0)
      expect(steps).toHaveLength(0)
      expect(entities).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("reset creates new session with new ID", () =>
    Effect.gen(function* () {
      const session = yield* InsightSessionService

      const originalId = yield* session.getSessionId()

      yield* session.setMode("discover")
      yield* session.addPlayId(123)

      yield* session.reset()

      const newId = yield* session.getSessionId()
      const mode = yield* session.getMode()
      const playIds = yield* session.getPlayIds()

      expect(newId).not.toBe(originalId)
      expect(mode).toBe("enrich")
      expect(playIds).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer))
  )
})
