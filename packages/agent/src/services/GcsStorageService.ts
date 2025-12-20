/**
 * GCS Storage Service
 *
 * Simple service for uploading generated assets to Google Cloud Storage.
 * Uses Application Default Credentials (works automatically on Cloud Run).
 *
 * @module
 */

import { Context, Data, Effect, Layer, Config, Option } from "effect";

// =============================================================================
// Errors
// =============================================================================

export class GcsStorageError extends Data.TaggedError("GcsStorageError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Types
// =============================================================================

export interface UploadResult {
  readonly bucket: string;
  readonly path: string;
  readonly publicUrl: string;
}

export interface UploadRequest {
  /** Base64-encoded file content */
  readonly base64Data: string;
  /** MIME type (e.g., "image/png") */
  readonly mimeType: string;
  /** Path within bucket (e.g., "liner-notes/play-123/asset.png") */
  readonly path: string;
  /** Optional cache control header */
  readonly cacheControl?: string;
}

// =============================================================================
// Service Interface
// =============================================================================

export interface GcsStorageServiceInterface {
  /**
   * Upload a file to GCS
   */
  readonly upload: (
    request: UploadRequest
  ) => Effect.Effect<UploadResult, GcsStorageError>;

  /**
   * Get public URL for a path
   */
  readonly getPublicUrl: (path: string) => string;
}

/**
 * GcsStorageService tag
 */
export class GcsStorageService extends Context.Tag("GcsStorageService")<
  GcsStorageService,
  GcsStorageServiceInterface
>() {}

// =============================================================================
// Configuration
// =============================================================================

export interface GcsConfigShape {
  readonly bucketName: string;
  readonly baseUrl: string;
}

export class GcsConfig extends Effect.Service<GcsConfig>()("GcsConfig", {
  effect: Effect.gen(function* () {
    const { bucketName } = yield* Config.all({
      bucketName: Config.string("GCS_BUCKET").pipe(
        Config.withDefault("crate-generated-assets")
      ),
    });

    return {
      bucketName,
      baseUrl: `https://storage.googleapis.com/${bucketName}`,
    } satisfies GcsConfigShape;
  }),
}) {}

// =============================================================================
// Live Implementation
// =============================================================================

const makeGcsStorageService = Effect.gen(function* () {
  const config = yield* GcsConfig;

  // Dynamically import @google-cloud/storage (only on Cloud Run / Node.js)
  const { Storage } = yield* Effect.tryPromise({
    try: () => import("@google-cloud/storage"),
    catch: (e) =>
      new GcsStorageError({
        message: "Failed to load @google-cloud/storage",
        cause: e,
      }),
  });

  const storage = new Storage();
  const bucket = storage.bucket(config.bucketName);

  const getPublicUrl = (path: string): string =>
    `${config.baseUrl}/${path}`;

  const upload = (
    request: UploadRequest
  ): Effect.Effect<UploadResult, GcsStorageError> =>
    Effect.gen(function* () {
      const buffer = Buffer.from(request.base64Data, "base64");
      const file = bucket.file(request.path);

      yield* Effect.tryPromise({
        try: async () => {
          await file.save(buffer, {
            metadata: {
              contentType: request.mimeType,
              cacheControl: request.cacheControl ?? "public, max-age=31536000",
            },
          });
          // Make publicly readable
          await file.makePublic();
        },
        catch: (e) =>
          new GcsStorageError({
            message: `Failed to upload to GCS: ${e}`,
            cause: e,
          }),
      });

      yield* Effect.log(
        `GcsStorage: Uploaded ${request.path} (${buffer.length} bytes)`
      );

      return {
        bucket: config.bucketName,
        path: request.path,
        publicUrl: getPublicUrl(request.path),
      };
    });

  return { upload, getPublicUrl } satisfies GcsStorageServiceInterface;
});

/**
 * Live layer - requires GcsConfig
 */
export const GcsStorageServiceLive: Layer.Layer<
  GcsStorageService,
  GcsStorageError,
  GcsConfig
> = Layer.effect(GcsStorageService, makeGcsStorageService);

/**
 * Full live layer with config
 */
export const GcsStorageServiceFull: Layer.Layer<
  GcsStorageService,
  GcsStorageError,
  never
> = Layer.provide(GcsStorageServiceLive, GcsConfig.Default);

// =============================================================================
// Test/Mock Implementation
// =============================================================================

/**
 * Test layer that doesn't actually upload
 */
export const GcsStorageServiceTest: Layer.Layer<GcsStorageService> =
  Layer.succeed(GcsStorageService, {
    upload: (request) =>
      Effect.succeed({
        bucket: "test-bucket",
        path: request.path,
        publicUrl: `https://storage.googleapis.com/test-bucket/${request.path}`,
      }),
    getPublicUrl: (path) =>
      `https://storage.googleapis.com/test-bucket/${path}`,
  });
