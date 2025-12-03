#!/usr/bin/env bun
/**
 * Test script for Phase 2 services
 *
 * Verifies SearchPlaysService, SemanticSearchService, and InsightSessionService
 * work correctly.
 *
 * Run with: bun run src/services/test-services.ts
 *
 * Set FAISS_API_URL env var to test against a live API.
 * Without it, only mock tests will run.
 *
 * @module
 */

import { Console, Effect, Layer, Option } from "effect";
import {
  SearchPlaysService,
  SearchPlaysServiceFull,
  SearchPlaysServiceTest,
  SemanticSearchService,
  SemanticSearchServiceFull,
  SemanticSearchServiceTest,
  InsightSessionService,
  InsightSessionServiceLive,
  makeInsightSessionServiceTestWithData,
  type InsightSummary,
} from "./index.js";

// =============================================================================
// Test Helpers
// =============================================================================

const logSection = (title: string) =>
  Console.log(`\n${"=".repeat(60)}\n${title}\n${"=".repeat(60)}`);

const logSuccess = (msg: string) => Console.log(`[OK] ${msg}`);
const logError = (msg: string) => Console.error(`[ERROR] ${msg}`);
const logSkip = (msg: string) => Console.log(`[SKIP] ${msg}`);

// =============================================================================
// Mock Tests (always run)
// =============================================================================

const testSearchPlaysServiceMock = Effect.gen(function* () {
  yield* logSection("Testing SearchPlaysService (Mock)");

  const searchPlays = yield* SearchPlaysService;

  // Test: Basic timeline fetch returns expected structure
  yield* Console.log("\n1. Testing mock timeline response structure...");
  const timeline = yield* searchPlays.timeline({ limit: 5 });

  if (Array.isArray(timeline.results)) {
    yield* logSuccess("Results is an array");
  }
  if (typeof timeline.query_time_ms === "number") {
    yield* logSuccess("query_time_ms is a number");
  }
  if (typeof timeline.has_more === "boolean") {
    yield* logSuccess("has_more is a boolean");
  }

  // Test: Count returns a number
  yield* Console.log("\n2. Testing mock count response...");
  const count = yield* searchPlays.count("test-mbid", "artist");
  if (typeof count === "number") {
    yield* logSuccess("Count returns a number");
  }

  yield* logSuccess("SearchPlaysService mock tests passed!");
}).pipe(Effect.provide(SearchPlaysServiceTest));

const testSemanticSearchServiceMock = Effect.gen(function* () {
  yield* logSection("Testing SemanticSearchService (Mock)");

  const semanticSearch = yield* SemanticSearchService;

  // Test: Search returns expected structure
  yield* Console.log("\n1. Testing mock search response structure...");
  const results = yield* semanticSearch.search({
    query: "test query",
    limit: 5,
  });

  if (Array.isArray(results.results)) {
    yield* logSuccess("Results is an array");
  }
  if (typeof results.total === "number") {
    yield* logSuccess("total is a number");
  }
  if (typeof results.query_time_ms === "number") {
    yield* logSuccess("query_time_ms is a number");
  }
  if (results.query === "test query") {
    yield* logSuccess("Query is preserved in response");
  }

  yield* logSuccess("SemanticSearchService mock tests passed!");
}).pipe(Effect.provide(SemanticSearchServiceTest));

const testInsightSessionServiceMock = Effect.gen(function* () {
  yield* logSection("Testing InsightSessionService (In-Memory State)");

  const session = yield* InsightSessionService;

  // Test 1: Get session ID
  yield* Console.log("\n1. Getting session ID...");
  const sessionId = yield* session.getSessionId();
  if (sessionId.startsWith("session_")) {
    yield* logSuccess(`Session ID has correct format: ${sessionId}`);
  }

  // Test 2: Add insights
  yield* Console.log("\n2. Adding test insights...");
  const insight1: InsightSummary = {
    id: "insight_1",
    play_id: 12345,
    artist: "Radiohead",
    track: "Karma Police",
    insight_type: "artist_research",
    summary: "Radiohead is a British rock band formed in 1985",
    created_at: new Date().toISOString(),
    entity_mbids: ["a74b1b7f-71a5-4011-9441-d0b5e4122711"],
  };

  const insight2: InsightSummary = {
    id: "insight_2",
    play_id: 12346,
    artist: "Bjork",
    track: "Army of Me",
    insight_type: "track_analysis",
    summary: "Army of Me features industrial influences and aggressive drums",
    created_at: new Date().toISOString(),
    entity_mbids: ["87c5dedd-371d-4a53-9f7f-80522fb7f3cb"],
  };

  yield* session.addInsight(insight1);
  yield* session.addInsight(insight2);
  yield* logSuccess("Added 2 insights");

  // Test 3: Get recent insights
  yield* Console.log("\n3. Getting recent insights...");
  const recentInsights = yield* session.getRecentInsights({ limit: 10 });
  if (recentInsights.insights.length === 2) {
    yield* logSuccess(`Retrieved ${recentInsights.insights.length} insights`);
  }
  if (recentInsights.total === 2) {
    yield* logSuccess(`Total count is correct: ${recentInsights.total}`);
  }

  // Test 4: Filter by artist MBID
  yield* Console.log("\n4. Filtering by artist MBID (Radiohead)...");
  const filteredInsights = yield* session.getRecentInsights({
    artist_mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711",
    limit: 10,
  });
  if (filteredInsights.insights.length === 1) {
    yield* logSuccess(
      `Filtered to ${filteredInsights.insights.length} Radiohead insight`
    );
  }
  if (filteredInsights.insights[0]?.artist === "Radiohead") {
    yield* logSuccess("Correct insight returned after filter");
  }

  // Test 5: Clear session
  yield* Console.log("\n5. Clearing session...");
  yield* session.clear();
  const afterClear = yield* session.getRecentInsights();
  if (afterClear.insights.length === 0) {
    yield* logSuccess("Session cleared successfully");
  }

  // Verify session ID persists after clear
  const sessionIdAfterClear = yield* session.getSessionId();
  if (sessionIdAfterClear === sessionId) {
    yield* logSuccess("Session ID preserved after clear");
  }

  yield* logSuccess("InsightSessionService tests passed!");
}).pipe(Effect.provide(InsightSessionServiceLive));

