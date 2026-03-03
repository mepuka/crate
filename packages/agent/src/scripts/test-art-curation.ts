#!/usr/bin/env npx tsx
/**
 * Test script for Art Curation Service with Gemini Vision
 *
 * Tests the art curation pipeline with a real album art image.
 *
 * Usage:
 *   GOOGLE_AI_API_KEY=... npx tsx src/scripts/test-art-curation.ts
 */

import { Effect, Console, Layer } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import {
  curate,
  ArtCurationServiceGeminiWithConfig,
} from "../services/ArtCurationService.js";
import { GoogleAIConfig } from "../config.js";

// Test with a real album cover image from Unsplash (vinyl records)
const TEST_IMAGE_URL =
  "https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?w=500";

const TEST_CONTEXT = {
  artistName: "Indie Artist",
  albumTitle: "Vinyl Dreams",
  releaseYear: 2023,
  genres: ["Indie", "Alternative", "Lo-Fi"],
  isLocal: true,
};

const ArtCurationLive = ArtCurationServiceGeminiWithConfig.pipe(
  Layer.provide(GoogleAIConfig.Default)
);

const program = Effect.gen(function* () {
  yield* Console.log("🎨 Testing Art Curation with Gemini Vision");
  yield* Console.log(`📀 Album: ${TEST_CONTEXT.artistName} - ${TEST_CONTEXT.albumTitle}`);
  yield* Console.log(`🖼️  Image: ${TEST_IMAGE_URL}`);
  yield* Console.log("");

  const startTime = Date.now();

  const result = yield* curate(TEST_IMAGE_URL, TEST_CONTEXT);

  const elapsed = Date.now() - startTime;

  yield* Console.log("✅ Art Curation Complete!");
  yield* Console.log(`⏱️  Time: ${elapsed}ms`);
  yield* Console.log("");

  yield* Console.log("📝 Creative Analysis:");
  yield* Console.log(`   Description: ${result.analysis.creativeDescription}`);
  yield* Console.log(`   Mood: ${result.analysis.moodAtmosphere}`);
  yield* Console.log(`   Era: ${result.analysis.eraAesthetic}`);
  yield* Console.log(`   Elements: ${result.analysis.interestingElements.join(", ")}`);
  yield* Console.log("");

  yield* Console.log("🎨 Color Palette:");
  yield* Console.log(`   Dominant: ${result.palette.dominant}`);
  yield* Console.log(`   Colors: ${result.palette.colors.join(", ")}`);
  yield* Console.log(`   Temperature: ${result.palette.temperature}`);
  yield* Console.log("");

  yield* Console.log("✨ Derived Assets:");
  yield* Console.log(`   Glow Color: ${result.derivedAssets.glowColor}`);
  yield* Console.log(`   Gradient: ${result.derivedAssets.gradientCss}`);
  yield* Console.log(`   Texture: ${result.derivedAssets.textureRecommendation}`);
  yield* Console.log(`   Reasoning: ${result.derivedAssets.reasoning}`);

  return result;
}).pipe(
  Effect.provide(ArtCurationLive),
  Effect.tapError((error) =>
    Console.error(`❌ Error: ${error}`)
  )
);

NodeRuntime.runMain(program);
