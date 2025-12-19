/**
 * LinerNoteGallery - Algorithmically Arranged Liner Notes
 *
 * Creates an engaging, magazine-style layout that weaves together:
 * - Visual liner note cards (narratives as art)
 * - Playful assets (vinyl labels, polaroids, catalog cards)
 * - Traditional insight blocks
 *
 * Design Philosophy: "The Art Speaks First"
 * - Algorithmic layout ensures visual balance and rhythm
 * - Typography follows modular scale (1.25 Major Third)
 * - 8px baseline grid maintains vertical rhythm
 * - Design guardrails ensure authentic content takes precedence
 */

import { useMemo } from "react";
import { Insights } from "@crate/domain";
import { cn } from "@/lib/utils";
import { InsightBlock } from "./InsightBlock";
import { VisualLinerNote } from "./VisualLinerNote";
import {
  VinylLabel,
  PolaroidMoment,
  CatalogCard,
  RecordStoreTag,
  BackstagePass,
  WaxSeal,
} from "./LinerNoteAssets";
import { MessageSquareQuote } from "lucide-react";
import {
  computeLayout,
  getEraTypography,
  DESIGN_GUARDRAILS,
  type AlbumContext,
  type LayoutItem,
} from "./linerNoteLayout";

// ============================================================================
// Types
// ============================================================================

interface LinerNoteGalleryProps {
  insights: Insights.Insight[];
  comment?: string | null;
  artistName?: string;
  trackTitle?: string;
  albumTitle?: string;
  releaseYear?: number | null;
  playCount?: number;
  isLocal?: boolean;
  airdate?: Date;
  albumPalette?: {
    dominant: string;
    accent: string;
    temperature: "warm" | "cool" | "neutral";
  };
  className?: string;
}

interface GalleryItem {
  type: "insight" | "visual" | "asset" | "comment";
  content: React.ReactNode;
  layoutItem: LayoutItem;
  key: string;
}

// ============================================================================
// Era Detection
// ============================================================================

/**
 * Detect album era from release year for typography matching
 */
function detectEra(year: number | null | undefined): AlbumContext["era"] {
  if (!year) return "modern";
  if (year < 1980) return "vintage";
  if (year < 2000) return "classic";
  if (year < 2015) return "modern";
  return "contemporary";
}

// ============================================================================
// Asset Generation Logic
// ============================================================================

interface AssetDefinition {
  id: string;
  priority: number;
  content: React.ReactNode;
}

/**
 * Generate contextual assets based on available insights
 * Respects DESIGN_GUARDRAILS.maxAssetRatio
 */
