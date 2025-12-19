# Phase 1 Effect Alignment Audit

**Date:** December 16, 2025
**Auditor:** Claude (Effect Architect)
**Scope:** Phase 1 implementation plan from `docs/reviews/timeline-synthesis.md`

---

## Executive Summary

The Phase 1 plan proposes critical fixes for image reliability and WCAG compliance. However, **several frontend implementations deviate significantly from established Effect and Effect Atom patterns** used throughout the codebase. This audit identifies these deviations and provides corrected implementations.

### Overall Alignment Assessment

| Component | Plan Alignment | Issue Severity |
|-----------|---------------|----------------|
| Image Retry Logic (Layer 5) | **Poor** | High - Uses React useState instead of Effect patterns |
| Insight Caching (Phase 2 prep) | **Good** | Low - Minor pattern adjustments needed |
| Keyboard Navigation Hook | **Acceptable** | Medium - Could benefit from Effect integration |
| Focus Management | **Acceptable** | Low - React refs appropriate here |
| ARIA Live Regions | **Good** | None - React approach is correct |

**Key Finding:** The image retry logic in the Phase 1 plan uses naive `useState` + `setTimeout` patterns when the codebase already demonstrates `Effect.retry` with `Schedule.exponential` for exactly this use case.

---

## Pattern Violations

### Violation 1: Image Retry Logic Uses React useState Instead of Effect

**Location in Plan:** Section "Layer 5: Frontend Retry Logic"

**Proposed Code (INCORRECT):**
```typescript
// packages/web/src/components/AlbumArt.tsx
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

const handleError = useCallback(() => {
  if (retryCount < MAX_RETRIES) {
    const delay = RETRY_DELAYS[retryCount];
    retryTimeoutRef.current = window.setTimeout(() => {
      setError(false);
      setRetryCount(prev => prev + 1);
    }, delay);
  } else {
    setError(true);
  }
}, [retryCount]);
```

**Why This Violates Codebase Patterns:**

1. **Codebase uses `Effect.retry` with `Schedule`** - See `packages/web/src/services/kexp-api-service.ts`:
   ```typescript
   const retryPolicy = Schedule.exponential("100 millis").pipe(
     Schedule.intersect(Schedule.recurs(3))
   );
   ```

2. **Codebase uses `Result.Result` for loading states** - See `packages/web/src/atoms/insights.ts`:
   ```typescript
   export const insightsAtom = Atom.family((_playId: number) =>
     Atom.make<Result.Result<Insights.Insight[]>>(Result.initial())
   );
   ```

3. **Codebase uses `Atom.family` for parameterized state** - Not component-local `useState`

4. **Manual timeout management is error-prone** - Requires cleanup in useEffect, race condition handling

**Severity:** HIGH - This is the most significant deviation from established patterns.

---

### Violation 2: Insight Caching Proposal Doesn't Use Existing Service Pattern

**Location in Plan:** Section "High Priority #1: Insight Caching & Optimization"

**Proposed Code (PARTIALLY CORRECT but incomplete):**
```typescript
const storeInsights = (playId: number, insights: Insight[]) =>
  Effect.gen(function* () {
    yield* insightStore.set(`timeline:insights:${playId}`, { data, timestamp });
    yield* Reactivity.invalidate([`timeline:insights:${playId}`]);
  });
```

**Issues:**

1. **Missing `Atom.withReactivity` pattern** - The codebase pairs `Reactivity.invalidate` with `Atom.withReactivity`:
   ```typescript
   // From timeline.ts
   export const playAtom = Atom.family((id: number) =>
     TimelineRuntime.atom(...)
   ).pipe(Atom.withReactivity([`timeline:play:${id}`]))
   ```

2. **Doesn't follow `TimelineRuntime.atom` pattern** - Insights should use `TimelineRuntime.atom` like streaming links:
   ```typescript
   // From streaming-links.ts
   export const streamingLinksForPlayAtom = Atom.family((playId: number) =>
     TimelineRuntime.atom(Effect.gen(function* () { ... }))
   ).pipe(Atom.withReactivity([`timeline:play:${playId}`]))
   ```

**Severity:** MEDIUM - The direction is correct but needs pattern alignment.

---

