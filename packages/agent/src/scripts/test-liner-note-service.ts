#!/usr/bin/env bun
/**
 * Test: LinerNoteGenerationService
 *
 * Tests the service layer with proper Effect composition.
 * Uses local image files for reliable testing.
 *
 * Run with:
 *   set -a && source .env && set +a && bun run src/scripts/test-liner-note-service.ts
 */

import { Effect, Console, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import * as GoogleClientModule from "@effect/ai-google/GoogleClient";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  LinerNoteGenerationServiceLive,
  generateLinerNote,
  type LinerNoteRequest,
  type GraphContext,
} from "../services/LinerNoteGenerationService.js";

const OUTPUT_DIR = "/tmp/liner-notes-test";

// =============================================================================
// Test Data
// =============================================================================

interface TestCase {
  name: string;
  imagePath: string;
  request: Omit<LinerNoteRequest, "albumArtBase64" | "mimeType">;
  graphContext?: GraphContext | undefined;
}

// Custom test case from env vars (if ALBUM_ART is set)
const CUSTOM_TEST_CASE: TestCase | null = process.env.ALBUM_ART ? {
  name: `Custom: ${process.env.ARTIST || "Custom Artist"} (${process.env.ERA || "2024"})`,
  imagePath: process.env.ALBUM_ART, // Will be treated as URL
  request: {
    playId: 99999,
    releaseYear: parseInt(process.env.ERA || "2024"),
    title: process.env.TITLE || `${process.env.ARTIST || "Artist"}'s Musical Journey`,
    narrative: process.env.NARRATIVE || "A landmark album that defined its era and influenced generations of musicians.",
    artistName: process.env.ARTIST || "Custom Artist",
    albumName: process.env.ALBUM || "Custom Album",
    style: (process.env.STYLE as "art-forward" | "editorial" | "archival" | "collage") || "art-forward",
  },
  graphContext: process.env.COLLABORATORS ? {
    collaborators: process.env.COLLABORATORS.split(","),
    labels: process.env.LABELS?.split(",") || [],
  } : undefined,
} : null;

const TEST_CASES: TestCase[] = [
  {
    name: "Classic Rock Era (1973)",
    imagePath: "/Users/pooks/Dev/crate/packages/agent/test-output/easter-egg/dark-side-of-the-moon-easter-egg.png",
    request: {
      playId: 12345,
      releaseYear: 1973,
      title: "Pink Floyd's Dark Side Legacy",
      narrative: "The Dark Side of the Moon remained on the Billboard charts for over 900 weeks. Its conceptual ambition, innovative studio techniques, and Hipgnosis artwork created a template for the album as art object.",
      artistName: "Pink Floyd",
      albumName: "The Dark Side of the Moon",
      style: "art-forward",
    },
    graphContext: {
      collaborators: ["Alan Parsons", "Storm Thorgerson"],
      labels: ["Harvest", "Capitol"],
      memberOf: ["Pink Floyd"],
    }
  },
  {
    name: "Contemporary Jazz (2014)",
    imagePath: "/Users/pooks/Dev/crate/packages/agent/test-output/easter-egg/takuya-kuroda-rising-son-easter-egg.png",
    request: {
      playId: 67890,
      releaseYear: 2014,
      title: "Takuya Kuroda's Rising Son",
      narrative: "Japanese trumpeter Takuya Kuroda blends jazz tradition with hip-hop production on this Blue Note debut. A frequent collaborator with José James, Kuroda brings a fresh perspective to the storied label.",
      artistName: "Takuya Kuroda",
      albumName: "Rising Son",
      style: "art-forward",
    },
    graphContext: {
      collaborators: ["José James", "Kris Bowers"],
      labels: ["Blue Note"],
    }
  },
  {
    name: "Contemporary Indigenous Rock (2022)",
    imagePath: "/Users/pooks/Dev/crate/packages/agent/test-output/easter-egg/king-stingray-easter-egg.png",
    request: {
      playId: 99999,
      releaseYear: 2022,
      title: "King Stingray's KEXP Discovery",
      narrative: "Yolŋu surf rock from Northeast Arnhem Land. King Stingray blend their Indigenous Australian heritage with infectious guitar hooks, singing in both Yolŋu Matha and English.",
      artistName: "King Stingray",
      albumName: "King Stingray",
      style: "editorial",
    },
    graphContext: {
      collaborators: [],
      labels: ["Spinefarm"],
      relatedArtists: ["Yothu Yindi", "Baker Boy"],
    }
  }
];

// =============================================================================
// Main
// =============================================================================

const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error("❌ Missing GOOGLE_API_KEY or GOOGLE_AI_API_KEY");
  process.exit(1);
}

// Build the full service layer
const GoogleClientLive = Layer.provide(
  GoogleClientModule.layer({
    apiKey: Redacted.make(apiKey),
    transformClient: HttpClient.retryTransient({ times: 3 }),
  }),
  FetchHttpClient.layer
);

