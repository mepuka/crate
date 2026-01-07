#!/usr/bin/env bun
/**
 * Test Daily Summary Pipeline
 *
 * Runs the full daily summary agent pipeline:
 * 1. DayDataCollector - gathers plays for the target date
 * 2. SummaryResearchAgent - deep research with tools
 * 3. SummaryWriterAgent - narrative synthesis
 *
 * Usage:
 *   set -a && source .env && set +a && bun run src/scripts/test-daily-summary.ts
 *
 * Options:
 *   DATE=2024-12-15 bun run ... (specific date, defaults to yesterday)
 *   SKIP_PERSISTENCE=true bun run ... (skip saving to DB)
 *
 * Required environment:
 *   - ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY
 *   - FAISS_API_URL (defaults to http://localhost:8000)
 */

import { Effect, Console, Layer } from "effect"
import { NodeRuntime } from "@effect/platform-node"

import {
  DailySummaryAgent,
  DailySummaryAgentLive,
  type PipelineResult
} from "../daily-summary/DailySummaryAgent.js"
import { CrateToolsLive, ConfigurableModelLive } from "../layers.js"

// =============================================================================
// Configuration
// =============================================================================

const targetDate = process.env.DATE || undefined // undefined = yesterday
const skipPersistence = process.env.SKIP_PERSISTENCE === "true"

// =============================================================================
// Helpers
// =============================================================================

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

const formatTokens = (usage: PipelineResult["tokenUsage"]): string => {
  const total = usage.inputTokens + usage.outputTokens
  const cached = usage.cacheReadTokens
  const cacheRate = total > 0 ? ((cached / (usage.inputTokens || 1)) * 100).toFixed(0) : "0"
  return `${total.toLocaleString()} tokens (${cacheRate}% cached)`
}

// =============================================================================
// Program
// =============================================================================

