/**
 * PhysicalMediaGallery
 *
 * Orchestrates display of AI-generated visual assets as physical media artifacts.
 * Era-contextual rendering: vinyl sleeves, CD cases, cassettes based on release year.
 *
 * Architecture:
 * - Graceful absence: returns null when no assets (no placeholder noise)
 * - Progressive enhancement: loading states feel like developing photos
 * - Discogs-inspired: thumbnail strip for multiple assets
 *
 * @module
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { VinylSleeve } from "./VinylSleeve";
import type { Era } from "@/components/insights/eraVisualSystem";

// ============================================================================
// Types
// ============================================================================

export type MediaFormat = "vinyl" | "cd" | "cassette" | "78rpm" | "digital";

/**
 * Generated asset from the API
 * Asset types and placements are semantic strings - model-derived, not hardcoded
 */
export interface GeneratedAsset {
  readonly id: string;
  readonly play_id: number;
  readonly asset_type: string; // Semantic: liner_note, gatefold, insert, character, etc.
  readonly image_url: string;
  readonly thumbnail_url?: string;
  readonly metadata: {
    readonly era?: string;
    readonly style?: string;
    readonly placement?: string; // Semantic: front, back, inner, gatefold_left, etc.
    readonly page_number?: number;
    readonly mood?: string;
    readonly description?: string;
  };
  readonly created_at: string;
}

interface AlbumPalette {
  readonly dominant: string;
  readonly accent: string;
  readonly temperature: "warm" | "cool" | "neutral";
}

export interface PhysicalMediaGalleryProps {
  /** Play ID for tracking */
  playId: number;
  /** Album/track title */
  albumTitle: string;
  /** Artist name */
  artistName: string;
  /** Original album art URL (used as front if no enhanced version) */
  originalArtUrl?: string | null;
  /** Era for styling context */
  era: Era;
  /** Release year for format selection */
  releaseYear: number | null;
  /** Album palette for theming */
  albumPalette: AlbumPalette;
  /** Generated assets to display */
  assets: readonly GeneratedAsset[];
  /** Loading state */
  isLoading?: boolean;
  /** Optional className */
  className?: string;
}

// ============================================================================
// Format Selection Logic
// ============================================================================

/**
 * Determine the appropriate physical media format based on release year
 */
const getMediaFormat = (year: number | null, era: Era): MediaFormat => {
  if (!year) {
    // Default based on era
    if (era === "pre-vinyl") return "78rpm";
    if (era === "streaming" || era === "contemporary") return "vinyl"; // Vinyl revival
    return "vinyl";
  }

  if (year < 1950) return "78rpm";
  if (year < 1983) return "vinyl";
  if (year < 1992) return "vinyl"; // Vinyl still dominant
  if (year < 2003) return "cd"; // Peak CD era
  if (year < 2010) return "cd"; // Late CD
  return "vinyl"; // Modern vinyl revival aesthetic
};

// ============================================================================
// Asset Organization
// ============================================================================

interface OrganizedAssets {
  front: GeneratedAsset | null;
  back: GeneratedAsset | null;
  inner: GeneratedAsset | null;
  bookletPages: GeneratedAsset[];
  others: GeneratedAsset[];
}

/**
 * Organize assets by placement for physical media layout
 */
const organizeAssets = (assets: readonly GeneratedAsset[]): OrganizedAssets => {
  const result: OrganizedAssets = {
    front: null,
    back: null,
    inner: null,
    bookletPages: [],
    others: [],
  };

  for (const asset of assets) {
    switch (asset.metadata.placement) {
      case "front":
        if (!result.front) result.front = asset;
        else result.others.push(asset);
        break;
      case "back":
        if (!result.back) result.back = asset;
        else result.others.push(asset);
        break;
      case "inner":
        if (!result.inner) result.inner = asset;
        else result.others.push(asset);
        break;
      case "booklet_page":
        result.bookletPages.push(asset);
        break;
      default:
        result.others.push(asset);
    }
  }

  // Sort booklet pages by page number
  result.bookletPages.sort(
    (a, b) => (a.metadata.page_number ?? 0) - (b.metadata.page_number ?? 0)
  );

  return result;
};

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Thumbnail strip for multiple assets (Discogs-style)
 */
