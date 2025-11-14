import { useAtomValue, Result } from "@effect-atom/atom-react";
import { useEffect, useRef, useState } from "react";
import { recentAlbumArtAtom, type AlbumArtworkData } from "@/atoms/album-bar";

/**
 * Row configuration for multi-directional scrolling
 */
interface RowState {
  offsetX: number;
  direction: -1 | 1;
  speed: number;
  images: HTMLImageElement[];
}

/**
 * Configuration for the multi-row background album grid
 */
const CONFIG = {
  // Grid structure
  ROWS: 4,
  GRID_HEIGHT: 4 * (300 + 4) + 4, // rows * (tile + gap) + top gap = 1220px
  TILE_SIZE: 300, // Full native album art size
  TILE_GAP: 4,
  TILE_RADIUS: 8, // Increased for larger tiles

  // Animation (slower for ambient background effect)
  SCROLL_SPEED_BASE: 12, // pixels/second (research recommended 10-15)
  SCROLL_SPEED_VARIANCE: 0.1, // ±10% variance per row (reduced for cohesion)

  // Visual effects
  CANVAS_OPACITY: 0.75, // High visibility for prominent background
  BLUR_RADIUS: 20, // px - slightly reduced for sharper appearance
  BACKGROUND_OPACITY: 0.45, // Significantly reduced for darker, more visible albums
} as const;

/**
 * Row animation configurations (alternating directions)
 * Speed multipliers reduced for more cohesive motion
 */
const ROW_CONFIGS = [
  { direction: -1 as const, speedMultiplier: 0.95 },  // Row 0: left, slightly slower
  { direction: 1 as const, speedMultiplier: 1.0 },    // Row 1: right, normal
  { direction: -1 as const, speedMultiplier: 1.05 },  // Row 2: left, slightly faster
  { direction: 1 as const, speedMultiplier: 0.98 },   // Row 3: right, near normal
];

/**
 * Multi-row scrolling background grid displaying recent album artwork.
 * Features:
 * - 4 rows with alternating scroll directions
 * - Ambient speed (slower than foreground elements)
 * - CSS blur overlay for background effect
 * - GPU-accelerated rendering
 */
