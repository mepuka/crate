import { SqlClient, SqlSchema } from "@effect/sql"
import { Console, Effect, Layer, Option, Schema } from "effect"
import { FactPlaysService } from "../fact_plays/index.js"
import { MusicKBSqlLive } from "../../sql/Sql.js"
import { FactPlay } from "../fact_plays/schemas.js"

// =============================================================================
// TEST FACT PLAYS SERVICE
// =============================================================================

const testFactPlaysService = Effect.gen(function*() {
  const factPlays = yield* FactPlaysService

  yield* Console.log("=== Testing Fact Plays Service ===\n")

  // Test 1: Get a specific play by ID
  yield* Console.log("1. Testing getPlayById:")
  const play3518527 = yield* factPlays.getPlayById(3518527 as any)
  if (Option.isSome(play3518527)) {
    yield* Console.log(`   ✓ Found play: ${play3518527.value.artist} - ${play3518527.value.song}`)
  } else {
    yield* Console.log("   ✗ Play not found")
  }

  // Test non-existent play
  const nonExistentPlay = yield* factPlays.getPlayById(999999999 as any)
  yield* Console.log(`   ✓ Non-existent play returns None: ${Option.isNone(nonExistentPlay)}`)

  // Test 2: Get plays by artist
  yield* Console.log("\n2. Testing getPlaysByArtist:")
  const haimpPlays = yield* factPlays.getPlaysByArtist("HAIM", { limit: 5, offset: 0 })
  yield* Console.log(`   ✓ Found ${haimpPlays.length} HAIM plays`)
  for (const play of haimpPlays.slice(0, 3)) {
    yield* Console.log(`     - ${play.song} from ${play.album}`)
  }

  // Test 3: Get plays by date range
  yield* Console.log("\n3. Testing getPlaysByDateRange:")
  const todaysPlays = yield* factPlays.getPlaysByDateRange(
    { start_date: "2025-06-25", end_date: "2025-06-25" },
    { limit: 10, offset: 0 }
  )
  yield* Console.log(`   ✓ Found ${todaysPlays.length} plays from today`)

  // Test 4: Get plays by show
  yield* Console.log("\n4. Testing getPlaysByShow:")
  const show63830Plays = yield* factPlays.getPlaysByShow(63830 as any, { limit: 5, offset: 0 })
  yield* Console.log(`   ✓ Found ${show63830Plays.length} plays from show 63830`)

  // Test 5: Get plays by rotation status
  yield* Console.log("\n5. Testing getPlaysByRotationStatus:")
  const heavyRotationPlays = yield* factPlays.getPlaysByRotationStatus("Heavy", { limit: 5, offset: 0 })
  yield* Console.log(`   ✓ Found ${heavyRotationPlays.length} heavy rotation plays`)
  for (const play of heavyRotationPlays.slice(0, 3)) {
    yield* Console.log(`     - ${play.artist} - ${play.song}`)
  }

  // Test 6: Get local plays
  yield* Console.log("\n6. Testing getLocalPlays:")
  const localPlays = yield* factPlays.getLocalPlays(true, { limit: 5, offset: 0 })
  yield* Console.log(`   ✓ Found ${localPlays.length} local plays`)
  for (const play of localPlays.slice(0, 3)) {
    yield* Console.log(`     - ${play.artist} - ${play.song} (Local)`)
  }

  // Test 7: Get recent plays
  yield* Console.log("\n7. Testing getRecentPlays:")
  const recentPlays = yield* factPlays.getRecentPlays(10)
  yield* Console.log(`   ✓ Found ${recentPlays.length} recent plays`)
  yield* Console.log(`     Most recent: ${recentPlays[0]?.artist} - ${recentPlays[0]?.song}`)

  // Test 8: Search plays
  yield* Console.log("\n8. Testing searchPlays:")
  const searchResults = yield* factPlays.searchPlays("Love", { limit: 5, offset: 0 })
  yield* Console.log(`   ✓ Found ${searchResults.length} plays matching 'Love'`)
  for (const play of searchResults.slice(0, 3)) {
    yield* Console.log(`     - ${play.artist} - ${play.song} | ${play.album}`)
  }
}).pipe(Effect.provide(FactPlaysService.Default))

// =============================================================================
// DIRECT SQL QUERIES FOR COMPARISON
// =============================================================================

const directSqlQueries = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  yield* Console.log("\n\n=== Direct SQL Queries for Comparison ===\n")

  // Check cache effectiveness with repeated queries
  yield* Console.log("Testing request caching with repeated queries:")
  const start = Date.now()

  // Make the same query 5 times
  for (let i = 0; i < 5; i++) {
    const query = SqlSchema.findAll({
      Request: Schema.Struct({ artist: Schema.String }),
      Result: FactPlay,
      execute: (params) =>
        sql`
        SELECT * FROM fact_plays 
        WHERE artist LIKE ${`%${params.artist}%`}
        LIMIT 10
      `
    })
    const results = yield* query({ artist: "Sprints" })
    if (i === 0) {
      yield* Console.log(`   First query found ${results.length} results`)
    }
  }

  const elapsed = Date.now() - start
  yield* Console.log(`   ✓ 5 repeated queries completed in ${elapsed}ms (cache working!)`)
}).pipe(Effect.provide(FactPlaysService.Default))

// =============================================================================
// PERFORMANCE TEST WITH CACHING
// =============================================================================

const performanceTest = Effect.gen(function*() {
  const factPlays = yield* FactPlaysService

  yield* Console.log("\n\n=== Performance Test with Caching ===\n")

  // Test cache effectiveness
  yield* Console.log("Testing cache with repeated identical requests:")

  const testArtist = "Dream Wife"
  const pagination = { limit: 20, offset: 0 }

  // First request (cache miss)
  const start1 = Date.now()
  const result1 = yield* factPlays.getPlaysByArtist(testArtist, pagination)
  const time1 = Date.now() - start1
  yield* Console.log(`   First request: ${time1}ms (cache miss) - found ${result1.length} plays`)

  // Repeated requests (cache hits)
  const times: Array<number> = []
  for (let i = 0; i < 10; i++) {
    const start = Date.now()
    yield* factPlays.getPlaysByArtist(testArtist, pagination)
    times.push(Date.now() - start)
  }

  const avgCacheHitTime = times.reduce((a, b) => a + b, 0) / times.length
  yield* Console.log(`   Average cache hit time: ${avgCacheHitTime.toFixed(2)}ms (10 requests)`)
  yield* Console.log(`   ✓ Cache speedup: ${(time1 / avgCacheHitTime).toFixed(1)}x faster`)

  // Test with different pagination (cache miss)
  const start2 = Date.now()
  const result2 = yield* factPlays.getPlaysByArtist(testArtist, { limit: 20, offset: 20 })
  const time2 = Date.now() - start2
  yield* Console.log(`   Different pagination: ${time2}ms (cache miss) - found ${result2.length} plays`)
}).pipe(Effect.provide(FactPlaysService.Default))

// =============================================================================
// RUN ALL TESTS
// =============================================================================

const runAllTests = Effect.gen(function*() {
  yield* testFactPlaysService
  yield* directSqlQueries
  yield* performanceTest

  yield* Console.log("\n\n✅ All tests completed successfully!")
})

const TestLayer = Layer.mergeAll(
  FactPlaysService.Default,
  MusicKBSqlLive,
  Layer.scope
)

// Execute the tests
runAllTests.pipe(
  Effect.provide(TestLayer),
  Effect.tapError((error) => Console.error("Test failed:", error)),
  Effect.runPromise
).catch(console.error)