const generateAssets = (
  insights: Insights.Insight[],
  meta: {
    artistName?: string;
    trackTitle?: string;
    playCount?: number;
    isLocal?: boolean;
  },
  palette: { dominant: string; accent: string; temperature: "warm" | "cool" | "neutral" }
): AssetDefinition[] => {
  const assets: AssetDefinition[] = [];

  // Find specific insight types for asset generation
  const playHistory = insights.find((i) => i._tag === "PlayHistory") as
    | Extract<Insights.Insight, { _tag: "PlayHistory" }>
    | undefined;
  const concert = insights.find((i) => i._tag === "Concert") as
    | Extract<Insights.Insight, { _tag: "Concert" }>
    | undefined;
  const djRec = insights.find((i) => i._tag === "DJRecommendation") as
    | Extract<Insights.Insight, { _tag: "DJRecommendation" }>
    | undefined;
  const discoveryArc = insights.find((i) => i._tag === "DiscoveryArc") as
    | Extract<Insights.Insight, { _tag: "DiscoveryArc" }>
    | undefined;

  // Vinyl Label - if we have play history or play count (high priority)
  if (playHistory || meta.playCount) {
    const plays = playHistory?.totalPlays ?? meta.playCount ?? 0;
    if (plays > 10) {
      assets.push({
        id: "vinyl-label",
        priority: 6,
        content: (
          <div className="flex justify-center py-liner-2">
            <VinylLabel
              artistName={meta.artistName ?? "Unknown Artist"}
              trackTitle={meta.trackTitle ?? "Unknown Track"}
              playCount={plays}
              palette={{ accent: palette.dominant }}
              size="md"
            />
          </div>
        ),
      });
    }
  }

  // Catalog Card - archival feel (medium-high priority)
  if (playHistory?.firstPlay && playHistory?.lastPlay) {
    assets.push({
      id: "catalog-card",
      priority: 5,
      content: (
        <div className="flex justify-center py-liner-2">
          <CatalogCard
            title={meta.trackTitle ?? "Track"}
            artist={meta.artistName ?? "Artist"}
            entries={[
              { label: "First Play", value: new Date(playHistory.firstPlay.date).toLocaleDateString() },
              { label: "Last Play", value: new Date(playHistory.lastPlay.date).toLocaleDateString() },
              { label: "Total", value: `${playHistory.totalPlays} spins` },
            ]}
            notes="A KEXP favorite."
            catalogId={`KEXP-${playHistory.entityMbid?.slice(0, 8) ?? "0000"}`}
            palette={{ accent: palette.dominant }}
          />
        </div>
      ),
    });
  }

  // Polaroid Moment - if we have a DJ quote (medium priority)
  if (djRec?.sourceQuote) {
    assets.push({
      id: "polaroid",
      priority: 4,
      content: (
        <div className="flex justify-center py-liner-2">
          <PolaroidMoment
            caption={djRec.sourceQuote.slice(0, 80) + (djRec.sourceQuote.length > 80 ? "..." : "")}
            gradient={`linear-gradient(135deg, ${palette.dominant}60, ${palette.accent}40)`}
            palette={{ accent: palette.accent }}
            rotation={-2}
          />
        </div>
      ),
    });
  }

  // Backstage Pass - concert insight (medium priority)
  if (concert) {
    assets.push({
      id: "backstage-pass",
      priority: 4,
      content: (
        <div className="flex justify-center py-liner-2">
          <BackstagePass
            artistName={concert.artist.name}
            venue={concert.venue ?? "Live Venue"}
            date={concert.date ? new Date(concert.date).toLocaleDateString() : "TBA"}
            palette={{ primary: "#1a1a1a", accent: palette.accent }}
          />
        </div>
      ),
    });
  }

  // Record Store Tag - local artists (low-medium priority)
  if (meta.isLocal) {
    assets.push({
      id: "local-tag",
      priority: 3,
      content: (
        <div className="flex justify-start py-liner-1">
          <RecordStoreTag
            type="local-artist"
            message="Local gem from the PNW. Support your scene!"
            staffName="KEXP DJ"
          />
        </div>
      ),
    });
  }

  // Wax Seal - for play milestones (low priority accent)
  if (discoveryArc && discoveryArc.totalPlays >= 50) {
    assets.push({
      id: "wax-seal",
      priority: 2,
      content: (
        <div className="flex justify-center py-liner-2">
          <WaxSeal
            milestone="PLAYS"
            value={discoveryArc.totalPlays}
            palette={{ accent: palette.accent }}
            size="sm"
          />
        </div>
      ),
    });
  }

  return assets;
};

// ============================================================================
// Layout Component
// ============================================================================

