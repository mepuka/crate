#!/usr/bin/env bun
/**
 * Generate Crate Cat Variant
 *
 * Uses the AlbumArtEnhancementService with:
 * - Canonical Crate Cat as base
 * - Inspiration images as style references
 * - Album art analysis to guide the aesthetic
 *
 * Usage:
 *   bun run src/scripts/generate-crate-cat-variant.ts
 */

import { Effect, Console, Layer } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { FetchHttpClient } from "@effect/platform";
import { GoogleClient } from "@effect/ai-google";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AlbumArtEnhancementService,
  AlbumArtEnhancementServiceLive,
} from "../services/AlbumArtEnhancementService.js";
import { GoogleAIConfig } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Build GoogleClient layer from config
const GoogleClientLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* GoogleAIConfig;
    return GoogleClient.layer({
      apiKey: config.apiKey,
    }).pipe(Layer.provide(FetchHttpClient.layer));
  })
);

// Full service layer with all dependencies
const EnhancementServiceLive = Layer.provide(
  AlbumArtEnhancementServiceLive,
  GoogleClientLive
);

const REFERENCES_DIR = path.join(__dirname, "../../references/crate-cat");
const OUTPUT_DIR = path.join(__dirname, "../../test-output/crate-cat-variants");

// King Stingray creative analysis from the previous test run
const KING_STINGRAY_ANALYSIS = {
  creativeDescription: "A dreamy, out-of-focus record image awash in vibrant blues and purples",
  mood: "Playful, energetic, adventurous, whimsical",
  era: "Modern surf rock with Indigenous Australian influences",
  palette: {
    dominant: "#93B8D4",
    colors: ["#93B8D4", "#E8D5A3", "#2A4B6E", "#F5E6C8"],
    temperature: "warm" as const,
  },
  elements: ["Bright colors", "Energetic composition", "Surf rock vibes", "Playful imagery"],
};

const loadImageAsBase64 = async (imagePath: string): Promise<string> => {
  const buffer = await fs.readFile(imagePath);
  return buffer.toString("base64");
};

const saveBase64Image = async (base64: string, outputPath: string): Promise<void> => {
  const buffer = Buffer.from(base64, "base64");
  await fs.writeFile(outputPath, buffer);
};

const program = Effect.gen(function* () {
  yield* Console.log("🐱 Generating Crate Cat Variant");
  yield* Console.log("   Style: King Stingray (Surf Rock, Playful, Warm)");
  yield* Console.log("");

  // Ensure output directory exists
  yield* Effect.promise(() => fs.mkdir(OUTPUT_DIR, { recursive: true }));

  // Load canonical Crate Cat
  yield* Console.log("📦 Loading canonical Crate Cat...");
  const canonicalPath = path.join(REFERENCES_DIR, "canonical.jpg");
  const canonicalBase64 = yield* Effect.promise(() => loadImageAsBase64(canonicalPath));
  yield* Console.log(`   Loaded: ${canonicalPath}`);

  // Load inspiration images
  yield* Console.log("✨ Loading inspiration images...");
  const inspirationsDir = path.join(REFERENCES_DIR, "inspirations");
  const inspirationFiles = [
    "record-store-cat.jpg",
    "vinyl-crate-cat.jpg",
    "music-cat-illustration.jpg",
  ];

  const inspirationImages: string[] = [];
  for (const file of inspirationFiles) {
    const imgPath = path.join(inspirationsDir, file);
    const base64 = yield* Effect.promise(() => loadImageAsBase64(imgPath));
    inspirationImages.push(base64);
    yield* Console.log(`   Loaded: ${file}`);
  }

  // Build custom prompt using King Stingray analysis
  const customPrompt = `
Generate a new Crate Cat illustration that captures the spirit of surf rock album art.

REFERENCE IMAGES:
- Image 1: The canonical Crate Cat (must preserve character identity)
- Images 2-4: Style inspirations showing cats in vinyl/music contexts

CHARACTER REQUIREMENTS (from canonical):
- Preserve Crate Cat's rounded ears with characteristic tilt
- Maintain curved, expressive tail
- Keep friendly, curious expression with round eyes
- Compact body proportions
- Recognizable silhouette

ALBUM CONTEXT (King Stingray - Surf Rock):
- Mood: ${KING_STINGRAY_ANALYSIS.mood}
- Era/Style: ${KING_STINGRAY_ANALYSIS.era}
- Color palette: ${KING_STINGRAY_ANALYSIS.palette.colors.join(", ")}
- Temperature: ${KING_STINGRAY_ANALYSIS.palette.temperature}
- Visual elements: ${KING_STINGRAY_ANALYSIS.elements.join(", ")}

STYLE DIRECTION:
- Blend the cozy vinyl den aesthetic from the inspiration images
- Apply the warm, playful, surf rock energy
- The cat should feel at home among records, perhaps with a surfboard motif or beach/wave subtle element
- Warm golden and blue tones from the palette
- Illustrated style that feels hand-crafted, not digital

OUTPUT:
A cohesive Crate Cat variant that works as a companion piece to surf rock album art,
maintaining character recognition while harmonizing with the playful, adventurous mood.
`;

  yield* Console.log("");
  yield* Console.log("🎨 Generating variant with Nano Banana Pro...");
  yield* Console.log(`   Mood: ${KING_STINGRAY_ANALYSIS.mood}`);
  yield* Console.log(`   Palette: ${KING_STINGRAY_ANALYSIS.palette.colors.join(", ")}`);

  const service = yield* AlbumArtEnhancementService;

  const startTime = Date.now();

  const response = yield* service.enhance({
    albumArtBase64: canonicalBase64,
    style: "custom",
    customPrompt,
    styleReferences: inspirationImages,
    resolution: "2K",
    aspectRatio: "square",
  });

  const elapsed = Date.now() - startTime;

  yield* Console.log("");
  yield* Console.log(`✅ Generation complete! (${elapsed}ms)`);

  // Save the generated image
  const outputFileName = `crate-cat-surf-rock-${Date.now()}.jpg`;
  const outputPath = path.join(OUTPUT_DIR, outputFileName);
  yield* Effect.promise(() => saveBase64Image(response.enhancedImageBase64, outputPath));

  yield* Console.log(`💾 Saved: ${outputPath}`);

  if (response.description) {
    yield* Console.log("");
    yield* Console.log("📝 Model description:");
    yield* Console.log(`   ${response.description}`);
  }

  // Open the result
  yield* Console.log("");
  yield* Console.log("🖼️  Opening result...");
  yield* Effect.promise(() =>
    import("node:child_process").then(({ exec }) =>
      new Promise((resolve) => exec(`open "${outputPath}"`, resolve))
    )
  );

  return outputPath;
}).pipe(
  Effect.provide(EnhancementServiceLive),
  Effect.provide(GoogleAIConfig.Default),
  Effect.tapError((error) => Console.error(`❌ Error: ${error}`))
);

NodeRuntime.runMain(program);
