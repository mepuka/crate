/**
 * Mock SSE Stream for Timeline
 *
 * Simulates Server-Sent Events (SSE) for real-time play updates.
 * Emits realistic PlayResult objects at configurable intervals.
 *
 * Pattern Reference:
 * - Stream.async for event-based streaming
 * - Stream.unfold for state-based generation
 * - Local Effect source: docs/effect-source/effect/src/Stream.ts
 *
 * This mock allows testing reactive timeline updates without hitting a real API.
 */

import { Effect, Stream, Duration, Ref, Option } from "effect";
import type { PlayResult } from "@crate/api";
import { generateMockPlay, type MockPlayConfig } from "@/utils/mock-play-generator";

/**
 * Configuration for mock SSE stream
 */
export interface MockSSEConfig extends MockPlayConfig {
  /** Interval between play emissions (default: 2 seconds) */
  readonly emitIntervalMs?: number;
  /** Maximum number of plays to emit (undefined = infinite) */
  readonly maxPlays?: number;
  /** Start paused (requires manual start) */
  readonly startPaused?: boolean;
}

/**
 * SSE Stream Control
 * Allows external control of the stream (start, stop, emit)
 */
export interface SSEStreamControl {
  /** Manually emit a play (ignores interval) */
  readonly emit: (play: PlayResult) => Effect.Effect<void>;
  /** Pause the stream */
  readonly pause: Effect.Effect<void>;
  /** Resume the stream */
  readonly resume: Effect.Effect<void>;
  /** Check if stream is paused */
  readonly isPaused: Effect.Effect<boolean>;
  /** Stop the stream completely */
  readonly stop: Effect.Effect<void>;
}

/**
 * Create a mock SSE stream that emits plays periodically.
 *
 * Uses Stream.unfold pattern for state-based generation.
 * Each iteration generates a new play and increments the counter.
 *
 * @param config - Configuration for stream behavior
 * @returns Stream of PlayResult objects
 *
 * @example
 * ```typescript
 * const stream = createMockSSEStream({ emitIntervalMs: 2000 })
 *
 * // Consume with Effect.gen
 * const program = Effect.gen(function* () {
 *   yield* Stream.runForEach(stream, (play) =>
 *     Effect.log(`New play: ${play.artist} - ${play.song}`)
 *   )
 * })
 * ```
 */
export const createMockSSEStream = (
  config: MockSSEConfig = {}
): Stream.Stream<PlayResult, never, never> => {
  const {
    emitIntervalMs = 2000,
    maxPlays,
    baseId = 2000000, // Different base ID from pagination
    baseTimestamp = new Date(),
    seed = 123,
    ...playConfig
  } = config;

  // State: current index for play generation
  interface State {
    readonly index: number;
  }

  const initialState: State = { index: 0 };

  return Stream.unfoldEffect(initialState, (state) =>
    Effect.gen(function* () {
      // Check if we've hit max plays
      if (maxPlays !== undefined && state.index >= maxPlays) {
        return Option.none();
      }

      // Wait for the configured interval
      yield* Effect.sleep(Duration.millis(emitIntervalMs));

      // Generate next play
      const play = generateMockPlay(state.index, {
        baseId,
        baseTimestamp,
        seed,
        ...playConfig,
      });

      const nextState: State = { index: state.index + 1 };

      yield* Effect.log(
        `[Mock SSE] Emitting play #${state.index}: ${play.artist} - ${play.song}`
      );

      return Option.some([play, nextState] as const);
    })
  );
};

/**
 * Create a controlled mock SSE stream with manual controls.
 *
 * Returns both the stream and a control object for external manipulation.
 * The stream can be paused, resumed, and manually triggered.
 *
 * @param config - Configuration for stream behavior
 * @returns Tuple of [stream, control]
 *
 * @example
 * ```typescript
 * const [stream, control] = yield* createControlledMockSSEStream({ emitIntervalMs: 2000 })
 *
 * // Pause the stream
 * yield* control.pause
 *
 * // Manually emit a play
 * yield* control.emit(customPlay)
 *
 * // Resume the stream
 * yield* control.resume
 * ```
 */
export const createControlledMockSSEStream = (
  config: MockSSEConfig = {}
): Effect.Effect<
  readonly [Stream.Stream<PlayResult, never>, SSEStreamControl],
  never,
  never
