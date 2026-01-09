#!/usr/bin/env bun
/**
 * Test: LinerNoteGenerationService with LIVE album art
 *
 * Uses real album art from Cover Art Archive to test liner note generation
 * with the Crate Cat easter egg integration.
 *
 * Run with:
 *   set -a && source .env && set +a && bun run src/scripts/test-liner-note-live.ts
 *
 * Or with FAISS API (if running):
 *   CRATE_API_URL=http://cratemusic.duckdns.org:8000 bun run src/scripts/test-liner-note-live.ts
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
  type LinerNoteStyle,
} from "../services/LinerNoteGenerationService.js";

const OUTPUT_DIR = "/tmp/liner-notes-live";

// =============================================================================
// Test Albums - Real albums with Cover Art Archive URLs
// =============================================================================

interface TestAlbum {
  id: number;
  artist: string;
  album: string;
  song: string;
  releaseYear: number;
  imageUrl: string;
  comment?: string;
  style: LinerNoteStyle;
}

// Diverse selection of real albums across eras - using direct image URLs
const TEST_ALBUMS: TestAlbum[] = [
  {
    id: 1001,
    artist: "Miles Davis",
    album: "Kind of Blue",
    song: "So What",
    releaseYear: 1959,
    // Wikipedia commons - Kind of Blue
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/9/9c/MilesDavisKindofBlue.jpg",
    comment: "The best-selling jazz album of all time. Modal jazz perfection.",
    style: "art-forward",
  },
  {
    id: 1002,
    artist: "Radiohead",
    album: "OK Computer",
    song: "Paranoid Android",
    releaseYear: 1997,
    // Wikipedia commons - OK Computer
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/b/ba/Radioheadokcomputer.png",
    comment: "Alienation anthem from the definitive 90s rock album.",
    style: "collage",
  },
  {
    id: 1003,
    artist: "Kendrick Lamar",
    album: "To Pimp a Butterfly",
    song: "Alright",
    releaseYear: 2015,
    // Wikipedia commons - To Pimp a Butterfly
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/f/f6/Kendrick_Lamar_-_To_Pimp_a_Butterfly.png",
    comment: "Jazz-inflected hip-hop masterpiece. We gon' be alright.",
    style: "art-forward",
  },
  {
    id: 1004,
    artist: "Björk",
    album: "Homogenic",
    song: "Hunter",
    releaseYear: 1997,
    // Wikipedia commons - Homogenic
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/5/5e/Bj%C3%B6rk_-_Homogenic.png",
    comment: "Electronic orchestral fusion from Iceland's most visionary artist.",
    style: "archival",
  },
  {
    id: 1005,
    artist: "Portishead",
    album: "Dummy",
    song: "Glory Box",
    releaseYear: 1994,
    // Wikipedia commons - Dummy
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/6/6d/Portishead_-_Dummy.png",
    comment: "Trip-hop defining moment. Bristol's smoky, noir-tinged masterpiece.",
    style: "editorial",
  },
  {
    id: 1006,
    artist: "Tame Impala",
    album: "Currents",
    song: "Let It Happen",
    releaseYear: 2015,
    // Wikipedia commons - Currents
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/9/9b/Tame_Impala_-_Currents.png",
    comment: "Kevin Parker's psychedelic synth-pop evolution.",
    style: "art-forward",
  },
];

// =============================================================================
// Fetch Album Art
// =============================================================================

async function fetchAlbumArt(imageUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    console.log(`   📥 Fetching: ${imageUrl.slice(0, 70)}...`);

    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "CrateMusic/1.0 (album art fetcher)",
      },
    });

    if (!response.ok) {
      console.log(`   ⚠️  Image fetch failed: ${response.status}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return { base64, mimeType: contentType };
  } catch (error) {
    console.log(`   ⚠️  Image fetch error: ${error}`);
    return null;
  }
}

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

// Select test parameters
const playLimit = parseInt(process.env.PLAY_LIMIT ?? "3");

const program = Effect.gen(function* () {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  yield* Console.log(`\n🎨 Liner Note Generation - LIVE Album Art`);
  yield* Console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  yield* Console.log(`🐱 Crate Cat easter egg: ENABLED`);
  yield* Console.log(`📀 Testing with ${Math.min(playLimit, TEST_ALBUMS.length)} albums from Cover Art Archive\n`);

  const albumsToTest = TEST_ALBUMS.slice(0, playLimit);
  let processed = 0;

  for (const album of albumsToTest) {
    yield* Console.log(`\n📀 [${processed + 1}/${albumsToTest.length}] ${album.artist} - ${album.song}`);
    yield* Console.log(`   Album: ${album.album}`);
    yield* Console.log(`   Year: ${album.releaseYear}`);
    yield* Console.log(`   Style: ${album.style}`);

    // Fetch album art from Cover Art Archive
    const artData = yield* Effect.tryPromise({
      try: () => fetchAlbumArt(album.imageUrl),
      catch: () => null
    });

    if (!artData) {
      yield* Console.log(`   ⚠️  No album art available, skipping`);
      continue;
    }

    yield* Console.log(`   ✓ Art loaded (${Math.round(artData.base64.length * 0.75 / 1024)}KB)`);

    // Build request
    const request: LinerNoteRequest = {
      playId: album.id,
      albumArtBase64: artData.base64,
      mimeType: artData.mimeType,
      releaseYear: album.releaseYear,
      title: `${album.artist} - ${album.song}`,
      narrative: album.comment || `${album.song} by ${album.artist} from ${album.album}`,
      artistName: album.artist,
      albumName: album.album,
      style: album.style,
    };

    yield* Console.log(`   🎨 Generating texture with Crate Cat...`);
    const startTime = Date.now();

    const result = yield* generateLinerNote(request).pipe(
      Effect.catchAll((error) => {
        return Effect.gen(function* () {
          yield* Console.error(`   ❌ Generation failed: ${error}`);
          return null;
        });
      })
    );

    if (!result) {
      continue;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    yield* Console.log(`   ✓ Generated in ${elapsed}s`);
    yield* Console.log(`   Era: ${result.era}`);

    if (result.modelNotes) {
      // Show where the model says the cat is hidden
      const catMention = result.modelNotes.toLowerCase().includes("cat")
        ? result.modelNotes.split("\n").find(line => line.toLowerCase().includes("cat"))
        : null;
      if (catMention) {
        yield* Console.log(`   🐱 ${catMention.trim().slice(0, 100)}...`);
      }
    }

    // Save output
    const safeArtist = album.artist.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);
    const filename = path.join(
      OUTPUT_DIR,
      `${safeArtist}-${album.style}-${Date.now()}.png`
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

    processed++;
  }

  yield* Console.log(`\n✅ Generated ${processed} liner notes with Crate Cat!`);
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
