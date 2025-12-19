/**
 * Art Utilities
 *
 * Constants and validation for album art handling.
 * Image conversion utilities moved to backend pipeline.
 */

// ============================================================================
// Types
// ============================================================================

export interface ArtAssetSizes {
  /** Display size in UI (typically 48-300px) */
  display: number;
  /** Thumbnail size for lists (48-80px) */
  thumbnail: number;
  /** Hero/featured size (300-600px) */
  hero: number;
  /** Full quality for enhancement/download */
  full: "1K" | "2K" | "4K";
}

export interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Standard display sizes used across the app */
export const STANDARD_SIZES = {
  /** Track list item */
  trackThumb: 48,
  /** Play queue item */
  queueThumb: 56,
  /** Now playing card */
  nowPlaying: 80,
  /** Card thumbnail */
  cardThumb: 120,
  /** Card large */
  cardLarge: 180,
  /** Hero/featured */
  hero: 300,
  /** Full page hero */
  fullHero: 480,
} as const;

/** Enhancement resolution in pixels */
export const ENHANCEMENT_RESOLUTIONS = {
  "1K": 1024,
  "2K": 2048,
  "4K": 4096,
} as const;

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that we have a valid source image.
 */
export function validateSourceImage(src: string | null | undefined): boolean {
  if (!src) return false;
  if (typeof src !== "string") return false;
  if (src.trim().length === 0) return false;

  return (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:image/") ||
    src.startsWith("blob:")
  );
}

/**
 * Assert that source image exists - throws if not.
 */
export function assertSourceImage(
  src: string | null | undefined,
  context: string = "enhancement"
): asserts src is string {
  if (!validateSourceImage(src)) {
    throw new Error(
      `[${context}] Cannot process without valid image URL.`
    );
  }
}
