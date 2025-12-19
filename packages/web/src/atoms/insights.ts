/**
 * Insights Atoms
 *
 * Effect Atom-based state management for play insights (living liner notes).
 * Uses TimelineRuntime.atom pattern with Atom.withReactivity for cache coordination.
 *
 * Pattern matches streaming-links.ts:
 * - Atom.family for parameterized atoms
 * - TimelineRuntime.atom for Effect integration
 * - Atom.withReactivity for cache invalidation
 */

import { Atom, Result } from "@effect-atom/atom-react";
import { Insights } from "@crate/domain";
import { PlayInsightsResponse } from "@crate/domain/faiss/enrichment";
import { Effect, Schema, Array as A, Option, pipe, Duration } from "effect";
import { HttpClient } from "@effect/platform";
import { TimelineRuntime } from "@/lib/http-runtime";

// ============================================================================
// Constants
// ============================================================================

const INSIGHT_CACHE_KEY_PREFIX = "timeline:insights:";
const INSIGHT_CACHE_TTL = Duration.hours(24);

// API base URL for insights endpoint (FAISS API)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

// ============================================================================
// Cache Types
// ============================================================================

const InsightCacheEntry = Schema.Struct({
  data: Schema.Array(Insights.Insight),
  timestamp: Schema.Number,
  playId: Schema.Number,
});

type InsightCacheEntry = Schema.Schema.Type<typeof InsightCacheEntry>;

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Get cached insights from localStorage.
 * Returns Option.none() if cache miss or expired.
 */
const getCachedInsights = (
  playId: number
): Effect.Effect<Option.Option<readonly Insights.Insight[]>> =>
  Effect.try(() => {
    const cached = localStorage.getItem(`${INSIGHT_CACHE_KEY_PREFIX}${playId}`);
    if (!cached) return Option.none<readonly Insights.Insight[]>();

    const parsed = JSON.parse(cached);
    const decoded = Schema.decodeUnknownSync(InsightCacheEntry)(parsed);

    // Check TTL
    const age = Date.now() - decoded.timestamp;
    const ttlMs = Duration.toMillis(INSIGHT_CACHE_TTL);

    if (age > ttlMs) {
      return Option.none<readonly Insights.Insight[]>();
    }

    return Option.some(decoded.data);
  }).pipe(
    Effect.catchAll(() =>
      Effect.succeed(Option.none<readonly Insights.Insight[]>())
    )
  );

/**
 * Store insights in localStorage cache.
 */
const cacheInsights = (
  playId: number,
  insights: readonly Insights.Insight[]
): Effect.Effect<void> =>
  Effect.try(() => {
    const cacheEntry: InsightCacheEntry = {
      data: [...insights],
      timestamp: Date.now(),
      playId,
    };
    localStorage.setItem(
      `${INSIGHT_CACHE_KEY_PREFIX}${playId}`,
      JSON.stringify(cacheEntry)
    );
  }).pipe(Effect.ignore);

// ============================================================================
// Insight Decoding
// ============================================================================

/**
 * Decode raw insight data from InsightRecord.data field.
 *
 * The API returns insights with `tag` property, but our schema uses `_tag`
 * for the Effect discriminated union pattern. This function transforms
 * the data before decoding.
 */
const decodeInsightData = (data: unknown): Insights.Insight | null => {
  // Transform `tag` to `_tag` for Effect schema compatibility
  if (data && typeof data === "object" && "tag" in data) {
    const transformed = {
      ...data,
      _tag: (data as { tag: string }).tag,
    };
    const result = Schema.decodeUnknownEither(Insights.Insight)(transformed);
    return result._tag === "Right" ? result.right : null;
  }

  // Try direct decode if already has _tag
  const result = Schema.decodeUnknownEither(Insights.Insight)(data);
  return result._tag === "Right" ? result.right : null;
};

// ============================================================================
// Insights Atom Family
// ============================================================================

/**
 * Reactive atom for insights for a specific play.
 *
 * Pattern matches streamingLinksForPlayAtom:
 * - Uses TimelineRuntime.atom for Effect integration
 * - Uses Atom.family for parameterization
 * - Uses Atom.withReactivity for cache invalidation
 * - Returns Insight[] (empty array on error/miss)
 *
 * Caching Strategy:
 * - Checks localStorage cache first
 * - Falls back to API fetch on cache miss or expiry
 * - Stores result in cache with 24h TTL
 * - Uses Atom.withReactivity for reactive updates
 */