export const LinerNoteGallery = ({
  insights,
  comment,
  artistName,
  trackTitle,
  albumTitle: _albumTitle,
  releaseYear,
  playCount,
  isLocal,
  airdate,
  albumPalette,
  className,
}: LinerNoteGalleryProps) => {
  // Note: albumTitle reserved for future use in colophon
  const palette = albumPalette ?? {
    dominant: "#E8825B",
    accent: "#4ECDC4",
    temperature: "warm" as const,
  };

  const era = detectEra(releaseYear);
  const eraTypography = getEraTypography(era);

  // Build gallery items using algorithmic layout
  const galleryItems = useMemo(() => {
    // 1. Generate assets first
    const assetDefinitions = generateAssets(
      insights,
      {
        ...(artistName !== undefined && { artistName }),
        ...(trackTitle !== undefined && { trackTitle }),
        ...(playCount !== undefined && { playCount }),
        ...(isLocal !== undefined && { isLocal }),
      },
      palette
    );

    // 2. Compute optimal layout
    const layoutItems = computeLayout(
      insights,
      assetDefinitions.map((a) => ({ id: a.id, priority: a.priority })),
      { columns: 2, rhythm: "balanced", heroPosition: "first" }
    );

    // 3. Build gallery items from layout
    const items: GalleryItem[] = [];

    // DJ Comment always first (full width, authentic content)
    if (comment) {
      items.push({
        type: "comment",
        key: "dj-comment",
        layoutItem: {
          id: "dj-comment",
          type: "quote",
          size: "full",
          priority: 10,
          cssClass: "gallery-full",
        },
        content: (
          <div className="liner-pullquote">
            <div className="flex items-start gap-3">
              <MessageSquareQuote className="w-5 h-5 text-accent mt-1 shrink-0" />
              <div className="space-y-1">
                <p className="liner-byline">DJ Comment</p>
                <p className="font-serif text-liner-base leading-relaxed whitespace-pre-wrap">
                  {comment}
                </p>
              </div>
            </div>
          </div>
        ),
      });
    }

    // 4. Map layout items to content
    for (const layoutItem of layoutItems) {
      // Check if this is an insight
      if (layoutItem.id.startsWith("insight-")) {
        const insightIndex = parseInt(layoutItem.id.split("-").pop() ?? "0");
        const insight = insights[insightIndex];
        if (!insight) continue;

        // Narrative insights get visual treatment
        const isNarrative = DESIGN_GUARDRAILS.authenticContentTypes.includes(
          insight._tag as (typeof DESIGN_GUARDRAILS.authenticContentTypes)[number]
        );

        if (layoutItem.type === "hero" || (isNarrative && layoutItem.size === "full")) {
          items.push({
            type: "visual",
            key: layoutItem.id,
            layoutItem,
            content: (
              <VisualLinerNote
                insight={insight}
                albumPalette={palette}
              />
            ),
          });
        } else {
          items.push({
            type: "insight",
            key: layoutItem.id,
            layoutItem,
            content: <InsightBlock insight={insight} />,
          });
        }
      }
      // Check if this is an asset
      else {
        const assetDef = assetDefinitions.find((a) => a.id === layoutItem.id);
        if (assetDef) {
          items.push({
            type: "asset",
            key: layoutItem.id,
            layoutItem,
            content: assetDef.content,
          });
        }
      }
    }

    return items;
  }, [insights, comment, artistName, trackTitle, playCount, isLocal, palette]);

  return (
    <div className={cn("liner-rhythm", className)}>
      {/* Header with era-appropriate typography */}
      <header className="flex items-baseline justify-between border-b border-foreground/10 pb-liner-1">
        <h4 className={cn("liner-heading text-liner-sm uppercase tracking-widest", eraTypography)}>
          Living Liner Notes
        </h4>
        {playCount && playCount > 0 && (
          <span className="liner-data">
            {playCount.toLocaleString()} plays on KEXP
          </span>
        )}
      </header>

      {/* Gallery Grid - Uses CSS-based masonry layout */}
      <div className="liner-gallery">
        {galleryItems.map((item) => (
          <article
            key={item.key}
            className={cn(
              item.layoutItem.cssClass,
              // Add semantic classes based on content type
              item.type === "visual" && "liner-prose",
              item.type === "comment" && "liner-prose"
            )}
          >
            {item.content}
          </article>
        ))}
      </div>

      {/* Empty state with era-appropriate styling */}
      {galleryItems.length === 0 && (
        <div className="text-center py-liner-8">
          <p className={cn("font-serif text-liner-base text-muted-foreground/60 italic", eraTypography)}>
            No liner notes yet for this track.
          </p>
          {airdate && (
            <p className="liner-data mt-liner-2">
              Played on {airdate.toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Colophon - archival attribution */}
      {galleryItems.length > 0 && (
        <footer className="pt-liner-4 mt-liner-4 border-t border-foreground/5">
          <p className="liner-data text-center">
            Curated from KEXP archives
            {releaseYear && ` \u00b7 ${releaseYear}`}
          </p>
        </footer>
      )}
    </div>
  );
};

export default LinerNoteGallery;
