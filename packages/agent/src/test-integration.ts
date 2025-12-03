/**
 * Integration Test for Crate Research Agent
 *
 * Tests all tools against the live FAISS API.
 * Requires FAISS API to be running at FAISS_API_URL.
 *
 * Run with:
 * ```bash
 * FAISS_API_URL=http://localhost:8000 bun run src/test-integration.ts
 * ```
 *
 * @module
 */

import { Effect, Console, Duration, ConfigProvider, Layer } from "effect"
import { NodeRuntime } from "@effect/platform-node"

import { CrateToolkit } from "./tools/definitions.js"
import { CrateToolsLive } from "./layers.js"

// =============================================================================
// Test Configuration
// =============================================================================

const TEST_CONFIG = {
  // Known artist for testing
  artistName: "Radiohead",
  artistMbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711",

  // Semantic search query
  semanticQuery: "atmospheric electronic ambient",

  // URL for link fetcher test
  testUrl: "https://en.wikipedia.org/wiki/Radiohead"
} as const

// =============================================================================
// Test Cases
// =============================================================================

/**
 * Test search_plays tool
 */
const testSearchPlays = Effect.gen(function* () {
  yield* Console.log("\n--- Testing search_plays ---")

  const toolkit = yield* CrateToolkit

  // Test basic search
  const result = yield* toolkit.handle("search_plays", {
    limit: 5
  })

  yield* Console.log(`Results: ${result.encodedResult.total} plays found`)
  yield* Console.log(`Query time: ${result.encodedResult.query_time_ms}ms`)

  if (result.encodedResult.results.length > 0) {
    const first = result.encodedResult.results[0]
    yield* Console.log(`First play: ${first.artist} - ${first.song}`)
  }

  return result.encodedResult.total > 0
})

/**
 * Test semantic_search tool
 */
const testSemanticSearch = Effect.gen(function* () {
  yield* Console.log("\n--- Testing semantic_search ---")

  const toolkit = yield* CrateToolkit

  const result = yield* toolkit.handle("semantic_search", {
    query: TEST_CONFIG.semanticQuery,
    limit: 5
  })

  yield* Console.log(`Query: "${TEST_CONFIG.semanticQuery}"`)
  yield* Console.log(`Results: ${result.encodedResult.total} matches`)
  yield* Console.log(`Query time: ${result.encodedResult.query_time_ms}ms`)

  if (result.encodedResult.results.length > 0) {
    const first = result.encodedResult.results[0]
    yield* Console.log(`Top match: ${first.artist} - ${first.song} (score: ${first.similarity.toFixed(3)})`)
  }

  return result.encodedResult.total > 0
})

/**
 * Test resolve_mbid tool
 */
const testResolveMbid = Effect.gen(function* () {
  yield* Console.log("\n--- Testing resolve_mbid ---")

  const toolkit = yield* CrateToolkit

  const result = yield* toolkit.handle("resolve_mbid", {
    query: TEST_CONFIG.artistName,
    entity_type: "artist"
  })

  yield* Console.log(`Query: "${TEST_CONFIG.artistName}"`)
  yield* Console.log(`Results: ${result.encodedResult.results.length} matches`)

  if (result.encodedResult.results.length > 0) {
    const first = result.encodedResult.results[0]
    yield* Console.log(`Top match: ${first.name} (score: ${first.score})`)
    yield* Console.log(`MBID: ${first.mbid}`)
  }

  return result.encodedResult.results.length > 0
})

/**
 * Test fetch_link tool
 */
const testFetchLink = Effect.gen(function* () {
  yield* Console.log("\n--- Testing fetch_link ---")

  const toolkit = yield* CrateToolkit

  const result = yield* toolkit.handle("fetch_link", {
    url: TEST_CONFIG.testUrl,
    extract_links: true
  })

  yield* Console.log(`URL: ${TEST_CONFIG.testUrl}`)
  yield* Console.log(`Title: ${result.encodedResult.title}`)
  yield* Console.log(`Word count: ${result.encodedResult.word_count}`)
  yield* Console.log(`Links extracted: ${result.encodedResult.links.length}`)

  // Check for any MusicBrainz links
  const mbLinks = result.encodedResult.links.filter(
    (l: { type?: string }) => l.type === "musicbrainz"
  )
  if (mbLinks.length > 0) {
    yield* Console.log(`MusicBrainz links found: ${mbLinks.length}`)
  }

  return result.encodedResult.word_count > 0
})

