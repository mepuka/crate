/**
 * VisualLinerNote Component
 *
 * Transforms narrative insights into visual "inner sleeve" experiences.
 *
 * Design Philosophy:
 * - Text IS the artwork, not decoration on top
 * - Each insight type has a distinct visual language
 * - Colors derived from album art palette
 * - Typography feels printed, tactile, archival
 *
 * Inspired by:
 * - ECM Records' minimalist sleeve designs
 * - Reid Miles' Blue Note typography
 * - Criterion Collection booklet essays
 * - Vinyl gatefold inner sleeve stories
 */

import { useState, useMemo } from "react";
import { Insights } from "@crate/domain";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  Mic2,
  Home,
  Network,
  Maximize2,
  X,
  Quote,
  Disc3
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface VisualLinerNoteProps {
  insight: Insights.Insight;
  albumPalette?: {
    dominant: string;
    accent: string;
    temperature: "warm" | "cool" | "neutral";
  } | undefined;
  className?: string | undefined;
}

interface LinerNoteLayoutProps {
  title: string;
  subtitle?: string | undefined;
  narrative: string;
  metadata?: Array<{ label: string; value: string }> | undefined;
  quote?: string | undefined;
  palette: {
    dominant: string;
    accent: string;
    temperature: "warm" | "cool" | "neutral";
  };
  variant: "discovery" | "dj" | "local" | "connection";
}

// ============================================================================
// Layout Variants
// ============================================================================

/**
 * ECM Style: Extreme negative space, centered serif text
 * Perfect for: DiscoveryArc narratives
 */
