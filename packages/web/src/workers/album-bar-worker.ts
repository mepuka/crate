/**
 * Album Bar Worker
 *
 * Web Worker for processing album artwork data for the scrolling top bar.
 * Uses Effect's WorkerRunner for structured message passing and error handling.
 *
 * Architecture:
 * - AlbumArtworkService encapsulates business logic (filtering, processing)
 * - WorkerRunner handles message routing and serialization
 * - Effect patterns ensure type safety and composability
 *
 * Processing happens off the main thread to keep UI responsive.
 */

import { BrowserWorkerRunner } from "@effect/platform-browser";
import { WorkerRunner } from "@effect/platform";
import { Effect, Layer, Context, Schema, Match } from "effect";
import {
  AlbumArtworkData,
  type WorkerRequest,
} from "./album-bar-worker-protocol";
import { PlayResult } from "@crate/api";

/**
 * AlbumArtworkService
 *
 * Handles processing of play data to extract and prepare album artwork.
 * Pure data transformation - no side effects.
 */
class AlbumArtworkService extends Context.Tag("AlbumArtworkService")<
  AlbumArtworkService,
  {
    readonly processArtwork: (
      plays: ReadonlyArray<typeof PlayResult.Type>,
      maxCount: number
    ) => Effect.Effect<ReadonlyArray<AlbumArtworkData>>;
    readonly preloadImages: (
      urls: ReadonlyArray<string>
    ) => Effect.Effect<{ loaded: string[]; failed: string[] }>;
  }
>() {}

/**
 * AlbumArtworkService Implementation
 *
 * Live implementation for processing album artwork.
 */
const AlbumArtworkServiceLive = Layer.succeed(
  AlbumArtworkService,
  AlbumArtworkService.of({
    processArtwork: (plays, maxCount) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(
          `Processing ${plays.length} plays for album artwork (max: ${maxCount})`
        );

        // Sort by airdate (newest first) - moved from main thread
        const sorted = [...plays].sort(
          (a, b) => b.airdate.getTime() - a.airdate.getTime()
        );

        // Filter plays with artwork
        const withArtwork = sorted.filter(
          (play) => play.thumbnail_uri || play.image_uri
        );

        // Dedupe by image URI to avoid visual repetition in the background grid
        // Keep the first (most recent) occurrence of each unique album cover
        const seenUris = new Set<string>();
        const uniqueArtwork = withArtwork.filter((play) => {
          const uri = play.image_uri || play.thumbnail_uri || "";
          if (seenUris.has(uri)) {
            return false;
          }
          seenUris.add(uri);
          return true;
        });

        // Take max count from unique artwork
        const finalArtwork = uniqueArtwork.slice(0, maxCount);

        yield* Effect.logInfo(
          `Found ${withArtwork.length} plays with artwork, ${uniqueArtwork.length} unique covers, using ${finalArtwork.length}`
        );

        // Map to AlbumArtworkData structure
        const artworkData = finalArtwork.map((play) => ({
          id: play.id,
          thumbnailUri: play.thumbnail_uri || play.image_uri || "",
          imageUri: play.image_uri || play.thumbnail_uri || "",
          artist: play.artist,
          album: play.album,
          song: play.song,
          width: 300,
          height: 300,
          airdate: play.airdate,
          comment: play.comment,
        }));

        // Data is already in correct format for postMessage (plain objects)
        return artworkData;
      }),

    preloadImages: (urls) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(`Preloading ${urls.length} images`);

        const loaded: string[] = [];
        const failed: string[] = [];

        // Attempt to preload each image using Effect patterns
        // Fetch triggers browser caching for the resources
        for (const url of urls) {
          const fetchEffect = Effect.tryPromise({
            try: () => fetch(url, { mode: "cors" }),
            catch: () => new Error(`Failed to fetch ${url}`),
          });

          const result = yield* Effect.either(fetchEffect);

          if (result._tag === "Right") {
            loaded.push(url);
            yield* Effect.logDebug(`Preloaded: ${url}`);
          } else {
            failed.push(url);
            yield* Effect.logDebug(`Failed to preload: ${url}`);
          }
        }

        yield* Effect.logInfo(
          `Preload complete: ${loaded.length} loaded, ${failed.length} failed`
        );

        return { loaded, failed };
      }),
  })
);

/**
 * Worker Request Handler
 *
 * Routes incoming requests to appropriate service methods.
 * Pattern: Match.type to handle each request type.
 */
const handleRequest = (request: WorkerRequest) =>
  Match.type<WorkerRequest>().pipe(
    Match.tag("LoadAlbumArtwork", (r) =>
      Effect.gen(function* () {
        const service = yield* AlbumArtworkService;

        // Decode plays from wire format
        const plays = yield* Effect.forEach(
          r.plays,
          (play) => Schema.decodeUnknown(PlayResult)(play).pipe(Effect.orDie),
          { concurrency: 50 }
        );

        const artwork = yield* service.processArtwork(plays, r.maxCount);

        // Encode results for postMessage serialization
        // Pattern: Schema.encode converts Date -> string for DateFromString
        return yield* Effect.forEach(
          artwork,
          (item) => Schema.encode(AlbumArtworkData)(item).pipe(Effect.orDie),
          { concurrency: 50 }
        );
      })
    ),
    Match.tag("PreloadImages", (r) =>
      Effect.gen(function* () {
        const service = yield* AlbumArtworkService;
        return yield* service.preloadImages(r.urls);
      })
    ),
    Match.exhaustive
  )(request);

/**
 * Worker Runtime Layer
 *
 * Composes all service layers needed by the worker.
 * Uses WorkerRunner.layer pattern for proper lifecycle management.
 */
const WorkerLive = WorkerRunner.layer(handleRequest).pipe(
  // Provide our service implementation
  Layer.provide(AlbumArtworkServiceLive),
  // Provide the browser platform runner
  Layer.provide(BrowserWorkerRunner.layer)
);

/**
 * Worker Entry Point
 *
 * Launch the worker using BrowserWorkerRunner.launch
 * Pattern from Effect source: BrowserWorkerRunner.launch(WorkerLive) + Effect.runFork
 */
Effect.runFork(BrowserWorkerRunner.launch(WorkerLive));
