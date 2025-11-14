import { useAtomValue, Result } from "@effect-atom/atom-react";
import { useEffect, useRef, useState } from "react";
import { recentAlbumArtAtom, type AlbumArtworkData } from "@/atoms/album-bar";

/**
 * Configuration for the scrolling album bar
 */
const CONFIG = {
  BAR_HEIGHT: 64, // Height of the bar in pixels
  TILE_SIZE: 56, // Size of each album art tile (square)
  TILE_GAP: 4, // Gap between tiles
  SCROLL_SPEED: 25, // Pixels per second
  TILE_RADIUS: 4, // Border radius for tiles
  OPACITY: 0.95, // Canvas opacity
} as const;

/**
 * Scrolling canvas-based top bar displaying recent album artwork.
 * Features smooth infinite scrolling animation with seamless looping.
 */
export function ScrollingAlbumBar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const albumArtResult = useAtomValue(recentAlbumArtAtom);
  const [loadedImages, setLoadedImages] = useState<Map<number, HTMLImageElement>>(new Map());
  const animationFrameRef = useRef<number>();
  const offsetXRef = useRef(0);

  // Load album artwork images
  useEffect(() => {
    Result.matchWithWaiting(albumArtResult, {
      onWaiting: () => {},
      onError: (error) => {
        console.error("Failed to load album artwork:", error);
      },
      onDefect: (error) => {
        console.error("Defect loading album artwork:", error);
      },
      onSuccess: (s) => {
        const artworks = s.value as readonly AlbumArtworkData[];
        const imageMap = new Map<number, HTMLImageElement>();
        let loadedCount = 0;

        artworks.forEach((artwork) => {
          const img = new Image();
          img.crossOrigin = "anonymous";

          img.onload = () => {
            imageMap.set(artwork.id, img);
            loadedCount++;

            // Update state when all images are loaded
            if (loadedCount === artworks.length) {
              setLoadedImages(new Map(imageMap));
            }
          };

          img.onerror = () => {
            console.error(`Failed to load image for play ${artwork.id}`);
            loadedCount++;

            // Still update if this was the last image (even if it failed)
            if (loadedCount === artworks.length && imageMap.size > 0) {
              setLoadedImages(new Map(imageMap));
            }
          };

          // Use thumbnail for better performance
          img.src = artwork.thumbnailUri;
        });
      },
    });
  }, [albumArtResult]);

  // Canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loadedImages.size === 0) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Set canvas size to match window width
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = CONFIG.BAR_HEIGHT * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${CONFIG.BAR_HEIGHT}px`;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const images = Array.from(loadedImages.values());
    const tileWidth = CONFIG.TILE_SIZE + CONFIG.TILE_GAP;
    const totalWidth = images.length * tileWidth;

    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      lastTime = currentTime;

      // Update scroll offset
      offsetXRef.current -= CONFIG.SCROLL_SPEED * deltaTime;

      // Loop seamlessly when we've scrolled past the first set
      if (offsetXRef.current <= -totalWidth) {
        offsetXRef.current += totalWidth;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate how many times we need to draw the pattern to fill the screen
      const canvasWidth = window.innerWidth;
      const repetitionsNeeded = Math.ceil(canvasWidth / totalWidth) + 2;

      // Draw album tiles (multiple repetitions for seamless scrolling)
      for (let rep = 0; rep < repetitionsNeeded; rep++) {
        images.forEach((img, index) => {
          const x = offsetXRef.current + rep * totalWidth + index * tileWidth;
          const y = (CONFIG.BAR_HEIGHT - CONFIG.TILE_SIZE) / 2;

          // Only draw if visible on screen
          if (x + CONFIG.TILE_SIZE >= 0 && x <= canvasWidth) {
            // Draw rounded rectangle background
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_RADIUS);
            ctx.clip();

            // Draw image
            ctx.drawImage(img, x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);

            ctx.restore();
          }
        });
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [loadedImages]);

  return (
    <div className="scrolling-album-bar fixed top-0 left-0 right-0 z-50">
      <div className="relative w-full" style={{ height: CONFIG.BAR_HEIGHT }}>
        {/* Background blur layer */}
        <div className="absolute inset-0 bg-background/80 backdrop-blur-md border-b border-border" />

        {/* Canvas layer */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ opacity: CONFIG.OPACITY }}
        />

        {/* Loading state */}
        {Result.matchWithWaiting(albumArtResult, {
          onWaiting: () => (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex gap-2 items-center text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Loading album artwork...
              </div>
            </div>
          ),
          onError: () => (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">Failed to load album artwork</span>
            </div>
          ),
          onDefect: () => (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">Error loading album artwork</span>
            </div>
          ),
          onSuccess: () => null,
        })}
      </div>
    </div>
  );
}