/**
 * Test get_recent_insights tool
 */
const testGetRecentInsights = Effect.gen(function* () {
  yield* Console.log("\n--- Testing get_recent_insights ---")

  const toolkit = yield* CrateToolkit

  // This should return empty for a fresh session
  const result = yield* toolkit.handle("get_recent_insights", {
    limit: 10
  })

  yield* Console.log(`Session: ${result.encodedResult.session_id}`)
  yield* Console.log(`Insights: ${result.encodedResult.total}`)

  // Empty session is expected for fresh test
  return true
})

// =============================================================================
// Test Runner
// =============================================================================

/**
 * Run all integration tests
 */
const runIntegrationTests = Effect.gen(function* () {
  yield* Console.log("===========================================")
  yield* Console.log("Crate Research Agent - Integration Tests")
  yield* Console.log("===========================================")

  const startTime = Date.now()
  const results: Array<{ name: string; passed: boolean; error?: string }> = []

  // Test 1: search_plays
  const searchPlaysResult = yield* testSearchPlays.pipe(
    Effect.map((passed) => ({ name: "search_plays", passed })),
    Effect.catchAll((error) =>
      Effect.succeed({
        name: "search_plays",
        passed: false,
        error: String(error)
      })
    )
  )
  results.push(searchPlaysResult)

  // Test 2: semantic_search
  const semanticResult = yield* testSemanticSearch.pipe(
    Effect.map((passed) => ({ name: "semantic_search", passed })),
    Effect.catchAll((error) =>
      Effect.succeed({
        name: "semantic_search",
        passed: false,
        error: String(error)
      })
    )
  )
  results.push(semanticResult)

  // Test 3: resolve_mbid (with delay for rate limiting)
  yield* Effect.sleep(Duration.seconds(1.5))
  const mbidResult = yield* testResolveMbid.pipe(
    Effect.map((passed) => ({ name: "resolve_mbid", passed })),
    Effect.catchAll((error) =>
      Effect.succeed({
        name: "resolve_mbid",
        passed: false,
        error: String(error)
      })
    )
  )
  results.push(mbidResult)

  // Test 4: fetch_link (with delay)
  yield* Effect.sleep(Duration.seconds(1))
  const linkResult = yield* testFetchLink.pipe(
    Effect.map((passed) => ({ name: "fetch_link", passed })),
    Effect.catchAll((error) =>
      Effect.succeed({
        name: "fetch_link",
        passed: false,
        error: String(error)
      })
    )
  )
  results.push(linkResult)

  // Test 5: get_recent_insights
  const insightsResult = yield* testGetRecentInsights.pipe(
    Effect.map((passed) => ({ name: "get_recent_insights", passed })),
    Effect.catchAll((error) =>
      Effect.succeed({
        name: "get_recent_insights",
        passed: false,
        error: String(error)
      })
    )
  )
  results.push(insightsResult)

  // Summary
  const elapsed = Date.now() - startTime
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  yield* Console.log("\n===========================================")
  yield* Console.log("Test Results")
  yield* Console.log("===========================================")

  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL"
    const icon = result.passed ? "[OK]" : "[X]"
    yield* Console.log(`${icon} ${result.name}: ${status}`)
    if (result.error) {
      yield* Console.log(`    Error: ${result.error}`)
    }
  }

  yield* Console.log("\n-------------------------------------------")
  yield* Console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`)
  yield* Console.log(`Duration: ${elapsed}ms`)
  yield* Console.log("===========================================\n")

  if (failed > 0) {
    yield* Effect.fail(new Error(`${failed} test(s) failed`))
  }
})

// =============================================================================
// Main
// =============================================================================

/**
 * Main entry point
 */
const main = runIntegrationTests.pipe(
  Effect.provide(CrateToolsLive),
  Effect.provide(Layer.setConfigProvider(ConfigProvider.fromEnv()))
)

// Run
main.pipe(NodeRuntime.runMain)