### Violation 3: Current insights.ts Doesn't Use TimelineRuntime

**Location:** `packages/web/src/atoms/insights.ts` (existing code, not plan)

**Current Code (INCORRECT for this codebase):**
```typescript
export const fetchInsightsAction = (playId: number) =>
  Effect.gen(function* (_) {
    const client = yield* _(HttpClient.HttpClient);
    const atom = insightsAtom(playId);
    // ... manual atom manipulation
  });
```

**Issues:**

1. **Uses raw `HttpClient.HttpClient`** instead of `InsightsClient` service
2. **Uses `Atom.get`/`Atom.set` manually** instead of `TimelineRuntime.atom` pattern
3. **Doesn't integrate with `Reactivity`** layer

**Severity:** MEDIUM - Existing code should be refactored alongside Phase 1.

---

### Violation 4: Keyboard Navigation as Plain React Hook

**Location in Plan:** Section "A. Keyboard Navigation"

**Proposed Code:**
```typescript
export function useTimelineKeyboardNav({
  containerRef,
  enabled = true
}: UseTimelineKeyboardNavOptions) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => { ... }, []);
}
```

**Analysis:**

This is actually **acceptable** for keyboard navigation because:
- It's purely UI/DOM manipulation, not data fetching
- No async operations or error handling needed
- No caching requirements
- Effect overhead not justified

However, the hook could benefit from:
- Integration with an Effect-based focus state atom for coordination with other components
- Using `Atom.make` for focus position tracking (enables persistence, debugging)

**Severity:** LOW - Acceptable with minor enhancement opportunities.

---

## Recommended Corrections

### Correction 1: Image Load State Service

Create a dedicated service for image loading state management using Effect patterns.

**File:** `packages/web/src/services/image-load-service.ts`

```typescript
import { Context, Data, Effect, Schedule, Duration, Option } from "effect";
import { Atom, Result } from "@effect-atom/atom-react";
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
    attempts
  }),
} as const;

// ============================================================================
// Image Load Service
// ============================================================================

export class ImageLoadService extends Effect.Service<ImageLoadService>()(
  "ImageLoadService",
  {
    effect: Effect.gen(function* () {
      const reactivity = yield* Reactivity.Reactivity;

      // Retry schedule: 1s, 2s, 4s (exponential backoff, 3 retries)
      const retrySchedule = Schedule.exponential(Duration.seconds(1)).pipe(
        Schedule.intersect(Schedule.recurs(3)),
        // Add jitter to prevent thundering herd
        Schedule.jittered
      );

      /**
       * Load an image with retry logic.
       * Uses native Image() constructor to preload and validate.
       */
      const loadImage = (src: string): Effect.Effect<string, ImageLoadExhausted> =>
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
              resume(Effect.fail(new ImageLoadError({
                src,
                attempt: currentAttempt,
                cause: event,
              })));
            };

            // Add cache-busting query param on retries
            const urlWithCacheBust = currentAttempt > 1
              ? `${src}${src.includes('?') ? '&' : '?'}_retry=${currentAttempt}&_t=${Date.now()}`
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
            Effect.retry(retrySchedule),
            Effect.mapError(() => new ImageLoadExhausted({
              src,
              totalAttempts: currentAttempt,
            }))
          );

          return result;
        });

      /**
       * Invalidate image state for reactive updates
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
```

---

### Correction 2: Image State Atom with Effect Retry

**File:** `packages/web/src/atoms/image-state.ts`

