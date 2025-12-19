/**
 * Color Extraction Utilities
 *
 * Client-side color extraction from album art images.
 * Uses canvas-based sampling for fast palette extraction.
 *
 * Inspired by ColorThief but lightweight and Effect-integrated.
 */

import { Effect, Schema, Duration, Option, pipe } from "effect";

// ============================================================================
// Types
// ============================================================================

export const AlbumPalette = Schema.Struct({
  dominant: Schema.String.annotations({ description: "Primary hex color" }),
  accent: Schema.String.annotations({ description: "Complementary accent color" }),
  colors: Schema.Array(Schema.String).annotations({ description: "Full palette" }),
  temperature: Schema.Literal("warm", "cool", "neutral"),
  glowColor: Schema.String.annotations({ description: "Color for ambient glow effects" }),
  gradientCss: Schema.String.annotations({ description: "CSS gradient for backgrounds" }),
});
export type AlbumPalette = Schema.Schema.Type<typeof AlbumPalette>;

// Default fallback palette (warm vinyl aesthetic)
export const DEFAULT_PALETTE: AlbumPalette = {
  dominant: "#E8825B",
  accent: "#4ECDC4",
  colors: ["#E8825B", "#4ECDC4", "#2D3436", "#DFE6E9"],
  temperature: "warm",
  glowColor: "#E8825B",
  gradientCss: "radial-gradient(circle at 30% 20%, rgba(232, 130, 91, 0.15) 0%, transparent 50%)",
};

// ============================================================================
// Color Math Utilities
// ============================================================================

interface RGB { r: number; g: number; b: number }
interface HSL { h: number; s: number; l: number }

