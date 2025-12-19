/**
 * InsightBlock Component
 *
 * Renders individual insight types as beautiful "liner notes" cards.
 * Design philosophy: Each insight should feel like a handwritten note
 * from a knowledgeable friend, not a database record.
 */

import { Insights } from "@crate/domain";
import {
  Ticket,
  Repeat,
  AudioWaveform,
  Network,
  Link as LinkIcon,
  History,
  ExternalLink,
  MapPin,
  Calendar,
  Quote,
  TrendingUp,
  Home,
  Mic2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AlbumPalette {
  dominant: string;
  accent: string;
  temperature: "warm" | "cool" | "neutral";
}

interface InsightBlockProps {
  insight: Insights.Insight;
  albumPalette?: AlbumPalette | undefined;
}

// Default fallback palette
const DEFAULT_PALETTE: AlbumPalette = {
  dominant: "#E8825B",
  accent: "#4ECDC4",
  temperature: "warm",
};

/**
 * Base card wrapper with dynamic palette theming
 */
const InsightCard = ({
  children,
  className,
  palette,
  variant = "dominant",
}: {
  children: React.ReactNode;
  className?: string;
  palette: AlbumPalette;
  variant?: "dominant" | "accent";
}) => {
  const color = variant === "accent" ? palette.accent : palette.dominant;

  return (
    <div
      className={cn(
        "relative p-4 rounded-lg",
        "border border-border/30",
        "border-l-[3px]",
        "transition-all duration-300 ease-out",
        "hover:shadow-lg",
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${color}08 0%, transparent 50%)`,
        borderLeftColor: `${color}60`,
        // Glow on hover
        boxShadow: `0 0 0 0 ${color}00`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px -8px ${color}30`;
        (e.currentTarget as HTMLDivElement).style.borderLeftColor = `${color}90`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 0 ${color}00`;
        (e.currentTarget as HTMLDivElement).style.borderLeftColor = `${color}60`;
      }}
    >
      {children}
    </div>
  );
};

/**
 * Source quote block - the story behind the insight
 */
const SourceQuote = ({ quote, color }: { quote: string; color: string }) => (
  <blockquote
    className="mt-3 pl-3 border-l-2 text-sm text-foreground/70 italic leading-relaxed"
    style={{ borderColor: `${color}40` }}
  >
    <Quote className="inline w-3 h-3 mr-1 -mt-1" style={{ color: `${color}60` }} />
    {quote}
  </blockquote>
);

/**
 * Icon wrapper with palette coloring
 */
const IconBadge = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <div
    className="p-2 rounded-full shrink-0 transition-colors"
    style={{ backgroundColor: `${color}15` }}
  >
    <div style={{ color }}>{children}</div>
  </div>
);

export const InsightBlock = ({ insight, albumPalette }: InsightBlockProps) => {
  const palette = albumPalette ?? DEFAULT_PALETTE;

  switch (insight._tag) {
    case "Concert":
      return (
        <InsightCard palette={palette} variant="accent">
          <div className="flex items-start gap-3">
            <IconBadge color={palette.accent}>
              <Ticket className="w-4 h-4" />
            </IconBadge>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {insight.artist.name} Live
                </p>
                {insight.venue && (
                  <p className="text-xs text-foreground/70 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" />
                    {insight.venue}
                  </p>
                )}
              </div>
              {insight.date && (
                <p className="text-xs text-foreground/60 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(insight.date).toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
              {insight.sourceQuote && <SourceQuote quote={insight.sourceQuote} color={palette.accent} />}
            </div>
          </div>
        </InsightCard>
      );

    case "Cover":
      return (
        <InsightCard palette={palette} variant="dominant">
          <div className="flex items-start gap-3">
            <IconBadge color={palette.dominant}>
              <Repeat className="w-4 h-4" />
            </IconBadge>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Cover Version
                </p>
                <p className="text-xs text-foreground/70 mt-1">
                  Originally{" "}
                  <span className="font-medium" style={{ color: palette.dominant }}>
                    "{insight.original.title}"
                  </span>{" "}
                  by {insight.original.artists.map((a) => a.name).join(", ")}
                </p>
              </div>
              {insight.sourceQuote && <SourceQuote quote={insight.sourceQuote} color={palette.dominant} />}
            </div>
          </div>
        </InsightCard>
      );

    case "Sample":
      return (
        <InsightCard palette={palette} variant="accent">
          <div className="flex items-start gap-3">
            <IconBadge color={palette.accent}>
              <AudioWaveform className="w-4 h-4" />
            </IconBadge>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {insight.direction === "samples" ? "Samples" : "Sampled By"}
                </p>
                <p className="text-xs text-foreground/70 mt-1">
                  <span className="font-medium" style={{ color: palette.accent }}>
                    "{insight.sampled.title}"
                  </span>{" "}
                  by {insight.sampled.artists.map((a) => a.name).join(", ")}
                </p>
              </div>
              {insight.sourceQuote && <SourceQuote quote={insight.sourceQuote} color={palette.accent} />}
            </div>
          </div>
        </InsightCard>
      );

    case "Connection":
      return (
        <InsightCard palette={palette} variant="dominant">
          <div className="flex items-start gap-3">
            <IconBadge color={palette.dominant}>
              <Network className="w-4 h-4" />
            </IconBadge>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Connected to{" "}
                  <span style={{ color: palette.accent }}>{insight.toArtist.name}</span>
                </p>
                <p className="text-xs text-foreground/60 capitalize mt-1">
                  {insight.connectionType.replace(/_/g, " ")}
                  {insight.viaLabel && ` via ${insight.viaLabel.name}`}
                </p>
              </div>
              {insight.explanation && (
                <p className="text-sm text-foreground/80 leading-relaxed mt-2">
                  {insight.explanation}
                </p>
              )}
            </div>
          </div>
        </InsightCard>
      );

    case "Link":
      return (
        <a
          href={insight.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block group"
        >
          <InsightCard palette={palette} variant="accent" className="cursor-pointer">
            <div className="flex items-start gap-3">
              <IconBadge color={palette.accent}>
                <LinkIcon className="w-4 h-4" />
              </IconBadge>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className="text-sm font-semibold text-foreground truncate transition-colors"
                    style={{ ["--hover-color" as string]: palette.accent }}
                  >
                    {insight.title}
                  </p>
                  <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
                <p className="text-xs text-foreground/70 line-clamp-2 leading-relaxed">
                  {insight.summary}
                </p>
                <span
                  className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-medium"
                  style={{ backgroundColor: `${palette.accent}15`, color: palette.accent }}
                >
                  {insight.linkType}
                </span>
              </div>
            </div>
          </InsightCard>
        </a>
      );

    case "PlayHistory":
      return (
        <InsightCard palette={palette} variant="dominant">
          <div className="flex items-start gap-3">
            <IconBadge color={palette.dominant}>
              <History className="w-4 h-4" />
            </IconBadge>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  <span className="text-lg font-bold" style={{ color: palette.dominant }}>
                    {insight.totalPlays}
                  </span>{" "}
                  plays on KEXP
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-foreground/60">
                  {insight.firstPlay && (
                    <span>
                      First:{" "}
                      {new Date(insight.firstPlay.date).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  )}
                  {insight.lastPlay && (
                    <span>
                      Latest:{" "}
                      {new Date(insight.lastPlay.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </InsightCard>
      );

    case "DiscoveryArc":
      return (
        <InsightCard palette={palette} variant="accent">
          <div className="flex items-start gap-3">
            <IconBadge color={palette.accent}>
              <TrendingUp className="w-4 h-4" />
            </IconBadge>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {insight.artist.name}'s KEXP Journey
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-foreground/60">
                  <span>
                    <span className="font-bold" style={{ color: palette.accent }}>{insight.totalPlays}</span> plays
                  </span>
                  <span>
                    Debut: {new Date(insight.firstPlay.date).toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="capitalize">{insight.currentStatus}</span>
                </div>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {insight.narrative}
              </p>
            </div>
          </div>
        </InsightCard>
      );

    case "LocalScene":
      return (
        <InsightCard palette={palette} variant="accent">
          <div className="flex items-start gap-3">
            <IconBadge color={palette.accent}>
              <Home className="w-4 h-4" />
            </IconBadge>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  <span style={{ color: palette.accent }}>{insight.localContext}</span>{" "}
                  {insight.sceneType === "label" ? "Label" : "Scene"}
                </p>
                <p className="text-xs text-foreground/70 mt-1">
                  {insight.artist.name}
                  {insight.labelName && ` • ${insight.labelName}`}
                </p>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {insight.narrative}
              </p>
            </div>
          </div>
        </InsightCard>
      );

    case "DJRecommendation":
      return (
        <InsightCard palette={palette} variant="dominant">
          <div className="flex items-start gap-3">
            <IconBadge color={palette.dominant}>
              <Mic2 className="w-4 h-4" />
            </IconBadge>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground capitalize">
                  {insight.recommendationType.replace(/_/g, " ")}
                </p>
                {insight.emotionalContext && (
                  <p className="text-xs mt-1 capitalize" style={{ color: `${palette.dominant}90` }}>
                    {insight.emotionalContext}
                  </p>
                )}
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {insight.narrative}
              </p>
              {insight.sourceQuote && <SourceQuote quote={insight.sourceQuote} color={palette.dominant} />}
            </div>
          </div>
        </InsightCard>
      );

    default:
      return null;
  }
};
