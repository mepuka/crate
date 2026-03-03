#!/usr/bin/env bun
/**
 * Test Easter Egg Cat Integration
 *
 * Subtle integration: Keep 99% of album art intact, hide a tiny
 * Crate Cat easter egg somewhere in the scene.
 *
 * Usage:
 *   bun run src/scripts/test-easter-egg-cat.ts --open
 */

import { Effect, Console, Layer } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import { GoogleClient } from "@effect/ai-google";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { GoogleAIConfig } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper to cast Effect types when working with @effect/ai-google
const asEffect = <A, E, R>(eff: unknown): Effect.Effect<A, E, R> =>
  eff as Effect.Effect<A, E, R>;

// Build GoogleClient layer from config
const GoogleClientLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* GoogleAIConfig;
    return GoogleClient.layer({
      apiKey: config.apiKey,
    }).pipe(Layer.provide(FetchHttpClient.layer));
  })
);

// Response type for text-only generation
interface GeminiTextResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

const REFERENCES_DIR = path.join(__dirname, "../../references/crate-cat");
const OUTPUT_DIR = path.join(__dirname, "../../test-output/easter-egg");

// Diverse test albums - different genres, eras, and visual styles
const DEFAULT_TEST_ALBUMS = [
  {
    url: "https://dn720703.ca.archive.org/0/items/mbid-aa90104a-ec1e-4de3-b954-12a63ea39747/mbid-aa90104a-ec1e-4de3-b954-12a63ea39747-33233332974_thumb500.jpg",
    name: "King Stingray",
  },
  {
    url: "http://ecx.images-amazon.com/images/I/51Ugmix0siL.jpg",
    name: "Takuya Kuroda Rising Son",
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/en/5/55/The_Clash_-_London_Calling.jpg",
    name: "London Calling",
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/en/3/3b/Dark_Side_of_the_Moon.png",
    name: "Dark Side of the Moon",
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/en/9/9b/Blonde_-_Frank_Ocean.jpeg",
    name: "Blonde Frank Ocean",
  },
];

// Allow overriding with ALBUM_ART env var
const TEST_ALBUMS = process.env.ALBUM_ART
  ? [{ url: process.env.ALBUM_ART, name: process.env.ALBUM_NAME || "Custom Album" }]
  : DEFAULT_TEST_ALBUMS;

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

const detectMimeType = (base64Data: string): string => {
  if (base64Data.startsWith("/9j/")) return "image/jpeg";
  if (base64Data.startsWith("iVBORw")) return "image/png";
  return "image/jpeg";
};

interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<
        | { text?: string }
        | { inlineData?: { mimeType?: string; data: string } }
      >;
    };
  }>;
}