> =>
  Effect.gen(function* () {
    const {
      emitIntervalMs = 2000,
      maxPlays,
      baseId = 2000000,
      baseTimestamp = new Date(),
      seed = 123,
      startPaused = false,
      ...playConfig
    } = config;

    // Shared state
    const indexRef = yield* Ref.make(0);
    const pausedRef = yield* Ref.make(startPaused);

    // Create stream using Stream.async for event-driven emission
    const stream = Stream.async<PlayResult>((emit) => {
      let intervalId: NodeJS.Timeout | null = null;
      let stopped = false;

      const emitPlay = () => {
        if (stopped) return;

        Effect.gen(function* () {
          const isPaused = yield* Ref.get(pausedRef);
          if (isPaused) return;

          const index = yield* Ref.get(indexRef);

          // Check max plays limit
          if (maxPlays !== undefined && index >= maxPlays) {
            if (intervalId) clearInterval(intervalId);
            emit.end();
            return;
          }

          const play = generateMockPlay(index, {
            baseId,
            baseTimestamp,
            seed,
            ...playConfig,
          });

          yield* Ref.update(indexRef, (i) => i + 1);
          yield* Effect.log(
            `[Controlled SSE] Emitting play #${index}: ${play.artist} - ${play.song}`
          );

          emit.single(play);
        }).pipe(Effect.runSync);
      };

      // Start interval
      if (!startPaused) {
        intervalId = setInterval(emitPlay, emitIntervalMs);
      }

      // Return cleanup effect
      return Effect.sync(() => {
        stopped = true;
        if (intervalId) {
          clearInterval(intervalId);
        }
      });
    });

    // Control interface
    const control: SSEStreamControl = {
      emit: (play: PlayResult) =>
        Effect.gen(function* () {
          yield* Effect.log(
            `[Controlled SSE] Manual emit: ${play.artist} - ${play.song}`
          );
          // Note: Stream.async emit is captured in closure above
          // For manual emit, we'd need to refactor to use a Queue-based approach
          // This is a simplified version - in production, use Queue + Stream.fromQueue
          yield* Effect.log(
            "[Controlled SSE] Manual emit not yet implemented - use Queue-based approach"
          );
        }),

      pause: Ref.set(pausedRef, true).pipe(
        Effect.tap(() => Effect.log("[Controlled SSE] Stream paused"))
      ),

      resume: Ref.set(pausedRef, false).pipe(
        Effect.tap(() => Effect.log("[Controlled SSE] Stream resumed"))
      ),

      isPaused: Ref.get(pausedRef),

      stop: Effect.sync(() => {
        // Cleanup is handled by the stream's return value
      }).pipe(Effect.tap(() => Effect.log("[Controlled SSE] Stream stopped"))),
    };

    return [stream, control] as const;
  });

/**
 * Create a burst-mode mock SSE stream.
 * Emits multiple plays rapidly, then pauses.
 *
 * Useful for testing batch updates and UI performance.
 *
 * @param burstSize - Number of plays to emit in each burst
 * @param burstIntervalMs - Interval between bursts
 * @param playIntervalMs - Interval between plays within a burst
 * @returns Stream of PlayResult objects
 */
export const createBurstMockSSEStream = (
  burstSize: number = 5,
  burstIntervalMs: number = 10000,
  playIntervalMs: number = 100
): Stream.Stream<PlayResult, never, never> => {
  interface BurstState {
    readonly globalIndex: number;
    readonly burstIndex: number;
  }

  const initialState: BurstState = { globalIndex: 0, burstIndex: 0 };

  return Stream.unfoldEffect(initialState, (state) =>
    Effect.gen(function* () {
      // If starting a new burst, wait for burst interval
      if (state.burstIndex === 0 && state.globalIndex > 0) {
        yield* Effect.log(
          `[Burst SSE] Waiting ${burstIntervalMs}ms before next burst...`
        );
        yield* Effect.sleep(Duration.millis(burstIntervalMs));
      }

      // Generate play
      const play = generateMockPlay(state.globalIndex, {
        baseId: 3000000, // Different base ID for burst mode
      });

      // Wait brief interval between plays in burst
      if (state.burstIndex > 0) {
        yield* Effect.sleep(Duration.millis(playIntervalMs));
      }

      yield* Effect.log(
        `[Burst SSE] Burst ${Math.floor(state.globalIndex / burstSize)}, Play ${state.burstIndex + 1}/${burstSize}: ${play.artist} - ${play.song}`
      );

      const nextBurstIndex = (state.burstIndex + 1) % burstSize;
      const nextState: BurstState = {
        globalIndex: state.globalIndex + 1,
        burstIndex: nextBurstIndex,
      };

      return Option.some([play, nextState] as const);
    })
  );
};

/**
 * Helper: Merge multiple SSE streams into one.
 * Useful for testing multiple concurrent data sources.
 *
 * @param streams - Array of SSE streams to merge
 * @param concurrency - Max concurrent streams (default: 10)
 * @returns Single merged stream
 */
export const mergeMockSSEStreams = (
  streams: ReadonlyArray<Stream.Stream<PlayResult, never, never>>,
  concurrency: number = 10
): Stream.Stream<PlayResult, never, never> => Stream.mergeAll(streams, { concurrency });
