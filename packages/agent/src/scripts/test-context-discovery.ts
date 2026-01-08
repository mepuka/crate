#!/usr/bin/env bun
/**
 * Test Context Discovery for Daily Summary
 *
 * Tests the artifact-based dynamic context discovery:
 * 1. DayDataCollector.collectDayWithArtifacts() - stores plays as artifacts
 * 2. Context discovery tools - list, read, search artifacts
 * 3. Token comparison - compact index vs inline
 *
 * Usage:
 *   set -a && source .env && set +a && bun run src/scripts/test-context-discovery.ts
 *
 * Options:
 *   DATE=2024-12-15 bun run ... (specific date, defaults to yesterday)
 */

import { Effect, Console, Layer } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { FetchHttpClient } from "@effect/platform"

import {
  DayDataCollector,
  buildDayDataMessage,
  buildDayDataIndexMessage
} from "../daily-summary/index.js"
import { ArtifactStoreService } from "../services/context-store/index.js"
import { FaissConfig } from "../config.js"

// =============================================================================
// Configuration
// =============================================================================

const targetDate = process.env.DATE ?? (() => {
  // Default to yesterday
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split("T")[0]
})()

// =============================================================================
// Helpers
// =============================================================================

const countTokensApprox = (text: string): number => {
  // Rough approximation: ~4 chars per token for English
  return Math.ceil(text.length / 4)
}

// =============================================================================
// Program
// =============================================================================

const program = Effect.gen(function* () {
  yield* Console.log("\n🧪 Context Discovery Test")
  yield* Console.log("━".repeat(60))
  yield* Console.log("")

  yield* Console.log(`📅 Target date: ${targetDate}`)
  yield* Console.log("")

  // Get the data collector
  const collector = yield* DayDataCollector

  // =============================================================================
  // Step 1: Collect day data with artifacts
  // =============================================================================
  yield* Console.log("📦 Step 1: Collecting day data with artifacts...")

  const startTime = Date.now()

  const artifacts = yield* collector.collectDayWithArtifacts(targetDate).pipe(
    Effect.tapError(e => Console.error(`Failed to collect: ${e.message}`))
  )

  const collectTime = Date.now() - startTime

  yield* Console.log(`   ✅ Collected in ${collectTime}ms`)
  yield* Console.log("")

  // =============================================================================
  // Step 2: Show artifact references
  // =============================================================================
  yield* Console.log("📋 Step 2: Artifact References")
  yield* Console.log(`   All Plays: ${artifacts.artifactRefs.allPlays.id}`)
  yield* Console.log(`     Summary: ${artifacts.artifactRefs.allPlays.summary}`)
  yield* Console.log(`   Comments: ${artifacts.artifactRefs.comments.id}`)
  yield* Console.log(`     Summary: ${artifacts.artifactRefs.comments.summary}`)
  yield* Console.log(`   Rotation: ${artifacts.artifactRefs.rotationPlays.id}`)
  yield* Console.log(`     Summary: ${artifacts.artifactRefs.rotationPlays.summary}`)
  yield* Console.log(`   Releases: ${artifacts.artifactRefs.recentReleases.id}`)
  yield* Console.log(`     Summary: ${artifacts.artifactRefs.recentReleases.summary}`)
  yield* Console.log("")

  // =============================================================================
  // Step 3: Token comparison
  // =============================================================================
  yield* Console.log("📊 Step 3: Token Comparison")

  // Build both message formats
  const inlineMessage = artifacts._fullData
    ? buildDayDataMessage(artifacts._fullData)
    : "(no full data available)"

  const indexMessage = buildDayDataIndexMessage(artifacts)

  const inlineTokens = countTokensApprox(inlineMessage)
  const indexTokens = countTokensApprox(indexMessage)
  const savings = inlineTokens - indexTokens
  const savingsPercent = ((savings / inlineTokens) * 100).toFixed(1)

  yield* Console.log(`   Inline format: ~${inlineTokens.toLocaleString()} tokens`)
  yield* Console.log(`   Index format:  ~${indexTokens.toLocaleString()} tokens`)
  yield* Console.log(`   Savings:       ~${savings.toLocaleString()} tokens (${savingsPercent}%)`)
  yield* Console.log("")

  // =============================================================================
  // Step 4: Test context tools
  // =============================================================================
  yield* Console.log("🔧 Step 4: Test Context Tools")

  const store = yield* ArtifactStoreService

  // Test list
  const allArtifacts = yield* store.list({ limit: 20 })
  yield* Console.log(`   context_list: Found ${allArtifacts.length} artifacts`)

  // Test read (first 10 lines of plays)
  const playsPreview = yield* store.retrieve(artifacts.artifactRefs.allPlays.id, {
    lineLimit: 10
  }).pipe(Effect.catchAll(() => Effect.succeed("(failed to read)")))

  yield* Console.log(`   context_read: First 10 lines of plays:`)
  const lines = playsPreview.split("\n").slice(0, 3)
  for (const line of lines) {
    const truncated = line.length > 80 ? line.slice(0, 80) + "..." : line
    yield* Console.log(`     ${truncated}`)
  }
  if (playsPreview.split("\n").length > 3) {
    yield* Console.log(`     ... and ${playsPreview.split("\n").length - 3} more lines`)
  }

  // Test search
  const searchResults = yield* store.search({
    pattern: "LOCAL",
    limit: 5
  }).pipe(Effect.catchAll(() => Effect.succeed([])))

  yield* Console.log(`   context_search("LOCAL"): ${searchResults.length} matches`)
  for (const match of searchResults.slice(0, 2)) {
    const line = match.line.length > 60 ? match.line.slice(0, 60) + "..." : match.line
    yield* Console.log(`     Line ${match.lineNumber}: ${line}`)
  }

  yield* Console.log("")

  // =============================================================================
  // Step 5: Show index message preview
  // =============================================================================
  yield* Console.log("📝 Step 5: Index Message Preview (first 40 lines)")
  const previewLines = indexMessage.split("\n").slice(0, 40)
  for (const line of previewLines) {
    yield* Console.log(`   ${line}`)
  }
  yield* Console.log(`   ... (${indexMessage.split("\n").length - 40} more lines)`)
  yield* Console.log("")

  // =============================================================================
  // Summary
  // =============================================================================
  yield* Console.log("━".repeat(60))
  yield* Console.log("✅ Context Discovery Test Complete!")
  yield* Console.log("")
  yield* Console.log("Summary:")
  yield* Console.log(`  • Date: ${targetDate}`)
  yield* Console.log(`  • Total plays: ${artifacts.stats.totalPlays}`)
  yield* Console.log(`  • Shows: ${artifacts.showIndex.length}`)
  yield* Console.log(`  • Notable plays: ${artifacts.notablePlays.length}`)
  yield* Console.log(`  • Artifacts created: 4`)
  yield* Console.log(`  • Token savings: ~${savingsPercent}%`)
  yield* Console.log("")

  return {
    artifacts,
    tokenSavings: { inline: inlineTokens, index: indexTokens, savings, percent: savingsPercent }
  }
})

// =============================================================================
// Layer Composition
// =============================================================================

const TestLayer = Layer.mergeAll(
  DayDataCollector.Default,
  ArtifactStoreService.Default
).pipe(
  Layer.provide(FaissConfig.Default),
  Layer.provide(FetchHttpClient.layer)
)

// =============================================================================
// Run
// =============================================================================

NodeRuntime.runMain(
  program.pipe(
    Effect.provide(TestLayer),
    Effect.tapErrorCause(cause =>
      Console.error(`\n💥 Fatal error:\n${cause}`)
    )
  )
)
