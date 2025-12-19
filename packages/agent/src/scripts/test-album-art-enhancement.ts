#!/usr/bin/env bun
/**
 * Test script for Album Art Enhancement Service
 *
 * Demonstrates how to enhance album art using Nano Banana Pro with KEXP-aligned
 * cultural values and aesthetic constraints.
 *
 * Run with:
 *   set -a && source .env && set +a && bun run src/scripts/test-album-art-enhancement.ts
 */

import { Effect, Console, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import * as GoogleClientModule from "@effect/ai-google/GoogleClient";
import {
  AlbumArtEnhancementServiceLive,
  enhance,
  refine,
  ArtEnhancement,
  type EnhancementRequest,
} from "../services/AlbumArtEnhancementService.js";
import * as fs from "node:fs";

// Get API key from environment
const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error("❌ Missing GOOGLE_API_KEY or GOOGLE_AI_API_KEY");
  process.exit(1);
}

// Build the client layer
const GoogleClientLive = Layer.provide(
  GoogleClientModule.layer({
    apiKey: Redacted.make(apiKey),
    transformClient: HttpClient.retryTransient({ times: 3 }),
  }),
  FetchHttpClient.layer
);

// Full service stack
const ServiceLive = Layer.provide(
  AlbumArtEnhancementServiceLive,
  GoogleClientLive
);

// =============================================================================
// Helper: Load image as base64
// =============================================================================

const loadImageAsBase64 = (filePath: string): string => {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString("base64");
};

// =============================================================================
// Helper: Save base64 image to file
// =============================================================================

const saveBase64Image = (
  base64Data: string,
  outputPath: string
): Effect.Effect<void> =>
  Effect.sync(() => {
    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(outputPath, buffer);
  });

// =============================================================================
// Example 1: Lo-Fi Indie Enhancement
// =============================================================================

const exampleLoFiIndie = Effect.gen(function* () {
  yield* Console.log("\n📀 Example 1: Lo-Fi Indie Enhancement");
  yield* Console.log("=====================================\n");

  // For this example, we'll use a sample album art
  // Replace with actual album art path
  const albumArtPath = "/tmp/sample-album-art.jpg";

  // Check if sample exists
  if (!fs.existsSync(albumArtPath)) {
    yield* Console.log(
      `⚠️  Sample album art not found at ${albumArtPath}`
    );
    yield* Console.log("   Skipping Example 1");
    return;
  }

  const albumArtBase64 = loadImageAsBase64(albumArtPath);

  const request: EnhancementRequest = {
    albumArtBase64,
    style: "lo-fi-indie",
    resolution: "2K",
    aspectRatio: "square",
  };

  yield* Console.log("📤 Enhancing with lo-fi indie aesthetic...");

  const response = yield* enhance(request);

  yield* Console.log("✅ Enhancement complete!");
  yield* Console.log(`   MIME type: ${response.mimeType}`);
  if (response.description) {
    yield* Console.log(`   Description: ${response.description.slice(0, 200)}...`);
  }

  const outputPath = "/tmp/enhanced-lofi-indie.png";
  yield* saveBase64Image(response.enhancedImageBase64, outputPath);
  yield* Console.log(`💾 Saved to: ${outputPath}`);
});

// =============================================================================
// Example 2: Pacific Northwest Local Artist
// =============================================================================

const examplePNWLocal = Effect.gen(function* () {
  yield* Console.log("\n🌲 Example 2: Pacific Northwest Local Artist");
  yield* Console.log("==============================================\n");

  const albumArtPath = "/tmp/sample-album-art.jpg";

  if (!fs.existsSync(albumArtPath)) {
    yield* Console.log(
      `⚠️  Sample album art not found at ${albumArtPath}`
    );
    yield* Console.log("   Skipping Example 2");
    return;
  }

  const albumArtBase64 = loadImageAsBase64(albumArtPath);

  const request: EnhancementRequest = {
    albumArtBase64,
    style: "pnw-local",
    resolution: "2K",
    aspectRatio: "square",
  };

  yield* Console.log("📤 Enhancing with Pacific Northwest aesthetic...");

  const response = yield* enhance(request);

  yield* Console.log("✅ Enhancement complete!");

  const outputPath = "/tmp/enhanced-pnw-local.png";
  yield* saveBase64Image(response.enhancedImageBase64, outputPath);
  yield* Console.log(`💾 Saved to: ${outputPath}`);
});

