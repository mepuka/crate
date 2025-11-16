import { useAtomValue, Result } from "@effect-atom/atom-react";
import { useEffect, useRef, useState } from "react";
import { recentAlbumArtAtom, type AlbumArtworkData } from "@/atoms/album-bar";
import { isNewMusic } from "@/lib/new-music-utils";

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
 */
function applyTileDefects(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  size: number
): void {
  // Vignette effect (darkened edges)
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

  // Film grain texture
  const grainAmount = organicNoise(row, col, 11) * CONFIG.GRAIN_OPACITY;
  if (grainAmount > 0.02) {
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
  }

  // Subtle color channel shifts (chromatic aberration-like)
  const colorShift = organicNoise(row, col, 12) * CONFIG.COLOR_SHIFT_AMOUNT;
  if (colorShift > 0.015) {
    // Get image data and apply slight color channel modifications
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
  }
}

/**
 * Static background displaying recent album artwork with subtle analog defects.
 * Simplified from animated version - clean brick pattern with visual imperfections.
 * 
 * Features:
 * - GPU-accelerated rendering with ImageBitmap
 * - Clean brick pattern (alternating row offset) - no position variance
 * - Two layers of visual defects:
 *   1. Tile-level: slight blur, opacity fade, brightness/contrast shifts
 *   2. Granular: vignetting, film grain, color channel shifts within each tile
 * - Creates analog/film-like quality without disrupting layout
 * - Seeded random for consistent appearance across renders
 * - Automatic sizing based on viewport
 * - Refreshes when new plays arrive
 */
