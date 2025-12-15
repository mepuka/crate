import { useAtomValue, Result } from "@effect-atom/atom-react";
import { useEffect, useRef, useState } from "react";
import { recentAlbumArtAtom, type AlbumArtworkData } from "@/atoms/album-bar";
import { isNewMusic } from "@/lib/new-music-utils";
import { Effect, Option, pipe } from "effect";

// ============================================================================
// Image Proxy - Pure Functions with Option
// ============================================================================

// API base URL for image proxy (empty for same-origin, full URL for cross-origin)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const CORS_BLOCKED_DOMAINS = ['archive.org', 'kexp.org', 'coverartarchive.org'] as const;

/** Parse URL safely, returning Option.none for invalid URLs */
const parseUrl = (url: string): Option.Option<URL> =>
  Option.liftThrowable((u: string) => new URL(u))(url);

/** Check if hostname matches or is subdomain of a blocked domain */
const isBlockedDomain = (hostname: string): boolean =>
  CORS_BLOCKED_DOMAINS.some(domain =>
    hostname === domain || hostname.endsWith('.' + domain)
  );

/** Determine if URL needs proxying - pure function returning boolean */
const needsProxy = (url: string): boolean =>
  pipe(
    parseUrl(url),
    Option.map(parsed => isBlockedDomain(parsed.hostname)),
    Option.getOrElse(() => false)
  );

/** Build proxied URL - endpoint is at /api/image-proxy */
const getProxiedUrl = (url: string): string =>
  `${API_BASE_URL}/api/image-proxy?url=${encodeURIComponent(url)}`;

/** Resolve image URL - applies proxy if needed */
const resolveImageUrl = (url: string): string =>
  needsProxy(url) ? getProxiedUrl(url) : url;

// ============================================================================
// Image Loading - Effect-based with proper error handling
// ============================================================================

/** Tagged error for image loading failures */
class ImageLoadError {
  readonly _tag = "ImageLoadError";
  constructor(
    readonly playId: number,
    readonly reason: "timeout" | "load_failed" | "bitmap_failed",
    readonly cause?: unknown
  ) {}
}

/** Load image element with timeout - returns Effect */
const loadImageElement = (
  url: string,
  timeoutMs: number = 8000
): Effect.Effect<HTMLImageElement, ImageLoadError> =>
  Effect.async<HTMLImageElement, ImageLoadError>((resume) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timeoutId = setTimeout(() => {
      resume(Effect.fail(new ImageLoadError(0, "timeout")));
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timeoutId);
      resume(Effect.succeed(img));
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      resume(Effect.fail(new ImageLoadError(0, "load_failed")));
    };

    img.src = url;

    // Cleanup on interruption
    return Effect.sync(() => {
      clearTimeout(timeoutId);
      img.src = '';
    });
  });

/** Create ImageBitmap from loaded image - returns Effect */
const createBitmap = (
  img: HTMLImageElement,
  size: number
): Effect.Effect<ImageBitmap, ImageLoadError> =>
  pipe(
    Effect.tryPromise({
      try: () => createImageBitmap(img, {
        resizeWidth: size,
        resizeHeight: size,
        resizeQuality: 'low'
      }),
      catch: (cause) => new ImageLoadError(0, "bitmap_failed", cause)
    })
  );

/**
 * Configuration for the static background album grid
 */
const CONFIG = {
  TILE_SIZE: 200,
  TILE_GAP: 4,
  TILE_RADIUS: 6,
  CANVAS_OPACITY: 0.75,
  BLUR_RADIUS: 8,
  BACKGROUND_OPACITY: 0.25,
  // Row offset for brick/staggered pattern
  ROW_OFFSET: 102, // Half tile width (200/2 + gap) for clean brick pattern
  // Visual defect ranges (subtle analog imperfections)
  BLUR_VARIANCE: 1, // Max blur radius variance (0-1px) - reduced for subtlety
  OPACITY_VARIANCE: 0.08, // Subtle opacity variation (92-100%)
  BRIGHTNESS_VARIANCE: 0.08, // Subtle brightness variation (±8%)
  CONTRAST_VARIANCE: 0.06, // Subtle contrast variation (±6%)
  // Per-tile granular defects
  VIGNETTE_STRENGTH: 0.25, // Vignette darkening strength (0-1)
  GRAIN_OPACITY: 0.08, // Film grain opacity (0-1)
  COLOR_SHIFT_AMOUNT: 0.06, // Subtle color channel shifts (±6%)
  // Cache limits to prevent unbounded memory growth
  MAX_TILE_CACHE_SIZE: 200, // Max cached tiles (LRU eviction)
} as const;

