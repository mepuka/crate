/**
 * VinylSleeve Component
 *
 * A 12" vinyl sleeve with authentic physical media aesthetics.
 * Features flip interaction, ring wear, paper texture, and era-appropriate weathering.
 *
 * Design Philosophy:
 * - "Crate Archaeology" - lived-in artifacts, not pristine museum pieces
 * - Era-contextual weathering (more wear = older release)
 * - Album palette integration for cohesive theming
 * - CSS-only effects for performance
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Era } from "@/components/insights/eraVisualSystem";

// ============================================================================
// Types
// ============================================================================

interface WeatheringProfile {
  wear: number;      // 0-1: edge wear, corner dings
  fade: number;      // 0-1: color desaturation
  grain: number;     // 0-1: paper/print grain intensity
  yellowing: number; // 0-1: age yellowing
}

interface VinylSleeveProps {
  /** Front cover image URL */
  frontImage: string;
  /** Back cover image URL (liner notes, credits) */
  backImage?: string;
  /** Inner sleeve image (if pulled out) */
  innerImage?: string;
  /** Album palette for theming */
  palette: {
    dominant: string;
    accent: string;
    temperature: "warm" | "cool" | "neutral";
  };
  /** Era for weathering profile */
  era: Era;
  /** Release year for additional context */
  releaseYear?: number | null;
  /** Alt text for accessibility */
  albumTitle: string;
  artistName: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Loading state */
  isLoading?: boolean;
  /** Click handler for expanded view */
  onExpand?: () => void;
  className?: string;
}

// ============================================================================
// Era Weathering Profiles
// ============================================================================

const ERA_WEATHERING: Record<Era, WeatheringProfile> = {
  "pre-vinyl": { wear: 0.9, fade: 0.85, grain: 0.8, yellowing: 0.9 },
  "golden-age": { wear: 0.7, fade: 0.6, grain: 0.6, yellowing: 0.7 },
  "classic-rock": { wear: 0.5, fade: 0.4, grain: 0.5, yellowing: 0.5 },
  "new-wave": { wear: 0.35, fade: 0.3, grain: 0.3, yellowing: 0.3 },
  "grunge": { wear: 0.25, fade: 0.2, grain: 0.4, yellowing: 0.15 },
  "digital": { wear: 0.15, fade: 0.1, grain: 0.2, yellowing: 0.05 },
  "streaming": { wear: 0.08, fade: 0.05, grain: 0.1, yellowing: 0.02 },
  "contemporary": { wear: 0.05, fade: 0.02, grain: 0.08, yellowing: 0.01 },
};

const SIZE_CONFIG = {
  sm: { sleeve: "w-48 h-48", label: "text-[8px]" },
  md: { sleeve: "w-72 h-72", label: "text-[10px]" },
  lg: { sleeve: "w-96 h-96", label: "text-xs" },
} as const;

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Ring wear overlay - that distinctive circular mark from the vinyl
 */
const RingWearOverlay = ({ intensity }: { intensity: number }) => (
  <div
    className="absolute inset-0 pointer-events-none rounded-lg mix-blend-multiply"
    style={{
      background: `radial-gradient(
        circle at center,
        transparent 42%,
        rgba(0, 0, 0, ${0.02 * intensity}) 43%,
        rgba(0, 0, 0, ${0.04 * intensity}) 45%,
        rgba(0, 0, 0, ${0.03 * intensity}) 47%,
        transparent 48%
      )`,
    }}
  />
);

/**
 * Paper grain texture overlay
 */
const PaperGrainOverlay = ({ intensity }: { intensity: number }) => (
  <div
    className="absolute inset-0 pointer-events-none rounded-lg mix-blend-overlay"
    style={{
      opacity: intensity * 0.3,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
    }}
  />
);

/**
 * Corner wear effect
 */
const CornerWearOverlay = ({ intensity }: { intensity: number }) => (
  <div
    className="absolute inset-0 pointer-events-none rounded-lg"
    style={{
      background: `
        radial-gradient(circle at 0% 0%, rgba(0,0,0,${0.08 * intensity}) 0%, transparent 15%),
        radial-gradient(circle at 100% 0%, rgba(0,0,0,${0.06 * intensity}) 0%, transparent 12%),
        radial-gradient(circle at 0% 100%, rgba(0,0,0,${0.07 * intensity}) 0%, transparent 14%),
        radial-gradient(circle at 100% 100%, rgba(0,0,0,${0.09 * intensity}) 0%, transparent 16%)
      `,
    }}
  />
);

/**
 * Age yellowing filter
 */
const YellowingOverlay = ({ intensity }: { intensity: number }) => (
  <div
    className="absolute inset-0 pointer-events-none rounded-lg mix-blend-multiply"
    style={{
      backgroundColor: `rgba(255, 248, 220, ${intensity * 0.15})`,
    }}
  />
);

/**
 * Spine edge highlight (like light catching the sleeve edge)
 */
const SpineHighlight = ({ side }: { side: "left" | "right" }) => (
  <div
    className={cn(
      "absolute top-0 bottom-0 w-1 pointer-events-none",
      side === "left" ? "left-0" : "right-0"
    )}
    style={{
      background: `linear-gradient(
        to ${side === "left" ? "right" : "left"},
        rgba(255, 255, 255, 0.1) 0%,
        transparent 100%
      )`,
    }}
  />
);

/**
 * Developing photo loading effect
 */