const rgbToHex = ({ r, g, b }: RGB): string =>
  `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;

const rgbToHsl = ({ r, g, b }: RGB): HSL => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
};

/**
 * Calculate luminance for contrast checking
 */
const getLuminance = ({ r, g, b }: RGB): number => {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
};

/**
 * Get color distance (Euclidean in RGB space)
 */
const colorDistance = (c1: RGB, c2: RGB): number =>
  Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );

/**
 * Determine temperature from hue
 */
const getTemperature = (hsl: HSL): "warm" | "cool" | "neutral" => {
  const { h, s } = hsl;
  if (s < 15) return "neutral"; // Low saturation = neutral
  if ((h >= 0 && h < 60) || (h >= 300 && h <= 360)) return "warm"; // Reds, oranges, yellows, magentas
  if (h >= 180 && h < 300) return "cool"; // Blues, cyans, purples
  return "neutral"; // Greens are more neutral
};

// ============================================================================
// K-Means Color Quantization
// ============================================================================

/**
 * Simple k-means clustering for color quantization
 */
const kMeans = (pixels: RGB[], k: number, iterations = 10): RGB[] => {
  if (pixels.length === 0) return [];
  if (pixels.length <= k) return pixels;

  // Initialize centroids with k-means++ style selection
  const centroids: RGB[] = [];
  centroids.push(pixels[Math.floor(Math.random() * pixels.length)]);

  while (centroids.length < k) {
    const distances = pixels.map((p) =>
      Math.min(...centroids.map((c) => colorDistance(p, c)))
    );
    const sum = distances.reduce((a, b) => a + b, 0);
    let target = Math.random() * sum;
    for (let i = 0; i < pixels.length; i++) {
      target -= distances[i];
      if (target <= 0) {
        centroids.push(pixels[i]);
        break;
      }
    }
  }

  // Iterate
  for (let iter = 0; iter < iterations; iter++) {
    // Assign pixels to clusters
    const clusters: RGB[][] = Array.from({ length: k }, () => []);
    for (const pixel of pixels) {
      let minDist = Infinity;
      let minIdx = 0;
      for (let i = 0; i < centroids.length; i++) {
        const dist = colorDistance(pixel, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          minIdx = i;
        }
      }
      clusters[minIdx].push(pixel);
    }

    // Update centroids
    for (let i = 0; i < k; i++) {
      if (clusters[i].length > 0) {
        centroids[i] = {
          r: Math.round(clusters[i].reduce((s, p) => s + p.r, 0) / clusters[i].length),
          g: Math.round(clusters[i].reduce((s, p) => s + p.g, 0) / clusters[i].length),
          b: Math.round(clusters[i].reduce((s, p) => s + p.b, 0) / clusters[i].length),
        };
      }
    }
  }

  return centroids;
};

// ============================================================================
// Image Loading & Sampling
// ============================================================================

/**
 * Load image and extract pixels via canvas
 */
const extractPixels = (imageUrl: string): Effect.Effect<RGB[], Error> =>
  Effect.async<RGB[], Error>((resume) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        // Scale down for performance (64x64 is enough for color extraction)
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resume(Effect.fail(new Error("Failed to get canvas context")));
          return;
        }

        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const pixels: RGB[] = [];

        // Sample every 4th pixel for speed
        for (let i = 0; i < imageData.data.length; i += 16) {
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          const a = imageData.data[i + 3];

          // Skip transparent or very dark/light pixels
          if (a < 128) continue;
          const lum = getLuminance({ r, g, b });
          if (lum < 0.05 || lum > 0.95) continue;

          pixels.push({ r, g, b });
        }

        resume(Effect.succeed(pixels));
      } catch (e) {
        resume(Effect.fail(e instanceof Error ? e : new Error(String(e))));
      }
    };

    img.onerror = () => {
      resume(Effect.fail(new Error(`Failed to load image: ${imageUrl}`)));
    };

    img.src = imageUrl;
  });

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract color palette from album art URL.
 *
 * Returns AlbumPalette with dominant color, accent, temperature, and derived assets.
 */
export const extractPalette = (imageUrl: string): Effect.Effect<AlbumPalette, Error> =>
  pipe(
    extractPixels(imageUrl),
    Effect.map((pixels) => {
      if (pixels.length < 10) {
        // Not enough pixels, return default
        return DEFAULT_PALETTE;
      }

      // Extract 5 main colors via k-means
      const colors = kMeans(pixels, 5);
      if (colors.length === 0) {
        return DEFAULT_PALETTE;
      }

      // Sort by saturation (most vibrant first)
      const sortedColors = colors
        .map((c) => ({ rgb: c, hsl: rgbToHsl(c), hex: rgbToHex(c) }))
        .sort((a, b) => b.hsl.s - a.hsl.s);

      // Dominant = most saturated color that's not too dark/light
      const dominant = sortedColors.find(
        (c) => c.hsl.l > 20 && c.hsl.l < 80
      ) ?? sortedColors[0];

      // Accent = color most distant from dominant
      const accent = sortedColors
        .filter((c) => c !== dominant)
        .sort(
          (a, b) =>
            colorDistance(b.rgb, dominant.rgb) - colorDistance(a.rgb, dominant.rgb)
        )[0] ?? dominant;

      const temperature = getTemperature(dominant.hsl);
      const allHexColors = sortedColors.map((c) => c.hex);

      // Generate glow color (slightly transparent dominant)
      const glowColor = dominant.hex;

      // Generate gradient CSS
      const gradientCss =
        temperature === "warm"
          ? `radial-gradient(circle at 30% 20%, ${dominant.hex}20 0%, transparent 50%), radial-gradient(circle at 70% 80%, ${accent.hex}15 0%, transparent 40%)`
          : `radial-gradient(circle at 70% 30%, ${dominant.hex}15 0%, transparent 50%), radial-gradient(circle at 30% 70%, ${accent.hex}10 0%, transparent 40%)`;

      return {
        dominant: dominant.hex,
        accent: accent.hex,
        colors: allHexColors,
        temperature,
        glowColor,
        gradientCss,
      };
    }),
    Effect.catchAll(() => Effect.succeed(DEFAULT_PALETTE))
  );

// ============================================================================
// LocalStorage Cache
// ============================================================================

const PALETTE_CACHE_PREFIX = "crate:palette:";
const PALETTE_CACHE_TTL = Duration.days(7);

interface PaletteCacheEntry {
  palette: AlbumPalette;
  timestamp: number;
}

/**
 * Get cached palette from localStorage
 */
export const getCachedPalette = (imageUrl: string): Option.Option<AlbumPalette> => {
  try {
    const key = `${PALETTE_CACHE_PREFIX}${btoa(imageUrl).slice(0, 50)}`;
    const cached = localStorage.getItem(key);
    if (!cached) return Option.none();

    const entry: PaletteCacheEntry = JSON.parse(cached);
    const age = Date.now() - entry.timestamp;
    if (age > Duration.toMillis(PALETTE_CACHE_TTL)) {
      localStorage.removeItem(key);
      return Option.none();
    }

    return Option.some(entry.palette);
  } catch {
    return Option.none();
  }
};

/**
 * Cache palette in localStorage
 */
export const cachePalette = (imageUrl: string, palette: AlbumPalette): void => {
  try {
    const key = `${PALETTE_CACHE_PREFIX}${btoa(imageUrl).slice(0, 50)}`;
    const entry: PaletteCacheEntry = {
      palette,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore cache errors
  }
};

/**
 * Extract palette with caching
 */
export const extractPaletteWithCache = (imageUrl: string): Effect.Effect<AlbumPalette, Error> =>
  Effect.gen(function* () {
    // Check cache first
    const cached = getCachedPalette(imageUrl);
    if (Option.isSome(cached)) {
      return cached.value;
    }

    // Extract and cache
    const palette = yield* extractPalette(imageUrl);
    cachePalette(imageUrl, palette);
    return palette;
  });
