/**
 * Example: Using the Crate Agent Prompt System
 *
 * This example demonstrates how to use the modular prompt system
 * with Effect AI to build a complete agent interaction.
 */

import { Effect, Schema } from "effect"
import { Prompt } from "@effect/ai"
import {
  CratePrompt,
  CrateInsights,
  CrateTools,
  toOpenAIFunctions,
  type PlayContext,
  type ShowContext,
  type SimpleShowContext,
} from "../prompts/index.js"

// Example show context (full format matching KEXP API)
const showContext: ShowContext = {
  id: 12345,
  programId: 1,
  programName: "The Morning Show",
  hostIds: [101],
  hostNames: ["John Richards"],
  tagline: "Uplifting, cathartic, and community-oriented music to start your day",
  programTags: "indie rock, electronic, punk, soul, eclectic",
  imageUri: "https://example.com/morning-show.jpg",
  startTime: "2025-12-02T06:00:00-08:00",
}

// Alternative: Simple show context when full data isn't available
const simpleShowContext: SimpleShowContext = {
  name: "The Morning Show",
  host: "John Richards",
  description: "Uplifting, cathartic, and community-oriented music",
  genreFocus: ["indie rock", "electronic", "punk", "soul"],
}

// Example play data (full format matching KEXP API)
const playData: PlayContext = {
  id: 123456,
  airdate: "2025-12-02T14:30:00-08:00",
  artist: "Fleet Foxes",
  track: "Helplessness Blues",
  album: "Helplessness Blues",
  labels: ["Sub Pop"],
  releaseDate: "2011-05-03",
  artistMbids: ["6393dd04-27de-4340-9807-f9f5e7ad6d14"],
  recordingMbid: "abc123-def456-ghi789",
  releaseMbid: "xyz789-uvw012",
  releaseGroupMbid: "aaa111-bbb222",
  rotationStatus: "Library",
  isLocal: true,  // Seattle band!
  isRequest: false,
  isLive: false,
  comment:
    "Seattle's own Fleet Foxes - catch them at the Paramount Theatre March 15th for an incredible hometown show. Tickets on sale now!",
  imageUri: "https://example.com/helplessness-blues.jpg",
}

// Example recent insights (from previous plays in this session)
const recentInsights = [
  {
    _tag: "PlayHistory" as const,
    playId: 123450,
    entityMbids: ["6e0ae159-8449-4262-bba5-18ec87fa529f"],
    summary: "Death Cab for Cutie has been played 2,847 times on KEXP",
  },
  {
    _tag: "Concert" as const,
    playId: 123445,
    entityMbids: ["6e0ae159-8449-4262-bba5-18ec87fa529f"],
    summary: "Death Cab hometown shows Oct 26-27 at Paramount Theatre",
  },
]

/**
 * Build the complete prompt for a play
 */
function buildCratePrompt() {
  // Create the system prompt with all context
  const systemContent = CratePrompt.buildSystemPrompt({
    currentTime: new Date(),
    showContext,
    recentInsights,
  })

  // Create the user message with play data
  const userContent = CratePrompt.buildPlayMessage(playData)

  // Build the Effect AI Prompt
  return Prompt.make([
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ])
}

/**
 * Demonstrate prompt building
 */
export const demonstratePrompt = Effect.gen(function* () {
  const prompt = buildCratePrompt()

  yield* Effect.log("=== System Prompt Preview ===")
  const systemMsg = prompt.content.find((m) => m.role === "system")
  if (systemMsg && "content" in systemMsg) {
    // Show first 500 chars of system prompt
    yield* Effect.log(
      String(systemMsg.content).slice(0, 500) + "\n... (truncated)"
    )
  }

  yield* Effect.log("\n=== User Message ===")
  const userMsg = prompt.content.find((m) => m.role === "user")
  if (userMsg && "content" in userMsg) {
    yield* Effect.log(String(userMsg.content))
  }

  return prompt
})

/**
 * Demonstrate insight parsing
 */
export const demonstrateInsightParsing = Effect.gen(function* () {
  // Example raw insight from LLM
  const rawInsight = {
    _tag: "Concert",
    playId: 123456,
    sourceRecordingMbid: "abc123-def456-ghi789",
    sourceArtistMbids: ["6393dd04-27de-4340-9807-f9f5e7ad6d14"],
    sourceReleaseMbid: null,
    confidence: "high",
    sourceType: "extraction",
    artist: {
      name: "Fleet Foxes",
      mbid: "6393dd04-27de-4340-9807-f9f5e7ad6d14",
    },
    venue: "The Paramount Theatre",
    date: "2025-03-15",
    time: null,
    city: "Seattle",
    ticketUrl: null,
    tourName: null,
    sourceQuote:
      "catch them at the Paramount Theatre March 15th for an incredible hometown show",
  }

  // Parse using Effect Schema
  const parsed = yield* Effect.try(() =>
    Schema.decodeUnknownSync(CrateInsights.ConcertInsight)(rawInsight)
  )

  yield* Effect.log("=== Parsed Concert Insight ===")
  yield* Effect.log(`Artist: ${parsed.artist.name}`)
  yield* Effect.log(`Venue: ${parsed.venue}`)
  yield* Effect.log(`Date: ${parsed.date}`)
  yield* Effect.log(`Confidence: ${parsed.confidence}`)
  yield* Effect.log(`Summary: ${CrateInsights.getInsightSummary(parsed)}`)

  return parsed
})

/**
 * Demonstrate tool definitions
 */
export const demonstrateTools = Effect.gen(function* () {
  yield* Effect.log("=== Available Tools ===")

  for (const [name, tool] of Object.entries(CrateTools)) {
    yield* Effect.log(`\n${name}: ${tool.description}`)
  }

  yield* Effect.log("\n=== OpenAI Function Definitions ===")
  const functions = toOpenAIFunctions()
  yield* Effect.log(`Generated ${functions.length} function definitions`)

  return functions
})

/**
 * Full demonstration
 */
export const main = Effect.gen(function* () {
  yield* Effect.log("Crate Agent Prompt System Demo\n")

  yield* demonstratePrompt
  yield* Effect.log("\n" + "=".repeat(50) + "\n")

  yield* demonstrateInsightParsing
  yield* Effect.log("\n" + "=".repeat(50) + "\n")

  yield* demonstrateTools
})

// Run if executed directly
// Effect.runPromise(main)
