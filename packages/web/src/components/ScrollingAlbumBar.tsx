import { useAtomValue, Result } from "@effect-atom/atom-react";
import { useEffect, useRef, useState, useCallback } from "react";
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
 * Tile metadata for position tracking and highlighting
 */
interface TileMetadata {
  id: number;
  x: number;
  y: number;
  rowIndex: number;
  imageIndex: number;
  highlighted: boolean;
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
  BLUR_RADIUS: 20, // px - target blur for loaded state
  BLUR_RADIUS_INITIAL: 40, // px - initial heavy blur
  BACKGROUND_OPACITY: 0.45, // Significantly reduced for darker, more visible albums

  // Progressive loading & fade-in
  MIN_IMAGES_TO_START: 10, // Start rendering after 10 images load
  FADE_IN_DURATION: 800, // ms - blur fade-in duration
  BLUR_FADE_DELAY: 200, // ms - delay before starting blur fade
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
 * - Progressive image loading with blur fade-in
 * - Static/animated mode toggle
 * - Tile position tracking for highlighting
 */
export function ScrollingAlbumBar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const albumArtResult = useAtomValue(recentAlbumArtAtom);

  // Progressive loading state
  const [loadedImageCount, setLoadedImageCount] = useState(0);
  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  const [canRender, setCanRender] = useState(false);

  // Animation control
  const [isAnimating, setIsAnimating] = useState(true);

  // Blur fade-in state
  const [currentBlur, setCurrentBlur] = useState(CONFIG.BLUR_RADIUS_INITIAL);
  const [canvasOpacity, setCanvasOpacity] = useState(0);

  // Image storage
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const artworkDataRef = useRef<AlbumArtworkData[]>([]);

  // Animation refs
  const animationFrameRef = useRef<number>();
  const rowsRef = useRef<RowState[]>([]);
  const lastTimeRef = useRef<number>(0);

  // Tile tracking for highlighting
  const tilesRef = useRef<Map<number, TileMetadata>>(new Map());
  const highlightedTilesRef = useRef<Set<number>>(new Set());

  // PERFORMANCE: Precompute clipping path once
  const clipPathRef = useRef<Path2D>();

  useEffect(() => {
    const path = new Path2D();
    path.roundRect(0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_RADIUS);
    clipPathRef.current = path;
  }, []);

  // API: Control animation
  const pauseAnimation = useCallback(() => {
    setIsAnimating(false);
  }, []);

  const resumeAnimation = useCallback(() => {
    setIsAnimating(true);
  }, []);

  const toggleAnimation = useCallback(() => {
    setIsAnimating((prev) => !prev);
  }, []);

  // API: Highlight tiles
  const highlightTile = useCallback((id: number) => {
    highlightedTilesRef.current.add(id);
  }, []);

  const unhighlightTile = useCallback((id: number) => {
    highlightedTilesRef.current.delete(id);
  }, []);

  const clearHighlights = useCallback(() => {
    highlightedTilesRef.current.clear();
  }, []);

  // Expose API via ref (for external control)
  useEffect(() => {
    // Store methods on canvas ref for external access
    if (canvasRef.current) {
      (canvasRef.current as any).albumBarAPI = {
        pauseAnimation,
        resumeAnimation,
        toggleAnimation,
        highlightTile,
        unhighlightTile,
        clearHighlights,
        getTiles: () => Array.from(tilesRef.current.values()),
      };
    }
  }, [pauseAnimation, resumeAnimation, toggleAnimation, highlightTile, unhighlightTile, clearHighlights]);

