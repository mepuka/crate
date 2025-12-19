#!/usr/bin/env bun
/**
 * Test script for Nano Banana Pro (Gemini native image generation)
 *
 * "Nano Banana" = Google's code name for native image output in Gemini
 *   - Nano Banana: gemini-2.5-flash-image
 *   - Nano Banana Pro: gemini-3-pro-image-preview (state-of-the-art)
 *
 * Run with:
 *   set -a && source .env && set +a && bun run src/scripts/test-nano-banana.ts
 */

import { Effect, Console, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import * as GoogleClientModule from "@effect/ai-google/GoogleClient";
import * as fs from "node:fs";

// Nano Banana Pro model - state-of-the-art image generation
const NANO_BANANA_PRO_MODEL = "gemini-3-pro-image-preview";

// Get API key from environment
const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error("❌ Missing GOOGLE_API_KEY or GOOGLE_AI_API_KEY");
  process.exit(1);
}

// Build the client layer directly with FetchHttpClient
const GoogleClientLive = Layer.provide(
  GoogleClientModule.layer({
    apiKey: Redacted.make(apiKey),
    transformClient: HttpClient.retryTransient({ times: 3 }),
  }),
  FetchHttpClient.layer
);

const program = Effect.gen(function* () {
  yield* Console.log(`\n🍌 Testing Nano Banana Pro (${NANO_BANANA_PRO_MODEL})...\n`);

  // Access the GoogleClient from context
  const googleClient = yield* GoogleClientModule.GoogleClient;

  // Build request with responseModalities including IMAGE
  const request = {
    model: NANO_BANANA_PRO_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Generate a cozy, warm illustration of a vintage record player with vinyl records stacked beside it in a dimly lit room. Lo-fi indie aesthetic with soft warm lighting and nostalgic feel. Style: digital art with muted warm colors.",
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  yield* Console.log("📤 Sending request to Gemini...");

  // Call generateContent with image modality
  const response = yield* googleClient.generateContent(request as any);

  yield* Console.log("📥 Response received!");
  yield* Console.log(`Candidates: ${response.candidates?.length ?? 0}`);

  // Check for image parts in response
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if ("text" in part && part.text) {
        yield* Console.log(`\n📝 Text: ${part.text.slice(0, 200)}...`);
      }
      if ("inlineData" in part && part.inlineData) {
        yield* Console.log(`\n🖼️  Image received!`);
        yield* Console.log(`   MIME type: ${part.inlineData.mimeType}`);
        yield* Console.log(`   Data length: ${part.inlineData.data?.length ?? 0} bytes`);

        // Save the image
        if (part.inlineData.data) {
          const buffer = Buffer.from(part.inlineData.data, "base64");
          const filename = `/tmp/nano-banana-test-${Date.now()}.png`;
          fs.writeFileSync(filename, buffer);
          yield* Console.log(`   💾 Saved to: ${filename}`);
        }
      }
    }
  }

  yield* Console.log(`\n✅ Nano Banana Pro test complete!`);

  return response;
});

// Run the test with scoped runtime for resource cleanup
Effect.runPromise(
  program.pipe(
    Effect.scoped,
    Effect.provide(GoogleClientLive),
    Effect.catchAll((error) =>
      Console.error(`❌ Error: ${JSON.stringify(error, null, 2)}`).pipe(
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
