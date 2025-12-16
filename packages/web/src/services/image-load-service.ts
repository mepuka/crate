/**
 * Image Load Service
 *
 * Effect-based service for image loading with retry logic.
 * Uses Effect.retry with Schedule.exponential for resilient image loading.
 *
 * Pattern matches the codebase's established service patterns:
 * - Effect.Service<T>()() for service definition
 * - Schedule for retry policies
 * - Data.TaggedError for typed errors
 */

import { Data, Effect, Schedule, Duration } from "effect";
import { Reactivity } from "@effect/experimental";

// ============================================================================
// Error Types
// ============================================================================

export class ImageLoadError extends Data.TaggedError("ImageLoadError")<{
  readonly src: string;
  readonly attempt: number;
  readonly cause: unknown;
}> {}

export class ImageLoadExhausted extends Data.TaggedError("ImageLoadExhausted")<{
  readonly src: string;
  readonly totalAttempts: number;
}> {}

// ============================================================================
// Image Load State
// ============================================================================

export type ImageLoadState =
  | { readonly _tag: "Initial" }
  | { readonly _tag: "Loading"; readonly attempt: number }
  | { readonly _tag: "Loaded"; readonly src: string }
  | { readonly _tag: "Failed"; readonly src: string; readonly attempts: number };

export const ImageLoadState = {
  initial: (): ImageLoadState => ({ _tag: "Initial" }),
  loading: (attempt: number): ImageLoadState => ({ _tag: "Loading", attempt }),
  loaded: (src: string): ImageLoadState => ({ _tag: "Loaded", src }),
  failed: (src: string, attempts: number): ImageLoadState => ({
    _tag: "Failed",
    src,
    attempts,
  }),
} as const;

// ============================================================================
// Constants
// ============================================================================

const MAX_RETRIES = 3;
const INITIAL_DELAY = Duration.seconds(1);

// ============================================================================
// Image Load Service
// ============================================================================

export class ImageLoadService extends Effect.Service<ImageLoadService>()(
  "ImageLoadService",
  {
    effect: Effect.gen(function* () {
      const reactivity = yield* Reactivity.Reactivity;

      // Retry schedule: 1s, 2s, 4s (exponential backoff, 3 retries)
      // Add jitter to prevent thundering herd on batch failures
      const retrySchedule = Schedule.exponential(INITIAL_DELAY).pipe(
        Schedule.intersect(Schedule.recurs(MAX_RETRIES)),
        Schedule.jittered
      );

      /**
       * Load an image with retry logic.
       * Uses native Image() constructor to preload and validate.
       *
       * @param src - The image URL to load
       * @returns Effect that resolves to the src on success, or fails with ImageLoadExhausted
       */
      const loadImage = (
        src: string
      ): Effect.Effect<string, ImageLoadExhausted> =>
        Effect.gen(function* () {
          // Track attempt number for logging/state
          let currentAttempt = 0;

          const loadOnce = Effect.async<string, ImageLoadError>((resume) => {
            currentAttempt++;
            const img = new Image();

            img.onload = () => {
              resume(Effect.succeed(src));
            };

            img.onerror = (event) => {
              resume(
                Effect.fail(
                  new ImageLoadError({
                    src,
                    attempt: currentAttempt,
                    cause: event,
                  })
                )
              );
            };

            // Add cache-busting query param on retries to bypass browser cache
            const urlWithCacheBust =
              currentAttempt > 1
                ? `${src}${src.includes("?") ? "&" : "?"}_retry=${currentAttempt}&_t=${Date.now()}`
                : src;

            img.src = urlWithCacheBust;

            // Cleanup on interruption
            return Effect.sync(() => {
              img.onload = null;
              img.onerror = null;
              img.src = "";
            });
          });

          // Apply retry with exponential backoff
          const result = yield* loadOnce.pipe(
            Effect.tap(() =>
              Effect.log(`Image load attempt ${currentAttempt} for: ${src}`)
            ),
            Effect.retry(retrySchedule),
            Effect.mapError(
              () =>
                new ImageLoadExhausted({
                  src,
                  totalAttempts: currentAttempt,
                })
            )
          );

          return result;
        });

      /**
       * Invalidate image state for reactive updates.
       * Triggers re-render of components using the image state atom.
       *
       * @param src - The image URL to invalidate
       */
      const invalidateImageState = (src: string) =>
        reactivity.invalidate([`image:${src}`]);

      return {
        loadImage,
        invalidateImageState,
      } as const;
    }),
    dependencies: [Reactivity.layer],
  }
) {}