  // Load album artwork images with progressive rendering
  useEffect(() => {
    Result.matchWithWaiting(albumArtResult, {
      onWaiting: () => {
        setIsLoadingComplete(false);
        setCanRender(false);
        setLoadedImageCount(0);
        setCurrentBlur(CONFIG.BLUR_RADIUS_INITIAL);
        setCanvasOpacity(0);
      },
      onError: (error) => {
        console.error("Failed to load album artwork:", error);
      },
      onDefect: (error) => {
        console.error("Defect loading album artwork:", error);
      },
      onSuccess: (s) => {
        const artworks = s.value as readonly AlbumArtworkData[];
        artworkDataRef.current = [...artworks];

        const loadedImages: (HTMLImageElement | null)[] = new Array(artworks.length).fill(null);
        let loadedCount = 0;
        let hasStartedRendering = false;

        // OPTIMIZATION: Worker-based preloading to warm browser cache
        // This runs in parallel with image loading and helps subsequent loads
        // Note: We don't wait for this - it's fire-and-forget cache warming
        const imageUrls = artworks.map((a) => a.imageUri);
        // TODO: Optionally integrate worker preloading here
        // This would require importing AlbumBarWorkerClient and calling preloadImages
        // For now, progressive loading provides the main performance benefit

        artworks.forEach((artwork, index) => {
          const img = new Image();
          img.crossOrigin = "anonymous";

          img.onload = () => {
            loadedImages[index] = img;
            loadedCount++;

            // Update progress
            setLoadedImageCount(loadedCount);

            // Update images ref with current loaded images
            imagesRef.current = loadedImages.filter((img): img is HTMLImageElement => img !== null);

            // Start rendering after MIN_IMAGES_TO_START images load
            if (!hasStartedRendering && loadedCount >= CONFIG.MIN_IMAGES_TO_START) {
              hasStartedRendering = true;
              setCanRender(true);
            }

            // Mark complete when all loaded
            if (loadedCount === artworks.length) {
              setIsLoadingComplete(true);
            }
          };

          img.onerror = () => {
            console.error(`Failed to load image for play ${artwork.id}`);
            loadedCount++;
            setLoadedImageCount(loadedCount);

            // Start rendering even with some failures
            if (!hasStartedRendering && loadedCount >= CONFIG.MIN_IMAGES_TO_START && imagesRef.current.length > 0) {
              hasStartedRendering = true;
              setCanRender(true);
            }

            // Still complete if this was the last image
            if (loadedCount === artworks.length && imagesRef.current.length > 0) {
              setIsLoadingComplete(true);
            }
          };

          // Use full-size image for better quality at 300x300
          img.src = artwork.imageUri;
        });
      },
    });
  }, [albumArtResult]);

  // Blur fade-in effect when rendering starts
  useEffect(() => {
    if (!canRender) return;

    // Delay slightly before starting fade
    const delayTimer = setTimeout(() => {
      // Fade in canvas opacity
      const opacityStart = 0;
      const opacityEnd = CONFIG.CANVAS_OPACITY;
      const blurStart = CONFIG.BLUR_RADIUS_INITIAL;
      const blurEnd = CONFIG.BLUR_RADIUS;
      const startTime = performance.now();

      const fadeIn = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / CONFIG.FADE_IN_DURATION, 1);

        // Ease-out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 3);

        // Update opacity and blur
        setCanvasOpacity(opacityStart + (opacityEnd - opacityStart) * eased);
        setCurrentBlur(blurStart + (blurEnd - blurStart) * eased);

        if (progress < 1) {
          requestAnimationFrame(fadeIn);
        }
      };

      requestAnimationFrame(fadeIn);
    }, CONFIG.BLUR_FADE_DELAY);