```typescript
import { Atom, Result } from "@effect-atom/atom-react";
import { Effect, Option, Duration, Schedule } from "effect";
import { TimelineRuntime } from "@/lib/http-runtime";
import { ImageLoadState, ImageLoadExhausted } from "@/services/image-load-service";

// ============================================================================
// Image State Atom Family
// ============================================================================

/**
 * State atom for image loading status.
 * Uses Result.Result pattern consistent with the codebase.
 */
export const imageStateAtom = Atom.family((src: string | null) => {
  // Handle null src immediately
  if (src === null) {
    return Atom.make<Result.Result<ImageLoadState>>(
      Result.success(ImageLoadState.initial())
    );
  }

  return Atom.make<Result.Result<ImageLoadState>>(Result.initial());
});

/**
 * Load image action atom.
 * Integrates with Effect retry and schedule patterns.
 */
export const loadImageAtom = Atom.family((src: string) =>
  TimelineRuntime.fn<void>()((_input, get) =>
    Effect.gen(function* () {
      const stateAtom = imageStateAtom(src);

      // Check if already loaded
      const current = get(stateAtom);
      if (Result.isSuccess(current) && current.value._tag === "Loaded") {
        yield* Effect.log(`Image already loaded: ${src}`);
        return;
      }

      // Set loading state with attempt tracking
      get.set(stateAtom, Result.waiting(current));

      // Retry schedule: 1s, 2s, 4s with jitter
      const retrySchedule = Schedule.exponential(Duration.seconds(1)).pipe(
        Schedule.intersect(Schedule.recurs(3)),
        Schedule.jittered
      );

      let attempt = 0;

      const loadOnce = Effect.async<string, Error>((resume) => {
        attempt++;
        const img = new Image();

        img.onload = () => resume(Effect.succeed(src));
        img.onerror = (e) => resume(Effect.fail(new Error(`Load failed: ${e}`)));

        // Cache-bust on retries
        const finalSrc = attempt > 1
          ? `${src}${src.includes('?') ? '&' : '?'}_retry=${attempt}&_t=${Date.now()}`
          : src;

        img.src = finalSrc;

        return Effect.sync(() => {
          img.onload = null;
          img.onerror = null;
        });
      });

      const result = yield* loadOnce.pipe(
        Effect.tap(() => Effect.log(`Image load attempt ${attempt} for: ${src}`)),
        Effect.retry(retrySchedule),
        Effect.either
      );

      if (result._tag === "Right") {
        get.set(stateAtom, Result.success(ImageLoadState.loaded(src)));
        yield* Effect.log(`Image loaded successfully after ${attempt} attempts: ${src}`);
      } else {
        get.set(stateAtom, Result.success(ImageLoadState.failed(src, attempt)));
        yield* Effect.logWarning(`Image failed to load after ${attempt} attempts: ${src}`);
      }
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
 * Whether an image has failed to load.
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
 * Get the current retry attempt for an image.
 */
export const imageRetryAttemptAtom = Atom.family((src: string | null) =>
  Atom.make((get) => {
    if (!src) return 0;
    const state = get(imageStateAtom(src));
    return Result.matchWithWaiting(state, {
      onWaiting: () => 1,
      onSuccess: (s) => {
        switch (s.value._tag) {
          case "Loading": return s.value.attempt;
          case "Failed": return s.value.attempts;
          default: return 0;
        }
      },
      onError: () => 0,
      onDefect: () => 0,
    });
  })
);
```

---

### Correction 3: Updated AlbumArt Component

**File:** `packages/web/src/components/AlbumArt.tsx` (updated)