const LinerNoteServiceLayer = Layer.provide(
  LinerNoteGenerationServiceLive,
  GoogleClientLive
);

// Select test case
const testIndex = parseInt(process.env.TEST_INDEX ?? "0");
const singleTest = process.env.SINGLE_TEST === "true";

// Helper to fetch image from URL
const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mimeType: string }> => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return {
    base64: Buffer.from(buffer).toString("base64"),
    mimeType: contentType.includes("png") ? "image/png" : "image/jpeg",
  };
};

const program = Effect.gen(function* () {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  yield* Console.log(`\n🎨 LinerNoteGenerationService Test`);
  yield* Console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Use custom test case if ALBUM_ART is set, otherwise use built-in cases
  const casesToRun = CUSTOM_TEST_CASE
    ? [CUSTOM_TEST_CASE]
    : (singleTest ? [TEST_CASES[testIndex]] : TEST_CASES);

  for (let i = 0; i < casesToRun.length; i++) {
    const testCase = casesToRun[i];

    yield* Console.log(`\n📀 Test: ${testCase.name}`);
    yield* Console.log(`   Artist: ${testCase.request.artistName}`);
    yield* Console.log(`   Year: ${testCase.request.releaseYear}`);
    yield* Console.log(`   Style: ${testCase.request.style}`);

    if (testCase.graphContext) {
      yield* Console.log(`   Graph Context:`);
      if (testCase.graphContext.collaborators?.length) {
        yield* Console.log(`     - Collaborators: ${testCase.graphContext.collaborators.join(", ")}`);
      }
      if (testCase.graphContext.labels?.length) {
        yield* Console.log(`     - Labels: ${testCase.graphContext.labels.join(", ")}`);
      }
    }

    // Load image (from URL or local file)
    let albumArtBase64: string;
    let mimeType: string;

    if (testCase.imagePath.startsWith("http")) {
      yield* Console.log(`   Fetching: ${testCase.imagePath.slice(0, 60)}...`);
      const fetched = yield* Effect.promise(() => fetchImageAsBase64(testCase.imagePath));
      albumArtBase64 = fetched.base64;
      mimeType = fetched.mimeType;
      yield* Console.log(`   ✓ Fetched (${Math.round(albumArtBase64.length * 0.75 / 1024)}KB)`);
    } else {
      if (!fs.existsSync(testCase.imagePath)) {
        yield* Console.error(`   ⚠️  Image not found: ${testCase.imagePath}`);
        continue;
      }
      const imageBuffer = fs.readFileSync(testCase.imagePath);
      albumArtBase64 = imageBuffer.toString("base64");
      mimeType = testCase.imagePath.endsWith(".png") ? "image/png" : "image/jpeg";
      yield* Console.log(`   Image: ${path.basename(testCase.imagePath)} (${Math.round(imageBuffer.length / 1024)}KB)`);
    }

    // Build full request
    const request: LinerNoteRequest = {
      ...testCase.request,
      albumArtBase64,
      mimeType,
      graphContext: testCase.graphContext,
    };

    yield* Console.log(`\n   🎨 Generating...`);
    const startTime = Date.now();

    // Use the service via the convenience function
    const result = yield* generateLinerNote(request);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    yield* Console.log(`   ✓ Generated in ${elapsed}s`);
    yield* Console.log(`   Era detected: ${result.era}`);

    if (result.modelNotes) {
      yield* Console.log(`   Model notes: ${result.modelNotes.slice(0, 100)}...`);
    }

    // Save output
    const filename = path.join(
      OUTPUT_DIR,
      `liner-note-service-${testCase.request.releaseYear}-${testCase.request.style}-${Date.now()}.png`
    );
    const buffer = Buffer.from(result.imageBase64, "base64");
    fs.writeFileSync(filename, buffer);
    yield* Console.log(`   💾 Saved: ${filename}`);

    // Open it
    yield* Effect.promise(() =>
      import("child_process").then(({ exec }) =>
        new Promise((resolve) => exec(`open "${filename}"`, () => resolve(undefined)))
      )
    );
  }

  yield* Console.log(`\n✅ All tests complete!`);
  yield* Console.log(`📁 Images saved to: ${OUTPUT_DIR}\n`);
});

// Run with service layer
Effect.runPromise(
  program.pipe(
    Effect.provide(LinerNoteServiceLayer),
    Effect.catchAll((error) =>
      Console.error(`❌ Error: ${error}`).pipe(Effect.zipRight(Effect.fail(error)))
    )
  )
).then(() => {
  console.log("\n🎉 Test run complete!");
  process.exit(0);
}).catch((error) => {
  console.error("\n💥 Test run failed:", error);
  process.exit(1);
});