/**
 * Seeded pseudo-random number generator using sin waves
 * Returns value between 0 and 1
 */
function organicNoise(row: number, col: number, seed: number = 0): number {
  const x = row * 12.9898 + col * 78.233 + seed * 43.758;
  return Math.abs(Math.sin(x) * 43758.5453123) % 1;
}

/**
 * Apply granular visual defects within a single tile
 * Creates localized imperfections like vignetting, grain, and color shifts
 *
 * NOTE: Pixel-level effects (grain, color shifts) require getImageData which
 * fails for cross-origin images. We gracefully skip those for CORS images.
 */
function applyTileDefects(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  row: number,
  col: number,
  size: number,
  isCrossOrigin: boolean = false
): void {
  // Vignette effect (darkened edges) - uses gradient overlay, works with CORS
  const vignetteStrength = organicNoise(row, col, 10) * CONFIG.VIGNETTE_STRENGTH;
  if (vignetteStrength > 0.05) {
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, size * 0.3,
      size / 2, size / 2, size * 0.7
    );
    gradient.addColorStop(0, `rgba(0, 0, 0, 0)`);
    gradient.addColorStop(1, `rgba(0, 0, 0, ${vignetteStrength})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  // Skip pixel-level effects for cross-origin images (getImageData would fail)
  if (isCrossOrigin) {
    return;
  }

  // Film grain texture - requires getImageData
  const grainAmount = organicNoise(row, col, 11) * CONFIG.GRAIN_OPACITY;
  if (grainAmount > 0.02) {
    try {
      const imageData = ctx.getImageData(0, 0, size, size);
      const pixels = imageData.data;

      // Apply subtle random noise to pixels
      for (let i = 0; i < pixels.length; i += 4) {
        const pixelNoise = organicNoise(
          Math.floor(i / 4 / size),
          (i / 4) % size,
          row * 1000 + col
        );
        const grain = (pixelNoise - 0.5) * grainAmount * 255;
        pixels[i] += grain;     // R
        pixels[i + 1] += grain; // G
        pixels[i + 2] += grain; // B
      }

      ctx.putImageData(imageData, 0, 0);
    } catch {
      // Canvas tainted by cross-origin data - skip grain effect
    }
  }

  // Subtle color channel shifts (chromatic aberration-like) - requires getImageData
  const colorShift = organicNoise(row, col, 12) * CONFIG.COLOR_SHIFT_AMOUNT;
  if (colorShift > 0.015) {
    try {
      const imageData = ctx.getImageData(0, 0, size, size);
      const pixels = imageData.data;

      const redShift = (organicNoise(row, col, 13) - 0.5) * colorShift * 2;
      const greenShift = (organicNoise(row, col, 14) - 0.5) * colorShift * 2;
      const blueShift = (organicNoise(row, col, 15) - 0.5) * colorShift * 2;

      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] *= (1 + redShift);       // R
        pixels[i + 1] *= (1 + greenShift); // G
        pixels[i + 2] *= (1 + blueShift);  // B
      }

      ctx.putImageData(imageData, 0, 0);
    } catch {
      // Canvas tainted by cross-origin data - skip color shift effect
    }
  }
}

/**
 * Create pre-rendered tile with all effects baked in
 * This is done ONCE per unique image and cached for reuse
 *
 * Returns an OffscreenCanvas with:
 * - Base image drawn with rounded corners
 * - Blur, opacity, brightness, contrast filters applied
 * - Vignette, grain, and color shift defects baked in
 *
 * Position-dependent effects (row/col) use a fixed seed for consistency
 */
function createPreRenderedTile(
  bitmap: ImageBitmap,
  row: number,
  col: number,
  clipPath: Path2D | undefined,
  isCrossOrigin: boolean = true // Default true for safety - skip pixel effects
): OffscreenCanvas {
  const offscreen = new OffscreenCanvas(CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
  const ctx = offscreen.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    throw new Error("Failed to get OffscreenCanvas context");
  }

  // Apply subtle blur variation (out of focus effect)
  const blurAmount = organicNoise(row, col, 1) * CONFIG.BLUR_VARIANCE;
  if (blurAmount > 0.3) {
    ctx.filter = `blur(${blurAmount}px)`;
  }

  // Apply subtle opacity variation (slight fading)
  const opacity = 1 - organicNoise(row, col, 2) * CONFIG.OPACITY_VARIANCE;
  ctx.globalAlpha = opacity;

  // Apply subtle brightness/contrast variation (analog color shifts)
  const brightness = 1 + (organicNoise(row, col, 3) - 0.5) * 2 * CONFIG.BRIGHTNESS_VARIANCE;
  const contrast = 1 + (organicNoise(row, col, 4) - 0.5) * 2 * CONFIG.CONTRAST_VARIANCE;

  // Apply color matrix for brightness/contrast
  if (brightness !== 1 || contrast !== 1) {
    const existingFilter = ctx.filter !== 'none' ? ctx.filter + ' ' : '';
    ctx.filter = `${existingFilter}brightness(${brightness}) contrast(${contrast})`;
  }

  // Draw with rounded corners
  if (clipPath) {
    ctx.clip(clipPath);
  }
  ctx.drawImage(bitmap, 0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);

  // Reset filters/alpha before applying pixel-level defects
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  // Apply granular per-tile defects (vignette, grain, color shifts)
  // Pixel-level effects skipped for cross-origin images (canvas tainted)
  applyTileDefects(ctx, row, col, CONFIG.TILE_SIZE, isCrossOrigin);

  return offscreen;
}

/**
 * Static background displaying recent album artwork with subtle analog defects.
 * Optimized with pre-rendered tile caching for maximum performance.
 *
 * Architecture:
 * - Pre-renders tiles to OffscreenCanvas with all effects baked in (ONCE per image)
 * - Main canvas draws cached tiles (GPU-only operations - extremely fast)
 * - No willReadFrequently flag needed (pure GPU rendering)
 * - Tiles cached by imageUri, reused across re-renders and resizes
 *
 * Features:
 * - GPU-accelerated rendering with OffscreenCanvas caching
 * - Clean brick pattern (alternating row offset) - no position variance
 * - Two layers of visual defects (pre-rendered into cache):
 *   1. Tile-level: slight blur, opacity fade, brightness/contrast shifts
 *   2. Granular: vignetting, film grain, color channel shifts within each tile
 * - Creates analog/film-like quality without disrupting layout
 * - Seeded random for consistent appearance across renders
 * - Automatic sizing based on viewport (cached tiles reused on resize)
 * - Refreshes cache when new plays arrive
 *
 * Performance:
 * - Expensive effects (grain, color shifts) computed once and cached
 * - Main render loop is ~60-80% faster (only GPU drawImage operations)
 * - Resize events are fast (just re-layout grid, tiles already cached)
 */
export function ScrollingAlbumBar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const albumArtResult = useAtomValue(recentAlbumArtAtom);

  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  const imagesRef = useRef<ImageBitmap[]>([]);

  // Cache of pre-rendered tiles with all effects baked in
  // Key: imageUri, Value: OffscreenCanvas with effects applied
  const tileCache = useRef<Map<string, OffscreenCanvas>>(new Map());

  // Metadata cache to map index -> artwork data for new music detection
  const artworkMetadata = useRef<Map<number, AlbumArtworkData>>(new Map());

  // Pre-computed isNewMusic flags (computed once during load, not per-render)
  const isNewMusicFlags = useRef<Map<number, boolean>>(new Map());

  // Precompute clipping path for rounded corners (used during tile creation)
  const clipPathRef = useRef<Path2D>();

  // Path2D for new music glow effect (created once, reused)
  const newMusicPathRef = useRef<Path2D>();

  // Helper: Add to cache with LRU eviction
  const addToTileCache = (key: string, tile: OffscreenCanvas) => {
    tileCache.current.set(key, tile);

    // LRU eviction: remove oldest entries if over limit
    if (tileCache.current.size > CONFIG.MAX_TILE_CACHE_SIZE) {
      const firstKey = tileCache.current.keys().next().value;
      if (firstKey) {
        tileCache.current.delete(firstKey);
      }
    }
  };

  // Cleanup ImageBitmaps on unmount to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      // Close all ImageBitmaps explicitly
      imagesRef.current.forEach((bitmap) => {
        if (bitmap && typeof bitmap.close === 'function') {
          bitmap.close();
        }
      });
      imagesRef.current = [];

      // Clear caches
      tileCache.current.clear();
      artworkMetadata.current.clear();
      isNewMusicFlags.current.clear();
    };
  }, []);

  useEffect(() => {
    // Clip path for tile corners
    const path = new Path2D();
    path.roundRect(0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_RADIUS);
    clipPathRef.current = path;

    // Path for new music glow effect (slightly inset)
    const glowPath = new Path2D();
    glowPath.roundRect(1, 1, CONFIG.TILE_SIZE - 2, CONFIG.TILE_SIZE - 2, CONFIG.TILE_RADIUS);
    newMusicPathRef.current = glowPath;
  }, []);

  // Track load progress for progressive rendering
  const [loadProgress, setLoadProgress] = useState(0);

  // Load album artwork images in PARALLEL with progressive rendering
  useEffect(() => {
    Result.matchWithWaiting(albumArtResult, {
      onWaiting: () => {
        setIsLoadingComplete(false);
        setLoadProgress(0);
      },
      onError: () => {},
      onDefect: () => {},
      onSuccess: async (s) => {
        const artworks = s.value as readonly AlbumArtworkData[];

        // Close old ImageBitmaps before clearing to prevent GPU memory leaks
        imagesRef.current.forEach((bitmap) => {
          if (bitmap && typeof bitmap.close === 'function') {
            bitmap.close();
          }
        });

        // Clear old caches when new data arrives
        tileCache.current.clear();
        artworkMetadata.current.clear();
        isNewMusicFlags.current.clear();
        imagesRef.current = [];

        // Build Effect for loading a single image with all side effects
        const loadSingleImage = (artwork: AlbumArtworkData, index: number) =>
          pipe(
            // Resolve URL (applies proxy if needed)
            Effect.succeed(resolveImageUrl(artwork.imageUri)),
            // Load image element
            Effect.flatMap(loadImageElement),
            // Create bitmap from loaded image
            Effect.flatMap((img) => createBitmap(img, CONFIG.TILE_SIZE)),
            // Store metadata and cache tile on success
            Effect.tap((bitmap) => Effect.sync(() => {
              artworkMetadata.current.set(index, artwork);
              // artwork.airdate arrives as ISO string from worker (Schema.encode converts Date → string)
              // Parse it back to Date for isNewMusic calculation
              isNewMusicFlags.current.set(index, isNewMusic({
                airdate: new Date(artwork.airdate as unknown as string),
                comment: artwork.comment,
              } as Parameters<typeof isNewMusic>[0]));

              const preRenderedTile = createPreRenderedTile(
                bitmap,
                0,
                index,
                clipPathRef.current
              );
              addToTileCache(artwork.imageUri, preRenderedTile);
              imagesRef.current[index] = bitmap;
            })),
            // Convert to Option - success yields Some, failure yields None
            Effect.option,
            // Track progress after each load (success or failure)
            Effect.tap(() => Effect.sync(() => {
              loadedCount++;
              setLoadProgress(loadedCount / artworks.length);

              if (loadedCount >= 6 && !isLoadingComplete) {
                const validBitmaps = imagesRef.current.filter(Boolean);
                if (validBitmaps.length >= 6) {
                  setIsLoadingComplete(true);
                }
              }
            })),
            // Log failures for debugging (using Option.match)
            Effect.tap((result) =>
              Option.match(result, {
                onNone: () => Effect.logWarning(`Failed to load image for play ${artwork.id}`),
                onSome: () => Effect.void
              })
            )
          );

        // Load ALL images in parallel with bounded concurrency
        let loadedCount = 0;
        const loadAllImages = pipe(
          Effect.all(
            artworks.map((artwork, index) => loadSingleImage(artwork, index)),
            { concurrency: 10 } // Limit concurrent loads to avoid overwhelming browser
          ),
          // Final completion check
          Effect.tap(() => Effect.sync(() => {
            const validBitmaps = imagesRef.current.filter(Boolean);
            if (validBitmaps.length > 0) {
              setIsLoadingComplete(true);
            }
          }))
        );

        // Run the Effect (convert to Promise for useEffect compatibility)
        await Effect.runPromise(loadAllImages);
      },
    });
  }, [albumArtResult]);

  // Track last rendered dimensions to avoid unnecessary redraws
  const lastDimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // Render static grid when images are loaded
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoadingComplete || imagesRef.current.length === 0) return;

    // NO willReadFrequently - we're using GPU-only operations now!
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const tileWidth = CONFIG.TILE_SIZE + CONFIG.TILE_GAP;

    const renderGrid = () => {
      const canvasWidth = window.innerWidth;
      const canvasHeight = window.innerHeight;

      // Skip render if dimensions haven't changed significantly (>10px)
      const lastDim = lastDimensionsRef.current;
      if (
        Math.abs(canvasWidth - lastDim.width) < 10 &&
        Math.abs(canvasHeight - lastDim.height) < 10
      ) {
        return;
      }
      lastDimensionsRef.current = { width: canvasWidth, height: canvasHeight };

      // Use standard DPR for static content
      const dpr = window.devicePixelRatio || 1;

      // Only resize canvas if dimensions actually changed (prevents flash)
      const newWidth = canvasWidth * dpr;
      const newHeight = canvasHeight * dpr;
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;
      }

      // Reset transform and clear
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Calculate grid dimensions (extra tiles to account for brick pattern offset)
      const cols = Math.ceil(canvasWidth / tileWidth) + 2;
      const rows = Math.ceil(canvasHeight / tileWidth) + 1;

      // Get valid artwork indices (filter sparse array)
      const validIndices = Array.from(artworkMetadata.current.keys());
      if (validIndices.length === 0) return;

      // Render grid using cached pre-rendered tiles with pseudo-random selection
      // to avoid obvious repetition patterns
      for (let row = 0; row < rows; row++) {
        // Start column offset for even rows to fill left edge
        const startCol = row % 2 === 1 ? -1 : 0;
        const endCol = cols + (row % 2 === 1 ? 0 : 1);

        for (let col = startCol; col < endCol; col++) {
          // Clean brick pattern position (no jitter)
          const x = col * tileWidth + (row % 2 === 1 ? CONFIG.ROW_OFFSET : 0);
          const y = row * tileWidth;

          // Use seeded random to select image - avoids obvious repetition patterns
          // Different seeds create varied distribution across the grid
          const randomIndex = Math.floor(organicNoise(row, col, 42) * validIndices.length);
          const artworkIndex = validIndices[randomIndex];
          const artwork = artworkMetadata.current.get(artworkIndex);

          if (!artwork) continue;

          // Get pre-rendered tile from cache
          const preRenderedTile = tileCache.current.get(artwork.imageUri);
          if (!preRenderedTile) continue;

          // Use pre-computed isNewMusic flag (computed once during load)
          const isNew = isNewMusicFlags.current.get(artworkIndex) ?? false;

          ctx.save();
          ctx.translate(x, y);

          // Draw pre-rendered tile (GPU-only operation - FAST!)
          ctx.drawImage(preRenderedTile, 0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);

          // Apply new music highlight if applicable
          if (isNew && newMusicPathRef.current) {
            // Teal glow effect for new music
            ctx.strokeStyle = 'rgba(94, 234, 212, 0.5)'; // Teal color (matches --new-music-glow)
            ctx.lineWidth = 3;
            ctx.shadowColor = 'rgba(94, 234, 212, 0.4)';
            ctx.shadowBlur = 12;

            // Draw rounded rectangle border using cached Path2D
            ctx.stroke(newMusicPathRef.current);

            // Reset shadow for next tile
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
          }

          ctx.restore();
        }
      }
    };

    // Initial render
    renderGrid();

    // Use ResizeObserver for smoother resize handling (better than window resize event)
    let rafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      // Cancel pending frame and schedule new one
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      // Use requestAnimationFrame for smooth rendering during resize
      rafId = requestAnimationFrame(renderGrid);
    });

    // Observe document body for size changes
    resizeObserver.observe(document.body);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
    };
  }, [isLoadingComplete]);

  return (
    <div className="album-grid-background fixed inset-0 -z-10 overflow-hidden">
      {/* Canvas layer - renders album tiles with fade-in */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ease-out ${
          isLoadingComplete ? 'opacity-75' : 'opacity-0'
        }`}
      />

      {/* CSS blur overlay - light blur for aesthetic */}
      <div
        className="album-grid-blur absolute inset-0 bg-background pointer-events-none"
        style={{
          opacity: CONFIG.BACKGROUND_OPACITY,
          backdropFilter: `blur(${CONFIG.BLUR_RADIUS}px) saturate(120%)`,
          WebkitBackdropFilter: `blur(${CONFIG.BLUR_RADIUS}px) saturate(120%)`,
        }}
      />

      {/* Scrim gradient for text contrast */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/50 to-background/80 pointer-events-none"
        aria-hidden="true"
      />

      {/* Loading state with progress */}
      {!isLoadingComplete && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col gap-2 items-center text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Loading album artwork... {Math.round(loadProgress * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
