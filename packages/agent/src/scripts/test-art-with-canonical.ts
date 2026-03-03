#!/usr/bin/env bun
/**
 * Test Art Curation with Canonical References Integration
 *
 * Demonstrates the full art pipeline:
 * 1. Analyze album art with Gemini Vision
 * 2. Query canonical references for matching variants (e.g., Crate Cat)
 * 3. Generate derived assets that harmonize with both
 * 4. Show how canonicals can be integrated into compositions
 *
 * Usage:
 *   bun run src/scripts/test-art-with-canonical.ts [--open]
 */

import { Effect, Console, Layer, Option, Data } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

class ArtCanonicalTestError extends Data.TaggedError("ArtCanonicalTestError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

import {
  curate,
  ArtCurationServiceGeminiWithConfig,
  type CurationResult,
} from "../services/ArtCurationService.js";
import { GoogleAIConfig } from "../config.js";
import {
  generateAssets,
  DerivedAssetGeneratorLive,
} from "../services/DerivedAssetGenerator.js";
import {
  CanonicalReferenceServiceLive,
  loadAllCanonicals,
  getVariantForContext,
  type LoadedCanonical,
  type LoadedVariant,
} from "../services/CanonicalReferenceService.js";
import {
  DesignDirectiveServiceLive,
  getDesignDirective,
  generateDesignPromptAddendum,
} from "../services/DesignDirectiveService.js";

const execAsync = promisify(exec);

// Real KEXP plays with album covers
const KEXP_ALBUMS = [
  {
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

/**
 * Generate an HTML preview showing the album art with canonical mascot integration.
 */
const generateIntegratedPreview = async (
  outputDir: string,
  baseName: string,
  imageUrl: string,
  curation: CurationResult,
  canonical: LoadedCanonical | null,
  selectedVariant: LoadedVariant | null
): Promise<string> => {
  const variantImagePath = selectedVariant?.filePath;
  let variantBase64 = "";
  let variantMediaType = "image/jpeg";

  if (variantImagePath) {
    try {
      const buffer = await fs.readFile(variantImagePath);
      variantBase64 = buffer.toString("base64");
      const ext = path.extname(variantImagePath).toLowerCase();
      variantMediaType = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
    } catch {
      // Variant file not available
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${baseName} - Integrated Art Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fff;
      min-height: 100vh;
      padding: 2rem;
    }
    h1 { color: #666; font-weight: 400; font-size: 1.2rem; margin-bottom: 2rem; }
    h2 { color: #444; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; margin: 2rem 0 1rem; }

    .hero {
      position: relative;
      max-width: 600px;
      margin: 0 auto 3rem;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 30px 80px rgba(0,0,0,0.6);
    }
    .hero .album-art {
      width: 100%;
      display: block;
    }
    .hero .glow-layer {
      position: absolute;
      top: -20%;
      left: -20%;
      width: 140%;
      height: 140%;
      mix-blend-mode: screen;
      pointer-events: none;
      opacity: 0.7;
    }
    .hero .mascot-layer {
      position: absolute;
      bottom: 10px;
      right: 10px;
      width: 80px;
      height: 80px;
      object-fit: contain;
      filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));
      opacity: 0.9;
    }
    .hero .texture-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      mix-blend-mode: overlay;
      pointer-events: none;
      opacity: 0.4;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      max-width: 900px;
      margin: 0 auto;
    }
    .info-card {
      background: #141414;
      border-radius: 12px;
      padding: 1.5rem;
    }
    .info-card p { color: #999; font-size: 0.9rem; line-height: 1.6; margin-top: 0.5rem; }
    .info-card .label { color: #555; font-size: 0.7rem; text-transform: uppercase; }

    .palette {
      display: flex;
      gap: 8px;
      margin-top: 1rem;
    }
    .palette .swatch {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.1);
    }

    .mascot-info {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 1rem;
    }
    .mascot-info img {
      width: 60px;
      height: 60px;
      border-radius: 8px;
      object-fit: cover;
    }
    .mascot-info .details { color: #888; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Integrated Art Preview</h1>

  <div class="hero">
    <img class="glow-layer" src="${baseName}-glow.svg" alt="">
    <img class="album-art" src="${imageUrl}" alt="Album Art">
    ${variantBase64 ? `<img class="mascot-layer" src="data:${variantMediaType};base64,${variantBase64}" alt="Crate Cat">` : ""}
    <img class="texture-layer" src="${baseName}-texture.svg" alt="">
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h2>Creative Analysis</h2>
      <p class="label">Mood</p>
      <p>${curation.analysis.moodAtmosphere}</p>
      <p class="label" style="margin-top:1rem">Era</p>
      <p>${curation.analysis.eraAesthetic}</p>
    </div>

    <div class="info-card">
      <h2>Color Palette</h2>
      <p class="label">Temperature: ${curation.palette.temperature}</p>
      <div class="palette">
        ${curation.palette.colors.map(c => `<div class="swatch" style="background:${c}" title="${c}"></div>`).join("")}
      </div>
      <p class="label" style="margin-top:1rem">Dominant</p>
      <p>${curation.palette.dominant}</p>
    </div>

    <div class="info-card">
      <h2>Derived Assets</h2>
      <p class="label">Glow</p>
      <p>${curation.derivedAssets.glowColor}</p>
      <p class="label" style="margin-top:1rem">Texture</p>
      <p>${curation.derivedAssets.textureRecommendation}</p>
      <p class="label" style="margin-top:1rem">Reasoning</p>
      <p style="font-size:0.8rem">${curation.derivedAssets.reasoning}</p>
    </div>

    ${canonical ? `
    <div class="info-card">
      <h2>Canonical Reference</h2>
      <p class="label">Mascot</p>
      <p>${canonical.config.name}</p>
      ${selectedVariant ? `
      <div class="mascot-info">
        ${variantBase64 ? `<img src="data:${variantMediaType};base64,${variantBase64}" alt="">` : ""}
        <div class="details">
          <strong>${selectedVariant.config.name}</strong><br>
          ${selectedVariant.config.useCase}
        </div>
      </div>
      ` : "<p style='color:#666;margin-top:0.5rem'>No matching variant found</p>"}
    </div>
    ` : ""}
  </div>
</body>
</html>`;

  const previewPath = path.join(outputDir, `${baseName}-integrated.html`);
  await fs.writeFile(previewPath, html, "utf-8");
  return previewPath;
};

const ArtCanonicalLive = Layer.mergeAll(
  ArtCurationServiceGeminiWithConfig,
  DerivedAssetGeneratorLive,
  CanonicalReferenceServiceLive,
  DesignDirectiveServiceLive
).pipe(
  Layer.provide(GoogleAIConfig.Default)
);

const program = Effect.gen(function* () {
  yield* Console.log("Art + Canonical Integration Test");
  yield* Console.log("=".repeat(50));

  const outputDir = path.join(process.cwd(), "test-output", "art-canonical");
  yield* Console.log(`Output: ${outputDir}\n`);

  // Load canonicals first
  yield* Console.log("Loading canonical references...");
  const canonicals = yield* loadAllCanonicals().pipe(
    Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<LoadedCanonical>))
  );
  yield* Console.log(`  Found ${canonicals.length} canonical(s)`);

  const crateCat = canonicals.find((c) => c.config.id === "crate-cat") ?? null;
  if (crateCat) {
    yield* Console.log(`  Crate Cat: ${crateCat.variants.length} variants`);
  }
  yield* Console.log("");

  for (const [index, album] of KEXP_ALBUMS.entries()) {
    yield* Console.log(
      `[${index + 1}/${KEXP_ALBUMS.length}] ${album.context.artistName} - ${album.context.albumTitle}`
    );
    yield* Console.log(`   Genres: ${album.context.genres.join(", ")}`);

    // Step 0: Get design directive based on genre/context
    yield* Console.log("   Getting design directive...");
    const directive = yield* getDesignDirective({
      genres: album.context.genres,
      temperature: "neutral", // Will be determined by analysis
      isLocal: album.context.isLocal,
    });

    yield* Console.log(`   Design Reference: ${directive.primaryReference}`);
    if (directive.eraContext) {
      yield* Console.log(`   Era Context: ${directive.eraContext}`);
    }

    // Generate the design prompt addendum (would be passed to enhanced curation)
    yield* generateDesignPromptAddendum(directive);
    yield* Console.log(`   Design Directives: ${directive.visualLanguage.length} visual rules`);

    // Step 1: Analyze album art
    yield* Console.log("   Analyzing album art...");
    const curation = yield* curate(album.url, album.context).pipe(
      Effect.tapError((e) => Console.error(`   Curation failed: ${e}`)),
      Effect.catchAll(() => Effect.succeed(null))
    );

    if (!curation) {
      yield* Console.log("   Skipping due to curation error\n");
      continue;
    }

    yield* Console.log(`   Mood: ${curation.analysis.moodAtmosphere}`);
    yield* Console.log(`   Palette: ${curation.palette.temperature} (${curation.palette.dominant})`);

    // Step 2: Find matching canonical variant
    let selectedVariant: LoadedVariant | null = null;
    if (crateCat) {
      yield* Console.log("   Finding matching Crate Cat variant...");

      // Map palette temperature and genres to selection context
      const variantResult = yield* getVariantForContext("crate-cat", {
        palette: curation.palette.temperature as "warm" | "cool" | "neutral",
        useCase: album.context.genres[0]?.toLowerCase(),
        mood: curation.analysis.moodAtmosphere,
      }).pipe(Effect.catchAll(() => Effect.succeed(Option.none())));

      if (Option.isSome(variantResult)) {
        selectedVariant = variantResult.value;
        yield* Console.log(`   Selected: ${selectedVariant.config.name}`);
      } else {
        yield* Console.log("   No matching variant (would use canonical)");
      }
    }

    // Step 3: Generate derived assets
    const baseName = album.context.artistName.toLowerCase().replace(/\s+/g, "-");
    const assetDir = path.join(outputDir, baseName);

    yield* Console.log("   Generating assets...");
    yield* generateAssets(curation, assetDir, album.url, baseName);

    // Step 4: Generate integrated preview
    yield* Console.log("   Creating integrated preview...");
    const integratedPreview = yield* Effect.tryPromise({
      try: () =>
        generateIntegratedPreview(
          assetDir,
          baseName,
          album.url,
          curation,
          crateCat,
          selectedVariant
        ),
      catch: (error) =>
        new ArtCanonicalTestError({
          message: "Failed to generate preview",
          cause: error,
        }),
    });

    yield* Console.log(`   Preview: ${integratedPreview}`);

    // Open first preview
    if (shouldOpen && index === 0) {
      yield* Console.log("   Opening preview...");
      yield* Effect.tryPromise({
        try: () => execAsync(`open "${integratedPreview}"`),
        catch: (error) =>
          new ArtCanonicalTestError({
            message: "Failed to open browser",
            cause: error,
          }),
      });
    }

    yield* Console.log("");
  }

  yield* Console.log("=".repeat(50));
  yield* Console.log("Done! View integrated previews in: " + outputDir);
  if (!shouldOpen) {
    yield* Console.log("Run with --open to view in browser");
  }
}).pipe(
  Effect.provide(ArtCanonicalLive),
  Effect.tapError((error) => Console.error(`Error: ${error}`))
);

NodeRuntime.runMain(program);