```typescript
import { cn } from '@/lib/utils';
import { useMemo, useEffect } from 'react';
import { useAtomValue, useAtom } from '@effect-atom/atom-react';
import {
  imageStateAtom,
  loadImageAtom,
  isImageLoadingAtom,
  isImageFailedAtom
} from '@/atoms/image-state';
import { Result } from '@effect-atom/atom-react';

interface AlbumArtProps {
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
  isNewMusic?: boolean;
}

// API base URL for image proxy
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

// Domains that require CORS proxy
const CORS_BLOCKED_DOMAINS = ['archive.org', 'kexp.org', 'coverartarchive.org'];

function needsProxy(url: string): boolean {
  return CORS_BLOCKED_DOMAINS.some(domain => url.includes(domain));
}

function getProxiedUrl(url: string): string {
  return `${API_BASE_URL}/api/image-proxy?url=${encodeURIComponent(url)}`;
}

// Generate organic gradient based on alt text hash
function generateOrganicGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }

  const palettes = [
    ['hsl(240, 15%, 28%)', 'hsl(240, 15%, 32%)'],
    ['hsl(280, 15%, 28%)', 'hsl(280, 15%, 32%)'],
    ['hsl(160, 15%, 28%)', 'hsl(160, 15%, 32%)'],
    ['hsl(200, 15%, 28%)', 'hsl(200, 15%, 32%)'],
    ['hsl(320, 15%, 28%)', 'hsl(320, 15%, 32%)'],
    ['hsl(40, 15%, 28%)', 'hsl(40, 15%, 32%)'],
  ];

  const paletteIndex = Math.abs(hash) % palettes.length;
  const palette = palettes[paletteIndex];
  const angle = 135 + (Math.abs(hash >> 8) % 90);

  return `linear-gradient(${angle}deg, ${palette[0]}, ${palette[1]})`;
}

export function AlbumArt({ src, alt, size = 120, className, isNewMusic = false }: AlbumArtProps) {
  // Compute proxied URL
  const imageSrc = useMemo(() => {
    if (!src) return null;
    return needsProxy(src) ? getProxiedUrl(src) : src;
  }, [src]);

  // Use Effect Atom for image state management
  const imageState = useAtomValue(imageStateAtom(imageSrc));
  const isLoading = useAtomValue(isImageLoadingAtom(imageSrc));
  const isFailed = useAtomValue(isImageFailedAtom(imageSrc));
  const [, loadImage] = useAtom(loadImageAtom(imageSrc ?? ""));

  // Trigger image load on mount or when src changes
  useEffect(() => {
    if (imageSrc) {
      loadImage();
    }
  }, [imageSrc, loadImage]);

  // Generate consistent gradient for placeholder
  const gradient = useMemo(() => generateOrganicGradient(alt), [alt]);

  // Determine if image is loaded successfully
  const isLoaded = Result.matchWithWaiting(imageState, {
    onWaiting: () => false,
    onSuccess: (s) => s.value._tag === "Loaded",
    onError: () => false,
    onDefect: () => false,
  });

  // Determine if we should show the image element
  const showImage = imageSrc && !isFailed;

  return (
    <div
      className={cn("album-art relative rounded overflow-hidden shrink-0", className)}
      data-new-music={isNewMusic ? "new" : undefined}
      data-loading={isLoading ? "true" : undefined}
      data-failed={isFailed ? "true" : undefined}
      style={{
        width: size,
        height: size,
        background: gradient
      }}
    >
      {/* Image */}
      {showImage && (
        <img
          src={imageSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(
            "w-full h-full object-cover transition-opacity duration-200 relative z-10",
            isLoaded ? "opacity-100" : "opacity-0"
          )}
        />
      )}

      {/* Loading indicator (optional) */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
```

---

### Correction 4: Refactored Insights Atom

**File:** `packages/web/src/atoms/insights.ts` (refactored)

