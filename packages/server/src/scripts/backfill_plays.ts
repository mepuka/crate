import { Chunk, Effect, Option, Schema, Stream } from "effect"
import { KEXPApi, KEXP_API_URL } from "../kexp/api.js"
import * as KEXPSchemas from "../kexp/schemas.js"
import { FactPlaysService } from "../knowledge_base/fact_plays/index.js"
import { FactPlay, factPlayFromKexpPlay } from "../knowledge_base/fact_plays/schemas.js"

/**
 * Backfill script for fetching historical KEXP plays for a specific date range.
 *
 * Usage:
 *   Set START_DATE and END_DATE below, then run:
 *   bun run packages/server/src/scripts/backfill_plays.ts
 *
 * This will fetch all plays from KEXP API for the specified date range and insert them.
 *
 * Note: KEXP API uses ISO 8601 format for dates and supports:
 *   - airdate_after: Plays aired after this date (inclusive)
 *   - airdate_before: Plays aired before this date (exclusive)
 */

// Configure the date range to backfill (in ISO format: YYYY-MM-DDTHH:MM:SS)
const START_DATE = "2024-11-01T00:00:00"  // Start of day, local time
const END_DATE = "2024-11-11T00:00:00"    // End date (exclusive)

const BATCH_SIZE = 100

const backfillPlays = Effect.gen(function*() {
  yield* Effect.logInfo(`Starting backfill for ${START_DATE} to ${END_DATE}`)

  const kexpApi = yield* KEXPApi
  const factPlaysService = yield* FactPlaysService

  // Build the date range query URL
  // KEXP API accepts airdate_after and airdate_before parameters
  const baseUrl = `${KEXP_API_URL}/plays?limit=${BATCH_SIZE}&airdate_after=${START_DATE}&airdate_before=${END_DATE}`

  yield* Effect.logInfo(`Fetching plays from KEXP API...`)
  yield* Effect.logInfo(`URL: ${baseUrl}`)

  // Stream all plays from the date range using pagination
  const totalInserted = yield* Stream.paginateEffect(
    baseUrl,
    (url) =>
      kexpApi.fetchPlaysFromUrl(url).pipe(
        Effect.flatMap((response) =>
          Effect.gen(function*() {
            const plays = response.results.filter(KEXPSchemas.isTrackPlay)
            yield* Effect.logInfo(`Fetched ${plays.length} track plays (${response.results.length} total results)`)

            // Stop pagination if no results returned
            if (response.results.length === 0) {
              return [Chunk.fromIterable(plays), Option.none()] as const
            }

            return [Chunk.fromIterable(plays), Option.fromNullable(response.next)] as const
          })
        )
      )
  ).pipe(
    Stream.mapConcatChunk((plays) => plays),
    Stream.tap((play) =>
      Effect.logDebug(`Processing play: ${play.artist} - ${play.play_type} @ ${play.airdate}`)
    ),
    Stream.grouped(BATCH_SIZE),
    Stream.mapEffect((chunk) =>
      Effect.gen(function*() {
        const chunkArray = Chunk.toReadonlyArray(chunk)

        // Transform KEXP plays to FactPlay format
        const decodedPlays = yield* Schema.decodeUnknown(Schema.Array(factPlayFromKexpPlay))(chunkArray)
        const encodedPlays = yield* Schema.encode(Schema.Array(FactPlay.insert))(decodedPlays)

        // Insert batch
        yield* factPlaysService.insertPlays(encodedPlays)

        yield* Effect.logInfo(`✓ Inserted batch of ${chunk.length} plays`)

        return chunk.length
      })
    ),
    Stream.runSum
  )

  yield* Effect.logInfo(`\n✅ Backfill completed successfully!`)
  yield* Effect.logInfo(`Total plays inserted: ${totalInserted}`)

  return totalInserted
})

const program = backfillPlays.pipe(
  Effect.provide(FactPlaysService.Default),
  Effect.provide(KEXPApi.Default),
  Effect.scoped
)

Effect.runPromise(program)
  .then((count) => {
    console.log(`\n🎵 Done! Inserted ${count} plays into the database.`)
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Backfill failed:", error)
    process.exit(1)
  })