// =============================================================================
// Example 3: Style Transfer with Reference Image
// =============================================================================

const exampleStyleTransfer = Effect.gen(function* () {
  yield* Console.log("\n🎨 Example 3: Style Transfer with Reference Image");
  yield* Console.log("===================================================\n");

  const albumArtPath = "/tmp/sample-album-art.jpg";
  const styleRefPath = "/tmp/style-reference.jpg";

  if (!fs.existsSync(albumArtPath)) {
    yield* Console.log(
      `⚠️  Sample album art not found at ${albumArtPath}`
    );
    yield* Console.log("   Skipping Example 3");
    return;
  }

  if (!fs.existsSync(styleRefPath)) {
    yield* Console.log(
      `⚠️  Style reference not found at ${styleRefPath}`
    );
    yield* Console.log("   Skipping Example 3");
    return;
  }

  const albumArtBase64 = loadImageAsBase64(albumArtPath);
  const styleRefBase64 = loadImageAsBase64(styleRefPath);

  const request: EnhancementRequest = {
    albumArtBase64,
    style: "custom",
    customPrompt: `
      Using the provided album art (Image 1) and style reference (Image 2),
      apply the color palette and texture treatment from Image 2 to Image 1.
      Preserve Image 1's composition and artist identity entirely.
    `,
    styleReferences: [styleRefBase64],
    resolution: "2K",
    aspectRatio: "square",
  };

  yield* Console.log("📤 Applying style transfer...");

  const response = yield* enhance(request);

  yield* Console.log("✅ Style transfer complete!");

  const outputPath = "/tmp/enhanced-style-transfer.png";
  yield* saveBase64Image(response.enhancedImageBase64, outputPath);
  yield* Console.log(`💾 Saved to: ${outputPath}`);
});

// =============================================================================
// Example 4: Conversational Refinement
// =============================================================================

const exampleConversationalRefinement = Effect.gen(function* () {
  yield* Console.log("\n🔄 Example 4: Conversational Refinement");
  yield* Console.log("=========================================\n");

  const albumArtPath = "/tmp/sample-album-art.jpg";

  if (!fs.existsSync(albumArtPath)) {
    yield* Console.log(
      `⚠️  Sample album art not found at ${albumArtPath}`
    );
    yield* Console.log("   Skipping Example 4");
    return;
  }

  const albumArtBase64 = loadImageAsBase64(albumArtPath);

  // Turn 1: Initial enhancement
  yield* Console.log("📤 Turn 1: Initial enhancement with minimal style...");

  const initialRequest: EnhancementRequest = {
    albumArtBase64,
    style: "minimal",
    resolution: "2K",
    aspectRatio: "square",
  };

  const response1 = yield* enhance(initialRequest);
  yield* Console.log("✅ Turn 1 complete!");

  const output1Path = "/tmp/enhanced-refinement-turn1.png";
  yield* saveBase64Image(response1.enhancedImageBase64, output1Path);
  yield* Console.log(`💾 Turn 1 saved to: ${output1Path}`);

  // Turn 2: Refine with warmer color palette
  yield* Console.log("\n📤 Turn 2: Make the color palette warmer...");

  const response2 = yield* refine(
    response1,
    "Make the color palette warmer with more sepia tones"
  );

  yield* Console.log("✅ Turn 2 complete!");

  const output2Path = "/tmp/enhanced-refinement-turn2.png";
  yield* saveBase64Image(response2.enhancedImageBase64, output2Path);
  yield* Console.log(`💾 Turn 2 saved to: ${output2Path}`);

  // Turn 3: Add film grain
  yield* Console.log("\n📤 Turn 3: Add subtle film grain...");

  const response3 = yield* refine(
    response2,
    "Add subtle film grain texture, maintaining the warm color palette"
  );

  yield* Console.log("✅ Turn 3 complete!");

  const output3Path = "/tmp/enhanced-refinement-turn3.png";
  yield* saveBase64Image(response3.enhancedImageBase64, output3Path);
  yield* Console.log(`💾 Final refined image saved to: ${output3Path}`);
});

