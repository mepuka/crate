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

interface InsightBlockProps {
  insight: Insights.Insight;
}

/**
 * Base card wrapper with consistent styling
 */
const InsightCard = ({
  children,
  className,
  accentColor = "primary",
}: {
  children: React.ReactNode;
  className?: string;
  accentColor?: "primary" | "teal" | "blue" | "indigo" | "purple" | "orange";
}) => {
  const accentClasses = {
    primary: "border-l-primary/40 hover:border-l-primary/60",
    teal: "border-l-accent/40 hover:border-l-accent/60",
    blue: "border-l-blue-500/40 hover:border-l-blue-500/60",
    indigo: "border-l-indigo-500/40 hover:border-l-indigo-500/60",
    purple: "border-l-purple-500/40 hover:border-l-purple-500/60",
    orange: "border-l-orange-500/40 hover:border-l-orange-500/60",
  };

  return (
    <div
      className={cn(
        "relative p-4 rounded-lg",
        "bg-gradient-to-br from-card/80 to-card/40",
        "border border-border/30",
        "border-l-[3px]",
        accentClasses[accentColor],
        "transition-all duration-300 ease-out",
        "hover:bg-card/90 hover:shadow-lg hover:shadow-black/10",
        className
      )}
    >
      {children}
    </div>
  );
};

/**
 * Source quote block - the story behind the insight
 */
const SourceQuote = ({ quote }: { quote: string }) => (
  <blockquote className="mt-3 pl-3 border-l-2 border-primary/20 text-sm text-foreground/70 italic leading-relaxed">
    <Quote className="inline w-3 h-3 mr-1 -mt-1 text-primary/40" />
    {quote}
  </blockquote>
);

export const InsightBlock = ({ insight }: InsightBlockProps) => {
  switch (insight._tag) {
    case "Concert":
      return (
        <InsightCard accentColor="teal">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-accent/10 shrink-0">
              <Ticket className="w-4 h-4 text-accent" />
            </div>
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
              {insight.sourceQuote && <SourceQuote quote={insight.sourceQuote} />}
            </div>
          </div>
        </InsightCard>
      );

    case "Cover":
      return (
        <InsightCard accentColor="blue">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-blue-500/10 shrink-0">
              <Repeat className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Cover Version
                </p>
                <p className="text-xs text-foreground/70 mt-1">
                  Originally{" "}
                  <span className="font-medium text-foreground/90">
                    "{insight.original.title}"
                  </span>{" "}
                  by {insight.original.artists.map((a) => a.name).join(", ")}
                </p>
              </div>
              {insight.sourceQuote && <SourceQuote quote={insight.sourceQuote} />}
            </div>
          </div>
        </InsightCard>
      );

    case "Sample":
      return (
        <InsightCard accentColor="indigo">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-indigo-500/10 shrink-0">
              <AudioWaveform className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {insight.direction === "samples" ? "Samples" : "Sampled By"}
                </p>
                <p className="text-xs text-foreground/70 mt-1">
                  <span className="font-medium text-foreground/90">
                    "{insight.sampled.title}"
                  </span>{" "}
                  by {insight.sampled.artists.map((a) => a.name).join(", ")}
                </p>
              </div>
              {insight.sourceQuote && <SourceQuote quote={insight.sourceQuote} />}
            </div>
          </div>
        </InsightCard>
      );

    case "Connection":
      return (
        <InsightCard accentColor="purple">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-purple-500/10 shrink-0">
              <Network className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Connected to {insight.toArtist.name}
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
          <InsightCard accentColor="primary" className="cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-primary/10 shrink-0 group-hover:bg-primary/20 transition-colors">
                <LinkIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {insight.title}
                  </p>
                  <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
                <p className="text-xs text-foreground/70 line-clamp-2 leading-relaxed">
                  {insight.summary}
                </p>
                <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wider font-medium">
                  {insight.linkType}
                </span>
              </div>
            </div>
          </InsightCard>
        </a>
      );

    case "PlayHistory":
      return (
        <InsightCard accentColor="orange">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-orange-500/10 shrink-0">
              <History className="w-4 h-4 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  <span className="text-lg font-bold text-primary">
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
        <InsightCard accentColor="primary">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-primary/10 shrink-0">
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {insight.artist.name}'s KEXP Journey
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-foreground/60">
                  <span>
                    <span className="font-bold text-primary">{insight.totalPlays}</span> plays
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
        <InsightCard accentColor="teal">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-accent/10 shrink-0">
              <Home className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {insight.localContext} {insight.sceneType === "label" ? "Label" : "Scene"}
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
        <InsightCard accentColor="purple">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-purple-500/10 shrink-0">
              <Mic2 className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground capitalize">
                  {insight.recommendationType.replace(/_/g, " ")}
                </p>
                {insight.emotionalContext && (
                  <p className="text-xs text-foreground/60 mt-1 capitalize">
                    {insight.emotionalContext}
                  </p>
                )}
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {insight.narrative}
              </p>
              {insight.sourceQuote && <SourceQuote quote={insight.sourceQuote} />}
            </div>
          </div>
        </InsightCard>
      );

    default:
      return null;
  }
};