```typescript
import { Atom, Result } from "@effect-atom/atom-react";
import { Insights } from "@crate/domain";
import { PlayInsightsResponse } from "@crate/domain/faiss/enrichment";
import { Effect, Schema, Array as A, Option, pipe, Duration } from "effect";
import {
  InsightsClient,
  TimelineKVS,
  TimelineRuntime
} from "@/lib/http-runtime";
import { Reactivity } from "@effect/experimental";

// ============================================================================
// Insight Cache Schema
// ============================================================================

const InsightCacheEntry = Schema.Struct({
  data: Schema.Array(Insights.Insight),
  timestamp: Schema.Number,
  playId: Schema.Number,
});

type InsightCacheEntry = Schema.Schema.Type<typeof InsightCacheEntry>;

const INSIGHT_CACHE_TTL = Duration.hours(24);

// ============================================================================
// Insights Atom Family - Follows streamingLinksForPlayAtom Pattern
// ============================================================================

/**
 * Reactive atom for insights for a specific play.
 *
 * Pattern matches streamingLinksForPlayAtom:
 * - Uses TimelineRuntime.atom for Effect integration
 * - Uses Atom.family for parameterization
 * - Uses Atom.withReactivity for cache invalidation
 * - Returns Option<Insight[]> wrapped in Result
 *
 * Caching Strategy:
 * - Checks localStorage cache first (via TimelineKVS pattern)
 * - Falls back to API fetch on cache miss or expiry
 * - Stores result in cache with TTL
 * - Uses Reactivity.invalidate for reactive updates
 */
export const insightsAtom = Atom.family((playId: number) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const client = yield* InsightsClient;
      const reactivity = yield* Reactivity.Reactivity;

      // Try to get from browser storage (localStorage)
      const cachedResult = yield* Effect.try(() => {
        const cached = localStorage.getItem(`timeline:insights:${playId}`);
        if (!cached) return Option.none<InsightCacheEntry>();

        const parsed = JSON.parse(cached);
        const decoded = Schema.decodeUnknownSync(InsightCacheEntry)(parsed);

        // Check TTL
        const age = Date.now() - decoded.timestamp;
        const ttlMs = Duration.toMillis(INSIGHT_CACHE_TTL);

        if (age > ttlMs) {
          yield* Effect.log(`Insights cache expired for play ${playId}`);
          return Option.none<InsightCacheEntry>();
        }

        return Option.some(decoded);
      }).pipe(
        Effect.catchAll(() => Effect.succeed(Option.none<InsightCacheEntry>()))
      );

      // Return cached data if available
      if (Option.isSome(cachedResult)) {
        yield* Effect.log(`Insights cache hit for play ${playId}`);
        return cachedResult.value.data;
      }

      yield* Effect.log(`Insights cache miss for play ${playId}, fetching from API`);

      // Fetch from API
      const response = yield* client.insights.getPlayInsights({
        urlParams: { play_id: playId }
      }).pipe(
        Effect.catchAll((error) => {
          Effect.logWarning(`Failed to fetch insights for play ${playId}: ${error}`);
          return Effect.succeed({ insights: [] });
        })
      );

      // Decode insight data from response
      const insights = pipe(
        response.insights,
        A.map((record) => {
          const result = Schema.decodeUnknownEither(Insights.Insight)(record.data);
          return result._tag === "Right" ? result.right : null;
        }),
        A.filter((insight): insight is Insights.Insight => insight !== null)
      );

      // Store in cache
      yield* Effect.try(() => {
        const cacheEntry: InsightCacheEntry = {
          data: insights,
          timestamp: Date.now(),
          playId,
        };
        localStorage.setItem(
          `timeline:insights:${playId}`,
          JSON.stringify(cacheEntry)
        );
      }).pipe(
        Effect.catchAll((error) => {
          Effect.logWarning(`Failed to cache insights for play ${playId}: ${error}`);
          return Effect.succeed(undefined);
        })
      );

      // Invalidate reactivity for any listeners
      yield* reactivity.invalidate([`timeline:insights:${playId}`]);

      return insights;
    })
  ).pipe(Atom.withReactivity([`timeline:insights:${playId}`]))
);

// ============================================================================
// Derived Atoms
// ============================================================================

/**
 * Derived: Notch state for the "Spectrum Notch" UI component.
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
          const atom = insightsAtom(playId);
          return Effect.sync(() => get(atom));
        }),
        { concurrency: 5 }
      );

      yield* Effect.log(`Prefetch complete for ${playIds.length} plays`);
    })
);

/**
 * Invalidate cached insights for a play.
 * Useful when insights need to be refetched (e.g., after enrichment).
 */
export const invalidateInsightsAtom = TimelineRuntime.fn<number>()(
  (playId, _get) =>
    Effect.gen(function* () {
      const reactivity = yield* Reactivity.Reactivity;

      // Remove from localStorage
      yield* Effect.try(() => {
        localStorage.removeItem(`timeline:insights:${playId}`);
      }).pipe(Effect.ignore);

      // Invalidate reactivity to trigger refetch
      yield* reactivity.invalidate([`timeline:insights:${playId}`]);

      yield* Effect.log(`Invalidated insights cache for play ${playId}`);
    })
);
```

---

### Correction 5: Keyboard Navigation with Focus Atom

While a React hook is acceptable, here's an enhanced version that integrates with Effect Atom for focus state persistence:

**File:** `packages/web/src/atoms/timeline-focus.ts`

