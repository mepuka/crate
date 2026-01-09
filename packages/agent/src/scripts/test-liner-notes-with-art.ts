#!/usr/bin/env bun
/**
 * Test: Album Art-Derived Liner Note Generation
 *
 * Takes actual album artwork and generates a weathered liner note
 * that incorporates the album's visual elements.
 *
 * Run with:
 *   set -a && source .env && set +a && bun run src/scripts/test-liner-notes-with-art.ts
 *
 * With custom image:
 *   ALBUM_ART="https://example.com/album.jpg" bun run ...
 */

import { Effect, Console, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import * as GoogleClientModule from "@effect/ai-google/GoogleClient";
import * as fs from "node:fs";
import * as path from "node:path";

const NANO_BANANA_PRO_MODEL = "gemini-3-pro-image-preview";
const OUTPUT_DIR = "/tmp/liner-notes-test";

// ============================================================================
// Test Data - A real KEXP play
// ============================================================================

const TEST_PLAY = {
  albumArtUrl: process.env.ALBUM_ART || "https://i.scdn.co/image/ab67616d0000b273a7b3e428b3f7f0a9e8e6e5a4",
  title: process.env.TITLE || `${process.env.ARTIST || "The Hives"}'s KEXP Journey`,
  narrative: process.env.NARRATIVE || "Produced by Beastie Boys legend Mike D and Viagra Boys' Pelle Gunnerfeldt, with contributions from Josh Homme of Queens of the Stone Age, this album showcases The Hives at their most focused and ferocious.",
  releaseYear: parseInt(process.env.ERA || "2024"),
  artist: process.env.ARTIST || "The Hives",
  album: process.env.ALBUM || "The Death of Randy Fitzsimmons"
};

// ============================================================================
// Era Detection (simplified)
// ============================================================================

type Era = "golden-age" | "classic-rock" | "new-wave" | "grunge" | "digital" | "streaming" | "contemporary";

function getEraContext(year: number): { era: Era; weathering: string; style: string } {
  if (year < 1970) return {
    era: "golden-age",
    weathering: "Heavy wear (70%), significant fade (60%), paper yellowing, vinyl ring marks, split seams",
    style: "Mid-century modern, Blue Note/Verve influence, bold geometric typography"
  };
  if (year < 1980) return {
    era: "classic-rock",
    weathering: "Moderate wear (50%), warm fade (40%), gatefold creases, textured cardboard",
    style: "Psychedelic, cosmic imagery, hand-drawn logos, Hipgnosis influence"
  };
  if (year < 1990) return {
    era: "new-wave",
    weathering: "Light wear (35%), slight color shift, glossy paper showing age",
    style: "Geometric, Peter Saville influence, bold color blocks, clean typography"
  };
  if (year < 2000) return {
    era: "grunge",
    weathering: "Minimal wear (25%), high grain (60%), photocopied texture",
    style: "DIY zine, collage elements, distressed typography, anti-corporate"
  };
  if (year < 2010) return {
    era: "digital",
    weathering: "Very light wear (15%), clean but aging, occasional print artifacts",
    style: "Early digital precision, Helvetica Neue, transitional era"
  };
  if (year < 2020) return {
    era: "streaming",
    weathering: "Nearly pristine (5%), minimal texture, digital-first",
    style: "Ultra-minimal, Instagram aesthetic, square format influence"
  };
  return {
    era: "contemporary",
    weathering: "No weathering - brand new, pristine, fresh off the press",
    style: "Contemporary, experimental typography, vibrant full-saturation"
  };
}

// ============================================================================
// Prompt Builder
// ============================================================================

function buildPrompt(play: typeof TEST_PLAY): string {
  const eraContext = getEraContext(play.releaseYear);

  return `You are looking at the album artwork for "${play.album}" by ${play.artist} (${play.releaseYear}).

Create a VISUAL LINER NOTE image that:
1. Incorporates visual elements from this album artwork (colors, textures, mood)
2. Overlays the following text in a readable, designed way
3. Feels like an authentic inner sleeve from a ${eraContext.era} vinyl record

=== TEXT CONTENT ===
Title: "${play.title}"
Body: "${play.narrative}"

=== ERA STYLING: ${play.releaseYear} ===
Weathering: ${eraContext.weathering}
Design style: ${eraContext.style}

=== REQUIREMENTS ===
- Use the album art's color palette and visual mood
- Text must be fully legible (4.5:1 contrast minimum)
- Apply appropriate weathering/aging for ${play.releaseYear}
- Feel like a real vinyl inner sleeve, not generic AI art
- NO purple gradients, NO generic stock imagery
- The album artwork should inform the atmosphere and texture

=== OUTPUT ===
A single cohesive image combining:
- Album art atmosphere/elements as background
- Styled text overlay
- Era-appropriate weathering and texture`;
}

// ============================================================================
// Main
// ============================================================================

const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error("❌ Missing GOOGLE_API_KEY or GOOGLE_AI_API_KEY");
  process.exit(1);
}

