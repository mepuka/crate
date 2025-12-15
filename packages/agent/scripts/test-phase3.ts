/**
 * Phase 3 Test Script
 *
 * Verifies the MbidResolverService and LinkFetcherService work correctly.
 * Run with: bun run src/services/test-phase3.ts
 *
 * Tests both mock (Test layers) and live API calls.
 * Set environment variables for live tests:
 * - MUSICBRAINZ_USER_AGENT: e.g., "Crate/1.0 (your@email.com)"
 * - JINA_API_KEY: Your Jina AI Reader API key (optional)
 */

import { Effect, Console } from "effect"
import {
  MbidResolverService,
  MbidResolverServiceTest,
  MbidResolverServiceFull,
  LinkFetcherService,
  LinkFetcherServiceTest,
  LinkFetcherServiceFull
} from "./index.js"

// =============================================================================
// Test with Mock Layers
// =============================================================================

const testMockMbidResolver = Effect.gen(function* () {
  yield* Console.log("--- Testing MbidResolverService (Mock) ---")

  const resolver = yield* MbidResolverService

  // Test resolve
  const searchResult = yield* resolver.resolve({
    query: "Radiohead",
    entity_type: "artist"
  })
  yield* Console.log(`Mock search results: ${searchResult.results.length} result(s)`)
  yield* Console.log(`  First result: ${searchResult.results[0]?.name} (${searchResult.results[0]?.mbid})`)

  // Test lookup
  const lookupResult = yield* resolver.lookup(
    "a74b1b7f-71a5-4011-9441-d0b5e4122711",
    "artist"
  )
  yield* Console.log(`Mock lookup result: ${lookupResult.name} (${lookupResult.type})`)
}).pipe(Effect.provide(MbidResolverServiceTest))

const testMockLinkFetcher = Effect.gen(function* () {
  yield* Console.log("\n--- Testing LinkFetcherService (Mock) ---")

  const fetcher = yield* LinkFetcherService

  // Test fetch
  const fetchResult = yield* fetcher.fetch({
    url: "https://example.com/article",
    extract_links: true
  })
  yield* Console.log(`Mock fetch result:`)
  yield* Console.log(`  Title: ${fetchResult.title}`)
  yield* Console.log(`  Word count: ${fetchResult.word_count}`)
  yield* Console.log(`  Links found: ${fetchResult.links.length}`)

  // Test MBID extraction
  const testMarkdown = `
Check out [this artist](https://musicbrainz.org/artist/a74b1b7f-71a5-4011-9441-d0b5e4122711)
and their [album](https://musicbrainz.org/release/c1234567-89ab-cdef-0123-456789abcdef).
`
  const mbids = yield* fetcher.extractMbids(testMarkdown)
  yield* Console.log(`Extracted MBIDs: ${mbids.length}`)
  for (const mbid of mbids) {
    yield* Console.log(`  - ${mbid}`)
  }
}).pipe(Effect.provide(LinkFetcherServiceTest))

// =============================================================================
// Test with Live APIs (requires network)
// =============================================================================