```typescript
import { Atom } from "@effect-atom/atom-react";
import { Option } from "effect";

// ============================================================================
// Focus State Atoms
// ============================================================================

/**
 * Currently focused play ID in the timeline.
 * Used for keyboard navigation coordination.
 */
export const focusedPlayIdAtom = Atom.make<Option.Option<number>>(Option.none());

/**
 * Focus position for restoration after panel close.
 * Stored separately to handle the "return focus" pattern.
 */
export const savedFocusPositionAtom = Atom.make<Option.Option<{
  readonly playId: number;
  readonly scrollPosition: number;
}>>(Option.none());

// ============================================================================
// Focus Actions
// ============================================================================

/**
 * Set focused play ID
 */
export const setFocusedPlayId = (playId: number | null) =>
  playId !== null ? Option.some(playId) : Option.none();

/**
 * Save current focus for later restoration
 */
export const saveFocusPosition = (playId: number, scrollPosition: number) =>
  Option.some({ playId, scrollPosition });

/**
 * Clear saved focus position
 */
export const clearSavedFocus = () => Option.none();
```

**File:** `packages/web/src/hooks/useTimelineKeyboardNav.ts`

```typescript
import { useCallback, useEffect } from 'react';
import { useAtom, useAtomValue } from '@effect-atom/atom-react';
import { Option } from 'effect';
import {
  focusedPlayIdAtom,
  savedFocusPositionAtom,
  setFocusedPlayId,
  saveFocusPosition,
  clearSavedFocus,
} from '@/atoms/timeline-focus';
import { allLoadedPlayIdsAtom } from '@/atoms/timeline-infinite';

interface UseTimelineKeyboardNavOptions {
  containerRef: React.RefObject<HTMLElement>;
  enabled?: boolean;
  onSelect?: (playId: number) => void;
}

export function useTimelineKeyboardNav({
  containerRef,
  enabled = true,
  onSelect,
}: UseTimelineKeyboardNavOptions) {
  const playIds = useAtomValue(allLoadedPlayIdsAtom);
  const [focusedPlayId, setFocused] = useAtom(focusedPlayIdAtom);
  const [savedFocus, setSavedFocus] = useAtom(savedFocusPositionAtom);

  // Get current focus index
  const currentIndex = Option.match(focusedPlayId, {
    onNone: () => -1,
    onSome: (id) => playIds.indexOf(id),
  });

  // Focus a card element by play ID
  const focusCard = useCallback((playId: number) => {
    const container = containerRef.current;
    if (!container) return;

    const card = container.querySelector(`[data-play-id="${playId}"]`) as HTMLElement;
    if (card) {
      card.focus();
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setFocused(setFocusedPlayId(playId));
    }
  }, [containerRef, setFocused]);

  // Navigation handlers
  const navigateNext = useCallback(() => {
    if (currentIndex < playIds.length - 1) {
      focusCard(playIds[currentIndex + 1]);
    }
  }, [currentIndex, playIds, focusCard]);

  const navigatePrev = useCallback(() => {
    if (currentIndex > 0) {
      focusCard(playIds[currentIndex - 1]);
    }
  }, [currentIndex, playIds, focusCard]);

  const navigateFirst = useCallback(() => {
    if (playIds.length > 0) {
      focusCard(playIds[0]);
    }
  }, [playIds, focusCard]);

  const navigateLast = useCallback(() => {
    if (playIds.length > 0) {
      focusCard(playIds[playIds.length - 1]);
    }
  }, [playIds, focusCard]);

  // Save focus position (for restoration after panel close)
  const saveFocus = useCallback(() => {
    Option.match(focusedPlayId, {
      onNone: () => {},
      onSome: (playId) => {
        const scrollPos = containerRef.current?.scrollTop ?? 0;
        setSavedFocus(saveFocusPosition(playId, scrollPos));
      },
    });
  }, [focusedPlayId, containerRef, setSavedFocus]);

  // Restore focus from saved position
  const restoreFocus = useCallback(() => {
    Option.match(savedFocus, {
      onNone: () => {},
      onSome: ({ playId, scrollPosition }) => {
        focusCard(playId);
        if (containerRef.current) {
          containerRef.current.scrollTop = scrollPosition;
        }
        setSavedFocus(clearSavedFocus());
      },
    });
  }, [savedFocus, focusCard, containerRef, setSavedFocus]);

  // Keyboard event handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Only handle when focus is within the container
    const container = containerRef.current;
    if (!container?.contains(document.activeElement)) return;

    switch (e.key) {
      case 'ArrowDown':
      case 'j': // vim-style
        e.preventDefault();
        navigateNext();
        break;

      case 'ArrowUp':
      case 'k': // vim-style
        e.preventDefault();
        navigatePrev();
        break;

      case 'Home':
        e.preventDefault();
        navigateFirst();
        break;

      case 'End':
        e.preventDefault();
        navigateLast();
        break;

      case 'Enter':
      case ' ': // Space
        e.preventDefault();
        Option.match(focusedPlayId, {
          onNone: () => {},
          onSome: (playId) => onSelect?.(playId),
        });
        break;

      case 'Escape':
        // Clear focus
        setFocused(setFocusedPlayId(null));
        (document.activeElement as HTMLElement)?.blur();
        break;
    }
  }, [
    enabled,
    containerRef,
    navigateNext,
    navigatePrev,
    navigateFirst,
    navigateLast,
    focusedPlayId,
    onSelect,
    setFocused,
  ]);

  // Attach keyboard listener
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);

  return {
    focusedPlayId,
    focusCard,
    saveFocus,
    restoreFocus,
    navigateNext,
    navigatePrev,
    navigateFirst,
    navigateLast,
  };
}
```

