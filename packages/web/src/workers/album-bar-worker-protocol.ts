/**
 * Album Bar Worker Protocol
 *
 * Defines the typed message protocol between main thread and album bar worker.
 * Uses Effect Schema for type-safe serialization and validation.
 */

import { Schema } from "effect";
import { PlayResult } from "@crate/api";

/**
 * Processed album artwork data ready for rendering.
 * Contains image URLs and metadata for canvas rendering.
 */
export const AlbumArtworkData = Schema.Struct({
  id: Schema.Number,
  thumbnailUri: Schema.String,
  imageUri: Schema.String,
  artist: Schema.String,
  album: Schema.NullOr(Schema.String),
  song: Schema.String,
  // Image dimensions (useful for rendering)
  width: Schema.optionalWith(Schema.Number, { default: () => 300 }),
  height: Schema.optionalWith(Schema.Number, { default: () => 300 }),
  // New music detection fields
  airdate: Schema.DateFromString, // Encodes Date -> string for postMessage
  comment: Schema.NullOr(Schema.String),
});

export type AlbumArtworkData = typeof AlbumArtworkData.Type;

/**
 * Load and process album artwork from recent plays.
 *
 * Worker will:
 * 1. Filter plays with artwork
 * 2. Process and validate image URLs
 * 3. Optionally preload/decode images for faster rendering
 * 4. Return structured artwork data
 */
export class LoadAlbumArtworkRequest
  extends Schema.TaggedRequest<LoadAlbumArtworkRequest>()(
    "LoadAlbumArtwork",
    {
      failure: Schema.Unknown, // Generic error handling
      success: Schema.Array(AlbumArtworkData),
      payload: {
        plays: Schema.Array(PlayResult),
        maxCount: Schema.optionalWith(Schema.Number, { default: () => 25 }),
      },
    }
  ) {}

/**
 * Preload specific images in the worker.
 * Uses Image API to trigger browser decoding/caching.
 *
 * Returns success status for each URL.
 */
export class PreloadImagesRequest extends Schema.TaggedRequest<PreloadImagesRequest>()(
  "PreloadImages",
  {
    failure: Schema.Never, // Best-effort, no failures
    success: Schema.Struct({
      loaded: Schema.Array(Schema.String), // Successfully loaded URLs
      failed: Schema.Array(Schema.String), // Failed URLs
    }),
    payload: {
      urls: Schema.Array(Schema.String),
    },
  }
) {}

/**
 * Union of all worker requests.
 * Used for WorkerRunner type signature.
 */
export type WorkerRequest = LoadAlbumArtworkRequest | PreloadImagesRequest;
