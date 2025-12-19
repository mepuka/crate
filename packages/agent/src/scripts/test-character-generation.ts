#!/usr/bin/env bun
/**
 * Test Character Generation Service
 *
 * Full pipeline test:
 * 1. Curate album art (extract style)
 * 2. Load character config
 * 3. Generate character in album's style
 *
 * Usage:
 *   bun run src/scripts/test-character-generation.ts [--open]
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
  CharacterGenerationServiceLive,
  loadConfig,
  generate,
} from "../services/CharacterGenerationService.js";
import { GoogleAIConfig } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Build layers
const GoogleClientLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* GoogleAIConfig;
    return GoogleClient.layer({
      apiKey: config.apiKey,
    }).pipe(Layer.provide(FetchHttpClient.layer));
  })
);

const CurationServiceLive = ArtCurationServiceGeminiWithConfig;
const CharacterServiceLive = Layer.provide(
  CharacterGenerationServiceLive,
  GoogleClientLive
);

const REFERENCES_DIR = path.join(__dirname, "../../references/crate-cat");
const OUTPUT_DIR = path.join(__dirname, "../../test-output/character-generation");

// Test albums
const TEST_ALBUMS = [
  {
    name: "King Stingray",
    url: "https://dn720703.ca.archive.org/0/items/mbid-aa90104a-ec1e-4de3-b954-12a63ea39747/mbid-aa90104a-ec1e-4de3-b954-12a63ea39747-33233332974_thumb500.jpg",
    context: {
      artistName: "King Stingray",
      albumTitle: "King Stingray",
      releaseYear: 2022,
      genres: ["Surf Rock", "Indigenous Australian"],
      isLocal: false,
    },
  },
  {
    name: "Takuya Kuroda",
    url: "http://ecx.images-amazon.com/images/I/51Ugmix0siL.jpg",
    context: {
      artistName: "Takuya Kuroda",
      albumTitle: "Rising Son",
      releaseYear: 2014,
      genres: ["Jazz", "Funk"],
      isLocal: false,
    },
  },
];

const shouldOpen = process.argv.includes("--open");

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
  yield* Console.log("🐱 Character Generation Service Test");
  yield* Console.log("=" .repeat(50));
  yield* Console.log("");

  // Ensure output directory
  yield* Effect.promise(() => fs.mkdir(OUTPUT_DIR, { recursive: true }));

  // Load character config
  yield* Console.log("📦 Loading Crate Cat configuration...");
  const characterConfig = yield* loadConfig(REFERENCES_DIR);
  yield* Console.log(`   Character: ${characterConfig.name}`);
  yield* Console.log(`   Must preserve: ${characterConfig.styleGuide.mustPreserve.length} constraints`);
  yield* Console.log(`   Visual constraints: ${characterConfig.visualConstraints?.critical?.length || 0} critical`);
  yield* Console.log("");

  // Load canonical and inspirations
  yield* Console.log("🖼️  Loading reference images...");
  const canonicalPath = path.join(REFERENCES_DIR, characterConfig.canonical);
  const canonicalRef = yield* Effect.promise(() => loadImageAsBase64(canonicalPath));
  yield* Console.log(`   Canonical: ${characterConfig.canonical}`);

  const inspirationsDir = path.join(REFERENCES_DIR, "inspirations");
  const inspirationFiles = ["record-store-cat.jpg", "vinyl-crate-cat.jpg", "music-cat-illustration.jpg"];
  const inspirationRefs: string[] = [];

  for (const file of inspirationFiles) {
    const refResult = yield* Effect.tryPromise({
      try: () => loadImageAsBase64(path.join(inspirationsDir, file)),
      catch: () => null,
    });
    if (refResult) {
      inspirationRefs.push(refResult);
      yield* Console.log(`   Inspiration: ${file}`);
    }
  }
  yield* Console.log("");

  // Process each test album
  for (const album of TEST_ALBUMS) {
    yield* Console.log(`🎨 Processing: ${album.context.artistName} - ${album.context.albumTitle}`);
    yield* Console.log(`   Genres: ${album.context.genres.join(", ")}`);

    // Step 1: Curate album art
    yield* Console.log("   Step 1: Curating album art...");
    const curation = yield* curate(album.url, album.context);
    yield* Console.log(`   Mood: ${curation.analysis.moodAtmosphere}`);
    yield* Console.log(`   Era: ${curation.analysis.eraAesthetic}`);
    yield* Console.log(`   Palette: ${curation.palette.colors.slice(0, 3).join(", ")}`);

    // Step 2: Fetch album art
    const albumArtBase64 = yield* fetchImageAsBase64(album.url).pipe(
      Effect.provide(FetchHttpClient.layer)
    );

    // Step 3: Generate character
    yield* Console.log("   Step 2: Generating character variant...");
    const startTime = Date.now();

    const result = yield* generate({
      canonicalRef,
      inspirationRefs,
      targetAlbumArt: albumArtBase64,
      curation,
      characterConfig,
      resolution: "2K",
    });

    const elapsed = Date.now() - startTime;
    yield* Console.log(`   ✅ Generated in ${elapsed}ms`);

    // Save result
    const slug = album.context.artistName.toLowerCase().replace(/\s+/g, "-");
    const outputPath = path.join(OUTPUT_DIR, `crate-cat-${slug}.${result.mimeType.split("/")[1] || "png"}`);
    yield* Effect.promise(() => saveBase64Image(result.characterImageBase64, outputPath));
    yield* Console.log(`   💾 Saved: ${outputPath}`);

    if (result.notes) {
      yield* Console.log(`   📝 Notes: ${result.notes.slice(0, 100)}...`);
    }

    // Open if requested
    if (shouldOpen) {
      yield* Effect.promise(() =>
        import("node:child_process").then(({ exec }) =>
          new Promise((resolve) => exec(`open "${outputPath}"`, resolve))
        )
      );
    }

    yield* Console.log("");
  }

  yield* Console.log("=" .repeat(50));
  yield* Console.log(`✅ Done! Output: ${OUTPUT_DIR}`);
  if (!shouldOpen) {
    yield* Console.log("💡 Run with --open to view results");
  }
}).pipe(
  Effect.provide(
    Layer.merge(CurationServiceLive, CharacterServiceLive)
  ),
  Effect.provide(GoogleAIConfig.Default),
  Effect.tapError((error) => Console.error(`❌ Error: ${error}`))
);

NodeRuntime.runMain(program);