---

## Dependencies & Layer Updates

### Required Changes to TimelineRuntime

Add `ImageLoadService` to the runtime layers:

**File:** `packages/web/src/lib/http-runtime.ts` (additions)

```typescript
// Add import
import { ImageLoadService } from "@/services/image-load-service";

// Update TimelineRuntime to include new service
export const TimelineRuntime = Atom.runtime(
  Layer.mergeAll(
    Reactivity.layer,
    BrowserKeyValueStore.layerLocalStorage,
    FetchHttpClient.layer,
    TimelineKVS.Default,
    AlbumBarWorkerClient.Default,
    TimelineClient.layer,
    StreamingLinksClient.layer,
    InsightsClient.layer,
    // Add new service
    ImageLoadService.Default,  // NEW
  )
);
```

### New Service Dependencies Graph

```
                    Reactivity.layer
                          |
              +-----------+-----------+
              |                       |
      ImageLoadService          TimelineKVS
              |                       |
              v                       v
        imageStateAtom            insightsAtom
              |                       |
              v                       v
           AlbumArt            InsightPanel
```

---

## Implementation Checklist

### Phase 1 Critical Items - Effect Alignment

- [ ] **Create `image-load-service.ts`** - Effect service with retry schedule
- [ ] **Create `image-state.ts`** - Atom family with Result pattern
- [ ] **Refactor `AlbumArt.tsx`** - Use Effect Atom instead of useState
- [ ] **Refactor `insights.ts`** - Use TimelineRuntime.atom pattern
- [ ] **Create `timeline-focus.ts`** - Focus state atoms
- [ ] **Create `useTimelineKeyboardNav.ts`** - Enhanced keyboard hook
- [ ] **Update `http-runtime.ts`** - Add ImageLoadService to runtime

### Testing Considerations

1. **Image retry logic:**
   - Test with 404 URLs to verify retry behavior
   - Verify cache-busting query params on retries
   - Test exponential backoff timing
   - Verify Result state transitions (Initial -> Loading -> Loaded/Failed)

2. **Insights caching:**
   - Test cache hit/miss scenarios
   - Verify TTL expiration
   - Test concurrent fetches for same playId
   - Verify Reactivity.invalidate triggers re-fetch

3. **Keyboard navigation:**
   - Test arrow key navigation
   - Test Home/End keys
   - Test focus restoration after panel close
   - Verify ARIA attributes on focused elements

---

## Summary

The Phase 1 plan is strong in identifying critical issues (image reliability, accessibility) but proposes frontend implementations that don't align with the codebase's established Effect and Effect Atom patterns.

**Key Recommendations:**

1. **Replace React useState with Effect Atom** for image retry state
2. **Use `Effect.retry` with `Schedule.exponential`** instead of manual setTimeout
3. **Use `Atom.withReactivity`** for cache-invalidation coordination
4. **Follow `TimelineRuntime.atom` pattern** for async data loading
5. **Use `Result.Result`** for loading/success/error states

The corrected implementations provided in this audit maintain consistency with the codebase patterns while achieving the Phase 1 goals of improved image reliability and accessibility.

---

**Audit Completed:** December 16, 2025
**Next Steps:** Review with engineering team, update Phase 1 implementation plan
