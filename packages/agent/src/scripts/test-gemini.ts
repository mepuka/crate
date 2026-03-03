#!/usr/bin/env npx tsx
/**
 * Test script for configurable AI provider
 *
 * Run with:
 *   # Default (Claude Haiku)
 *   npx tsx src/scripts/test-gemini.ts
 *
 *   # Google Gemini
 *   AI_PROVIDER=google npx tsx src/scripts/test-gemini.ts
 *
 *   # Specific model
 *   AI_PROVIDER=google AI_MODEL=gemini-2.5-pro npx tsx src/scripts/test-gemini.ts
 */

import { Effect, Console, Layer } from "effect";
import { LanguageModel, Prompt } from "@effect/ai";
import { ConfigurableModelLive } from "../layers.js";
import { AIModelConfig } from "../config.js";

const program = Effect.gen(function* () {
  // Show which provider/model we're using
  const config = yield* AIModelConfig;
  yield* Console.log(`\n🔍 Testing ${config.provider}/${config.model}...\n`);

  // Get the language model
  const model = yield* LanguageModel.LanguageModel;

  // Simple text generation test
  yield* Console.log("Test 1: Simple text generation");

  // Build prompt using Prompt.make with user message
  const prompt = Prompt.fromMessages([
    Prompt.userMessage({
      content: [
        Prompt.makePart("text", {
          text: "You are a music expert. In one sentence, describe what makes KEXP radio station unique."
        })
      ]
    })
  ]);

  const response = yield* model.generateText({
    prompt,
  });

  yield* Console.log(`Response: ${response.text}\n`);

  yield* Console.log(`✅ ${config.provider}/${config.model} working!`);

  return response;
});

const ModelLive = Layer.mergeAll(
  ConfigurableModelLive,
  AIModelConfig.Default
);

// Run the test
Effect.runPromise(
  program.pipe(
    Effect.provide(ModelLive),
    Effect.catchAll((error) =>
      Console.error(`❌ Error: ${error}`).pipe(
        Effect.zipRight(Effect.fail(error))
      )
    )
  )
).then(() => {
  console.log("\n🎉 Test passed!");
  process.exit(0);
}).catch((error) => {
  console.error("\n💥 Test failed:", error);
  process.exit(1);
});
