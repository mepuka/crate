/**
 * EnhancedAlbumArt Component
 *
 * Album art with derived ambient assets.
 * The album art itself is NEVER altered - we add complementary elements
 * extracted from its visual style (glows, gradients, textures).
 *
 * Aesthetic: "Pacific Northwest Vinyl Den" - warm, analog, intimate.
 *
 * Features:
 * - Album art displayed untouched (sacred)
 * - Ambient glow derived from album's color palette
 * - Optional texture overlay matching album's era/style
 * - All effects are subtle, seamless, fast (pre-computed)
 */

import { cn } from "@/lib/utils";
import { forwardRef, memo, useMemo } from "react";
import { AlbumArt } from "../AlbumArt";

// ============================================================================
// Types
// ============================================================================

/** Derived style assets from album art analysis */
export interface DerivedStyle {
  /** Dominant color from album art palette */
  glowColor?: string;
  /** CSS gradient for ambient background */
  backgroundGradient?: string;
  /** Texture type matching album era */
  textureType?: "grain" | "noise" | "paper" | "none";
  /** Color temperature */
  temperature?: "warm" | "cool" | "neutral";
}

interface EnhancedAlbumArtProps {
  /** Album art URL (displayed untouched) */
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
  isNewMusic?: boolean;
  /** Pre-computed derived style from backend */
  derivedStyle?: DerivedStyle;
  /** Enable ambient glow effect */
  enableGlow?: boolean;
  /** Enable subtle texture overlay */
  enableTexture?: boolean;
}

// ============================================================================
// Texture SVG data URIs (pre-baked for performance)
// ============================================================================

const TEXTURES = {
  grain: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
  noise: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.6' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
  paper: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.4' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
} as const;

// ============================================================================
// Component
// ============================================================================

export const EnhancedAlbumArt = memo(
  forwardRef<HTMLDivElement, EnhancedAlbumArtProps>(
    (
      {
        src,
        alt,
        size = 120,
        className,
        isNewMusic = false,
        derivedStyle,
        enableGlow = true,
        enableTexture = true,
      },
      ref
    ) => {
      // Compute glow style from derived palette
      const glowStyle = useMemo(() => {
        if (!enableGlow || !derivedStyle?.glowColor) return undefined;
        return {
          background: `radial-gradient(circle, ${derivedStyle.glowColor}40 0%, transparent 70%)`,
        };
      }, [enableGlow, derivedStyle?.glowColor]);

      // Default warm glow if no derived style
      const defaultGlowStyle = useMemo(() => {
        if (!enableGlow || derivedStyle?.glowColor) return undefined;
        // Fallback to KEXP warm orange
        return {
          background: "radial-gradient(circle, hsl(28 80% 50% / 0.25) 0%, transparent 70%)",
        };
      }, [enableGlow, derivedStyle?.glowColor]);

      const textureType = derivedStyle?.textureType || "grain";
      const showTexture = enableTexture && textureType !== "none";

      return (
        <div
          ref={ref}
          className={cn("enhanced-album-art relative", className)}
          style={{ width: size, height: size }}
        >
          {/* Ambient glow layer (behind art) */}
          {enableGlow && (
            <div
              className="absolute -inset-2 -z-10 rounded-xl opacity-40 blur-xl"
              style={glowStyle || defaultGlowStyle}
            />
          )}

          {/* Album art - untouched, sacred */}
          <AlbumArt
            src={src}
            alt={alt}
            size={size}
            isNewMusic={isNewMusic}
          />

          {/* Subtle texture overlay (on top, very low opacity) */}
          {showTexture && (
            <div
              className="absolute inset-0 pointer-events-none opacity-15 mix-blend-overlay rounded"
              style={{ backgroundImage: TEXTURES[textureType] }}
            />
          )}
        </div>
      );
    }
  )
);

EnhancedAlbumArt.displayName = "EnhancedAlbumArt";

// ============================================================================
// Style metadata (used by backend for auto-selection)
// ============================================================================

export type EnhancementStyle =
  | "lo-fi-indie"
  | "concert-poster"
  | "vinyl-sleeve"
  | "synth-pop-retro"
  | "pnw-local"
  | "minimal";

export const STYLE_METADATA: Record<
  EnhancementStyle,
  { label: string; description: string }
> = {
  "lo-fi-indie": {
    label: "Lo-Fi Indie",
    description: "Warm analog, SubPop 90s vibes",
  },
  "concert-poster": {
    label: "Concert Poster",
    description: "Screen-printed venue poster",
  },
  "vinyl-sleeve": {
    label: "Vinyl Sleeve",
    description: "Tactile record store feel",
  },
  "synth-pop-retro": {
    label: "Synth-Pop",
    description: "Retro-futuristic neon",
  },
  "pnw-local": {
    label: "PNW Local",
    description: "Misty forest textures",
  },
  minimal: {
    label: "Minimal",
    description: "Subtle warmth only",
  },
};
