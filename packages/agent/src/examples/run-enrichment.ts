#!/usr/bin/env bun
/**
 * Run agent enrichment flow against prod API
 *
 * Usage:
 *   bun run --env-file=.env src/examples/run-enrichment.ts
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY environment variable set
 *   - FAISS_API_URL environment variable (defaults to localhost:8000)
 */

import { Effect, Console, Layer, Logger, LogLevel } from "effect";
import { BunRuntime } from "@effect/platform-bun";
import { MusicAgent, MusicAgentWithAnthropicLive } from "../MusicAgent.js";
import { FaissClient, FaissClientLive } from "../FaissClient.js";

// Get play IDs from command line or use recent plays
const playIdsArg = process.argv[2];

// Jump to percentage of timeline (0.0 = most recent, 1.0 = oldest)
// Use JUMP=0.5 to start halfway through the timeline
const jumpArg = process.env.JUMP ? parseFloat(process.env.JUMP) : undefined;

// Limit for timeline
const limitArg = parseInt(process.env.LIMIT || "1", 10);

// Enable debug logging with DEBUG=1 env var
const isDebug = process.env.DEBUG === "1";

const program = Effect.gen(function* () {
  yield* Console.log("=".repeat(60));
  yield* Console.log("Crate Agent Enrichment Flow");
  yield* Console.log("=".repeat(60));

  const faissClient = yield* FaissClient;
  const agent = yield* MusicAgent;

  // Get play IDs to enrich
  let playIds: number[];

  if (playIdsArg) {
    // Parse comma-separated play IDs from command line
    playIds = playIdsArg.split(",").map((id) => parseInt(id.trim(), 10));
    yield* Console.log(`Using provided play IDs: ${playIds.join(", ")}`);
  } else {
    // Fetch plays from timeline
    const jumpInfo = jumpArg !== undefined ? ` @ ${(jumpArg * 100).toFixed(0)}%` : "";
    yield* Console.log(
      `Fetching ${limitArg} plays from timeline${jumpInfo}...`
    );
    const timeline = yield* faissClient.timeline({
      limit: limitArg,
      ...(jumpArg !== undefined ? { percentage: jumpArg } : {}),
    });
    playIds = timeline.results.map((play) => play.id);
    yield* Console.log(
      `Got ${playIds.length} plays: ${playIds.join(", ")}`
    );

    // Show what we're about to enrich
    for (const play of timeline.results) {
      yield* Console.log(`  - ${play.id}: "${play.song}" by ${play.artist}`);
    }
  }

  yield* Console.log("\n" + "-".repeat(60));
  yield* Console.log("Starting enrichment...");
  yield* Console.log("-".repeat(60) + "\n");

  // Run enrichment
  const result = yield* agent.enrichPlays(playIds);

  yield* Console.log("\n" + "=".repeat(60));
  yield* Console.log(
    `Enrichment complete! ${result.count} insights generated.`
  );
  yield* Console.log("=".repeat(60));

  return result;
});

// Combined layer with FaissClient exposed for timeline fetch
// MusicAgentWithAnthropicLive includes both MusicAgent and LanguageModel
const AppLive = Layer.merge(FaissClientLive, MusicAgentWithAnthropicLive);

// Run with all dependencies
// Use DEBUG=1 to enable debug-level logging (shows tool executions, etc.)
const runnable = program.pipe(
  Effect.provide(AppLive),
  Logger.withMinimumLogLevel(isDebug ? LogLevel.Debug : LogLevel.Info),
  Effect.catchAll((error) =>
    Console.error(`Error: ${String(error)}`).pipe(
      Effect.flatMap(() => Effect.fail(error))
    )
  )
);

BunRuntime.runMain(runnable);
