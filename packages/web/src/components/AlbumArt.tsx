/**
 * AlbumArt Component
 *
 * Displays album artwork with retry logic for failed loads.
 * Uses simple React state for immediate reliability.
 *
 * Features:
 * - Automatic retry with exponential backoff (1s, 2s, 4s)
 * - Cache-busting on retries to bypass browser cache
 * - Organic gradient placeholders for missing/failed images
 * - CORS proxy for blocked domains (archive.org, kexp.org, coverartarchive.org)
 */

import { cn } from "@/lib/utils";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";

// ============================================================================
// Types
// ============================================================================

interface AlbumArtProps {
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
  isNewMusic?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

// API base URL for image proxy (empty for same-origin, full URL for cross-origin)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

// Domains that require CORS proxy (block browser requests)
const CORS_BLOCKED_DOMAINS = ["archive.org", "kexp.org", "coverartarchive.org"];

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if a URL needs to be proxied due to CORS restrictions.
 * Only archive.org, kexp.org, and coverartarchive.org are proxied.
 */
function needsProxy(url: string): boolean {
  // Simple string check is much faster than new URL()
  // We only care if the hostname *ends with* one of these domains
  return CORS_BLOCKED_DOMAINS.some((domain) => url.includes(domain));
}

/**
 * Get the proxied URL for an image that needs CORS bypass.
 * Note: The image-proxy endpoint is at /api/image-proxy
 */
function getProxiedUrl(url: string): string {
  return `${API_BASE_URL}/api/image-proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Generate organic gradient based on alt text hash.
 * Creates a consistent, desaturated placeholder that doesn't compete with real album art.
 */
function generateOrganicGradient(seed: string): string {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash = hash & hash;
  }

  // Desaturated placeholder palettes - Phase 1.3
  // Low saturation (15%) so placeholders recede visually and don't compete with real album art
  const palettes = [
    // Blue-gray gradient
    ["hsl(240, 15%, 28%)", "hsl(240, 15%, 32%)"],
    // Purple-gray gradient
    ["hsl(280, 15%, 28%)", "hsl(280, 15%, 32%)"],
    // Teal-gray gradient
    ["hsl(160, 15%, 28%)", "hsl(160, 15%, 32%)"],
    // Cyan-gray gradient
    ["hsl(200, 15%, 28%)", "hsl(200, 15%, 32%)"],
    // Magenta-gray gradient
    ["hsl(320, 15%, 28%)", "hsl(320, 15%, 32%)"],
    // Amber-gray gradient
    ["hsl(40, 15%, 28%)", "hsl(40, 15%, 32%)"],
  ];

  const paletteIndex = Math.abs(hash) % palettes.length;
  const palette = palettes[paletteIndex];

  // Random angle based on hash
  const angle = 135 + (Math.abs(hash >> 8) % 90);

  return `linear-gradient(${angle}deg, ${palette[0]}, ${palette[1]})`;
}

// ============================================================================
// Component
// ============================================================================

export function AlbumArt({
  src,
  alt,
  size = 120,
  className,
  isNewMusic = false,
}: AlbumArtProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute proxied URL (memoized to avoid recalculation)
  const imageSrc = useMemo(() => {
    if (!src) return null;
    return needsProxy(src) ? getProxiedUrl(src) : src;
  }, [src]);

  // Generate consistent gradient for placeholder
  const gradient = useMemo(() => generateOrganicGradient(alt), [alt]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Reset state when src changes
  useEffect(() => {
    setLoaded(false);
    setError(false);
    setRetryCount(0);
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
  }, [imageSrc]);

  // Handle successful load
  const handleLoad = useCallback(() => {
    setLoaded(true);
    setError(false);
  }, []);

  // Handle error with retry logic
  const handleError = useCallback(() => {
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];

      retryTimeoutRef.current = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        // Force re-render by toggling error state
        setError(false);
      }, delay);
    } else {
      // Max retries exceeded, show placeholder
      setError(true);
    }
  }, [retryCount]);

  // Build the final image URL with cache-busting for retries
  const finalImageSrc = useMemo(() => {
    if (!imageSrc) return null;
    if (retryCount === 0) return imageSrc;

    // Add cache-busting query param for retries
    const separator = imageSrc.includes("?") ? "&" : "?";
    return `${imageSrc}${separator}_retry=${retryCount}&_t=${Date.now()}`;
  }, [imageSrc, retryCount]);

  // Determine if we should show the image element
  const showImage = finalImageSrc && !error;

  return (
    <div
      className={cn(
        "album-art relative rounded overflow-hidden shrink-0",
        className
      )}
      data-new-music={isNewMusic ? "new" : undefined}
      data-loading={!loaded && showImage ? "true" : undefined}
      data-failed={error ? "true" : undefined}
      data-retry-attempt={retryCount > 0 ? retryCount : undefined}
      style={{
        width: size,
        height: size,
        background: gradient,
      }}
    >
      {/* Image element - hidden until loaded */}
      {showImage && (
        <img
          src={finalImageSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(
            "w-full h-full object-cover transition-opacity duration-200 relative z-10",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* Loading indicator - subtle spinner during retries */}
      {!loaded && showImage && retryCount > 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