export const insightsAtom = Atom.family((playId: number) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      // Try cache first
      const cachedResult = yield* getCachedInsights(playId);

      if (Option.isSome(cachedResult)) {
        yield* Effect.log(`Insights cache hit for play ${playId}`);
        return cachedResult.value;
      }

      yield* Effect.log(
        `Insights cache miss for play ${playId}, fetching from API`
      );

      // Fetch from API using HttpClient directly
      const client = yield* HttpClient.HttpClient;

      const response = yield* client
        .get(`${API_BASE_URL}/api/insights/plays/${playId}`)
        .pipe(
          Effect.flatMap((res) => {
            // Handle non-2xx responses gracefully without trying to parse JSON
            if (res.status >= 400) {
              return Effect.succeed({
                play_id: playId,
                insights: [],
                total: 0,
              } as PlayInsightsResponse);
            }
            return res.json.pipe(
              Effect.flatMap((json) =>
                Schema.decodeUnknown(PlayInsightsResponse)(json)
              )
            );
          }),
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(
                `Failed to fetch insights for play ${playId}: ${error}`
              );
              // Return empty response on error
              return {
                play_id: playId,
                insights: [],
                total: 0,
              } as PlayInsightsResponse;
            })
          )
        );

      // Decode insight data from response
      const insights = pipe(
        response.insights,
        A.map((record) => decodeInsightData(record.data)),
        A.filter((insight): insight is Insights.Insight => insight !== null)
      );

      // Store in cache (fire and forget)
      yield* cacheInsights(playId, insights);

      yield* Effect.log(
        `Fetched and cached ${insights.length} insights for play ${playId}`
      );

      return insights as readonly Insights.Insight[];
    })
  ).pipe(Atom.withReactivity([`timeline:insights:${playId}`]))
);

// ============================================================================
// Derived Atoms
// ============================================================================

/**
 * Derived: Notch state for the "Spectrum Notch" UI component.
 * Shows the loading/ready/empty state of insights.
 */
export type NotchState = "idle" | "digging" | "ready" | "empty" | "error";

export const notchStateAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const result = get(insightsAtom(playId));
    return Result.matchWithWaiting(result, {
      onWaiting: () => "digging" as NotchState,
      onSuccess: (success) =>
        (success.value.length > 0 ? "ready" : "empty") as NotchState,
      onError: () => "error" as NotchState,
      onDefect: () => "error" as NotchState,
    });
  })
);

/**
 * Check if insights exist for a play (without loading them).
 */
export const hasInsightsAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const result = get(insightsAtom(playId));
    return Result.matchWithWaiting(result, {
      onWaiting: () => false,
      onSuccess: (s) => s.value.length > 0,
      onError: () => false,
      onDefect: () => false,
    });
  })
);

/**
 * Get the count of insights for a play.
 */
export const insightCountAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const result = get(insightsAtom(playId));
    return Result.matchWithWaiting(result, {
      onWaiting: () => 0,
      onSuccess: (s) => s.value.length,
      onError: () => 0,
      onDefect: () => 0,
    });
  })
);

// ============================================================================
// Action Atoms
// ============================================================================

/**
 * Prefetch insights for multiple plays (e.g., visible viewport).
 * Uses Effect.all with bounded concurrency.
 */
export const prefetchInsightsAtom = TimelineRuntime.fn<readonly number[]>()(
  (playIds, get) =>
    Effect.gen(function* () {
      yield* Effect.log(`Prefetching insights for ${playIds.length} plays`);

      // Fetch up to 5 concurrently to avoid overwhelming the API
      yield* Effect.all(
        playIds.map((playId) => {
          // Just reading the atom will trigger the fetch
          return Effect.sync(() => get(insightsAtom(playId)));
        }),
        { concurrency: 5 }
      );

      yield* Effect.log(`Prefetch complete for ${playIds.length} plays`);
    })
);

/**
 * Invalidate cached insights for a play.
 * Removes from localStorage and triggers reactive refetch.
 */
export const invalidateInsightsAtom = TimelineRuntime.fn<number>()(
  (playId, _get) =>
    Effect.gen(function* () {
      // Remove from localStorage
      yield* Effect.try(() => {
        localStorage.removeItem(`${INSIGHT_CACHE_KEY_PREFIX}${playId}`);
      }).pipe(Effect.ignore);

      yield* Effect.log(`Invalidated insights cache for play ${playId}`);
    })
);