export function ScrollingAlbumBar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const albumArtResult = useAtomValue(recentAlbumArtAtom);

  // FIX: Use single boolean + ref instead of Map to prevent animation re-runs
  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  const imagesRef = useRef<HTMLImageElement[]>([]);

  const animationFrameRef = useRef<number>();
  const rowsRef = useRef<RowState[]>([]);
  const lastTimeRef = useRef<number>(0);

  // PERFORMANCE: Precompute clipping path once
  const clipPathRef = useRef<Path2D>();

  useEffect(() => {
    const path = new Path2D();
    path.roundRect(0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_RADIUS);
    clipPathRef.current = path;
  }, []);

  // Load album artwork images (fixed to prevent animation re-runs)
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
      onSuccess: (s) => {
        const artworks = s.value as readonly AlbumArtworkData[];
        const images: HTMLImageElement[] = [];
        let loadedCount = 0;

        artworks.forEach((artwork) => {
          const img = new Image();
          img.crossOrigin = "anonymous";

          img.onload = () => {
            images.push(img);
            loadedCount++;

            // CRITICAL FIX: Single state update when ALL images loaded
            if (loadedCount === artworks.length) {
              imagesRef.current = images;
              setIsLoadingComplete(true);
            }
          };

          img.onerror = () => {
            console.error(`Failed to load image for play ${artwork.id}`);
            loadedCount++;

            // Still complete if this was the last image
            if (loadedCount === artworks.length && images.length > 0) {
              imagesRef.current = images;
              setIsLoadingComplete(true);
            }
          };

          // Use full-size image for better quality at 300x300
          img.src = artwork.imageUri;
        });
      },
    });
  }, [albumArtResult]);

  // Initialize rows when images are loaded
  useEffect(() => {
    if (!isLoadingComplete || imagesRef.current.length === 0) return;

    const images = imagesRef.current;
    const imagesPerRow = Math.ceil(images.length / CONFIG.ROWS);

    // Create rows with alternating scroll directions
    rowsRef.current = Array.from({ length: CONFIG.ROWS }, (_, rowIndex) => {
      const config = ROW_CONFIGS[rowIndex];
      const startIndex = rowIndex * imagesPerRow;
      const endIndex = Math.min(startIndex + imagesPerRow, images.length);
      const rowImages = images.slice(startIndex, endIndex);

      // Add variance to speed for more organic feel
      const speedVariance = (Math.random() - 0.5) * 2 * CONFIG.SCROLL_SPEED_VARIANCE;
      const speed = CONFIG.SCROLL_SPEED_BASE * config.speedMultiplier * (1 + speedVariance);

      return {
        offsetX: 0,
        direction: config.direction,
        speed,
        images: rowImages,
      };
    });
  }, [isLoadingComplete]);

  // Canvas animation loop (only runs once when loading complete)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoadingComplete || rowsRef.current.length === 0) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = CONFIG.GRID_HEIGHT * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${CONFIG.GRID_HEIGHT}px`;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const tileWidth = CONFIG.TILE_SIZE + CONFIG.TILE_GAP;

    const animate = (currentTime: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = currentTime;
      }

      const deltaTime = (currentTime - lastTimeRef.current) / 1000;
      lastTimeRef.current = currentTime;

      // OPTIMIZATION: Clear only once instead of per-row
      ctx.clearRect(0, 0, window.innerWidth, CONFIG.GRID_HEIGHT);

      const canvasWidth = window.innerWidth;

      // Render each row
      rowsRef.current.forEach((row, rowIndex) => {
        // Update row offset
        row.offsetX += row.direction * row.speed * deltaTime;

        // Calculate row dimensions
        const rowWidth = row.images.length * tileWidth;
        const y = CONFIG.TILE_GAP + rowIndex * (CONFIG.TILE_SIZE + CONFIG.TILE_GAP);

        // Seamless loop
        if (row.direction === -1 && row.offsetX <= -rowWidth) {
          row.offsetX += rowWidth;
        } else if (row.direction === 1 && row.offsetX >= rowWidth) {
          row.offsetX -= rowWidth;
        }

        // Calculate repetitions needed
        const repetitionsNeeded = Math.ceil(canvasWidth / rowWidth) + 2;

        // Draw tiles for this row
        for (let rep = 0; rep < repetitionsNeeded; rep++) {
          row.images.forEach((img, index) => {
            const x = row.offsetX + rep * rowWidth + index * tileWidth;

            // Only draw if visible (viewport culling)
            if (x + CONFIG.TILE_SIZE >= 0 && x <= canvasWidth) {
              // OPTIMIZATION: Use precomputed clip path
              ctx.save();
              ctx.translate(x, y);
              if (clipPathRef.current) {
                ctx.clip(clipPathRef.current);
              }
              ctx.drawImage(img, 0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
              ctx.restore();
            }
          });
        }
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener("resize", resizeCanvas);
      lastTimeRef.current = 0;
    };
  }, [isLoadingComplete]);

  return (
    <div className="album-grid-background fixed top-0 left-0 right-0 -z-10 overflow-hidden">
      <div className="relative w-full" style={{ height: CONFIG.GRID_HEIGHT }}>
        {/* Canvas layer - renders album tiles (no blur) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ opacity: CONFIG.CANVAS_OPACITY }}
        />

        {/* CSS blur overlay */}
        <div
          className="album-grid-blur absolute inset-0 bg-background pointer-events-none"
          style={{
            opacity: CONFIG.BACKGROUND_OPACITY,
            backdropFilter: `blur(${CONFIG.BLUR_RADIUS}px)`,
            WebkitBackdropFilter: `blur(${CONFIG.BLUR_RADIUS}px)`,
          }}
        />

        {/* Scrim gradient for text contrast (WCAG compliance) */}
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
    </div>
  );
}