const DevelopingLoader = () => (
  <div className="absolute inset-0 rounded-lg overflow-hidden">
    <div
      className="absolute inset-0 animate-develop"
      style={{
        background: "linear-gradient(135deg, #2a1810 0%, #1a0f0a 100%)",
      }}
    />
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-[10px] uppercase tracking-[0.3em] text-amber-900/60 font-medium">
        Developing...
      </div>
    </div>
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export const VinylSleeve = ({
  frontImage,
  backImage,
  innerImage,
  palette,
  era,
  releaseYear: _releaseYear,
  albumTitle,
  artistName,
  size = "md",
  isLoading = false,
  onExpand: _onExpand,
  className,
}: VinylSleeveProps) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isInnerPulled, setIsInnerPulled] = useState(false);

  const weathering = ERA_WEATHERING[era];
  const sizeConfig = SIZE_CONFIG[size];

  const handleFlip = useCallback(() => {
    if (backImage) {
      setIsFlipped((prev) => !prev);
    }
  }, [backImage]);

  const handlePullInner = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (innerImage) {
      setIsInnerPulled((prev) => !prev);
    }
  }, [innerImage]);

  // Calculate fade filter based on era
  const fadeFilter = `saturate(${1 - weathering.fade * 0.3}) brightness(${1 - weathering.fade * 0.1})`;

  return (
    <div
      className={cn(
        "vinyl-sleeve-container group relative perspective-1000",
        className
      )}
      style={{
        // CSS custom properties for theming
        "--sleeve-dominant": palette.dominant,
        "--sleeve-accent": palette.accent,
      } as React.CSSProperties}
    >
      {/* 3D flip container */}
      <div
        className={cn(
          "relative transition-transform duration-700 transform-style-3d cursor-pointer",
          sizeConfig.sleeve,
          isFlipped && "rotate-y-180"
        )}
        onClick={handleFlip}
        role="button"
        aria-label={`${albumTitle} by ${artistName}. ${backImage ? "Click to flip" : ""}`}
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && handleFlip()}
      >
        {/* Front face */}
        <div
          className={cn(
            "absolute inset-0 backface-hidden rounded-lg overflow-hidden",
            "shadow-xl ring-1 ring-black/10",
            "transition-shadow duration-300",
            "group-hover:shadow-2xl group-hover:ring-black/20"
          )}
          style={{ filter: fadeFilter }}
        >
          {isLoading ? (
            <DevelopingLoader />
          ) : (
            <>
              {/* Album art */}
              <img
                src={frontImage}
                alt={`${albumTitle} by ${artistName} - Front cover`}
                className="w-full h-full object-cover"
                loading="lazy"
              />

              {/* Weathering overlays */}
              <RingWearOverlay intensity={weathering.wear} />
              <PaperGrainOverlay intensity={weathering.grain} />
              <CornerWearOverlay intensity={weathering.wear} />
              <YellowingOverlay intensity={weathering.yellowing} />
              <SpineHighlight side="left" />

              {/* Subtle lift shadow on hover */}
              <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)]" />
            </>
          )}
        </div>

        {/* Back face */}
        {backImage && (
          <div
            className={cn(
              "absolute inset-0 backface-hidden rounded-lg overflow-hidden rotate-y-180",
              "shadow-xl ring-1 ring-black/10"
            )}
            style={{ filter: fadeFilter }}
          >
            <img
              src={backImage}
              alt={`${albumTitle} by ${artistName} - Back cover`}
              className="w-full h-full object-cover"
              loading="lazy"
            />

            {/* Weathering overlays */}
            <PaperGrainOverlay intensity={weathering.grain} />
            <CornerWearOverlay intensity={weathering.wear} />
            <YellowingOverlay intensity={weathering.yellowing} />
            <SpineHighlight side="right" />
          </div>
        )}
      </div>

      {/* Inner sleeve pull-out (positioned behind main sleeve) */}
      {innerImage && (
        <div
          className={cn(
            "absolute top-0 left-0 rounded-lg overflow-hidden transition-transform duration-500 ease-out cursor-pointer",
            sizeConfig.sleeve,
            isInnerPulled ? "translate-x-[60%] z-10" : "translate-x-0 -z-10"
          )}
          onClick={handlePullInner}
          role="button"
          aria-label="Pull out inner sleeve"
          tabIndex={0}
        >
          <div className="relative w-full h-full bg-neutral-900 rounded-lg overflow-hidden shadow-lg">
            <img
              src={innerImage}
              alt={`${albumTitle} - Inner sleeve`}
              className="w-full h-full object-cover opacity-90"
              loading="lazy"
            />
            {/* Inner sleeve has less weathering */}
            <PaperGrainOverlay intensity={weathering.grain * 0.5} />
          </div>
        </div>
      )}

      {/* Flip hint */}
      {backImage && !isFlipped && (
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div
            className={cn(
              "px-2 py-1 rounded-full backdrop-blur-sm",
              "bg-black/40 text-white/80",
              sizeConfig.label,
              "uppercase tracking-wider font-medium"
            )}
          >
            Flip →
          </div>
        </div>
      )}

      {/* Era badge */}
      <div
        className={cn(
          "absolute top-2 left-2 px-2 py-0.5 rounded-sm",
          "bg-black/50 backdrop-blur-sm",
          sizeConfig.label,
          "uppercase tracking-[0.15em] font-medium text-white/70"
        )}
      >
        {era.replace("-", " ")}
      </div>
    </div>
  );
};

export default VinylSleeve;
