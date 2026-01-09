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
 * Model Configuration:
 *   AI_PROVIDER=google                      → Use Google (default: anthropic)
 *   RESEARCH_MODEL=gemini-3-flash-preview   → Model for research phase
 *   WRITER_MODEL=gemini-3-pro-preview       → Model for writer/polish phases
 *   AI_MODEL=claude-haiku-4-5               → Single model for all phases (fallback)
 *
 * Required environment:
 *   - ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY
 *   - FAISS_API_URL (defaults to http://localhost:8000)
 */

import { Effect, Console, Layer, Clock } from "effect"
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
  type PolishResult,
  type DailySummaryType
} from "../daily-summary/index.js"
import { ArtifactStoreService } from "../services/context-store/index.js"
import {
  CrateToolsWithContextLive,
  ConfigurableModelLive,
  makeGoogleModelLayer,
  makeAnthropicModelLayer
} from "../layers.js"
import { GoogleAIConfig, AnthropicConfig } from "../config.js"
import { type TokenUsage, addTokenUsage } from "../multi-agent/types.js"
import { FaissClient } from "../FaissClient.js"

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

// Model configuration
const aiProvider = process.env.AI_PROVIDER ?? "anthropic"
const researchModel = process.env.RESEARCH_MODEL
const writerModel = process.env.WRITER_MODEL

// Determine if we're using multi-model mode
const useMultiModel = researchModel && writerModel

// =============================================================================
// Helpers
// =============================================================================

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

const countTokensApprox = (text: string): number => Math.ceil(text.length / 4)

/**
 * Persist research and summary to FAISS API
 */
const persistToDatabase = (
  date: string,
  researchContext: Record<string, unknown>,
  researchDurationMs: number,
  toolCallCount: number,
  summary: DailySummaryType,
  tokenUsage: TokenUsage
) =>
  Effect.gen(function* () {
    const faissClient = yield* FaissClient

    yield* Console.log("\n💾 Persisting to database...")

    // Persist research
    const researchResponse = yield* faissClient.saveDailyResearch(
      date,
      researchContext,
      researchDurationMs,
      toolCallCount,
      {
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: tokenUsage.totalTokens
      }
    ).pipe(
      Effect.tapError(e => Console.error(`   ⚠️ Research persistence failed: ${e.message}`)),
      Effect.orElseSucceed(() => ({ id: 0, date, status: "skipped" }))
    )

    yield* Console.log(`   ✓ Research saved: id=${researchResponse.id}, status=${researchResponse.status}`)

    // Persist summary
    const summaryResponse = yield* faissClient.saveDailySummary(
      date,
      summary as unknown as Record<string, unknown>,
      researchResponse.id
    ).pipe(
      Effect.tapError(e => Console.error(`   ⚠️ Summary persistence failed: ${e.message}`)),
      Effect.orElseSucceed(() => ({ id: 0, date, status: "skipped", regenerated_count: 0 }))
    )

    yield* Console.log(`   ✓ Summary saved: id=${summaryResponse.id}, status=${summaryResponse.status}`)

    return {
      researchId: researchResponse.id,
      summaryId: summaryResponse.id
    }
  })

// =============================================================================
// Model Layer Builders
// =============================================================================

/**
 * Create a model layer for the given provider and model name
 */
const createModelLayer = (provider: string, model: string) => {
  if (provider === "google") {
    return makeGoogleModelLayer(model).pipe(
      Layer.provide(GoogleAIConfig.Default)
    )
  } else {
    return makeAnthropicModelLayer(model).pipe(
      Layer.provide(AnthropicConfig.Default)
    )
  }
}

// =============================================================================
// Phase Programs (separated for multi-model support)
// =============================================================================

/**
 * Phase 1 & 2: Data Collection + Research
 * Returns artifacts and research result
 */
