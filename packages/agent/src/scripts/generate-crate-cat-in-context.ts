#!/usr/bin/env bun
/**
 * Generate Crate Cat IN Context
 *
 * Full agent flow:
 * 1. Curate the actual album art (extract palette, mood, era, elements)
 * 2. Load canonical Crate Cat + inspirations as character references
 * 3. Generate a Crate Cat rendered IN THE STYLE of that album's visual world
 *
 * The cat should look like it belongs in that album's universe.
 *
 * Usage:
 *   bun run src/scripts/generate-crate-cat-in-context.ts
 */

import { Effect, Console, Layer } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import { GoogleClient } from "@effect/ai-google";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  curate,
  ArtCurationServiceGeminiWithConfig,
} from "../services/ArtCurationService.js";
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

// Full service layers
const CurationServiceLive = ArtCurationServiceGeminiWithConfig;
const EnhancementServiceLive = Layer.provide(
  AlbumArtEnhancementServiceLive,
  GoogleClientLive
);

const REFERENCES_DIR = path.join(__dirname, "../../references/crate-cat");
const OUTPUT_DIR = path.join(__dirname, "../../test-output/crate-cat-in-context");

// Default album - can be overridden with ALBUM_ART env var
const DEFAULT_ALBUM = {
  url: "https://dn720703.ca.archive.org/0/items/mbid-aa90104a-ec1e-4de3-b954-12a63ea39747/mbid-aa90104a-ec1e-4de3-b954-12a63ea39747-33233332974_thumb500.jpg",
  context: {
    artistName: "King Stingray",
    albumTitle: "King Stingray",
    releaseYear: 2022,
    genres: ["Surf Rock", "Indigenous Australian"],
    isLocal: false,
  },
};

// Allow overriding with ALBUM_ART env var
const ALBUM = process.env.ALBUM_ART
  ? {
      url: process.env.ALBUM_ART,
      context: {
        artistName: process.env.ALBUM_NAME || "Custom Album",
        albumTitle: process.env.ALBUM_NAME || "Custom Album",
        releaseYear: parseInt(process.env.ERA || "2024"),
        genres: (process.env.GENRES || "Rock").split(","),
        isLocal: false,
      },
    }
  : DEFAULT_ALBUM;

const loadImageAsBase64 = async (imagePath: string): Promise<string> => {
  const buffer = await fs.readFile(imagePath);
  return buffer.toString("base64");
};

const fetchImageAsBase64 = (url: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(url);
    const arrayBuffer = yield* response.arrayBuffer;
    return Buffer.from(arrayBuffer).toString("base64");
  });

const saveBase64Image = async (base64: string, outputPath: string): Promise<void> => {
  const buffer = Buffer.from(base64, "base64");
  await fs.writeFile(outputPath, buffer);
};