const AssetThumbnailStrip = ({
  assets,
  activeIndex,
  onSelect,
}: {
  assets: readonly GeneratedAsset[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) => {
  if (assets.length <= 1) return null;

  return (
    <div className="flex gap-2 mt-4 justify-center">
      {assets.map((asset, index) => (
        <button
          key={asset.id}
          onClick={() => onSelect(index)}
          className={cn(
            "w-12 h-12 rounded overflow-hidden transition-all duration-200",
            "ring-2 ring-offset-2 ring-offset-background",
            index === activeIndex
              ? "ring-primary scale-105"
              : "ring-transparent hover:ring-foreground/30 opacity-60 hover:opacity-100"
          )}
          aria-label={`View asset ${index + 1} of ${assets.length}`}
        >
          <img
            src={asset.thumbnail_url || asset.image_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );
};

/**
 * Format indicator badge
 */
const FormatBadge = ({ format }: { format: MediaFormat }) => {
  const labels: Record<MediaFormat, string> = {
    vinyl: "12\" LP",
    cd: "Compact Disc",
    cassette: "Cassette",
    "78rpm": "78 RPM",
    digital: "Digital",
  };

  return (
    <div className="media-format-badge inline-flex items-center gap-1.5 px-2 py-1 rounded-sm bg-foreground/5 text-foreground/50">
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {labels[format]}
    </div>
  );
};

/**
 * Section header with catalog aesthetic
 */
const GalleryHeader = ({
  format,
  assetCount,
  palette,
}: {
  format: MediaFormat;
  assetCount: number;
  palette: AlbumPalette;
}) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-3">
      <span
        className="text-[10px] uppercase tracking-[0.2em] font-medium"
        style={{
          color: `${palette.dominant}80`,
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        Physical Media
      </span>
      <span
        className="w-1 h-1 rounded-full"
        style={{ backgroundColor: `${palette.accent}60` }}
      />
      <FormatBadge format={format} />
    </div>
    {assetCount > 1 && (
      <span className="text-[10px] text-foreground/40">
        {assetCount} views
      </span>
    )}
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export const PhysicalMediaGallery = ({
  playId: _playId,
  albumTitle,
  artistName,
  originalArtUrl,
  era,
  releaseYear,
  albumPalette,
  assets,
  isLoading = false,
  className,
}: PhysicalMediaGalleryProps) => {
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);

  // Graceful absence: no assets and not loading = render nothing
  if (!isLoading && assets.length === 0 && !originalArtUrl) {
    return null;
  }

  const format = useMemo(
    () => getMediaFormat(releaseYear, era),
    [releaseYear, era]
  );

  const organized = useMemo(() => organizeAssets(assets), [assets]);

  // Build the list of viewable assets
  const allViewableAssets = useMemo(() => {
    const list: GeneratedAsset[] = [];
    if (organized.front) list.push(organized.front);
    if (organized.back) list.push(organized.back);
    if (organized.inner) list.push(organized.inner);
    list.push(...organized.bookletPages);
    list.push(...organized.others);
    return list;
  }, [organized]);

  // Get current asset URLs for the sleeve
  const frontUrl = organized.front?.image_url || originalArtUrl || "";
  const backUrl = organized.back?.image_url;
  const innerUrl = organized.inner?.image_url;

  // Don't render if we only have original art and no generated content
  // (the original art is already shown in the hero section)
  if (!isLoading && assets.length === 0) {
    return null;
  }

  return (
    <div className={cn("relative py-6", className)}>
      {/* Section divider */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${albumPalette.dominant}15 20%, ${albumPalette.dominant}15 80%, transparent 100%)`,
        }}
      />

      <GalleryHeader
        format={format}
        assetCount={allViewableAssets.length}
        palette={albumPalette}
      />

      {/* Main artifact display */}
      <div className="flex justify-center">
        {format === "vinyl" || format === "78rpm" ? (
          <VinylSleeve
            frontImage={frontUrl}
            {...(backUrl ? { backImage: backUrl } : {})}
            {...(innerUrl ? { innerImage: innerUrl } : {})}
            palette={albumPalette}
            era={era}
            releaseYear={releaseYear}
            albumTitle={albumTitle}
            artistName={artistName}
            size="lg"
            isLoading={isLoading}
          />
        ) : format === "cd" ? (
          // CD case placeholder - can be implemented as CDCase component
          <div className="relative w-72 h-72">
            <div className="absolute inset-0 rounded-sm bg-gradient-to-br from-neutral-800 to-neutral-900 shadow-xl overflow-hidden">
              {/* Jewel case effect */}
              <div className="absolute inset-0 cd-case-reflection" />
              <img
                src={frontUrl}
                alt={`${albumTitle} CD`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Spine highlight */}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-r from-white/10 to-transparent" />
            </div>
            <FormatBadge format="cd" />
          </div>
        ) : format === "cassette" ? (
          // Cassette placeholder - can be implemented as CassetteTape component
          <div className="relative w-64 h-40">
            <div className="absolute inset-0 rounded bg-neutral-800 shadow-xl overflow-hidden cassette-shell">
              <img
                src={frontUrl}
                alt={`${albumTitle} cassette`}
                className="w-full h-full object-cover opacity-90"
                loading="lazy"
              />
            </div>
          </div>
        ) : (
          // Digital/fallback
          <VinylSleeve
            frontImage={frontUrl}
            {...(backUrl ? { backImage: backUrl } : {})}
            palette={albumPalette}
            era={era}
            releaseYear={releaseYear}
            albumTitle={albumTitle}
            artistName={artistName}
            size="lg"
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Thumbnail strip for multiple views */}
      {allViewableAssets.length > 1 && (
        <AssetThumbnailStrip
          assets={allViewableAssets}
          activeIndex={activeAssetIndex}
          onSelect={setActiveAssetIndex}
        />
      )}

      {/* Liner notes callout */}
      {organized.back && (
        <p className="text-center text-xs text-foreground/40 mt-4 italic">
          Click to flip and read the liner notes
        </p>
      )}
    </div>
  );
};

export default PhysicalMediaGallery;