const runResearchPhase = (targetDate: string) => Effect.gen(function* () {
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

  yield* Console.log("🔍 Phase 2: Research WITH CONTEXT DISCOVERY TOOLS...")

  const researchAgent = yield* SummaryResearchAgent

  const startResearch = yield* Clock.currentTimeMillis
  const researchResult = yield* researchAgent.researchWithArtifacts(artifacts)
  const researchMs = Number((yield* Clock.currentTimeMillis) - startResearch)

  yield* Console.log(`   ✅ Research complete in ${formatDuration(researchMs)}`)
  yield* Console.log(`   🔧 Tool calls: ${researchResult.toolCallCount}`)
  yield* Console.log(`   📝 Discoveries: ${researchResult.context.discoveries.length}`)
  yield* Console.log(`   🎵 Fresh releases: ${researchResult.context.freshReleases.length}`)
  yield* Console.log(`   🎭 Themes: ${researchResult.context.themes.length}`)
  yield* Console.log(`   🎂 Cultural moments: ${researchResult.context.culturalMoments.length}`)
  yield* Console.log("")

  return {
    artifacts,
    fullData,
    researchResult,
    timing: { dataCollectionMs, researchMs },
    tokenStats: { inlineTokens, indexTokens, tokenSavings }
  }
})

/**
 * Phase 3 & 4: Writing + Polish
 * Takes research results, returns final summary
 */