    return () => clearTimeout(delayTimer);
  }, [canRender]);

  // Initialize/update rows as images load progressively
  useEffect(() => {
    if (!canRender || imagesRef.current.length === 0) return;

    const images = imagesRef.current;
    const imagesPerRow = Math.ceil(images.length / CONFIG.ROWS);

    // If rows don't exist yet, create them
    if (rowsRef.current.length === 0) {
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
    } else {
      // Update existing rows with new images as they load
      rowsRef.current.forEach((row, rowIndex) => {
        const startIndex = rowIndex * imagesPerRow;
        const endIndex = Math.min(startIndex + imagesPerRow, images.length);
        row.images = images.slice(startIndex, endIndex);
      });
    }
  }, [canRender, loadedImageCount]);

  // Canvas animation loop with static/animated mode support
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canRender || rowsRef.current.length === 0) return;

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

      // Clear tile tracking for this frame
      tilesRef.current.clear();

      // Render each row
      rowsRef.current.forEach((row, rowIndex) => {
        // Update row offset ONLY if animating
        if (isAnimating) {
          row.offsetX += row.direction * row.speed * deltaTime;
        }

        // Calculate row dimensions
        const rowWidth = row.images.length * tileWidth;
        const y = CONFIG.TILE_GAP + rowIndex * (CONFIG.TILE_SIZE + CONFIG.TILE_GAP);

        // Seamless loop (only if animating)
        if (isAnimating) {
          if (row.direction === -1 && row.offsetX <= -rowWidth) {
            row.offsetX += rowWidth;
          } else if (row.direction === 1 && row.offsetX >= rowWidth) {
            row.offsetX -= rowWidth;
          }
        }

        // Calculate repetitions needed
        const repetitionsNeeded = Math.ceil(canvasWidth / rowWidth) + 2;

        // Draw tiles for this row
        for (let rep = 0; rep < repetitionsNeeded; rep++) {
          row.images.forEach((img, index) => {
            const x = row.offsetX + rep * rowWidth + index * tileWidth;

            // Only draw if visible (viewport culling)
            if (x + CONFIG.TILE_SIZE >= 0 && x <= canvasWidth) {
              // Calculate artwork ID from artworkDataRef
              const absoluteIndex = rowIndex * Math.ceil(imagesRef.current.length / CONFIG.ROWS) + index;
              const artworkId = absoluteIndex < artworkDataRef.current.length
                ? artworkDataRef.current[absoluteIndex].id
                : -1;

              // Track tile position
              if (artworkId !== -1) {
                tilesRef.current.set(artworkId, {
                  id: artworkId,
                  x,
                  y,
                  rowIndex,
                  imageIndex: index,
                  highlighted: highlightedTilesRef.current.has(artworkId),
                });
              }

              // Apply highlighting effect
              const isHighlighted = artworkId !== -1 && highlightedTilesRef.current.has(artworkId);

              ctx.save();
              ctx.translate(x, y);

              // Add glow for highlighted tiles
              if (isHighlighted) {
                ctx.shadowColor = "rgba(245, 130, 22, 0.8)"; // Primary color
                ctx.shadowBlur = 20;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
              }

              if (clipPathRef.current) {
                ctx.clip(clipPathRef.current);
              }

              // Draw image with optional brightness boost for highlights
              if (isHighlighted) {
                ctx.filter = "brightness(1.2) contrast(1.1)";
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
  }, [canRender, isAnimating]);

  return (
    <div className="album-grid-background fixed top-0 left-0 right-0 -z-10 overflow-hidden">
      <div className="relative w-full" style={{ height: CONFIG.GRID_HEIGHT }}>
        {/* Canvas layer - renders album tiles with dynamic opacity */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{
            opacity: canvasOpacity,
            transition: "opacity 0.3s ease-out",
          }}
        />

        {/* CSS blur overlay with dynamic blur amount */}
        <div
          className="album-grid-blur absolute inset-0 bg-background pointer-events-none"
          style={{
            opacity: CONFIG.BACKGROUND_OPACITY,
            backdropFilter: `blur(${currentBlur}px)`,
            WebkitBackdropFilter: `blur(${currentBlur}px)`,
            transition: "backdrop-filter 0.3s ease-out",
          }}
        />

        {/* Scrim gradient for text contrast (WCAG compliance) */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/50 to-background/80 pointer-events-none"
          aria-hidden="true"
        />

        {/* Loading state with progress indicator */}
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
          onSuccess: (s) => {
            const artworks = s.value as readonly AlbumArtworkData[];
            const totalCount = artworks.length;

            // Show progress during initial load
            if (loadedImageCount < totalCount && loadedImageCount > 0) {
              return (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="flex gap-2 items-center text-sm text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Loading {loadedImageCount} / {totalCount} images...
                  </div>
                </div>
              );
            }

            return null;
          },
        })}
      </div>
    </div>
  );
}
