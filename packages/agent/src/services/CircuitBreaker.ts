/**
 * CircuitBreaker
 *
 * Implements the circuit breaker pattern to prevent cascading failures.
 * Wraps Effect operations to track failures and prevent calls when open.
 *
 * States:
 * - Closed: Normal operation, requests pass through
 * - Open: Requests fail immediately without calling the service
 * - HalfOpen: One request allowed to test if service recovered
 *
 * @module
 */

import { Effect, Ref, Data, Duration, Clock } from "effect";

// =============================================================================
// Types
// =============================================================================

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  readonly failureThreshold: number;
  /** Number of successes in half-open before closing */
  readonly successThreshold: number;
  /** Duration to wait before transitioning from open to half-open */
  readonly resetTimeout: Duration.Duration;
  /** Name for logging/metrics */
  readonly name: string;
}

export interface CircuitBreakerState {
  readonly state: CircuitState;
  readonly failureCount: number;
  readonly successCount: number;
  readonly lastFailureTime: number;
}

// =============================================================================
// Errors
// =============================================================================

export class CircuitOpenError extends Data.TaggedError("CircuitOpenError")<{
  readonly name: string;
  readonly message: string;
}> {}

// =============================================================================
// Default Config
// =============================================================================

export const defaultConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: Duration.seconds(60),
  name: "default",
};

// =============================================================================
// Circuit Breaker Implementation
// =============================================================================

/**
 * Create a circuit breaker for protecting external service calls
 */
export const make = (config: Partial<CircuitBreakerConfig> = {}) =>
  Effect.gen(function* () {
    const fullConfig: CircuitBreakerConfig = { ...defaultConfig, ...config };

    const stateRef = yield* Ref.make<CircuitBreakerState>({
      state: "closed",
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
    });

    /**
     * Check if circuit should transition from open to half-open
     */
    const maybeTransitionToHalfOpen = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const current = yield* Ref.get(stateRef);

      if (current.state === "open") {
        const elapsed = now - current.lastFailureTime;
        const timeout = Duration.toMillis(fullConfig.resetTimeout);

        if (elapsed >= timeout) {
          yield* Ref.set(stateRef, {
            state: "half-open" as const,
            failureCount: current.failureCount,
            successCount: 0,
            lastFailureTime: current.lastFailureTime,
          });
          yield* Effect.log(
            `CircuitBreaker[${fullConfig.name}]: Transitioning to half-open`
          );
        }
      }
    });

    /**
     * Record a success and potentially close the circuit
     */
    const recordSuccess = Effect.gen(function* () {
      const current = yield* Ref.get(stateRef);

      if (current.state === "half-open") {
        const newSuccessCount = current.successCount + 1;

        if (newSuccessCount >= fullConfig.successThreshold) {
          yield* Ref.set(stateRef, {
            state: "closed" as const,
            failureCount: 0,
            successCount: 0,
            lastFailureTime: 0,
          });
          yield* Effect.log(
            `CircuitBreaker[${fullConfig.name}]: Closed (service recovered)`
          );
        } else {
          yield* Ref.set(stateRef, {
            state: "half-open" as const,
            failureCount: current.failureCount,
            successCount: newSuccessCount,
            lastFailureTime: current.lastFailureTime,
          });
        }
      } else if (current.state === "closed" && current.failureCount > 0) {
        // Reset failure count on success in closed state
        yield* Ref.set(stateRef, {
          state: "closed" as const,
          failureCount: 0,
          successCount: current.successCount,
          lastFailureTime: current.lastFailureTime,
        });
      }
    });

    /**
     * Record a failure and potentially open the circuit
     */
    const recordFailure = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const current = yield* Ref.get(stateRef);

      if (current.state === "half-open") {
        // Single failure in half-open reopens the circuit
        yield* Ref.set(stateRef, {
          state: "open" as const,
          failureCount: fullConfig.failureThreshold,
          successCount: 0,
          lastFailureTime: now,
        });
        yield* Effect.log(
          `CircuitBreaker[${fullConfig.name}]: Re-opened (half-open test failed)`
        );
      } else if (current.state === "closed") {
        const newFailureCount = current.failureCount + 1;

        if (newFailureCount >= fullConfig.failureThreshold) {
          yield* Ref.set(stateRef, {
            state: "open" as const,
            failureCount: newFailureCount,
            successCount: 0,
            lastFailureTime: now,
          });
          yield* Effect.log(
            `CircuitBreaker[${fullConfig.name}]: Opened after ${newFailureCount} failures`
          );
        } else {
          yield* Ref.set(stateRef, {
            state: "closed" as const,
            failureCount: newFailureCount,
            successCount: current.successCount,
            lastFailureTime: now,
          });
          yield* Effect.log(
            `CircuitBreaker[${fullConfig.name}]: Failure ${newFailureCount}/${fullConfig.failureThreshold}`
          );
        }
      }
    });

    /**
     * Wrap an effect with circuit breaker protection
     */
    const protect = <A, E, R>(
      effect: Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | CircuitOpenError, R> =>
      Effect.gen(function* () {
        // Check for state transition
        yield* maybeTransitionToHalfOpen;

        const current = yield* Ref.get(stateRef);

        if (current.state === "open") {
          return yield* Effect.fail(
            new CircuitOpenError({
              name: fullConfig.name,
              message: `Circuit breaker is open for ${fullConfig.name}`,
            })
          );
        }

        // Execute the effect
        const result = yield* effect.pipe(
          Effect.tap(() => recordSuccess),
          Effect.tapError(() => recordFailure)
        );

        return result;
      });

    /**
     * Get current circuit state (for monitoring)
     */
    const getState = Ref.get(stateRef);

    return {
      protect,
      getState,
      config: fullConfig,
    };
  });

export type CircuitBreaker = Effect.Effect.Success<ReturnType<typeof make>>;