const ECMLayout = ({
  title,
  narrative,
  metadata,
  palette
}: LinerNoteLayoutProps) => (
  <div
    className="relative w-full aspect-[4/5] overflow-hidden rounded-xl"
    style={{
      background: `linear-gradient(
        145deg,
        ${palette.dominant}08 0%,
        ${palette.dominant}15 50%,
        ${palette.accent}10 100%
      )`
    }}
  >
    {/* Paper texture overlay */}
    <div
      className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }}
    />

    {/* Content - extreme vertical centering */}
    <div className="absolute inset-0 flex flex-col justify-center px-8 py-12">
      {/* Title - small, uppercase, tracked */}
      <div className="mb-8">
        <span
          className="text-[9px] uppercase tracking-[0.35em] font-medium"
          style={{ color: `${palette.accent}90` }}
        >
          {title}
        </span>
      </div>

      {/* Narrative - serif, generous leading */}
      <p
        className="font-serif text-[15px] leading-[2] text-foreground/85 max-w-[32ch]"
        style={{ fontFamily: "'Libre Baskerville', 'Georgia', serif" }}
      >
        {narrative}
      </p>

      {/* Metadata footer - tiny, spaced */}
      {metadata && metadata.length > 0 && (
        <div className="mt-auto pt-8 flex gap-6">
          {metadata.map((item, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="text-[8px] uppercase tracking-[0.25em] text-muted-foreground/50">
                {item.label}
              </span>
              <span
                className="text-[11px] font-medium tabular-nums"
                style={{ color: palette.dominant }}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Edge accent line */}
    <div
      className="absolute left-0 top-12 bottom-12 w-[2px]"
      style={{
        background: `linear-gradient(
          to bottom,
          transparent 0%,
          ${palette.accent}40 20%,
          ${palette.accent}40 80%,
          transparent 100%
        )`
      }}
    />
  </div>
);

/**
 * Blue Note Style: Bold typography, diagonal energy
 * Perfect for: DJRecommendation with emotional context
 */
const BlueNoteLayout = ({
  title,
  subtitle,
  narrative,
  quote,
  palette
}: LinerNoteLayoutProps) => (
  <div
    className="relative w-full aspect-square overflow-hidden rounded-xl"
    style={{
      background: `linear-gradient(
        135deg,
        ${palette.dominant}20 0%,
        ${palette.dominant}05 100%
      )`
    }}
  >
    {/* Diagonal accent block */}
    <div
      className="absolute -right-20 -top-20 w-64 h-64 rotate-12 opacity-20"
      style={{ backgroundColor: palette.accent }}
    />

    {/* Content grid */}
    <div className="absolute inset-0 p-6 flex flex-col">
      {/* Header - bold, tight */}
      <div className="mb-4">
        <h3
          className="text-2xl font-bold tracking-tight leading-none"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: palette.dominant
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            className="mt-1 text-xs uppercase tracking-[0.2em]"
            style={{ color: `${palette.accent}` }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {/* Pull quote - if exists */}
      {quote && (
        <div className="mb-4 pl-4 border-l-2" style={{ borderColor: palette.accent }}>
          <Quote
            className="w-4 h-4 mb-1 opacity-40"
            style={{ color: palette.accent }}
          />
          <p
            className="text-sm italic text-foreground/70 leading-relaxed"
            style={{ fontFamily: "'Libre Baskerville', serif" }}
          >
            "{quote.slice(0, 120)}{quote.length > 120 ? '...' : ''}"
          </p>
        </div>
      )}

      {/* Narrative - flush left, ragged right */}
      <p
        className="text-[13px] leading-[1.8] text-foreground/80 flex-1"
        style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        {narrative}
      </p>

      {/* Footer mark */}
      <div className="mt-4 flex items-center gap-2">
        <Disc3 className="w-3 h-3 text-muted-foreground/40" />
        <span className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground/40">
          KEXP Liner Notes
        </span>
      </div>
    </div>
  </div>
);

/**
 * Gatefold Style: Split composition, image hint + text
 * Perfect for: LocalScene with geographic context
 */
const GatefoldLayout = ({
  title,
  narrative,
  metadata,
  palette
}: LinerNoteLayoutProps) => (
  <div
    className="relative w-full aspect-[3/2] overflow-hidden rounded-xl"
    style={{
      background: palette.temperature === "warm"
        ? `linear-gradient(90deg, ${palette.dominant}15 0%, ${palette.dominant}05 50%, transparent 100%)`
        : `linear-gradient(90deg, ${palette.dominant}10 0%, transparent 100%)`
    }}
  >
    {/* Left panel - "image zone" suggestion */}
    <div
      className="absolute left-0 top-0 bottom-0 w-1/3"
      style={{
        background: `linear-gradient(
          180deg,
          ${palette.dominant}25 0%,
          ${palette.accent}15 100%
        )`
      }}
    >
      {/* Geographic icon or texture */}
      <div className="absolute inset-0 flex items-center justify-center opacity-10">
        <Home className="w-24 h-24" style={{ color: palette.dominant }} />
      </div>

      {/* Vertical text hint */}
      <div
        className="absolute left-4 top-1/2 -translate-y-1/2 -rotate-90 origin-left"
      >
        <span
          className="text-[10px] uppercase tracking-[0.4em] whitespace-nowrap"
          style={{ color: `${palette.accent}60` }}
        >
          Pacific Northwest
        </span>
      </div>
    </div>

    {/* Right panel - text content */}
    <div className="absolute right-0 top-0 bottom-0 w-2/3 p-6 flex flex-col justify-center">
      <h3
        className="text-lg font-semibold tracking-tight mb-3"
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          color: palette.dominant
        }}
      >
        {title}
      </h3>

      <p
        className="text-sm leading-[1.9] text-foreground/75"
        style={{ fontFamily: "'Libre Baskerville', serif" }}
      >
        {narrative}
      </p>

      {metadata && metadata.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
          {metadata.map((item, i) => (
            <span
              key={i}
              className="text-[10px] text-muted-foreground/60"
            >
              {item.label}: <span className="font-medium">{item.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>

    {/* Center fold line */}
    <div
      className="absolute left-1/3 top-4 bottom-4 w-px"
      style={{ backgroundColor: `${palette.dominant}20` }}
    />
  </div>
);

/**
 * Web Style: Network diagram aesthetic
 * Perfect for: Connection insights
 */
const NetworkLayout = ({
  title,
  narrative,
  metadata,
  palette
}: LinerNoteLayoutProps) => (
  <div
    className="relative w-full aspect-[16/9] overflow-hidden rounded-xl"
    style={{
      background: `radial-gradient(
        ellipse at 30% 50%,
        ${palette.accent}15 0%,
        transparent 50%
      ), radial-gradient(
        ellipse at 70% 50%,
        ${palette.dominant}10 0%,
        transparent 50%
      )`
    }}
  >
    {/* Connection line visualization */}
    <svg
      className="absolute inset-0 w-full h-full opacity-20"
      preserveAspectRatio="none"
    >
      <line
        x1="20%" y1="50%" x2="80%" y2="50%"
        stroke={palette.accent}
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <circle cx="20%" cy="50%" r="8" fill={palette.dominant} opacity="0.5" />
      <circle cx="80%" cy="50%" r="8" fill={palette.accent} opacity="0.5" />
    </svg>

    {/* Content overlay */}
    <div className="absolute inset-0 p-6 flex flex-col justify-center items-center text-center">
      <Network
        className="w-5 h-5 mb-3 opacity-40"
        style={{ color: palette.accent }}
      />

      <h3
        className="text-base font-semibold tracking-tight mb-2"
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          color: palette.dominant
        }}
      >
        {title}
      </h3>

      <p
        className="text-[13px] leading-[1.8] text-foreground/75 max-w-md"
        style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        {narrative}
      </p>

      {metadata && metadata.length > 0 && (
        <div className="mt-3 flex gap-4 text-[10px] text-muted-foreground/50">
          {metadata.map((item, i) => (
            <span key={i}>
              {item.label} <span className="font-medium">{item.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export const VisualLinerNote = ({
  insight,
  albumPalette,
  className
}: VisualLinerNoteProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Default palette if none provided
  const palette = useMemo(() => albumPalette ?? {
    dominant: "#E8825B", // Warm terracotta
    accent: "#4ECDC4",   // Teal
    temperature: "warm" as const
  }, [albumPalette]);

  // Extract narrative content based on insight type
  const layoutProps = useMemo((): LinerNoteLayoutProps | null => {
    switch (insight._tag) {
      case "DiscoveryArc":
        return {
          title: `${insight.artist.name}'s KEXP Journey`,
          narrative: insight.narrative,
          metadata: [
            { label: "Total Plays", value: String(insight.totalPlays) },
            { label: "Debut", value: new Date(insight.firstPlay.date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) },
            { label: "Status", value: insight.currentStatus }
          ],
          palette,
          variant: "discovery"
        };

      case "DJRecommendation":
        return {
          title: insight.recommendationType.replace(/_/g, " "),
          subtitle: insight.emotionalContext ?? undefined,
          narrative: insight.narrative,
          quote: insight.sourceQuote,
          palette,
          variant: "dj"
        };

      case "LocalScene":
        return {
          title: `${insight.localContext} Scene`,
          narrative: insight.narrative,
          metadata: [
            ...(insight.labelName ? [{ label: "Label", value: insight.labelName }] : []),
            { label: "Type", value: insight.sceneType }
          ],
          palette,
          variant: "local"
        };

      case "Connection":
        if (!insight.explanation) return null;
        return {
          title: `${insight.fromArtist.name} → ${insight.toArtist.name}`,
          narrative: insight.explanation,
          metadata: [
            { label: "Via", value: insight.connectionType.replace(/_/g, " ") },
            ...(insight.viaLabel ? [{ label: "Label", value: insight.viaLabel.name }] : [])
          ],
          palette,
          variant: "connection"
        };

      default:
        return null;
    }
  }, [insight, palette]);

  // Only render for narrative-rich insight types
  if (!layoutProps) return null;

  // Choose layout based on variant
  const renderLayout = () => {
    switch (layoutProps.variant) {
      case "discovery":
        return <ECMLayout {...layoutProps} />;
      case "dj":
        return <BlueNoteLayout {...layoutProps} />;
      case "local":
        return <GatefoldLayout {...layoutProps} />;
      case "connection":
        return <NetworkLayout {...layoutProps} />;
      default:
        return null;
    }
  };

  // Icon for the insight type
  const getIcon = () => {
    switch (insight._tag) {
      case "DiscoveryArc": return <TrendingUp className="w-3.5 h-3.5" />;
      case "DJRecommendation": return <Mic2 className="w-3.5 h-3.5" />;
      case "LocalScene": return <Home className="w-3.5 h-3.5" />;
      case "Connection": return <Network className="w-3.5 h-3.5" />;
      default: return null;
    }
  };

  return (
    <div className={cn("group relative", className)}>
      {/* Compact card view */}
      <div
        className={cn(
          "relative overflow-hidden rounded-xl cursor-pointer",
          "transition-all duration-500 ease-out",
          "hover:shadow-xl hover:shadow-black/20",
          "border border-border/20 hover:border-border/40",
          isExpanded && "hidden"
        )}
        onClick={() => setIsExpanded(true)}
      >
        {renderLayout()}

        {/* Expand hint overlay */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            "bg-black/0 group-hover:bg-black/30",
            "transition-all duration-300"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full",
              "bg-white/10 backdrop-blur-sm",
              "opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100",
              "transition-all duration-300"
            )}
          >
            <Maximize2 className="w-3.5 h-3.5 text-white" />
            <span className="text-xs text-white font-medium">View Full</span>
          </div>
        </div>

        {/* Type badge */}
        <div
          className={cn(
            "absolute top-3 left-3 flex items-center gap-1.5",
            "px-2 py-1 rounded-md",
            "bg-black/40 backdrop-blur-sm",
            "text-white/80"
          )}
        >
          {getIcon()}
          <span className="text-[10px] uppercase tracking-wider font-medium">
            Visual Note
          </span>
        </div>
      </div>

      {/* Expanded modal view */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="relative max-w-2xl w-full animate-in zoom-in-95 fade-in duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {renderLayout()}

            {/* Close button */}
            <button
              onClick={() => setIsExpanded(false)}
              className={cn(
                "absolute -top-4 -right-4 p-2 rounded-full",
                "bg-white/10 backdrop-blur-sm",
                "hover:bg-white/20 transition-colors"
              )}
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Export Types for AI Generation Service
// ============================================================================

export interface LinerNoteGenerationRequest {
  insightType: "DiscoveryArc" | "DJRecommendation" | "LocalScene" | "Connection";
  narrative: string;
  title: string;
  albumArtBase64?: string;
  palette?: {
    dominant: string;
    accent: string;
    temperature: "warm" | "cool" | "neutral";
  };
}

/**
 * Prompt template for AI image generation with embedded text
 * Use with AlbumArtEnhancementService or Nano Banana Pro
 */
export const generateLinerNotePrompt = (request: LinerNoteGenerationRequest): string => {
  const basePrompt = `Create a visual liner note design in the style of classic vinyl inner sleeves.

CONTENT TO RENDER:
Title: "${request.title}"
Narrative: "${request.narrative.slice(0, 300)}${request.narrative.length > 300 ? '...' : ''}"

TYPOGRAPHY SPECIFICATIONS:
- Title: Bold sans-serif (Helvetica/Akzidenz style), 18pt, uppercase with wide tracking
- Narrative: Classic serif (Garamond/Caslon style), 11pt, generous leading (1.8)
- All text: ${request.palette?.dominant ?? "soft charcoal gray (#4A4A4A)"}

LAYOUT:
- Generous margins (ma principle - negative space is sacred)
- Text aligned left with ragged right edge
- Title separated from body by subtle horizontal rule
- Footer with small "KEXP Living Liner Notes" attribution

TEXTURE & AESTHETIC:
- Subtle paper/grain texture overlay (15% opacity)
- ${request.palette?.temperature === "warm" ? "Warm sepia undertones" : "Cool silver undertones"}
- Feel of archival quality print, not digital
- ECM Records / Blue Note aesthetic influence
- NOT commercial or polished - authentic, documentary feel

CONSTRAINTS:
- Text must be fully legible (minimum 4.5:1 contrast ratio)
- Preserve breathing room around text blocks
- No decorative elements that compete with typography
- Typography IS the design`;

  return basePrompt;
};
