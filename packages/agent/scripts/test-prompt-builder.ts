/**
 * Test Prompt Builder Service
 *
 * Fetches recent KEXP plays and generates prompts for them.
 *
 * Usage: bun packages/agent/scripts/test-prompt-builder.ts
 */

import { Effect, Schema, Console } from "effect"
import * as Kexp from "@crate/domain/kexp/schemas"
import {
  PromptBuilderService,
  PromptBuilderServiceFull,
  builtPromptToAiPrompt,
} from "../src/services/PromptBuilderService.js"

const { KexpPlaysResponse, isTrackPlay } = Kexp

// Fetch recent plays from KEXP API
const fetchRecentPlays = Effect.gen(function* () {
  const response = yield* Effect.tryPromise({
    try: () => fetch("https://api.kexp.org/v2/plays/?format=json&limit=10"),
    catch: (error) => new Error(`Failed to fetch plays: ${error}`),
  })

  const json = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: (error) => new Error(`Failed to parse plays JSON: ${error}`),
  })

  const parsed = yield* Schema.decodeUnknown(KexpPlaysResponse)(json).pipe(
    Effect.mapError((error) => new Error(`Schema validation failed: ${error}`))
  )

  return parsed.results.filter(isTrackPlay)
})

// Fetch show info for a play
const fetchShowForPlay = (showId: number) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(`https://api.kexp.org/v2/shows/${showId}/?format=json`),
      catch: (error) => new Error(`Failed to fetch show: ${error}`),
    })

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) => new Error(`Failed to parse show JSON: ${error}`),
    })

    return yield* Schema.decodeUnknown(Kexp.KexpShow)(json).pipe(
      Effect.mapError(
        (error) => new Error(`Show schema validation failed: ${error}`)
      )
    )
  })

// Main test program
const program = Effect.gen(function* () {
  yield* Console.log("Testing Prompt Builder Service\n")

  // Get the prompt builder service
  const promptBuilder = yield* PromptBuilderService

  // Show loaded data stats
  const djBios = yield* promptBuilder.getAllDjBios()
  const showDescriptions = yield* promptBuilder.getAllShowDescriptions()
  yield* Console.log(`Loaded ${djBios.length} DJ bios`)
  yield* Console.log(`Loaded ${showDescriptions.length} show descriptions\n`)

  // Fetch recent plays
  yield* Console.log("Fetching recent KEXP plays...")
  const plays = yield* fetchRecentPlays
  yield* Console.log(`Found ${plays.length} track plays\n`)

  // Process first 3 plays with DJ comments
  const playsWithComments = plays.filter(
    (p) => p.comment && p.comment.length > 10
  )
  const testPlays =
    playsWithComments.length > 0
      ? playsWithComments.slice(0, 3)
      : plays.slice(0, 3)

  for (const play of testPlays) {
    yield* Console.log("=".repeat(80))
    yield* Console.log(`\n${play.artist} - "${play.song}"`)
    yield* Console.log(`   Album: ${play.album || "N/A"}`)
    yield* Console.log(`   Airdate: ${play.airdate}`)

    if (play.comment) {
      const truncatedComment =
        play.comment.length > 200
          ? play.comment.slice(0, 200) + "..."
          : play.comment
      yield* Console.log(`   DJ Comment: "${truncatedComment}"`)
    }

    // Fetch show info
    const show = yield* fetchShowForPlay(play.show).pipe(
      Effect.catchAll(() =>
        Effect.succeed(undefined as Kexp.KexpShow | undefined)
      )
    )

    if (show) {
      yield* Console.log(`   Show: ${show.program_name}`)
      yield* Console.log(`   Host(s): ${show.host_names.join(", ")}`)

      // Check if we have DJ bio for the host(s)
      for (const hostName of show.host_names) {
        const djBio = yield* promptBuilder.getDjBio(hostName)
        if (djBio) {
          yield* Console.log(`   [OK] Found DJ bio for ${hostName}`)
        }
      }
    }

    // Build the prompt
    const builtPrompt = yield* promptBuilder.buildForKexpPlay(play, { show })

    yield* Console.log(`\nBuilt Prompt:`)
    yield* Console.log(
      `   System prompt length: ${builtPrompt.systemPrompt.length} chars`
    )
    yield* Console.log(
      `   User message length: ${builtPrompt.userMessage.length} chars`
    )
    yield* Console.log(`   Has DJ bio: ${builtPrompt.metadata.hasDjBio}`)
    yield* Console.log(`   Has comment: ${builtPrompt.metadata.hasComment}`)

    // Show a snippet of the user message
    yield* Console.log(`\nUser Message Preview:`)
    yield* Console.log(builtPrompt.userMessage.slice(0, 500) + "...")
    yield* Console.log("")

    // Also test the @effect/ai Prompt integration
    const aiPrompt = builtPromptToAiPrompt(builtPrompt)
    yield* Console.log(`@effect/ai Prompt: ${aiPrompt.content.length} messages`)
  }

  yield* Console.log("=".repeat(80))
  yield* Console.log("\nDone!")
})

// Run with proper layers - PromptBuilderServiceFull includes Assets
const runnable = program.pipe(Effect.provide(PromptBuilderServiceFull))

Effect.runPromise(runnable).catch(console.error)