export function ScrollingAlbumBar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const albumArtResult = useAtomValue(recentAlbumArtAtom);
  
  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  const imagesRef = useRef<ImageBitmap[]>([]);
  
  // Precompute clipping path for rounded corners
  const clipPathRef = useRef<Path2D>();

  useEffect(() => {
    const path = new Path2D();
    path.roundRect(0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_RADIUS);
    clipPathRef.current = path;
  }, []);

  // Load album artwork images as ImageBitmaps (GPU-native, optimized)
  useEffect(() => {
    Result.matchWithWaiting(albumArtResult, {
      onWaiting: () => {
        setIsLoadingComplete(false);
      },
      onError: (error) => {
        console.error("Failed to load album artwork:", error);
      },
      onDefect: (error) => {
        console.error("Defect loading album artwork:", error);
      },
      onSuccess: async (s) => {
        const artworks = s.value as readonly AlbumArtworkData[];
        const bitmaps: ImageBitmap[] = [];

        // Load images as ImageBitmaps for GPU-native rendering
        for (const artwork of artworks) {
          try {
            const response = await fetch(artwork.imageUri);
            const blob = await response.blob();

            // Decode to ImageBitmap with resize during decode (saves memory)
            const bitmap = await createImageBitmap(blob, {
              resizeWidth: CONFIG.TILE_SIZE,
              resizeHeight: CONFIG.TILE_SIZE,
              resizeQuality: 'medium'
            });

            bitmaps.push(bitmap);
          } catch (err) {
            console.error(`Failed to load image for play ${artwork.id}:`, err);
          }
        }

        if (bitmaps.length > 0) {
          imagesRef.current = bitmaps;
          setIsLoadingComplete(true);
        }
      },
    });
  }, [albumArtResult]);

  // Render static grid when images are loaded
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoadingComplete || imagesRef.current.length === 0) return;

    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!ctx) return;

    const images = imagesRef.current;
    const tileWidth = CONFIG.TILE_SIZE + CONFIG.TILE_GAP;

    // Get artwork data for new music detection
    let artworkDataArray: readonly AlbumArtworkData[] = [];
    Result.match(albumArtResult, {
      onSuccess: (s) => {
        artworkDataArray = s.value as readonly AlbumArtworkData[];
      },
      onWaiting: () => {},
      onError: () => {},
      onDefect: () => {},
    });

    const renderGrid = () => {
      const canvasWidth = window.innerWidth;
      const canvasHeight = window.innerHeight;
      
      // Use standard DPR for static content
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;
      ctx.scale(dpr, dpr);

      // Clear canvas
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Calculate grid dimensions (extra tiles to account for brick pattern offset)
      const cols = Math.ceil(canvasWidth / tileWidth) + 2;
      const rows = Math.ceil(canvasHeight / tileWidth) + 1;

      // Render grid with alternating row offset (brick pattern) + subtle visual defects
      let imageIndex = 0;
      for (let row = 0; row < rows; row++) {
        // Start column offset for even rows to fill left edge
        const startCol = row % 2 === 1 ? -1 : 0;
        const endCol = cols + (row % 2 === 1 ? 0 : 1);

        for (let col = startCol; col < endCol; col++) {
          // Clean brick pattern position (no jitter)
          const x = col * tileWidth + (row % 2 === 1 ? CONFIG.ROW_OFFSET : 0);
          const y = row * tileWidth;

          // Get image (cycle through available images)
          const img = images[imageIndex % images.length];
          const artworkIndex = imageIndex % images.length;
          imageIndex++;

          // Check if this tile is new music
          const artwork = artworkDataArray[artworkIndex];
          const isNew = artwork ? isNewMusic({
            airdate: artwork.airdate,
            comment: artwork.comment,
          } as any) : false;

          // Apply subtle visual defects (analog imperfections)
          ctx.save();
          ctx.translate(x, y);
          
          // Subtle blur variation (out of focus effect)
          const blurAmount = organicNoise(row, col, 1) * CONFIG.BLUR_VARIANCE;
          if (blurAmount > 0.3) {
            ctx.filter = `blur(${blurAmount}px)`;
          }
          
          // Subtle opacity variation (slight fading)
          const opacity = 1 - organicNoise(row, col, 2) * CONFIG.OPACITY_VARIANCE;
          ctx.globalAlpha = opacity;
          
          // Subtle brightness/contrast variation (analog color shifts)
          const brightness = 1 + (organicNoise(row, col, 3) - 0.5) * 2 * CONFIG.BRIGHTNESS_VARIANCE;
          const contrast = 1 + (organicNoise(row, col, 4) - 0.5) * 2 * CONFIG.CONTRAST_VARIANCE;
          
          // Apply color matrix for brightness/contrast
          if (brightness !== 1 || contrast !== 1) {
            const existingFilter = ctx.filter !== 'none' ? ctx.filter + ' ' : '';
            ctx.filter = `${existingFilter}brightness(${brightness}) contrast(${contrast})`;
          }
          
          // Draw with rounded corners
          if (clipPathRef.current) {
            ctx.clip(clipPathRef.current);
          }
          ctx.drawImage(img, 0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
          
          // Apply granular per-tile defects (vignette, grain, color shifts)
          applyTileDefects(ctx, row, col, CONFIG.TILE_SIZE);

          // Apply new music highlight if applicable
          if (isNew) {
            // Teal glow effect for new music
            ctx.strokeStyle = 'rgba(94, 234, 212, 0.5)'; // Teal color (matches --new-music-glow)
            ctx.lineWidth = 3;
            ctx.shadowColor = 'rgba(94, 234, 212, 0.4)';
            ctx.shadowBlur = 12;

            // Draw rounded rectangle border
            const path = new Path2D();
            path.roundRect(1, 1, CONFIG.TILE_SIZE - 2, CONFIG.TILE_SIZE - 2, CONFIG.TILE_RADIUS);
            ctx.stroke(path);

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

    // Re-render on resize
    let resizeTimeout: number;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(renderGrid, 250);
    };
    
    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
    };
  }, [isLoadingComplete]);

  return (
    <div className="album-grid-background fixed inset-0 -z-10 overflow-hidden">
      {/* Canvas layer - renders album tiles (no blur) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: CONFIG.CANVAS_OPACITY }}
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

      {/* Loading state */}
      {Result.matchWithWaiting(albumArtResult, {
        onWaiting: () => (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex gap-2 items-center text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading album artwork...
            </div>
          </div>
        ),
        onError: () => (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-muted-foreground">Failed to load album artwork</span>
          </div>
        ),
        onDefect: () => (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-muted-foreground">Error loading album artwork</span>
          </div>
        ),
        onSuccess: () => null,
      })}
    </div>
  );
}
