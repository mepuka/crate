/**
 * Album Bar Worker Client
 *
 * Main thread interface to the album bar worker.
 * Provides type-safe API for sending requests and receiving responses.
 *
 * Uses Effect's Worker API for structured worker communication with Schema serialization.
 */

import { Effect } from "effect";
import * as Worker from "@effect/platform/Worker";
import * as BrowserWorker from "@effect/platform-browser/BrowserWorker";
import type { PlayResult } from "@crate/api";
import {
  LoadAlbumArtworkRequest,
  PreloadImagesRequest,
  type WorkerRequest,
  type AlbumArtworkData,
} from "./album-bar-worker-protocol";

/**
 * AlbumBarWorkerClient
 *
 * Service for communicating with the album bar worker.
 * Provides typed methods for all worker operations.
 *
 * Uses Effect.Service pattern for proper .Default layer support.
 */
export class AlbumBarWorkerClient extends Effect.Service<AlbumBarWorkerClient>()(
  "AlbumBarWorkerClient",
  {
    scoped: Effect.gen(function* () {
      yield* Effect.logInfo("AlbumBarWorkerClient: Initializing worker pool");

      // Create a worker pool with Schema serialization
      const pool = yield* Worker.makePoolSerialized<WorkerRequest>({
        size: 1, // Single worker for album bar processing
      });

      yield* Effect.logInfo("AlbumBarWorkerClient: Worker pool created");

      return {
        /**
         * Load and process album artwork from recent plays.
         * Returns structured artwork data ready for rendering.
         */
        loadArtwork: (
          plays: ReadonlyArray<typeof PlayResult.Type>,
          maxCount?: number
        ) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(
              `AlbumBarWorkerClient: Loading artwork for ${plays.length} plays (max: ${maxCount ?? 25})`
            );

            // Create typed request
            const request = new LoadAlbumArtworkRequest({
              plays,
              maxCount: maxCount ?? 25,
            });

            // Send to worker and get response
            const results = yield* pool.executeEffect(request);

            yield* Effect.logInfo(
              `AlbumBarWorkerClient: Received ${results.length} artwork items`
            );

            return results as ReadonlyArray<AlbumArtworkData>;
          }),

        /**
         * Preload images in the worker to trigger browser caching.
         * Returns which URLs loaded successfully.
         */
        preloadImages: (urls: ReadonlyArray<string>) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(
              `AlbumBarWorkerClient: Preloading ${urls.length} images`
            );

            const request = new PreloadImagesRequest({ urls });

            const result = yield* pool.executeEffect(request);

            yield* Effect.logInfo(
              `AlbumBarWorkerClient: Preload complete - ${result.loaded.length} loaded, ${result.failed.length} failed`
            );

            return result;
          }),
      } as const;
    }),
    dependencies: [
      BrowserWorker.layer(
        () =>
          new globalThis.Worker(
            new URL("./album-bar-worker.ts", import.meta.url),
            {
              type: "module",
            }
          )
      ),
    ],
  }
) {}