// =============================================================================
// Example 5: Concert Poster with Text Overlay
// =============================================================================

const exampleConcertPoster = Effect.gen(function* () {
  yield* Console.log("\n🎸 Example 5: Concert Poster with Text Overlay");
  yield* Console.log("================================================\n");

  const albumArtPath = "/tmp/sample-album-art.jpg";

  if (!fs.existsSync(albumArtPath)) {
    yield* Console.log(
      `⚠️  Sample album art not found at ${albumArtPath}`
    );
    yield* Console.log("   Skipping Example 5");
    return;
  }

  const albumArtBase64 = loadImageAsBase64(albumArtPath);

  const request: EnhancementRequest = {
    albumArtBase64,
    style: "concert-poster",
    resolution: "2K",
    aspectRatio: "portrait",
    textOverlay: {
      text: "Live at The Crocodile - March 15, 2025",
      typography: "clean sans-serif, bold",
      placement: "bottom margin, centered",
    },
  };

  yield* Console.log("📤 Creating concert poster...");

  const response = yield* enhance(request);

  yield* Console.log("✅ Concert poster created!");

  const outputPath = "/tmp/enhanced-concert-poster.png";
  yield* saveBase64Image(response.enhancedImageBase64, outputPath);
  yield* Console.log(`💾 Saved to: ${outputPath}`);
});

// =============================================================================
// Example 6: Composable Builder API
// =============================================================================

const exampleBuilderAPI = Effect.gen(function* () {
  yield* Console.log("\n🔧 Example 6: Composable Builder API");
  yield* Console.log("=====================================\n");

  const albumArtPath = "/tmp/sample-album-art.jpg";

  if (!fs.existsSync(albumArtPath)) {
    yield* Console.log(
      `⚠️  Sample album art not found at ${albumArtPath}`
    );
    yield* Console.log("   Skipping Example 6");
    return;
  }

  const albumArtBase64 = loadImageAsBase64(albumArtPath);

  yield* Console.log("📤 Using composable builder API...");

  // Demonstrate the fluent builder pattern
  const result = yield* ArtEnhancement
    .from(albumArtBase64)
    .style("lo-fi-indie")
    .withGrain(0.15)
    .warmth(1.3)
    .vintage(true)
    .filmStock("kodak")
    .resolution("2K")
    .build();

  yield* Console.log("✅ Builder API enhancement complete!");
  yield* Console.log(`   MIME type: ${result.mimeType}`);
  if (result.description) {
    yield* Console.log(`   Description: ${result.description.slice(0, 200)}...`);
  }

  const outputPath = "/tmp/enhanced-builder-api.png";
  yield* saveBase64Image(result.enhancedImageBase64, outputPath);
  yield* Console.log(`💾 Saved to: ${outputPath}`);
});

// =============================================================================
// Main Program
// =============================================================================

const program = Effect.gen(function* () {
  yield* Console.log("\n🍌 Nano Banana Pro Album Art Enhancement Examples");
  yield* Console.log("==================================================\n");

  yield* Console.log("Testing Album Art Enhancement Service with KEXP-aligned prompts\n");

  // Run all examples (sequentially)
  yield* exampleLoFiIndie;
  yield* examplePNWLocal;
  yield* exampleStyleTransfer;
  yield* exampleConversationalRefinement;
  yield* exampleConcertPoster;
  yield* exampleBuilderAPI;

  yield* Console.log("\n✅ All examples complete!");
  yield* Console.log("\nOutputs saved to /tmp/enhanced-*.png");
});

// =============================================================================
// Run
// =============================================================================

Effect.runPromise(
  program.pipe(
    Effect.scoped,
    Effect.provide(ServiceLive),
    Effect.catchAll((error) =>
      Console.error(`❌ Error: ${JSON.stringify(error, null, 2)}`).pipe(
        Effect.zipRight(Effect.fail(error))
      )
    )
  )
)
  .then(() => {
    console.log("\n🎉 Test complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Test failed:", error);
    process.exit(1);
  });