const GoogleClientLive = Layer.provide(
  GoogleClientModule.layer({
    apiKey: Redacted.make(apiKey),
    transformClient: HttpClient.retryTransient({ times: 3 }),
  }),
  FetchHttpClient.layer
);

const program = Effect.gen(function* () {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  yield* Console.log(`\n🎨 Album Art-Derived Liner Note Generation`);
  yield* Console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  yield* Console.log(`Artist: ${TEST_PLAY.artist}`);
  yield* Console.log(`Album: ${TEST_PLAY.album}`);
  yield* Console.log(`Year: ${TEST_PLAY.releaseYear}`);
  yield* Console.log(`Art URL: ${TEST_PLAY.albumArtUrl}`);
  yield* Console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Load album art (local file or URL)
  yield* Console.log(`📥 Loading album artwork...`);
  let imageBase64: string;
  let mimeType = "image/jpeg";

  if (TEST_PLAY.albumArtUrl.startsWith("http")) {
    // Fetch from URL with proper headers
    const response = yield* Effect.tryPromise(() =>
      fetch(TEST_PLAY.albumArtUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "image/*"
        }
      })
    );
    if (!response.ok) {
      yield* Console.error(`   ✗ HTTP ${response.status}: ${response.statusText}`);
      return yield* Effect.fail(new Error(`Failed to fetch image: ${response.status}`));
    }
    const buffer = yield* Effect.tryPromise(() => response.arrayBuffer());
    imageBase64 = Buffer.from(buffer).toString("base64");
    yield* Console.log(`   ✓ Fetched ${Math.round(buffer.byteLength / 1024)}KB from URL`);
  } else {
    // Read local file
    const fileBuffer = fs.readFileSync(TEST_PLAY.albumArtUrl);
    imageBase64 = fileBuffer.toString("base64");
    mimeType = TEST_PLAY.albumArtUrl.endsWith(".png") ? "image/png" : "image/jpeg";
    yield* Console.log(`   ✓ Loaded ${Math.round(fileBuffer.byteLength / 1024)}KB from file`);
  }

  // Build prompt
  const prompt = buildPrompt(TEST_PLAY);
  yield* Console.log(`\n📝 Prompt:\n${prompt.slice(0, 400)}...\n`);

  // Build request with image input
  const googleClient = yield* GoogleClientModule.GoogleClient;

  const request = {
    model: NANO_BANANA_PRO_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBase64
            }
          },
          { text: prompt }
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  yield* Console.log(`🎨 Generating liner note with album art reference...`);
  const startTime = Date.now();

  const response = yield* googleClient.generateContent(request as any);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  yield* Console.log(`✓ Generated in ${elapsed}s`);

  // Process response
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if ("text" in part && part.text) {
        yield* Console.log(`\n💬 Notes: ${part.text.slice(0, 150)}...`);
      }
      if ("inlineData" in part && part.inlineData?.data) {
        const buffer = Buffer.from(part.inlineData.data, "base64");
        const filename = path.join(
          OUTPUT_DIR,
          `liner-note-with-art-${TEST_PLAY.releaseYear}-${Date.now()}.png`
        );
        fs.writeFileSync(filename, buffer);
        yield* Console.log(`\n🖼️  Saved: ${filename}`);

        // Open it
        yield* Effect.promise(() =>
          import("child_process").then(({ exec }) =>
            new Promise((resolve) => exec(`open "${filename}"`, () => resolve(undefined)))
          )
        );
      }
    }
  }

  yield* Console.log(`\n✅ Done!\n`);
});

Effect.runPromise(
  program.pipe(
    Effect.scoped,
    Effect.provide(GoogleClientLive),
    Effect.catchAll((error) =>
      Console.error(`❌ Error: ${error}`).pipe(Effect.zipRight(Effect.fail(error)))
    )
  )
).catch(console.error);
