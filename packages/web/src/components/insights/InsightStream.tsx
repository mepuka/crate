import { useMemo } from "react";
import { Insights } from "@crate/domain";
import { InsightBlock } from "./InsightBlock";
import { InlineLinerNote } from "./InlineLinerNote";
import { TrackContextCard } from "./TrackContextCard";
import { MessageSquareQuote } from "lucide-react";

interface InsightStreamProps {
  insights: Insights.Insight[];
  comment?: string | null | undefined;
  // Context for empty state
  releaseYear?: number | null | undefined;
  rotationStatus?: string | null | undefined;
  isLocal?: boolean | undefined;
  airdate?: Date | undefined;
  // Optional palette from album art analysis
  albumPalette?: {
    dominant: string;
    accent: string;
    temperature: "warm" | "cool" | "neutral";
  } | undefined;
  /** Callback when an artist name is clicked in liner notes */
  onArtistClick?: (artistName: string, mbid?: string | null) => void;
}

/**
 * Check if an insight has rich narrative content worthy of inline liner note treatment
 */
const isNarrativeInsight = (insight: Insights.Insight): boolean => {
  switch (insight._tag) {
    case "DiscoveryArc":
    case "DJRecommendation":
    case "LocalScene":
      return true;
    case "Connection":
      return Boolean(insight.explanation && insight.explanation.length > 50);
    default:
      return false;
  }
};

export const InsightStream = ({
  insights,
  comment,
  releaseYear,
  rotationStatus,
  isLocal,
  airdate,
  albumPalette,
  onArtistClick,
}: InsightStreamProps) => {
  // Separate narrative insights from data insights
  const { narrativeInsights, dataInsights } = useMemo(() => {
    const narrative: Insights.Insight[] = [];
    const data: Insights.Insight[] = [];

    for (const insight of insights) {
      if (isNarrativeInsight(insight)) {
        narrative.push(insight);
      } else {
        data.push(insight);
      }
    }

    return { narrativeInsights: narrative, dataInsights: data };
  }, [insights]);

  return (
    <div className="space-y-4 pt-2">
      {/* DJ Comment - always first, flows inline */}
      {comment && (
        <div
          className="flex items-start gap-3 p-3 rounded-lg bg-accent/10 border border-accent/20 animate-insight-appear"
          style={{ animationDelay: "0ms" }}
        >
          <MessageSquareQuote className="w-5 h-5 text-accent mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium leading-none text-accent">DJ Comment</p>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {comment}
            </p>
          </div>
        </div>
      )}

      {/* Narrative Insights - Inline liner notes with artist highlighting */}
      {narrativeInsights.map((insight, i) => (
        <div
          key={`narrative-${insight._tag}-${i}`}
          className="animate-insight-appear"
          style={{ animationDelay: `${(i + (comment ? 1 : 0)) * 75}ms` }}
        >
          <InlineLinerNote
            insight={insight}
            albumPalette={albumPalette}
            onArtistClick={onArtistClick}
          />
        </div>
      ))}

      {/* Data Insights - Compact blocks for play history, concerts, etc */}
      {dataInsights.map((insight, i) => (
        <div
          key={`data-${insight._tag}-${i}`}
          className="animate-insight-appear"
          style={{ animationDelay: `${(i + narrativeInsights.length + (comment ? 1 : 0)) * 50 + 100}ms` }}
        >
          <InsightBlock insight={insight} />
        </div>
      ))}

      {/* Empty state */}
      {insights.length === 0 && !comment && airdate && (
        <TrackContextCard
          releaseYear={releaseYear}
          rotationStatus={rotationStatus}
          isLocal={isLocal}
          airdate={airdate}
        />
      )}
    </div>
  );
};