const program = Effect.gen(function* () {
  yield* Console.log("🐱 Generating Crate Cat IN Album Context");
  yield* Console.log(`   Album: ${ALBUM.context.artistName} - ${ALBUM.context.albumTitle}`);
  yield* Console.log(`   Genres: ${ALBUM.context.genres.join(", ")}`);
  yield* Console.log("");

  // Ensure output directory exists
  yield* Effect.promise(() => fs.mkdir(OUTPUT_DIR, { recursive: true }));

  // =========================================================================
  // Step 1: Curate the actual album art
  // =========================================================================
  yield* Console.log("🎨 Step 1: Curating album art...");
  const curation = yield* curate(ALBUM.url, ALBUM.context);

  yield* Console.log(`   Mood: ${curation.analysis.moodAtmosphere}`);
  yield* Console.log(`   Era: ${curation.analysis.eraAesthetic}`);
  yield* Console.log(`   Palette: ${curation.palette.colors.join(", ")}`);
  yield* Console.log(`   Temperature: ${curation.palette.temperature}`);
  yield* Console.log(`   Elements: ${curation.analysis.interestingElements.join(", ")}`);
  yield* Console.log("");

  // =========================================================================
  // Step 2: Load all reference images
  // =========================================================================
  yield* Console.log("📦 Step 2: Loading reference images...");

  // Fetch the actual album art
  const albumArtBase64 = yield* fetchImageAsBase64(ALBUM.url).pipe(
    Effect.provide(FetchHttpClient.layer)
  );
  yield* Console.log(`   Album art: ${ALBUM.url}`);

  // Load canonical Crate Cat
  const canonicalPath = path.join(REFERENCES_DIR, "canonical.jpg");
  const canonicalBase64 = yield* Effect.promise(() => loadImageAsBase64(canonicalPath));
  yield* Console.log(`   Canonical cat: ${canonicalPath}`);

  // Load inspiration images
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
    yield* Console.log(`   Inspiration: ${file}`);
  }
  yield* Console.log("");

  // =========================================================================
  // Step 3: Generate Crate Cat in the album's visual style
  // =========================================================================
  yield* Console.log("✨ Step 3: Generating Crate Cat in album's visual world...");

  // Build prompt that puts the cat INTO the album's world
  const customPrompt = `
You are creating a new illustration of Crate Cat - a music-loving feline mascot.

IMAGES PROVIDED:
- Image 1: The TARGET album art (King Stingray). The cat must be rendered in THIS visual style.
- Image 2: The CANONICAL Crate Cat. This defines the character's identity that must be preserved.
- Images 3-5: Style inspirations showing cats in vinyl/music contexts.

YOUR TASK:
Create a Crate Cat illustration that looks like it was drawn BY THE SAME ARTIST who created the King Stingray album art. The cat should feel native to that album's visual universe.

FROM THE ALBUM ART CURATION:
- Description: ${curation.analysis.creativeDescription}
- Mood: ${curation.analysis.moodAtmosphere}
- Era/Style: ${curation.analysis.eraAesthetic}
- Visual Elements: ${curation.analysis.interestingElements.join(", ")}
- Color Palette: ${curation.palette.colors.join(", ")}
- Dominant Color: ${curation.palette.dominant}
- Temperature: ${curation.palette.temperature}

CHARACTER IDENTITY (from canonical - MUST preserve):
- Rounded ears with characteristic tilt
- Curved, expressive tail
- Friendly, curious expression with round eyes
- Compact body proportions
- Recognizable silhouette

STYLE TRANSFER REQUIREMENTS:
- Use the EXACT color palette from the album art
- Match the artistic technique (brushwork, line quality, texture)
- Capture the same energy and mood
- The cat should look like it belongs in a sticker/badge/corner element for this album
- Think: "What if this album's artist drew a cat mascot for the record label?"

DO NOT:
- Make a generic cat illustration
- Use colors outside the album's palette
- Create a realistic cat photo
- Lose the Crate Cat character identity

OUTPUT:
A square illustration of Crate Cat rendered in King Stingray's visual style, suitable for use as a companion element to the album art.
`;

  const service = yield* AlbumArtEnhancementService;
  const startTime = Date.now();

  // Pass album art as the base, with canonical cat and inspirations as style references
  const response = yield* service.enhance({
    albumArtBase64: albumArtBase64, // The album art defines the style
    style: "custom",
    customPrompt,
    styleReferences: [canonicalBase64, ...inspirationImages], // Cat identity + inspirations
    resolution: "2K",
    aspectRatio: "square",
  });

  const elapsed = Date.now() - startTime;
  yield* Console.log(`   Generation complete! (${elapsed}ms)`);
  yield* Console.log("");

  // =========================================================================
  // Step 4: Save and display
  // =========================================================================
  const slug = ALBUM.context.artistName.toLowerCase().replace(/\s+/g, "-");
  const outputFileName = `crate-cat-${slug}-${Date.now()}.jpg`;
  const outputPath = path.join(OUTPUT_DIR, outputFileName);
  yield* Effect.promise(() => saveBase64Image(response.enhancedImageBase64, outputPath));

  yield* Console.log(`💾 Saved: ${outputPath}`);

  if (response.description) {
    yield* Console.log("");
    yield* Console.log("📝 Model notes:");
    yield* Console.log(`   ${response.description}`);
  }

  // Also save the curation data for reference
  const curationPath = path.join(OUTPUT_DIR, `${slug}-curation.json`);
  yield* Effect.promise(() =>
    fs.writeFile(curationPath, JSON.stringify(curation, null, 2))
  );

  // Open the result
  yield* Console.log("");
  yield* Console.log("🖼️  Opening result...");
  yield* Effect.promise(() =>
    import("node:child_process").then(({ exec }) =>
      new Promise((resolve) => exec(`open "${outputPath}"`, resolve))
    )
  );

  return { outputPath, curation };
}).pipe(
  Effect.provide(
    Layer.merge(CurationServiceLive, EnhancementServiceLive).pipe(
      Layer.provide(GoogleAIConfig.Default)
    )
  ),
  Effect.tapError((error) => Console.error(`❌ Error: ${error}`))
);

NodeRuntime.runMain(program);
