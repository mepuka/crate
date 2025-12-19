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
  LinerNoteGenerationService,
  LinerNoteGenerationServiceLive,
  generateLinerNote,
  type LinerNoteRequest,
  type LinerNoteGraphContext,
} from "../services/LinerNoteGenerationService.js";

const OUTPUT_DIR = "/tmp/liner-notes-test";

// =============================================================================
// Test Data
// =============================================================================

interface TestCase {
  name: string;
  imagePath: string;
  request: Omit<LinerNoteRequest, "albumArtBase64" | "mimeType">;
  graphContext?: LinerNoteGraphContext;
}

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
    name: "Golden Age Jazz (1959)",
    imagePath: "/Users/pooks/Dev/crate/packages/agent/test-output/character-generation/crate-cat-takuya-kuroda.png",
    request: {
      playId: 67890,
      releaseYear: 1959,
      title: "Miles Davis's Kind of Blue Journey",
      narrative: "When Miles Davis stepped into Columbia's 30th Street Studio in March 1959, he brought a new vision of jazz - modal, spacious, revolutionary. This album would become the best-selling jazz record of all time.",
      artistName: "Miles Davis",
      albumName: "Kind of Blue",
      style: "archival",
    },
    graphContext: {
      collaborators: ["John Coltrane", "Bill Evans", "Cannonball Adderley"],
      labels: ["Columbia"],
    }
  },
  {
    name: "Contemporary (2024)",
    imagePath: "/Users/pooks/Dev/crate/packages/agent/test-output/character-generation/crate-cat-king-stingray.png",
    request: {
      playId: 99999,
      releaseYear: 2024,
      title: "The Hives's KEXP Journey",
      narrative: "Produced by Beastie Boys legend Mike D and Viagra Boys' Pelle Gunnerfeldt, with contributions from Josh Homme of Queens of the Stone Age, this album showcases The Hives at their most focused.",
      artistName: "The Hives",
      albumName: "The Death of Randy Fitzsimmons",
      style: "editorial",
    },
    graphContext: {
      collaborators: ["Mike D", "Pelle Gunnerfeldt", "Josh Homme"],
      labels: ["Disques Hansen"],
      relatedArtists: ["Beastie Boys", "Viagra Boys", "Queens of the Stone Age"],
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

const program = Effect.gen(function* () {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  yield* Console.log(`\n🎨 LinerNoteGenerationService Test`);
  yield* Console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const casesToRun = singleTest ? [TEST_CASES[testIndex]] : TEST_CASES;

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

    // Load image
    if (!fs.existsSync(testCase.imagePath)) {
      yield* Console.error(`   ⚠️  Image not found: ${testCase.imagePath}`);
      continue;
    }

    const imageBuffer = fs.readFileSync(testCase.imagePath);
    const albumArtBase64 = imageBuffer.toString("base64");
    const mimeType = testCase.imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

    yield* Console.log(`   Image: ${path.basename(testCase.imagePath)} (${Math.round(imageBuffer.length / 1024)}KB)`);

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
