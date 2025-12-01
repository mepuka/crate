/**
 * Basic Music Agent Example
 *
 * Demonstrates how to use the Music Agent to query the FAISS search API
 * using natural language.
 *
 * Prerequisites:
 * 1. Python FAISS API running at http://localhost:8000
 * 2. OPENAI_API_KEY environment variable set
 *
 * Usage:
 *   bun run packages/agent/src/examples/basic.ts
 *   # or
 *   pnpm --filter @crate/agent dev
 */

import { Effect, Console } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { MusicAgent, MusicAgentLive } from "../MusicAgent.js";

/**
 * Example program that asks the agent to find music
 */
const program = Effect.gen(function* () {
  yield* Console.log("🎵 Music Agent Example - KEXP Search");
  yield* Console.log("=====================================\n");

  // Get the agent service
  const agent = yield* MusicAgent;

  // Example queries to demonstrate the agent
  const queries = ["psychedelic rock", "ambient electronic", "upbeat indie"];

  // Ask each question
  for (const query of queries) {
    yield* Console.log(`\n❓ Searching for: ${query}`);
    yield* Console.log("─".repeat(50));

    const response = yield* agent.ask(query);
    yield* Console.log(`\n💬 ${response}`);
    yield* Console.log("\n");
  }

  yield* Console.log("✨ Done!");
});

/**
 * Run the program with all dependencies
 */
const runnable = program.pipe(
  Effect.provide(MusicAgentLive),
  Effect.catchAll((error) =>
    Console.error(`❌ Error: ${String(error)}`).pipe(
      Effect.flatMap(() => Effect.fail(error))
    )
  )
);

// Execute
NodeRuntime.runMain(runnable);
