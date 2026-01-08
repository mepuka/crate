#!/usr/bin/env bun
/**
 * Test Daily Summary Pipeline with Artifacts Mode
 *
 * Runs the full daily summary pipeline using artifact-based context:
 * 1. DayDataCollector.collectDayWithArtifacts() - stores plays as artifacts
 * 2. SummaryResearchAgent.researchWithArtifacts() - uses context discovery tools
 * 3. SummaryWriterAgent.write() - synthesizes narrative
 * 4. SummaryPolishAgent.polish() - quality refinement
 *
 * Usage:
 *   set -a && source .env && set +a && bun run src/scripts/test-daily-summary-artifacts.ts
 *
 * Options:
 *   DATE=2024-12-15 bun run ... (specific date, defaults to yesterday)
 *   SKIP_PERSISTENCE=true bun run ... (skip saving to DB)
 *   SKIP_POLISH=true bun run ... (skip polish phase)
 *
 * Required environment:
 *   - ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY
 *   - FAISS_API_URL (defaults to http://localhost:8000)
 */

import { Effect, Console, Layer, Duration, Clock, Config } from "effect"
import { NodeRuntime } from "@effect/platform-node"

import {
  DayDataCollector,
  SummaryResearchAgent,
  SummaryWriterAgent,
  SummaryPolishAgent,
  buildDayDataMessage,
  buildDayDataIndexMessage,
  extractReferencedPlayIds,
  extractCategorizedPlayIds,
  buildPlayLookupTable,
  type DayDataArtifacts,
  type ResearchResult,
  type WriterResult,
  type PolishResult,
  type DailySummaryType
} from "../daily-summary/index.js"
import { ArtifactStoreService } from "../services/context-store/index.js"
import { CrateToolsWithContextLive, ConfigurableModelLive } from "../layers.js"
import { type TokenUsage, emptyTokenUsage, addTokenUsage } from "../multi-agent/types.js"

// =============================================================================
// Configuration
// =============================================================================

const targetDate = process.env.DATE ?? (() => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split("T")[0]
})()

const skipPersistence = process.env.SKIP_PERSISTENCE === "true"
const skipPolish = process.env.SKIP_POLISH === "true"

// =============================================================================
// Helpers
// =============================================================================

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

const countTokensApprox = (text: string): number => Math.ceil(text.length / 4)

// =============================================================================
// Program
// =============================================================================

