/**
 * Test Script for Tool Handlers
 *
 * Verifies that tool handlers work correctly with mock services.
 * Run with: bun src/tools/test-handlers.ts
 *
 * @module
 */

import { Effect, Console } from "effect"
import {
  makeSearchPlaysHandler,
  makeSemanticSearchHandler,
  makeResolveMbidHandler,
  makeFetchLinkHandler,
  makeGetRecentInsightsHandler
} from "./handlers.js"
import type {
  SearchPlaysServiceInterface,
  SemanticSearchServiceInterface,
  InsightSessionServiceInterface,
  MbidResolverServiceInterface,
  LinkFetcherServiceInterface
} from "../services/index.js"

// =============================================================================
// Mock Services
// =============================================================================

const mockSearchPlaysService: SearchPlaysServiceInterface = {
  timeline: () => Effect.succeed({
    results: [],
    next_cursor: null,
    has_more: false,
    query_time_ms: 10,
    total_count: 0,
    anchor_position: null
  }),
  count: () => Effect.succeed(0)
}

const mockSemanticSearchService: SemanticSearchServiceInterface = {
  search: (params) => Effect.succeed({
    results: [],
    total: 0,
    query_time_ms: 5,
    query: params.query
  })
}

const mockMbidResolverService: MbidResolverServiceInterface = {
  resolve: (params) => Effect.succeed({
    results: [{
      mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711",
      name: params.query,
      type: params.entity_type,
      score: 100,
      disambiguation: "Mock result"
    }],
    query: params.query,
    entity_type: params.entity_type
  }),
  lookup: (mbid, entityType) => Effect.succeed({
    mbid,
    name: "Mock Entity",
    type: entityType,
    disambiguation: undefined,
    country: undefined,
    area: undefined,
    sortName: undefined,
    beginDate: undefined,
    endDate: undefined,
    artistCredit: undefined,
    firstReleaseDate: undefined
  })
}

const mockLinkFetcherService: LinkFetcherServiceInterface = {
  fetch: (params) => Effect.succeed({
    url: params.url,
    title: "Mock Page",
    content: "# Mock Content\n\nThis is mock content.",
    word_count: 5,
    links: params.extract_links ? [
      { url: "https://example.com", text: "Example", type: undefined }
    ] : []
  }),
  extractMbids: () => Effect.succeed([])
}

const mockInsightSessionService: InsightSessionServiceInterface = {
  addInsight: () => Effect.void,
  getRecentInsights: () => Effect.succeed({
    insights: [],
    total: 0,
    sessionId: "test_session_123"
  }),
  clear: () => Effect.void,
  getSessionId: () => Effect.succeed("test_session_123")
}

// =============================================================================
// Test Program
// =============================================================================

const testProgram = Effect.gen(function* () {
  yield* Console.log("=== Testing Individual Tool Handlers ===\n")

  // Create handlers from mock services
  const searchPlaysHandler = makeSearchPlaysHandler(mockSearchPlaysService)
  const semanticSearchHandler = makeSemanticSearchHandler(mockSemanticSearchService)
  const resolveMbidHandler = makeResolveMbidHandler(mockMbidResolverService)
  const fetchLinkHandler = makeFetchLinkHandler(mockLinkFetcherService)
  const getRecentInsightsHandler = makeGetRecentInsightsHandler(mockInsightSessionService)

  // Test 1: search_plays
  yield* Console.log("Test 1: search_plays handler")
  const searchResult = yield* searchPlaysHandler({
    query: "jazz",
    limit: 10
  })
  yield* Console.log(`  Query: ${searchResult.query}`)
  yield* Console.log(`  Total results: ${searchResult.total}`)
  yield* Console.log(`  Query time: ${searchResult.query_time_ms}ms`)
  yield* Console.log("")

  // Test 2: semantic_search
  yield* Console.log("Test 2: semantic_search handler")
  const semanticResult = yield* semanticSearchHandler({
    query: "upbeat electronic music",
    limit: 5
  })
  yield* Console.log(`  Query: ${semanticResult.query}`)
  yield* Console.log(`  Total results: ${semanticResult.total}`)
  yield* Console.log(`  Query time: ${semanticResult.query_time_ms}ms`)
  yield* Console.log("")

  // Test 3: resolve_mbid
  yield* Console.log("Test 3: resolve_mbid handler")
  const mbidResult = yield* resolveMbidHandler({
    query: "Radiohead",
    entity_type: "artist"
  })
  yield* Console.log(`  Query: ${mbidResult.query}`)
  yield* Console.log(`  Entity type: ${mbidResult.entity_type}`)
  yield* Console.log(`  Found ${mbidResult.results.length} results`)
  if (mbidResult.results.length > 0) {
    yield* Console.log(`  First result: ${mbidResult.results[0].name} (${mbidResult.results[0].mbid})`)
  }
  yield* Console.log("")

  // Test 4: fetch_link
  yield* Console.log("Test 4: fetch_link handler")
  const linkResult = yield* fetchLinkHandler({
    url: "https://en.wikipedia.org/wiki/Radiohead",
    extract_links: true
  })
  yield* Console.log(`  URL: ${linkResult.url}`)
  yield* Console.log(`  Title: ${linkResult.title}`)
  yield* Console.log(`  Word count: ${linkResult.word_count}`)
  yield* Console.log(`  Links extracted: ${linkResult.links.length}`)
  yield* Console.log("")

  // Test 5: get_recent_insights
  yield* Console.log("Test 5: get_recent_insights handler")
  const insightsResult = yield* getRecentInsightsHandler({
    limit: 5
  })
  yield* Console.log(`  Total insights: ${insightsResult.total}`)
  yield* Console.log(`  Session ID: ${insightsResult.session_id}`)
  yield* Console.log("")

  yield* Console.log("=== All handler tests completed successfully ===")
})

// =============================================================================
// Run Tests
// =============================================================================

Effect.runPromise(
  testProgram.pipe(
    Effect.catchAll((error) =>
      Console.error(`Test failed: ${JSON.stringify(error, null, 2)}`)
    )
  )
).catch(console.error)
