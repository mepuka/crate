#!/usr/bin/env bun
/**
 * Test script for Derived Asset Generator
 *
 * Runs the full art curation pipeline and generates viewable SVG assets.
 * Opens the HTML preview in the browser when complete.
 *
 * Usage:
 *   GOOGLE_AI_API_KEY=... bun run src/scripts/test-asset-generator.ts
 *   GOOGLE_AI_API_KEY=... bun run src/scripts/test-asset-generator.ts --open
 */

import { Effect, Console, Layer } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import {
  curate,
  ArtCurationServiceGeminiWithConfig,
} from "../services/ArtCurationService.js";
import { GoogleAIConfig } from "../config.js";
import {
  generateAssets,
  DerivedAssetGeneratorLive,
} from "../services/DerivedAssetGenerator.js";

const execAsync = promisify(exec);

// Test images - using Unsplash for reliable access
const TEST_IMAGES = [
  {
    url: "https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?w=500",
    context: {
      artistName: "Vinyl Dreams",
      albumTitle: "Analog Memories",
      releaseYear: 2023,
      genres: ["Indie", "Alternative", "Lo-Fi"],
      isLocal: true,
    },
  },
  {
    url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500",
    context: {
      artistName: "Stage Lights",
      albumTitle: "Live at the Paramount",
      releaseYear: 2024,
      genres: ["Rock", "Live"],
      isLocal: false,
    },
  },
  {
    url: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=500",
    context: {
      artistName: "Neon Streets",
      albumTitle: "After Midnight",
      releaseYear: 2024,
      genres: ["Electronic", "Synthwave"],
      isLocal: false,
    },
  },
];

const shouldOpen = process.argv.includes("--open");

const program = Effect.gen(function* () {
  yield* Console.log("🎨 Art Curation & Asset Generation Test");
  yield* Console.log("═".repeat(50));

  // Output directory for generated assets
  const outputDir = path.join(process.cwd(), "test-output", "art-assets");
  yield* Console.log(`📁 Output directory: ${outputDir}`);
  yield* Console.log("");

  // Process each test image
  for (const [index, test] of TEST_IMAGES.entries()) {
    yield* Console.log(`\n🖼️  Test ${index + 1}: ${test.context.artistName} - ${test.context.albumTitle}`);
    yield* Console.log(`   Genres: ${test.context.genres.join(", ")}`);
    yield* Console.log(`   Image: ${test.url.substring(0, 60)}...`);

    const startTime = Date.now();

    // Run curation
    yield* Console.log("   ⏳ Analyzing with Gemini Vision...");
    const curationResult = yield* curate(test.url, test.context);

    const curationTime = Date.now() - startTime;
    yield* Console.log(`   ✅ Analysis complete (${curationTime}ms)`);

    // Generate assets
    const baseName = test.context.artistName.toLowerCase().replace(/\s+/g, "-");
    const assetDir = path.join(outputDir, baseName);

    yield* Console.log("   🎨 Generating assets...");
    const bundle = yield* generateAssets(curationResult, assetDir, test.url, baseName);

    yield* Console.log(`   📄 Generated files:`);
    yield* Console.log(`      - ${bundle.glow.filename}`);
    yield* Console.log(`      - ${bundle.gradient.filename}`);
    if (bundle.texture) {
      yield* Console.log(`      - ${bundle.texture.filename}`);
    }
    yield* Console.log(`      - ${baseName}-preview.html`);

    // Summary
    yield* Console.log(`   📊 Analysis Summary:`);
    yield* Console.log(`      Mood: ${curationResult.analysis.moodAtmosphere}`);
    yield* Console.log(`      Era: ${curationResult.analysis.eraAesthetic}`);
    yield* Console.log(`      Palette: ${curationResult.palette.temperature} (${curationResult.palette.dominant})`);
    yield* Console.log(`      Texture: ${curationResult.derivedAssets.textureRecommendation}`);

    // Open preview if requested (only for first one)
    if (shouldOpen && index === 0) {
      yield* Console.log("   🌐 Opening preview in browser...");
      yield* Effect.tryPromise({
        try: () => execAsync(`open "${bundle.htmlPreview}"`),
        catch: () => new Error("Failed to open browser"),
      });
    }
  }

  yield* Console.log("\n" + "═".repeat(50));
  yield* Console.log("✅ All tests complete!");
  yield* Console.log(`📁 View assets in: ${outputDir}`);

  if (!shouldOpen) {
    yield* Console.log("\n💡 Tip: Run with --open to open the preview in your browser");
  }
}).pipe(
  Effect.provide(
    Layer.merge(ArtCurationServiceGeminiWithConfig, DerivedAssetGeneratorLive)
  ),
  Effect.provide(GoogleAIConfig.Default),
  Effect.tapError((error) => Console.error(`❌ Error: ${error}`))
);

NodeRuntime.runMain(program);