const program = Effect.gen(function* () {
  yield* Console.log("\n📰 Daily Summary Pipeline - ARTIFACTS MODE")
  yield* Console.log("━".repeat(60))
  yield* Console.log("")

  yield* Console.log(`📅 Target date: ${targetDate}`)
  yield* Console.log(`💾 Persistence: ${skipPersistence ? "SKIPPED" : "enabled"}`)
  yield* Console.log(`✨ Polish: ${skipPolish ? "SKIPPED" : "enabled"}`)
  yield* Console.log("")

  const pipelineStart = yield* Clock.currentTimeMillis
  let tokenUsage = emptyTokenUsage()

  // =============================================================================
  // Phase 1: Data Collection with Artifacts
  // =============================================================================
  yield* Console.log("📦 Phase 1: Collecting day data WITH ARTIFACTS...")

  const dataCollector = yield* DayDataCollector

  const startCollect = yield* Clock.currentTimeMillis
  const artifacts = yield* dataCollector.collectDayWithArtifacts(targetDate)
  const dataCollectionMs = Number((yield* Clock.currentTimeMillis) - startCollect)

  // Compare token usage
  const fullData = artifacts._fullData!
  const inlineMessage = buildDayDataMessage(fullData)
  const indexMessage = buildDayDataIndexMessage(artifacts)
  const inlineTokens = countTokensApprox(inlineMessage)
  const indexTokens = countTokensApprox(indexMessage)
  const tokenSavings = inlineTokens - indexTokens

  yield* Console.log(`   ✅ Collected ${artifacts.stats.totalPlays} plays in ${formatDuration(dataCollectionMs)}`)
  yield* Console.log(`   📊 Token comparison:`)
  yield* Console.log(`      Inline: ~${inlineTokens.toLocaleString()} tokens`)
  yield* Console.log(`      Index:  ~${indexTokens.toLocaleString()} tokens`)
  yield* Console.log(`      Saved:  ~${tokenSavings.toLocaleString()} tokens (${((tokenSavings/inlineTokens)*100).toFixed(0)}%)`)
  yield* Console.log("")

  // =============================================================================
  // Phase 2: Research with Artifacts
  // =============================================================================
  yield* Console.log("🔍 Phase 2: Research WITH CONTEXT DISCOVERY TOOLS...")

  const researchAgent = yield* SummaryResearchAgent

  const startResearch = yield* Clock.currentTimeMillis
  const researchResult = yield* researchAgent.researchWithArtifacts(artifacts)
  const researchMs = Number((yield* Clock.currentTimeMillis) - startResearch)

  tokenUsage = addTokenUsage(tokenUsage, researchResult.tokenUsage)

  yield* Console.log(`   ✅ Research complete in ${formatDuration(researchMs)}`)
  yield* Console.log(`   🔧 Tool calls: ${researchResult.toolCallCount}`)
  yield* Console.log(`   📝 Discoveries: ${researchResult.context.discoveries.length}`)
  yield* Console.log(`   🎵 Fresh releases: ${researchResult.context.freshReleases.length}`)
  yield* Console.log(`   🎭 Themes: ${researchResult.context.themes.length}`)
  yield* Console.log(`   🎂 Cultural moments: ${researchResult.context.culturalMoments.length}`)
  yield* Console.log("")

  // =============================================================================
  // Phase 3: Writing
  // =============================================================================
  yield* Console.log("✍️  Phase 3: Writing summary...")

  const writerAgent = yield* SummaryWriterAgent

  // Build play lookup from research
  const referencedIds = extractReferencedPlayIds(researchResult.context)
  const categorizedIds = extractCategorizedPlayIds(researchResult.context)
  const playLookup = buildPlayLookupTable(fullData, referencedIds)

  const startWrite = yield* Clock.currentTimeMillis
  const writerResult = yield* writerAgent.write(researchResult.context, {
    playLookup,
    categorizedIds
  })
  const writingMs = Number((yield* Clock.currentTimeMillis) - startWrite)

  tokenUsage = addTokenUsage(tokenUsage, writerResult.tokenUsage)

  yield* Console.log(`   ✅ Writing complete in ${formatDuration(writingMs)}`)
  yield* Console.log(`   📰 Headline: ${writerResult.summary.headline}`)
  yield* Console.log("")

  // =============================================================================
  // Phase 4: Polish (optional)
  // =============================================================================
  let polishMs = 0
  let polishedSummary = writerResult.summary
  let polishFixes: PolishResult["fixes"] | undefined

  if (!skipPolish) {
    yield* Console.log("✨ Phase 4: Polishing summary...")

    const polishAgent = yield* SummaryPolishAgent

    const startPolish = yield* Clock.currentTimeMillis
    const polishResult = yield* polishAgent.polish(writerResult.summary, researchResult.context)
    polishMs = Number((yield* Clock.currentTimeMillis) - startPolish)

    tokenUsage = addTokenUsage(tokenUsage, polishResult.tokenUsage)
    polishedSummary = polishResult.summary
    polishFixes = polishResult.fixes

    yield* Console.log(`   ✅ Polish complete in ${formatDuration(polishMs)}`)
    yield* Console.log(`   🔧 Headline improved: ${polishFixes.headlineImproved ? "✓" : "—"}`)
    yield* Console.log(`   🔧 PlayIds populated: ${polishFixes.playIdsPopulated ? "✓" : "—"}`)
    yield* Console.log("")
  } else {
    yield* Console.log("⏭️  Phase 4: Skipped (SKIP_POLISH=true)")
    yield* Console.log("")
  }

  // Merge missing play IDs
  const existingPlayIds = new Set(polishedSummary.playIds)
  const missingPlayIds = categorizedIds.all.filter(id => !existingPlayIds.has(id))
  const existingNewMusic = new Set(polishedSummary.newMusicPlaylistIds)
  const missingNewMusic = categorizedIds.freshReleases.filter(id => !existingNewMusic.has(id))

  const summary: DailySummaryType = {
    ...polishedSummary,
    researchId: 0,
    playIds: missingPlayIds.length > 0
      ? [...polishedSummary.playIds, ...missingPlayIds]
      : polishedSummary.playIds,
    newMusicPlaylistIds: missingNewMusic.length > 0
      ? [...polishedSummary.newMusicPlaylistIds, ...missingNewMusic]
      : polishedSummary.newMusicPlaylistIds
  }

  const pipelineEnd = yield* Clock.currentTimeMillis
  const totalMs = Number(pipelineEnd - pipelineStart)

  // =============================================================================
  // Results
  // =============================================================================
  yield* Console.log("━".repeat(60))
  yield* Console.log("✅ Pipeline Complete - ARTIFACTS MODE")
  yield* Console.log("━".repeat(60))
  yield* Console.log("")

  yield* Console.log("⏱️  Timing:")
  yield* Console.log(`   Data collection: ${formatDuration(dataCollectionMs)}`)
  yield* Console.log(`   Research:        ${formatDuration(researchMs)}`)
  yield* Console.log(`   Writing:         ${formatDuration(writingMs)}`)
  yield* Console.log(`   Polish:          ${polishMs > 0 ? formatDuration(polishMs) : "skipped"}`)
  yield* Console.log(`   Total:           ${formatDuration(totalMs)}`)
  yield* Console.log("")

  yield* Console.log("🎯 Token Usage:")
  yield* Console.log(`   Input:  ${tokenUsage.inputTokens.toLocaleString()}`)
  yield* Console.log(`   Output: ${tokenUsage.outputTokens.toLocaleString()}`)
  yield* Console.log(`   Total:  ${tokenUsage.totalTokens.toLocaleString()}`)
  yield* Console.log(`   Prompt savings: ~${tokenSavings.toLocaleString()} tokens (${((tokenSavings/inlineTokens)*100).toFixed(0)}%)`)
  yield* Console.log("")

  yield* Console.log("📝 Summary:")
  yield* Console.log(`   Date: ${summary.date}`)
  yield* Console.log(`   Headline: ${summary.headline}`)
  yield* Console.log("")

  yield* Console.log("📊 Stats:")
  yield* Console.log(`   Total plays: ${summary.stats.totalPlays}`)
  yield* Console.log(`   Unique artists: ${summary.stats.uniqueArtists}`)
  yield* Console.log(`   New to KEXP: ${summary.stats.newToKexp}`)
  yield* Console.log(`   Local artists: ${summary.stats.localArtists}`)
  yield* Console.log("")

  yield* Console.log("🎯 Highlights:")
  for (const h of summary.highlights.slice(0, 5)) {
    yield* Console.log(`   • [${h.category}] ${h.headline}`)
  }
  if (summary.highlights.length > 5) {
    yield* Console.log(`   ... and ${summary.highlights.length - 5} more`)
  }
  yield* Console.log("")

  yield* Console.log("📖 Opening (preview):")
  yield* Console.log(`   ${summary.openingNarrative.slice(0, 400)}...`)
  yield* Console.log("")

  yield* Console.log("━".repeat(60))
  yield* Console.log("🎉 Done!")
  yield* Console.log("")

  return {
    summary,
    timing: { dataCollectionMs, researchMs, writingMs, polishMs, totalMs },
    tokenUsage,
    tokenSavings: { inline: inlineTokens, index: indexTokens, saved: tokenSavings }
  }
})

// =============================================================================
// Layer Composition
// =============================================================================

// Use CrateToolsWithContextLive which includes:
// - All standard Crate research tools
// - Context discovery tools (context_list, context_read, context_search, context_tail)
// - ArtifactStoreService

// DayDataCollector needs ArtifactStoreService for collectDayWithArtifacts
const DataCollectorWithArtifacts = DayDataCollector.Default.pipe(
  Layer.provide(ArtifactStoreService.Default)
)

const AgentLayers = Layer.mergeAll(
  DataCollectorWithArtifacts,
  SummaryResearchAgent.Default,
  SummaryWriterAgent.Default,
  SummaryPolishAgent.Default,
  // Also provide ArtifactStoreService at top level for direct access
  ArtifactStoreService.Default
)

const FullLayer = AgentLayers.pipe(
  Layer.provide(CrateToolsWithContextLive),
  Layer.provideMerge(ConfigurableModelLive)
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