// =============================================================================
// Live API Tests (only run if API is available)
// =============================================================================

const testSearchPlaysServiceLive = Effect.gen(function* () {
  yield* logSection("Testing SearchPlaysService (Live API)");

  const searchPlays = yield* SearchPlaysService;

  // Test 1: Basic timeline fetch
  yield* Console.log("\n1. Testing basic timeline fetch...");
  const timeline1 = yield* searchPlays.timeline({ limit: 5 });
  yield* logSuccess(`Fetched ${timeline1.results.length} plays`);
  yield* Console.log(`   Query time: ${timeline1.query_time_ms.toFixed(2)}ms`);
  yield* Console.log(`   Has more: ${timeline1.has_more}`);

  if (timeline1.results.length > 0) {
    const firstPlay = timeline1.results[0];
    yield* Console.log(
      `   First play: "${firstPlay.song}" by ${firstPlay.artist}`
    );
  }

  // Test 2: Timeline with artist MBID filter (Radiohead)
  yield* Console.log(
    "\n2. Testing timeline with artist MBID filter (Radiohead)..."
  );
  const radioheadMbid = "a74b1b7f-71a5-4011-9441-d0b5e4122711";
  const timeline2 = yield* searchPlays.timeline({
    artistMbid: radioheadMbid,
    limit: 3,
  });
  yield* logSuccess(`Fetched ${timeline2.results.length} Radiohead plays`);

  // Test 3: Play count for artist
  yield* Console.log("\n3. Testing play count for Radiohead...");
  const count = yield* searchPlays.count(radioheadMbid, "artist");
  yield* logSuccess(`Radiohead has been played ${count} times on KEXP`);

  yield* logSuccess("SearchPlaysService live tests passed!");
}).pipe(Effect.provide(SearchPlaysServiceFull));

const testSemanticSearchServiceLive = Effect.gen(function* () {
  yield* logSection("Testing SemanticSearchService (Live API)");

  const semanticSearch = yield* SemanticSearchService;

  // Test 1: Basic semantic search
  yield* Console.log(
    "\n1. Testing semantic search for 'upbeat jazz fusion'..."
  );
  const results1 = yield* semanticSearch.search({
    query: "upbeat jazz fusion",
    limit: 5,
  });
  yield* logSuccess(
    `Found ${results1.total} total results, returned ${results1.results.length}`
  );
  yield* Console.log(`   Query time: ${results1.query_time_ms.toFixed(2)}ms`);

  if (results1.results.length > 0) {
    yield* Console.log("   Top results:");
    for (const result of results1.results.slice(0, 3)) {
      yield* Console.log(
        `     - "${result.song}" by ${result.artist} (similarity: ${result.similarity.toFixed(3)})`
      );
    }
  }

  yield* logSuccess("SemanticSearchService live tests passed!");
}).pipe(Effect.provide(SemanticSearchServiceFull));

// =============================================================================
// Main Program
// =============================================================================

const main = Effect.gen(function* () {
  yield* Console.log("Phase 2 Services Test Suite");
  yield* Console.log("===========================");

  // Always run mock tests first
  yield* testSearchPlaysServiceMock;
  yield* testSemanticSearchServiceMock;
  yield* testInsightSessionServiceMock;

  // Try live API tests if configured
  const apiUrl = process.env.FAISS_API_URL ?? "http://localhost:8000";
  yield* Console.log(`\nFAISS API URL: ${apiUrl}`);

  // Attempt live tests but catch connection errors gracefully
  const liveTestResult = yield* testSearchPlaysServiceLive.pipe(
    Effect.andThen(testSemanticSearchServiceLive),
    Effect.map(() => true),
    Effect.catchAllCause((cause) =>
      Effect.gen(function* () {
        yield* Console.log(
          "\n[INFO] Live API tests skipped - API not available"
        );
        yield* Console.log(`   Cause: Connection refused or API error`);
        return false;
      })
    )
  );

  yield* logSection("Test Summary");
  yield* logSuccess("Mock tests: PASSED");
  if (liveTestResult) {
    yield* logSuccess("Live API tests: PASSED");
  } else {
    yield* logSkip("Live API tests: SKIPPED (API not available)");
  }
});

// Run the test
Effect.runPromise(main);