const program = Effect.gen(function* () {
  yield* Console.log("\n📰 Daily Summary Pipeline Test")
  yield* Console.log("━".repeat(60))
  yield* Console.log("")

  // Log configuration
  yield* Console.log(`📅 Target date: ${targetDate || "(yesterday)"} `)
  yield* Console.log(`💾 Persistence: ${skipPersistence ? "SKIPPED" : "enabled"}`)
  yield* Console.log("")

  // Get the agent
  const agent = yield* DailySummaryAgent

  // Run the pipeline
  yield* Console.log("🚀 Starting pipeline...")
  yield* Console.log("")

  const startTime = Date.now()

  const result = yield* agent
    .run({
      date: targetDate,
      skipPersistence
    })
    .pipe(
      Effect.tapError(e =>
        Console.error(`\n❌ Pipeline failed: ${e.message}\n   Phase: ${e.phase}`)
      )
    )

  const elapsed = Date.now() - startTime

  // =============================================================================
  // Output Results
  // =============================================================================

  yield* Console.log("\n" + "━".repeat(60))
  yield* Console.log("✅ Pipeline Complete!")
  yield* Console.log("━".repeat(60))
  yield* Console.log("")

  // Timing breakdown
  yield* Console.log("⏱️  Timing:")
  yield* Console.log(`   Data collection: ${formatDuration(result.timing.dataCollectionMs)}`)
  yield* Console.log(`   Research:        ${formatDuration(result.timing.researchMs)}`)
  yield* Console.log(`   Writing:         ${formatDuration(result.timing.writingMs)}`)
  yield* Console.log(`   Polish:          ${result.timing.polishMs > 0 ? formatDuration(result.timing.polishMs) : "skipped"}`)
  yield* Console.log(`   Total:           ${formatDuration(result.timing.totalMs)} (wall: ${formatDuration(elapsed)})`)
  yield* Console.log("")

  // Token usage
  yield* Console.log("🎯 Token Usage:")
  yield* Console.log(`   ${formatTokens(result.tokenUsage)}`)
  yield* Console.log(`   Tool calls: ${result.toolCallCount}`)
  yield* Console.log("")

  // Summary preview
  const summary = result.summary
  yield* Console.log("📝 Summary Preview:")
  yield* Console.log(`   Date: ${summary.date}`)
  yield* Console.log(`   Headline: ${summary.headline}`)
  yield* Console.log("")

  yield* Console.log("📊 Stats:")
  yield* Console.log(`   Total plays: ${summary.stats.totalPlays}`)
  yield* Console.log(`   Unique artists: ${summary.stats.uniqueArtists}`)
  yield* Console.log(`   Unique albums: ${summary.stats.uniqueAlbums}`)
  yield* Console.log(`   New to KEXP: ${summary.stats.newToKexp}`)
  yield* Console.log(`   Local artists: ${summary.stats.localArtists}`)
  yield* Console.log(`   Shows: ${summary.stats.showCount}`)
  yield* Console.log("")

  yield* Console.log("🎯 Highlights:")
  for (const highlight of summary.highlights.slice(0, 5)) {
    yield* Console.log(`   • [${highlight.category}] ${highlight.headline}`)
  }
  if (summary.highlights.length > 5) {
    yield* Console.log(`   ... and ${summary.highlights.length - 5} more`)
  }
  yield* Console.log("")

  yield* Console.log("🆕 Discoveries:")
  for (const discovery of summary.discoveries.slice(0, 5)) {
    yield* Console.log(`   • ${discovery.artist} - "${discovery.song}" (${discovery.discoveryType})`)
  }
  if (summary.discoveries.length > 5) {
    yield* Console.log(`   ... and ${summary.discoveries.length - 5} more`)
  }
  yield* Console.log("")

  yield* Console.log("🎵 Fresh Releases:")
  for (const release of summary.freshReleases.slice(0, 5)) {
    yield* Console.log(`   • ${release.artist} - "${release.song}" (${release.releaseType})`)
  }
  if (summary.freshReleases.length > 5) {
    yield* Console.log(`   ... and ${summary.freshReleases.length - 5} more`)
  }
  yield* Console.log("")

  yield* Console.log("🎭 Themes:")
  for (const theme of summary.themes) {
    yield* Console.log(`   • ${theme.title}: ${theme.playIds.length} plays`)
  }
  yield* Console.log("")

  yield* Console.log("🎂 Cultural Moments:")
  for (const moment of summary.culturalMoments) {
    yield* Console.log(`   • [${moment.type}] ${moment.title}`)
  }
  yield* Console.log("")

  // Opening narrative preview
  yield* Console.log("📖 Opening Narrative (preview):")
  const narrativePreview = summary.openingNarrative.slice(0, 500)
  yield* Console.log(`   ${narrativePreview}...`)
  yield* Console.log("")

  // Play IDs summary
  yield* Console.log("🔗 Play References:")
  yield* Console.log(`   Total referenced: ${summary.playIds.length}`)
  yield* Console.log(`   Top picks: ${summary.topPickIds.length}`)
  yield* Console.log(`   New music playlist: ${summary.newMusicPlaylistIds.length}`)
  yield* Console.log("")

  // Polish fixes report
  if (result.polishFixes) {
    yield* Console.log("✨ Polish Fixes:")
    yield* Console.log(`   Headline improved: ${result.polishFixes.headlineImproved ? "✓" : "—"}`)
    yield* Console.log(`   PlayIds populated: ${result.polishFixes.playIdsPopulated ? "✓" : "—"}`)
    yield* Console.log(`   Themes included: ${result.polishFixes.themesIncluded ? "✓" : "—"}`)
    yield* Console.log(`   Cultural moments: ${result.polishFixes.culturalMomentsIncluded ? "✓" : "—"}`)
    yield* Console.log(`   Narrative enhanced: ${result.polishFixes.narrativeEnhanced ? "✓" : "—"}`)
    yield* Console.log("")
  }

  // Persistence info
  if (!skipPersistence) {
    yield* Console.log("💾 Persisted:")
    yield* Console.log(`   Research ID: ${result.researchId}`)
    yield* Console.log(`   Summary ID: ${result.summaryId}`)
    yield* Console.log("")
  }

  yield* Console.log("━".repeat(60))
  yield* Console.log("🎉 Done!")
  yield* Console.log("")

  return result
})

// =============================================================================
// Layer Composition
// =============================================================================

// Build the full layer stack:
// - DailySummaryAgentLive (which includes DayDataCollector, SummaryResearchAgent, SummaryWriterAgent)
//   - DayDataCollector.Default includes FaissClient.Default
//   - SummaryResearchAgent.Default includes CrateToolkit.Default
// - CrateToolsLive provides CrateToolkit handlers + services (required by SummaryResearchAgent)
// - ConfigurableModelLive provides the LLM (required by both agents)

// DailySummaryAgentLive needs CrateToolsLive for the toolkit handlers
const DailySummaryWithDeps = DailySummaryAgentLive.pipe(
  Layer.provide(CrateToolsLive)
)

// Full layer: agent + LLM
const FullLayer = Layer.mergeAll(
  DailySummaryWithDeps,
  ConfigurableModelLive
)

// =============================================================================
// Run
// =============================================================================

NodeRuntime.runMain(
  program.pipe(
    Effect.provide(FullLayer),
    Effect.tapErrorCause(cause =>
      Console.error(`\n💥 Fatal error:\n${cause}`)
    )
  )
)