const runWriterPhase = (
  researchContext: ReturnType<typeof runResearchPhase> extends Effect.Effect<infer A, any, any> ? A : never,
  skipPolish: boolean
) => Effect.gen(function* () {
  const { fullData, researchResult } = researchContext

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

  yield* Console.log(`   ✅ Writing complete in ${formatDuration(writingMs)}`)
  yield* Console.log(`   📰 Headline: ${writerResult.summary.headline}`)
  yield* Console.log("")

  // Phase 4: Polish (optional)
  let polishMs = 0
  let polishedSummary = writerResult.summary
  let polishFixes: PolishResult["fixes"] | undefined

  if (!skipPolish) {
    yield* Console.log("✨ Phase 4: Polishing summary...")

    const polishAgent = yield* SummaryPolishAgent

    const startPolish = yield* Clock.currentTimeMillis
    const polishResult = yield* polishAgent.polish(writerResult.summary, researchResult.context)
    polishMs = Number((yield* Clock.currentTimeMillis) - startPolish)

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

  // Merge token usage
  let tokenUsage = addTokenUsage(researchResult.tokenUsage, writerResult.tokenUsage)

  return {
    polishedSummary,
    categorizedIds,
    tokenUsage,
    timing: { writingMs, polishMs }
  }
})

// =============================================================================
// Main Program
// =============================================================================

const program = Effect.gen(function* () {
  yield* Console.log("\n📰 Daily Summary Pipeline - ARTIFACTS MODE")
  yield* Console.log("━".repeat(60))
  yield* Console.log("")

  yield* Console.log(`📅 Target date: ${targetDate}`)
  yield* Console.log(`💾 Persistence: ${skipPersistence ? "SKIPPED" : "enabled"}`)
  yield* Console.log(`✨ Polish: ${skipPolish ? "SKIPPED" : "enabled"}`)

  if (useMultiModel) {
    yield* Console.log(`🤖 Research model: ${researchModel}`)
    yield* Console.log(`🤖 Writer model: ${writerModel}`)
  }
  yield* Console.log("")

  const pipelineStart = yield* Clock.currentTimeMillis

  // Run research phase
  const researchPhaseResult = yield* runResearchPhase(targetDate)

  // Run writer phase
  const writerPhaseResult = yield* runWriterPhase(researchPhaseResult, skipPolish)

  const { polishedSummary, categorizedIds, tokenUsage } = writerPhaseResult
  const { tokenStats } = researchPhaseResult

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
  yield* Console.log(`   Data collection: ${formatDuration(researchPhaseResult.timing.dataCollectionMs)}`)
  yield* Console.log(`   Research:        ${formatDuration(researchPhaseResult.timing.researchMs)}`)
  yield* Console.log(`   Writing:         ${formatDuration(writerPhaseResult.timing.writingMs)}`)
  yield* Console.log(`   Polish:          ${writerPhaseResult.timing.polishMs > 0 ? formatDuration(writerPhaseResult.timing.polishMs) : "skipped"}`)
  yield* Console.log(`   Total:           ${formatDuration(totalMs)}`)
  yield* Console.log("")

  yield* Console.log("🎯 Token Usage:")
  yield* Console.log(`   Input:  ${tokenUsage.inputTokens.toLocaleString()}`)
  yield* Console.log(`   Output: ${tokenUsage.outputTokens.toLocaleString()}`)
  yield* Console.log(`   Total:  ${tokenUsage.totalTokens.toLocaleString()}`)
  yield* Console.log(`   Prompt savings: ~${tokenStats.tokenSavings.toLocaleString()} tokens (${((tokenStats.tokenSavings/tokenStats.inlineTokens)*100).toFixed(0)}%)`)
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

  // Persist to database if enabled
  if (!skipPersistence) {
    yield* persistToDatabase(
      targetDate,
      researchPhaseResult.researchResult.context as unknown as Record<string, unknown>,
      researchPhaseResult.timing.researchMs,
      researchPhaseResult.researchResult.toolCallCount,
      summary,
      tokenUsage
    )
  }

  // Save full summary JSON to file for inspection
  const summaryPath = `/tmp/daily-summary-${summary.date}.json`
  yield* Effect.promise(() => Bun.write(summaryPath, JSON.stringify(summary, null, 2)))
  yield* Console.log(`📄 Full summary saved to: ${summaryPath}`)

  return {
    summary,
    timing: {
      dataCollectionMs: researchPhaseResult.timing.dataCollectionMs,
      researchMs: researchPhaseResult.timing.researchMs,
      writingMs: writerPhaseResult.timing.writingMs,
      polishMs: writerPhaseResult.timing.polishMs,
      totalMs
    },
    tokenUsage,
    tokenSavings: tokenStats
  }
})

// =============================================================================
// Layer Composition
// =============================================================================

// DayDataCollector needs ArtifactStoreService for collectDayWithArtifacts
const DataCollectorWithArtifacts = DayDataCollector.Default.pipe(
  Layer.provide(ArtifactStoreService.Default)
)

// FaissClient layer for persistence
const FaissClientLayer = FaissClient.Default

// Base layers without model (model provided per-phase for multi-model)
const BaseAgentLayers = Layer.mergeAll(
  DataCollectorWithArtifacts,
  SummaryResearchAgent.Default,
  SummaryWriterAgent.Default,
  SummaryPolishAgent.Default,
  ArtifactStoreService.Default,
  FaissClientLayer
)

const BaseLayer = BaseAgentLayers.pipe(
  Layer.provide(CrateToolsWithContextLive)
)

// Single-model layer (when not using multi-model)
const SingleModelLayer = BaseLayer.pipe(
  Layer.provideMerge(ConfigurableModelLive)
)

// =============================================================================
// Multi-Model Program
// =============================================================================

const multiModelProgram = Effect.gen(function* () {
  yield* Console.log("\n📰 Daily Summary Pipeline - ARTIFACTS MODE (Multi-Model)")
  yield* Console.log("━".repeat(60))
  yield* Console.log("")

  yield* Console.log(`📅 Target date: ${targetDate}`)
  yield* Console.log(`💾 Persistence: ${skipPersistence ? "SKIPPED" : "enabled"}`)
  yield* Console.log(`✨ Polish: ${skipPolish ? "SKIPPED" : "enabled"}`)
  yield* Console.log(`🤖 Research model: ${researchModel}`)
  yield* Console.log(`🤖 Writer model: ${writerModel}`)
  yield* Console.log("")

  const pipelineStart = yield* Clock.currentTimeMillis

  // Run research phase with research model
  const researchModelLayer = createModelLayer(aiProvider, researchModel!)
  const researchLayer = BaseLayer.pipe(Layer.provideMerge(researchModelLayer))

  const researchPhaseResult = yield* runResearchPhase(targetDate).pipe(
    Effect.provide(researchLayer)
  )

  // Run writer phase with writer model
  const writerModelLayer = createModelLayer(aiProvider, writerModel!)
  const writerLayer = BaseLayer.pipe(Layer.provideMerge(writerModelLayer))

  const writerPhaseResult = yield* runWriterPhase(researchPhaseResult, skipPolish).pipe(
    Effect.provide(writerLayer)
  )

  const { polishedSummary, categorizedIds, tokenUsage } = writerPhaseResult
  const { tokenStats } = researchPhaseResult

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

  // Results output (same as single-model)
  yield* Console.log("━".repeat(60))
  yield* Console.log("✅ Pipeline Complete - MULTI-MODEL MODE")
  yield* Console.log("━".repeat(60))
  yield* Console.log("")

  yield* Console.log("⏱️  Timing:")
  yield* Console.log(`   Data collection: ${formatDuration(researchPhaseResult.timing.dataCollectionMs)}`)
  yield* Console.log(`   Research:        ${formatDuration(researchPhaseResult.timing.researchMs)}`)
  yield* Console.log(`   Writing:         ${formatDuration(writerPhaseResult.timing.writingMs)}`)
  yield* Console.log(`   Polish:          ${writerPhaseResult.timing.polishMs > 0 ? formatDuration(writerPhaseResult.timing.polishMs) : "skipped"}`)
  yield* Console.log(`   Total:           ${formatDuration(totalMs)}`)
  yield* Console.log("")

  yield* Console.log("🎯 Token Usage:")
  yield* Console.log(`   Input:  ${tokenUsage.inputTokens.toLocaleString()}`)
  yield* Console.log(`   Output: ${tokenUsage.outputTokens.toLocaleString()}`)
  yield* Console.log(`   Total:  ${tokenUsage.totalTokens.toLocaleString()}`)
  yield* Console.log(`   Prompt savings: ~${tokenStats.tokenSavings.toLocaleString()} tokens (${((tokenStats.tokenSavings/tokenStats.inlineTokens)*100).toFixed(0)}%)`)
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

  // Persist to database if enabled
  if (!skipPersistence) {
    yield* persistToDatabase(
      targetDate,
      researchPhaseResult.researchResult.context as unknown as Record<string, unknown>,
      researchPhaseResult.timing.researchMs,
      researchPhaseResult.researchResult.toolCallCount,
      summary,
      tokenUsage
    )
  }

  const summaryPath = `/tmp/daily-summary-${summary.date}.json`
  yield* Effect.promise(() => Bun.write(summaryPath, JSON.stringify(summary, null, 2)))
  yield* Console.log(`📄 Full summary saved to: ${summaryPath}`)

  return {
    summary,
    timing: {
      dataCollectionMs: researchPhaseResult.timing.dataCollectionMs,
      researchMs: researchPhaseResult.timing.researchMs,
      writingMs: writerPhaseResult.timing.writingMs,
      polishMs: writerPhaseResult.timing.polishMs,
      totalMs
    },
    tokenUsage,
    tokenSavings: tokenStats
  }
})

// =============================================================================
// Run
// =============================================================================

// Choose program based on multi-model mode
const mainProgram = useMultiModel ? multiModelProgram : program

// Choose layer based on multi-model mode (multi-model provides its own layers)
const mainLayer = useMultiModel ? Layer.empty : SingleModelLayer

NodeRuntime.runMain(
  mainProgram.pipe(
    Effect.provide(mainLayer),
    Effect.tapErrorCause(cause =>
      Console.error(`\n💥 Fatal error:\n${cause}`)
    )
  )
)
