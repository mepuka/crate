/**
 * Album Palette Atoms
 *
 * Effect Atom-based state management for album art color palettes.
 * Extracts dominant colors, accent colors, and temperature from album art
 * to theme the UI dynamically.
 *
 * Uses client-side canvas-based color extraction for fast performance.
 */

import { Atom, Result } from "@effect-atom/atom-react";
import { Effect, Option } from "effect";
import {
  AlbumPalette,
  DEFAULT_PALETTE,
  extractPaletteWithCache,
  getCachedPalette,
} from "@/lib/color-extraction";
import { TimelineRuntime } from "@/lib/http-runtime";

// ============================================================================
// Palette Atom Family
// ============================================================================

/**
 * Reactive atom for album palette extraction.
 *
 * Pattern matches insightsAtom:
 * - Uses Atom.family for parameterized atoms (by image URL)
 * - Uses TimelineRuntime.atom for Effect integration
 * - Returns AlbumPalette with colors, temperature, and derived assets
 *
 * Caching Strategy:
 * - First checks synchronous localStorage cache
 * - Falls back to async extraction on cache miss
 * - Stores result with 7-day TTL
 */
export const albumPaletteAtom = Atom.family((imageUrl: string | null | undefined) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      // No image = default palette
      if (!imageUrl) {
        return DEFAULT_PALETTE;
      }

      // Check synchronous cache first
      const cached = getCachedPalette(imageUrl);
      if (Option.isSome(cached)) {
        yield* Effect.logDebug(`Palette cache hit for ${imageUrl.slice(0, 50)}...`);
        return cached.value;
      }

      yield* Effect.logDebug(`Palette cache miss, extracting from ${imageUrl.slice(0, 50)}...`);

      // Extract with caching
      const palette = yield* extractPaletteWithCache(imageUrl).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`Palette extraction failed: ${error}`);
            return DEFAULT_PALETTE;
          })
        )
      );

      yield* Effect.logDebug(`Extracted palette: dominant=${palette.dominant}, temp=${palette.temperature}`);
      return palette;
    })
  ).pipe(Atom.withReactivity([`palette:${imageUrl ?? "default"}`]))
);

// ============================================================================
// Derived Atoms
// ============================================================================

/**
 * Get just the dominant color (sync, with default)
 */
export const dominantColorAtom = Atom.family((imageUrl: string | null | undefined) =>
  Atom.make((get) => {
    const result = get(albumPaletteAtom(imageUrl));
    return Result.matchWithWaiting(result, {
      onWaiting: () => DEFAULT_PALETTE.dominant,
      onSuccess: (s) => s.value.dominant,
      onError: () => DEFAULT_PALETTE.dominant,
      onDefect: () => DEFAULT_PALETTE.dominant,
    });
  })
);

/**
 * Get the accent color (sync, with default)
 */
export const accentColorAtom = Atom.family((imageUrl: string | null | undefined) =>
  Atom.make((get) => {
    const result = get(albumPaletteAtom(imageUrl));
    return Result.matchWithWaiting(result, {
      onWaiting: () => DEFAULT_PALETTE.accent,
      onSuccess: (s) => s.value.accent,
      onError: () => DEFAULT_PALETTE.accent,
      onDefect: () => DEFAULT_PALETTE.accent,
    });
  })
);

/**
 * Get temperature classification
 */
export const colorTemperatureAtom = Atom.family((imageUrl: string | null | undefined) =>
  Atom.make((get) => {
    const result = get(albumPaletteAtom(imageUrl));
    return Result.matchWithWaiting(result, {
      onWaiting: () => DEFAULT_PALETTE.temperature,
      onSuccess: (s) => s.value.temperature,
      onError: () => DEFAULT_PALETTE.temperature,
      onDefect: () => DEFAULT_PALETTE.temperature,
    });
  })
);

/**
 * Get CSS gradient for backgrounds
 */
export const gradientCssAtom = Atom.family((imageUrl: string | null | undefined) =>
  Atom.make((get) => {
    const result = get(albumPaletteAtom(imageUrl));
    return Result.matchWithWaiting(result, {
      onWaiting: () => DEFAULT_PALETTE.gradientCss,
      onSuccess: (s) => s.value.gradientCss,
      onError: () => DEFAULT_PALETTE.gradientCss,
      onDefect: () => DEFAULT_PALETTE.gradientCss,
    });
  })
);

// ============================================================================
// Loading State Atom
// ============================================================================

/**
 * Check if palette is still loading
 */
export const paletteLoadingAtom = Atom.family((imageUrl: string | null | undefined) =>
  Atom.make((get) => {
    const result = get(albumPaletteAtom(imageUrl));
    return Result.isWaiting(result);
  })
);

// ============================================================================
// Convenience Hook Types
// ============================================================================

export type { AlbumPalette };
export { DEFAULT_PALETTE };
