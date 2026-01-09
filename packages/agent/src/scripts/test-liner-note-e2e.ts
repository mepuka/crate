#!/usr/bin/env bun
/**
 * End-to-End Test: Liner Note Generation + Persistence
 *
 * Tests the complete flow:
 * 1. Fetch play from FAISS API (with album art)
 * 2. Generate liner note texture via LinerNoteGenerationService
 * 3. Upload to GCS via LinerNoteOrchestrator
 * 4. Persist metadata to FAISS API via FaissClient.storeGeneratedAsset
 *
 * Run with:
 *   set -a && source .env && set +a && bun run src/scripts/test-liner-note-e2e.ts
 *
 * Or specify play IDs:
 *   PLAY_IDS=123,456 bun run src/scripts/test-liner-note-e2e.ts
 */

import { Effect, Console, Layer, Redacted, pipe } from "effect";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import * as GoogleClientModule from "@effect/ai-google/GoogleClient";
import * as fs from "node:fs";
import * as path from "node:path";

import { FaissClient, FaissClientLive } from "../FaissClient.js";
import { LinerNoteGenerationServiceLive } from "../services/LinerNoteGenerationService.js";
import {
  LinerNoteOrchestratorLive,
  orchestrateLinerNote,
  type OrchestrateLinerNoteInput,
} from "../services/LinerNoteOrchestrator.js";
import { GcsStorageServiceTest } from "../services/GcsStorageService.js";

const OUTPUT_DIR = "/tmp/liner-notes-e2e";

// =============================================================================
// Fetch Album Art
// =============================================================================

async function fetchAlbumArt(
  imageUrl: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    console.log(`   📥 Fetching art: ${imageUrl.slice(0, 60)}...`);

    const response = await fetch(imageUrl, {
      headers: { "User-Agent": "CrateMusic/1.0 (liner notes test)" },
    });

    if (!response.ok) {
      console.log(`   ⚠️  Art fetch failed: ${response.status}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return { base64, mimeType: contentType };
  } catch (error) {
    console.log(`   ⚠️  Art fetch error: ${error}`);
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

// Parse play IDs from env or use default
const playIdsArg = process.env.PLAY_IDS;
const playIds = playIdsArg
  ? playIdsArg.split(",").map((id) => parseInt(id.trim(), 10))
  : undefined;

// Build layers
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

// Use test GCS for local testing (won't actually upload)
const OrchestratorLayer = pipe(
  LinerNoteOrchestratorLive,
  Layer.provide(GcsStorageServiceTest)
);

const program = Effect.gen(function* () {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  yield* Console.log(`\n🎨 Liner Note E2E Test`);
  yield* Console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  yield* Console.log(`📦 Flow: FAISS → Generate → GCS → Persist\n`);

  const faissClient = yield* FaissClient;

  // Get plays to process
  let plays: Array<{
    id: number;
    artist: string;
    song: string;
    album: string | null;
    image_uri: string | null;
    release_date: Date | string | null;
    comment: string | null;
  }>;

  if (playIds) {
    yield* Console.log(`Using specified play IDs: ${playIds.join(", ")}`);
    const batch = yield* faissClient.getPlaysBatch(playIds);
    plays = batch.plays;
  } else {
    yield* Console.log(`Fetching recent plays from timeline...`);
    const timeline = yield* faissClient.timeline({ limit: 3 });
    plays = timeline.results;
  }

  yield* Console.log(`Found ${plays.length} plays to process\n`);

  let processed = 0;
  let persisted = 0;

  for (const play of plays) {
    yield* Console.log(`\n📀 [${processed + 1}/${plays.length}] ${play.artist} - ${play.song}`);
    yield* Console.log(`   Album: ${play.album || "(unknown)"}`);
    yield* Console.log(`   Play ID: ${play.id}`);

    // Check for album art
    if (!play.image_uri) {
      yield* Console.log(`   ⚠️  No album art URL, skipping`);
      continue;
    }

    // Fetch album art
    const artData = yield* Effect.tryPromise({
      try: () => fetchAlbumArt(play.image_uri!),
      catch: () => null,
    });

    if (!artData) {
      yield* Console.log(`   ⚠️  Could not fetch album art, skipping`);
      continue;
    }

    yield* Console.log(`   ✓ Art loaded (${Math.round((artData.base64.length * 0.75) / 1024)}KB)`);

    // Parse release year
    const releaseYear = play.release_date
      ? new Date(play.release_date as string).getFullYear()
      : null;

    // Build orchestration input
    const input: OrchestrateLinerNoteInput = {
      playId: play.id,
      albumArtBase64: artData.base64,
      mimeType: artData.mimeType,
      releaseYear,
      artistName: play.artist,
      albumName: play.album ?? undefined,
      trackTitle: play.song,
      narrative: play.comment ?? undefined,
      style: "art-forward",
    };

    yield* Console.log(`   🎨 Generating liner note texture...`);
    const startTime = Date.now();

    // Orchestrate: generate + "upload" to GCS (test layer)
    const result = yield* orchestrateLinerNote(input).pipe(
      Effect.catchAll((error) => {
        return Console.error(`   ❌ Generation failed: ${error.message}`).pipe(
          Effect.map(() => null)
        );
      })
    );

    if (!result) {
      continue;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    yield* Console.log(`   ✓ Generated in ${elapsed}s`);
    yield* Console.log(`   Era: ${result.era}`);
    yield* Console.log(`   GCS URL: ${result.imageUrl}`);

    // Save output locally for visual inspection
    const safeArtist = play.artist
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .slice(0, 30);
    const filename = path.join(
      OUTPUT_DIR,
      `${safeArtist}-${result.style}-${result.paramsHash}.png`
    );
    const buffer = Buffer.from(result.imageBase64, "base64");
    fs.writeFileSync(filename, buffer);
    yield* Console.log(`   💾 Saved locally: ${filename}`);

    // Persist to FAISS API
    yield* Console.log(`   📤 Persisting to FAISS API...`);

    const storeResult = yield* faissClient
      .storeGeneratedAsset({
        play_id: play.id,
        asset_type: "liner_note",
        params_hash: result.paramsHash,
        image_base64: result.imageBase64,
        mime_type: result.mimeType,
        era: result.era,
        style: result.style,
        model_notes: result.modelNotes,
        gcs_url: result.imageUrl,
      })
      .pipe(
        Effect.catchAll((error) => {
          return Console.error(`   ⚠️  Persist failed: ${error.message}`).pipe(
            Effect.map(() => null)
          );
        })
      );

    if (storeResult) {
      yield* Console.log(
        `   ✓ Persisted! ID: ${storeResult.id}, existing: ${storeResult.was_existing}`
      );
      persisted++;
    }

    processed++;
  }

  yield* Console.log(`\n${"━".repeat(55)}`);
  yield* Console.log(`✅ Processed ${processed}/${plays.length} plays`);
  yield* Console.log(`✅ Persisted ${persisted} liner notes to FAISS API`);
  yield* Console.log(`📁 Local copies: ${OUTPUT_DIR}\n`);
});

// Combined layer
const AppLayer = Layer.mergeAll(
  FaissClientLive,
  LinerNoteServiceLayer,
  OrchestratorLayer
);

// Run
Effect.runPromise(
  program.pipe(
    Effect.provide(AppLayer),
    Effect.catchAll((error) =>
      Console.error(`❌ Error: ${error}`).pipe(Effect.zipRight(Effect.fail(error)))
    )
  )
)
  .then(() => {
    console.log("\n🎉 E2E test complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 E2E test failed:", error);
    process.exit(1);
  });