const program = Effect.gen(function* () {
  yield* Console.log("🐱 Easter Egg Cat Integration Test");
  yield* Console.log("   Goal: Preserve album art, hide tiny cat somewhere");
  yield* Console.log(`   Testing ${TEST_ALBUMS.length} diverse albums`);
  yield* Console.log("");

  yield* Effect.promise(() => fs.mkdir(OUTPUT_DIR, { recursive: true }));

  // Load canonical cat for reference
  const canonicalPath = path.join(REFERENCES_DIR, "canonical.jpg");
  const canonicalBase64 = yield* Effect.promise(() => loadImageAsBase64(canonicalPath));
  yield* Console.log("📦 Loaded canonical Crate Cat");
  yield* Console.log("");

  const googleClient = yield* GoogleClient.GoogleClient;
  const outputPaths: string[] = [];

  // Process each album
  for (const album of TEST_ALBUMS) {
    yield* Console.log("=".repeat(50));
    yield* Console.log(`🎨 Processing: ${album.name}`);

    // Fetch album art
    const albumArtBase64 = yield* fetchImageAsBase64(album.url).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.catchAll((e) => {
        return Effect.succeed(null as string | null);
      })
    );

    if (!albumArtBase64) {
      yield* Console.log(`   ⚠️  Failed to fetch album art, skipping...`);
      yield* Console.log("");
      continue;
    }

    yield* Console.log(`   🖼️  Fetched album art`);

    // =========================================================================
    // PHASE 1: Reasoning - Analyze the scene and plan placement
    // =========================================================================
    yield* Console.log("   🧠 Phase 1: Reasoning about placement...");

    const reasoningPrompt = `
Analyze this album art and plan where to hide a tiny cat easter egg.

THE CAT CHARACTER ("Crate Cat"):
- Stylized illustrated cat with rounded ears (slight tilt), NOT pointed/triangular
- Compact friendly body shape (NOT realistic proportions)
- Curved S-shape tail
- Round warm eyes
- Should be rendered as a tiny silhouette or subtle integration

ANALYZE THE IMAGE:
1. What are the main visual elements? (shapes, objects, text, patterns)
2. What is the color palette? (dominant colors, darks, lights)
3. What is the artistic style? (photographic, illustrated, graphic, painterly)
4. Where are natural hiding spots? (shadows, edges, patterns, behind objects)

PLAN THE EASTER EGG:
Based on your analysis, describe EXACTLY:
- WHERE to place the cat (specific location, e.g., "bottom left corner, behind the guitar neck")
- WHAT SIZE (as percentage of image, should be 3-8%)
- WHAT STYLE to render it (silhouette color, opacity, technique to match the art)
- HOW it integrates (peeking, blending into pattern, hidden in shadow, etc.)

OUTPUT FORMAT:
LOCATION: [specific placement description]
SIZE: [percentage of image]
STYLE: [how to render - color, opacity, technique]
INTEGRATION: [how it blends with the existing art]
`;

    // Use Gemini Flash for reasoning (text-only response)
    const reasoningContents = [
      {
        role: "user" as const,
        parts: [
          {
            inlineData: {
              mimeType: detectMimeType(albumArtBase64),
              data: albumArtBase64,
            },
          },
          { text: reasoningPrompt },
        ],
      },
    ];

    const reasoningResponse = yield* asEffect<GeminiTextResponse, Error, never>(
      googleClient.generateContent({
        model: "gemini-2.0-flash", // Fast model for reasoning
        contents: reasoningContents,
      } as any)
    ).pipe(
      Effect.catchAll(() => Effect.succeed(null as GeminiTextResponse | null))
    );

    const placementPlan = reasoningResponse?.candidates?.[0]?.content?.parts?.[0]?.text || "Place a tiny cat silhouette in a corner, matching the art's style.";
    yield* Console.log(`   📋 Plan: ${placementPlan.slice(0, 150).replace(/\n/g, " ")}...`);

    // =========================================================================
    // PHASE 2: Generation - Use the reasoned plan to generate
    // =========================================================================
    yield* Console.log("   ✨ Phase 2: Generating with plan...");
    const startTime = Date.now();

    // Build the generation prompt using the reasoned plan
    const generationPrompt = `
Execute this SPECIFIC easter egg placement plan on the album art.

IMAGES PROVIDED:
- Image 1: The album art to modify (PRESERVE 99% INTACT)
- Image 2: Crate Cat character reference (EXTRACT ONLY the cat shape, NOT the background)

PLACEMENT PLAN (from analysis):
${placementPlan}

CRITICAL INSTRUCTIONS:
1. Follow the placement plan EXACTLY
2. Extract ONLY the Crate Cat silhouette from the reference (rounded ears, curved tail, compact body)
3. DO NOT copy any background elements from the reference image
4. The cat must be TINY (follow the size in the plan)
5. Match the cat's rendering to the album art's style
6. The album art must remain almost completely unchanged

OUTPUT: The album art with the cat easter egg placed according to the plan.
`;

    const contents = [
      {
        role: "user" as const,
        parts: [
          {
            inlineData: {
              mimeType: detectMimeType(albumArtBase64),
              data: albumArtBase64,
            },
          },
          {
            inlineData: {
              mimeType: detectMimeType(canonicalBase64),
              data: canonicalBase64,
            },
          },
          { text: generationPrompt },
        ],
      },
    ];

    const response = yield* asEffect<GeminiImageResponse, Error, never>(
      googleClient.generateContent({
        model: "gemini-2.0-flash-exp",
        contents,
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      } as any)
    ).pipe(
      Effect.catchAll((e) => {
        return Effect.succeed(null as GeminiImageResponse | null);
      })
    );

    if (!response) {
      yield* Console.log(`   ⚠️  Generation failed, skipping...`);
      yield* Console.log("");
      continue;
    }

    const elapsed = Date.now() - startTime;

    // Extract image
    const candidate = response.candidates?.[0];
    let imageBase64: string | null = null;
    let notes: string | undefined;

    for (const part of candidate?.content?.parts || []) {
      if ("inlineData" in part && part.inlineData) {
        imageBase64 = part.inlineData.data;
      }
      if ("text" in part && part.text) {
        notes = part.text;
      }
    }

    if (!imageBase64) {
      yield* Console.log(`   ⚠️  No image in response, skipping...`);
      yield* Console.log("");
      continue;
    }

    yield* Console.log(`   ✅ Generated in ${elapsed}ms`);

    // Save
    const outputPath = path.join(OUTPUT_DIR, `${album.name.toLowerCase().replace(/\s+/g, "-")}-easter-egg.png`);
    yield* Effect.promise(() => saveBase64Image(imageBase64!, outputPath));
    yield* Console.log(`   💾 Saved: ${outputPath}`);
    outputPaths.push(outputPath);

    if (notes) {
      yield* Console.log(`   📝 ${notes.slice(0, 100)}...`);
    }

    yield* Console.log("");
  }

  // Open all results
  if (shouldOpen && outputPaths.length > 0) {
    yield* Console.log("🖼️  Opening all results...");
    for (const outputPath of outputPaths) {
      yield* Effect.promise(() =>
        import("node:child_process").then(({ exec }) =>
          new Promise((resolve) => exec(`open "${outputPath}"`, resolve))
        )
      );
    }
  }

  yield* Console.log("=".repeat(50));
  yield* Console.log(`✅ Done! Generated ${outputPaths.length}/${TEST_ALBUMS.length} easter eggs`);
  yield* Console.log("🔍 Can you find the cats?");
}).pipe(
  Effect.provide(
    GoogleClientLive.pipe(Layer.provide(GoogleAIConfig.Default))
  ),
  Effect.tapError((error) => Console.error(`❌ Error: ${error}`))
);

NodeRuntime.runMain(program);
