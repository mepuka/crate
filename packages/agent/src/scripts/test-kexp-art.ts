#!/usr/bin/env bun
/**
 * Test Art Curation with real KEXP album covers
 *
 * Usage:
 *   bun run src/scripts/test-kexp-art.ts [--open]
 */

import { Effect, Console, Layer, Data } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

class KexpArtTestError extends Data.TaggedError("KexpArtTestError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

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

// Real KEXP plays with album covers from Cover Art Archive
const KEXP_ALBUMS = [
  {
    // King Stingray - Yolŋu surf-rock from Australia, played on KEXP
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
    // Takuya Kuroda - Jazz trumpeter on Blue Note, KEXP favorite
    url: "http://ecx.images-amazon.com/images/I/51Ugmix0siL.jpg",
    context: {
      artistName: "Takuya Kuroda",
      albumTitle: "Rising Son",
      releaseYear: 2014,
      genres: ["Jazz", "Funk"],
      isLocal: false,
    },
  },
  {
    // Use Cover Art Archive directly for a well-known album
    // Khruangbin - Con Todo El Mundo
    url: "https://coverartarchive.org/release/8f1b87e1-8f12-4b71-8cc1-1d9d69a6d6b8/front-500",
    context: {
      artistName: "Khruangbin",
      albumTitle: "Con Todo El Mundo",
      releaseYear: 2018,
      genres: ["Psychedelic", "Funk", "World"],
      isLocal: false,
    },
  },
];

const shouldOpen = process.argv.includes("--open");

const KexpArtLive = Layer.merge(
  ArtCurationServiceGeminiWithConfig,
  DerivedAssetGeneratorLive
).pipe(
  Layer.provide(GoogleAIConfig.Default)
);

const program = Effect.gen(function* () {
  yield* Console.log("🎨 KEXP Album Art Curation Test");
  yield* Console.log("═".repeat(50));

  const outputDir = path.join(process.cwd(), "test-output", "kexp-art");
  yield* Console.log(`📁 Output: ${outputDir}\n`);

  for (const [index, album] of KEXP_ALBUMS.entries()) {
    yield* Console.log(`\n🖼️  [${index + 1}/${KEXP_ALBUMS.length}] ${album.context.artistName} - ${album.context.albumTitle}`);
    yield* Console.log(`   Genres: ${album.context.genres.join(", ")}`);

    const startTime = Date.now();

    // Analyze with Gemini Vision
    yield* Console.log("   ⏳ Analyzing...");
    const result = yield* curate(album.url, album.context).pipe(
      Effect.tapError((e) => Console.error(`   ❌ Curation failed: ${e}`)),
      Effect.catchAll(() => Effect.succeed(null))
    );

    if (!result) {
      yield* Console.log("   ⚠️  Skipping asset generation due to curation error");
      continue;
    }

    const curationTime = Date.now() - startTime;
    yield* Console.log(`   ✅ Analysis: ${curationTime}ms`);

    // Generate assets
    const baseName = album.context.artistName.toLowerCase().replace(/\s+/g, "-");
    const assetDir = path.join(outputDir, baseName);

    const bundle = yield* generateAssets(result, assetDir, album.url, baseName);

    yield* Console.log(`   📊 ${result.analysis.moodAtmosphere}`);
    yield* Console.log(`   🎨 ${result.palette.temperature} palette (${result.palette.dominant})`);
    yield* Console.log(`   ✨ Glow: ${result.derivedAssets.glowColor}, Texture: ${result.derivedAssets.textureRecommendation}`);

    // Open first preview
    if (shouldOpen && index === 0) {
      yield* Console.log("   🌐 Opening preview...");
      yield* Effect.tryPromise({
        try: () => execAsync(`open "${bundle.htmlPreview}"`),
        catch: (error) =>
          new KexpArtTestError({
            message: "Failed to open browser",
            cause: error,
          }),
      });
    }
  }

  yield* Console.log("\n" + "═".repeat(50));
  yield* Console.log("✅ Done! View assets in: " + outputDir);
  if (!shouldOpen) {
    yield* Console.log("💡 Run with --open to view in browser");
  }
}).pipe(
  Effect.provide(KexpArtLive),
  Effect.tapError((error) => Console.error(`❌ Error: ${error}`))
);

NodeRuntime.runMain(program);