const testLiveMbidResolver = Effect.gen(function* () {
  yield* Console.log("\n--- Testing MbidResolverService (Live API) ---")
  yield* Console.log("Note: This makes real API calls to MusicBrainz")

  const resolver = yield* MbidResolverService

  // Test search for a well-known artist
  yield* Console.log("\nSearching for 'Radiohead'...")
  const searchResult = yield* resolver.resolve({
    query: "Radiohead",
    entity_type: "artist"
  })
  yield* Console.log(`Found ${searchResult.results.length} result(s)`)
  for (const result of searchResult.results.slice(0, 3)) {
    yield* Console.log(`  - ${result.name} (score: ${result.score})`)
    yield* Console.log(`    MBID: ${result.mbid}`)
    if (result.disambiguation) {
      yield* Console.log(`    Disambiguation: ${result.disambiguation}`)
    }
  }

  // Test lookup for Radiohead's actual MBID
  yield* Console.log("\nLooking up Radiohead by MBID...")
  const lookupResult = yield* resolver.lookup(
    "a74b1b7f-71a5-4011-9441-d0b5e4122711",
    "artist"
  )
  yield* Console.log(`Lookup result:`)
  yield* Console.log(`  Name: ${lookupResult.name}`)
  yield* Console.log(`  Type: ${lookupResult.type}`)
  yield* Console.log(`  Country: ${lookupResult.country ?? "N/A"}`)
  if (lookupResult.disambiguation) {
    yield* Console.log(`  Disambiguation: ${lookupResult.disambiguation}`)
  }

  // Test recording search with artist hint
  yield* Console.log("\nSearching for recording 'Creep' by 'Radiohead'...")
  const recordingResult = yield* resolver.resolve({
    query: "Creep",
    entity_type: "recording",
    artist_hint: "Radiohead"
  })
  yield* Console.log(`Found ${recordingResult.results.length} recording(s)`)
  for (const result of recordingResult.results.slice(0, 3)) {
    yield* Console.log(`  - ${result.name}`)
    yield* Console.log(`    MBID: ${result.mbid}`)
    if (result.artist_credit) {
      yield* Console.log(`    Artist: ${result.artist_credit}`)
    }
  }
}).pipe(Effect.provide(MbidResolverServiceFull))

const testLiveLinkFetcher = Effect.gen(function* () {
  yield* Console.log("\n--- Testing LinkFetcherService (Live API) ---")
  yield* Console.log("Note: This makes real API calls to Jina AI Reader")

  const fetcher = yield* LinkFetcherService

  // Test fetching a Wikipedia page (usually works well)
  const testUrl = "https://en.wikipedia.org/wiki/Radiohead"
  yield* Console.log(`\nFetching: ${testUrl}`)

  const fetchResult = yield* fetcher.fetch({
    url: testUrl,
    extract_links: true
  })

  yield* Console.log(`Fetch result:`)
  yield* Console.log(`  Title: ${fetchResult.title}`)
  yield* Console.log(`  Word count: ${fetchResult.word_count}`)
  yield* Console.log(`  Content preview: ${fetchResult.content.slice(0, 200)}...`)
  yield* Console.log(`  Links found: ${fetchResult.links.length}`)

  // Show first few links
  for (const link of fetchResult.links.slice(0, 5)) {
    yield* Console.log(`    - [${link.text}](${link.url})${link.type ? ` (${link.type})` : ""}`)
  }

  // Extract MBIDs from the content
  const mbids = yield* fetcher.extractMbids(fetchResult.content)
  yield* Console.log(`\nExtracted MBIDs from content: ${mbids.length}`)
  for (const mbid of mbids.slice(0, 5)) {
    yield* Console.log(`  - ${mbid}`)
  }
}).pipe(Effect.provide(LinkFetcherServiceFull))

// =============================================================================
// Main
// =============================================================================

const runMockTests = Effect.gen(function* () {
  yield* Console.log("=== Phase 3 Test: MbidResolverService & LinkFetcherService ===\n")
  yield* Console.log("Running mock tests (no network required)...\n")
  yield* testMockMbidResolver
  yield* testMockLinkFetcher
  yield* Console.log("\n=== Mock tests passed! ===")
})

const runLiveTests = Effect.gen(function* () {
  yield* Console.log("\n\n=== Running Live API Tests ===")
  yield* Console.log("(Set --live flag to run these tests)\n")
  yield* testLiveMbidResolver
  yield* testLiveLinkFetcher
  yield* Console.log("\n=== Live tests passed! ===")
})

// Check for --live flag
const isLiveMode = process.argv.includes("--live")

const main = Effect.gen(function* () {
  yield* runMockTests

  if (isLiveMode) {
    yield* runLiveTests
  } else {
    yield* Console.log("\n\nTo run live API tests, use: bun run src/services/test-phase3.ts --live")
  }
})

Effect.runPromise(main).catch(console.error)
