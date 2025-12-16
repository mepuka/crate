/**
 * Image State Atoms
 *
 * Effect Atom-based state management for image loading.
 * Uses Result.Result pattern for loading/success/error states.
 *
 * Pattern matches the codebase's established atom patterns:
 * - Atom.family for parameterized atoms
 * - TimelineRuntime.fn for action atoms
 * - Result.Result for async state
 * - Effect.retry with Schedule for resilience
 */

import { Atom, Result } from "@effect-atom/atom-react";
import { Effect, Duration, Schedule } from "effect";
import { TimelineRuntime } from "@/lib/http-runtime";
import { ImageLoadState } from "@/services/image-load-service";

// ============================================================================
// Constants
// ============================================================================

const MAX_RETRIES = 3;
const INITIAL_DELAY = Duration.seconds(1);

// ============================================================================
// Image State Atom Family
// ============================================================================

/**
 * State atom for image loading status.
 * Uses Result.Result pattern consistent with the codebase.
 *
 * @param src - The image URL (or null for no image)
 * @returns Atom containing Result<ImageLoadState>
 */
export const imageStateAtom = Atom.family((src: string | null) => {
  // Handle null src immediately - no image to load
  if (src === null) {
    return Atom.make<Result.Result<ImageLoadState>>(
      Result.success(ImageLoadState.initial())
    );
  }

  // Start in initial state, will be loaded by loadImageAtom
  return Atom.make<Result.Result<ImageLoadState>>(Result.initial());
});

/**
 * Load image action atom.
 * Integrates with Effect retry and schedule patterns.
 *
 * Uses Effect.retry with Schedule.exponential for resilient loading:
 * - 3 retry attempts
 * - Exponential backoff: 1s, 2s, 4s
 * - Jitter to prevent thundering herd
 * - Cache-busting on retries
 *
 * @param src - The image URL to load
 */
export const loadImageAtom = Atom.family((src: string) =>
  TimelineRuntime.fn<void>()((_input, get) =>
    Effect.gen(function* () {
      const stateAtom = imageStateAtom(src);

      // Check if already loaded - avoid redundant work
      const current = get(stateAtom);
      if (Result.isSuccess(current) && current.value._tag === "Loaded") {
        yield* Effect.log(`Image already loaded: ${src}`);
        return;
      }

      // Set loading state
      get.set(stateAtom, Result.waiting(current));

      // Retry schedule: 1s, 2s, 4s with jitter
      const retrySchedule = Schedule.exponential(INITIAL_DELAY).pipe(
        Schedule.intersect(Schedule.recurs(MAX_RETRIES)),
        Schedule.jittered
      );

      let attempt = 0;

      // Create the load effect using native Image API
      const loadOnce = Effect.async<string, Error>((resume) => {
        attempt++;
        const img = new Image();

        img.onload = () => resume(Effect.succeed(src));
        img.onerror = (e) => resume(Effect.fail(new Error(`Load failed: ${e}`)));

        // Cache-bust on retries to bypass browser cache
        const finalSrc =
          attempt > 1
            ? `${src}${src.includes("?") ? "&" : "?"}_retry=${attempt}&_t=${Date.now()}`
            : src;

        img.src = finalSrc;

        // Cleanup on interruption
        return Effect.sync(() => {
          img.onload = null;
          img.onerror = null;
        });
      });

      // Execute with retry logic
      const result = yield* loadOnce.pipe(
        Effect.tap(() =>
          Effect.log(`Image load attempt ${attempt} for: ${src}`)
        ),
        Effect.retry(retrySchedule),
        Effect.either
      );

      // Update state based on result
      if (result._tag === "Right") {
        get.set(stateAtom, Result.success(ImageLoadState.loaded(src)));
        yield* Effect.log(
          `Image loaded successfully after ${attempt} attempts: ${src}`
        );
      } else {
        get.set(stateAtom, Result.success(ImageLoadState.failed(src, attempt)));
        yield* Effect.logWarning(
          `Image failed to load after ${attempt} attempts: ${src}`
        );
      }
    })
  )
);

/**
 * Force retry an image that previously failed.
 * Resets the state and triggers a new load.
 *
 * @param src - The image URL to retry
 */
export const retryImageAtom = Atom.family((src: string) =>
  TimelineRuntime.fn<void>()((_input, get) =>
    Effect.gen(function* () {
      const stateAtom = imageStateAtom(src);

      // Reset state to initial
      get.set(stateAtom, Result.initial());

      yield* Effect.log(`Retrying image load: ${src}`);

      // Trigger the load (will be handled by loadImageAtom)
      // Note: Component should call loadImageAtom after this
    })
  )
);

// ============================================================================
// Derived Atoms
// ============================================================================

/**
 * Whether an image is currently loading.
 */
export const isImageLoadingAtom = Atom.family((src: string | null) =>
  Atom.make((get) => {
    if (!src) return false;
    const state = get(imageStateAtom(src));
    return Result.matchWithWaiting(state, {
      onWaiting: () => true,
      onSuccess: (s) => s.value._tag === "Loading",
      onError: () => false,
      onDefect: () => false,
    });
  })
);

/**
 * Whether an image has failed to load after all retries.
 */
export const isImageFailedAtom = Atom.family((src: string | null) =>
  Atom.make((get) => {
    if (!src) return false;
    const state = get(imageStateAtom(src));
    return Result.matchWithWaiting(state, {
      onWaiting: () => false,
      onSuccess: (s) => s.value._tag === "Failed",
      onError: () => true,
      onDefect: () => true,
    });
  })
);

/**
 * Whether an image has loaded successfully.
 */
export const isImageLoadedAtom = Atom.family((src: string | null) =>
  Atom.make((get) => {
    if (!src) return false;
    const state = get(imageStateAtom(src));
    return Result.matchWithWaiting(state, {
      onWaiting: () => false,
      onSuccess: (s) => s.value._tag === "Loaded",
      onError: () => false,
      onDefect: () => false,
    });
  })
);

/**
 * Get the current retry attempt for an image.
 * Returns 0 if not loading, the attempt number during loading,
 * or the total attempts if failed.
 */
export const imageRetryAttemptAtom = Atom.family((src: string | null) =>
  Atom.make((get) => {
    if (!src) return 0;
    const state = get(imageStateAtom(src));
    return Result.matchWithWaiting(state, {
      onWaiting: () => 1,
      onSuccess: (s) => {
        switch (s.value._tag) {
          case "Loading":
            return s.value.attempt;
          case "Failed":
            return s.value.attempts;
          default:
            return 0;
        }
      },
      onError: () => 0,
      onDefect: () => 0,
    });
  })
);
